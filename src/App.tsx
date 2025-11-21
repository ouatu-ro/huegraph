import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { createZoomPan } from "./useZoomPan";
import ClusterWorker from "./workers/clusterWorker?worker";
import ControlPanel from "./components/ControlPanel";
import ClusterPanel from "./components/ClusterPanel";
import ZoomWidget from "./components/ZoomWidget";
import { styleFor } from "./utils/panelStyle";
import type {
  ClusterDistribution,
  ClusterDistributionMap,
  HierKey,
  ClusterMethod,
  PanelPlacement,
  PanelPlacementMap,
} from "./types";
import {
  CONTROL_PANEL_HEIGHT,
  CONTROL_PANEL_ID,
  CONTROL_PANEL_INITIAL_X,
  CONTROL_PANEL_INITIAL_Y,
  CONTROL_PANEL_PINNED_DEFAULT,
  CONTROL_PANEL_WIDTH,
  CONTROL_PANEL_Z_INDEX,
  CLUSTER_FOCUS_PAD,
  CLUSTER_LAYOUT_GAP_X,
  CLUSTER_LAYOUT_GAP_Y,
  CLUSTER_LAYOUT_PAD_BOTTOM,
  CLUSTER_LAYOUT_PAD_LEFT,
  CLUSTER_LAYOUT_PAD_RIGHT,
  CLUSTER_LAYOUT_PAD_TOP,
  DEFAULT_PANEL_HEIGHT,
  DEFAULT_PANEL_WIDTH,
  EPS_DEFAULT,
  HUD_MARGIN_RIGHT,
  HUD_MARGIN_TOP,
  K_COLORS,
  KMEANS_DEFAULT,
  MIN_PTS_DEFAULT,
  PANEL_BASE_Z_INDEX,
  PANEL_GRID_BASE_X,
  PANEL_GRID_BASE_Y,
  PANEL_GRID_COLUMN_SPACING,
  PANEL_GRID_COLUMNS,
  PANEL_GRID_ROW_SPACING,
  PANEL_ROW_EVEN_OFFSET,
  PANEL_ZTOP_START,
  WORKSPACE_HEIGHT,
  WORKSPACE_WIDTH,
  ZOOM_MAX,
  ZOOM_MIN,
  ARRANGE_PANEL_MAX_SCREEN_HEIGHT,
  ARRANGE_PANEL_MAX_SCREEN_WIDTH,
  ARRANGE_PANEL_MIN_SCREEN_HEIGHT,
  ARRANGE_PANEL_MIN_SCREEN_WIDTH,
} from "./appConfig";
import "./App.css";

const defaultPlacement = (id: string, order: number): PanelPlacement => {
  const col = order % PANEL_GRID_COLUMNS;
  const row = Math.floor(order / PANEL_GRID_COLUMNS);
  return {
    id,
    x: PANEL_GRID_BASE_X + col * PANEL_GRID_COLUMN_SPACING,
    y: PANEL_GRID_BASE_Y + row * PANEL_GRID_ROW_SPACING + (order % 2) * PANEL_ROW_EVEN_OFFSET,
    width: DEFAULT_PANEL_WIDTH,
    height: DEFAULT_PANEL_HEIGHT,
    zIndex: PANEL_BASE_Z_INDEX + order,
  };
};

export default function App() {
  const [ready, setReady] = createSignal(false);
  const [progress, setProgress] = createSignal<{ phase: string; done: number; total: number } | null>(null);
  const [labels, setLabels] = createSignal<number[] | null>(null);
  const [imageUrls, setImageUrls] = createSignal<string[] | null>(null);
  const [isClustering, setIsClustering] = createSignal(false);
  const [layer, setLayer] = createSignal<HierKey>("xkcd_color");
  const [method, setMethod] = createSignal<ClusterMethod>("dbscan");
  const [eps, setEps] = createSignal(EPS_DEFAULT);
  const [minPts, setMinPts] = createSignal(MIN_PTS_DEFAULT);
  const [kMeansK, setKMeansK] = createSignal(KMEANS_DEFAULT);
  const [hasRun, setHasRun] = createSignal(false);
  const [runId, setRunId] = createSignal(0);

  const [panelStates, setPanelStates] = createSignal<PanelPlacementMap>({});
  const [initialArrangeDone, setInitialArrangeDone] = createSignal(false);
  const [controlPanel, setControlPanel] = createSignal<PanelPlacement>({
    id: CONTROL_PANEL_ID,
    x: CONTROL_PANEL_INITIAL_X,
    y: CONTROL_PANEL_INITIAL_Y,
    width: CONTROL_PANEL_WIDTH,
    height: CONTROL_PANEL_HEIGHT,
    zIndex: CONTROL_PANEL_Z_INDEX,
  });
  const [controlPanelPinned, setControlPanelPinned] = createSignal(CONTROL_PANEL_PINNED_DEFAULT);
  const [zTop, setZTop] = createSignal(PANEL_ZTOP_START);
  const [clusterDists, setClusterDists] = createSignal<ClusterDistributionMap>({});
  const zoomPan = createZoomPan({
    width: WORKSPACE_WIDTH,
    height: WORKSPACE_HEIGHT,
    minZoom: ZOOM_MIN,
    maxZoom: ZOOM_MAX,
  });
  const resetView = () => zoomPan.resetView(controlPanel());

  const pinnedControlStyle = createMemo(() => ({
    position: "absolute",
    top: `${HUD_MARGIN_TOP}px`,
    right: `${HUD_MARGIN_RIGHT}px`,
    width: `${controlPanel().width}px`,
    height: `${controlPanel().height}px`,
    "z-index": `${controlPanel().zIndex}`,
    "pointer-events": "auto",
  }));

  const floatingControlStyle = createMemo(() => ({
    ...styleFor(controlPanel()),
    position: "absolute",
  }));

  const toggleControlPanelPin = () => setControlPanelPinned((prev) => !prev);

  const worker = new ClusterWorker();

  onMount(() => {
    zoomPan.centerWorkspace(controlPanel());

    worker.onmessage = (e: MessageEvent<any>) => {
      const m = e.data;
      if (m.type === "PROGRESS") setProgress(m);
      if (m.type === "READY") {
        setReady(true);
        setImageUrls(m.imageUrls ?? null);
        setProgress(null);
      }
      if (m.type === "CLUSTERS") {
        if (m.runId == null || m.runId === runId()) {
          setLabels(m.labels);
          const dist: ClusterDistributionMap = {};
          (m.colorFamilyDist ?? []).forEach((entry: ClusterDistribution) => {
            dist[String(entry.id)] = entry.parts;
          });
          setClusterDists(dist);
          setIsClustering(false);
          setProgress(null);
        }
      }
    };

    worker.postMessage({ type: "INIT", kColors: K_COLORS });
  });

  onCleanup(() => worker.terminate());

  const runCluster = () => {
    if (!ready()) return;
    const nextId = runId() + 1;
    setRunId(nextId);
    setIsClustering(true);
    worker.postMessage({
      type: "RUN_CLUSTER",
      layer: layer(),
      method: method(),
      eps: eps(),
      minPts: minPts(),
      k: kMeansK(),
      runId: nextId,
    });
  };

  // debounce after the first run so tweaks don't jitter the UI
  createEffect(() => {
    layer();
    method();
    eps();
    minPts();
    kMeansK();
    if (!ready() || !hasRun()) return;
    const timer = setTimeout(runCluster, 500);
    return () => clearTimeout(timer);
  });

  const clusters = createMemo(() => {
    if (!labels()) return [];
    const map = new Map<number, number[]>();
    labels()!.forEach((lab, i) => {
      if (!map.has(lab)) map.set(lab, []);
      map.get(lab)!.push(i);
    });
    return [...map.entries()].sort((a, b) => {
      if (a[0] === -1) return 1;
      if (b[0] === -1) return -1;
      return a[0] - b[0];
    });
  });

  // seed panel rectangles when new clusters appear
  createEffect(() => {
    const g = clusters();
    if (!g.length) return;
    let highest = zTop();
    let touched = false;
    setPanelStates((prev) => {
      const next = { ...prev };
      g.forEach(([lab], idx) => {
        const key = String(lab);
        if (!next[key]) {
          touched = true;
          highest += 1;
          next[key] = defaultPlacement(key, idx);
          next[key].zIndex = highest;
        }
      });
      return next;
    });
    if (touched) setZTop(highest);
    if (touched && !initialArrangeDone()) {
      setInitialArrangeDone(true);
      queueMicrotask(() => arrangePanels());
    }
  });

  const bumpZ = (id: string, isControl = false) => {
    const next = zTop() + 1;
    setZTop(next);
    if (isControl) setControlPanel((p) => ({ ...p, zIndex: next }));
    else
      setPanelStates((prev) => {
        const curr = prev[id];
        if (!curr) return prev;
        return { ...prev, [id]: { ...curr, zIndex: next } };
      });
  };

  const updatePanel = (id: string, patch: Partial<PanelPlacement>) =>
    setPanelStates((prev) => {
      const curr = prev[id];
      if (!curr) return prev;
      return { ...prev, [id]: { ...curr, ...patch } };
    });

  const updateControlPanel = (patch: Partial<PanelPlacement>) =>
    setControlPanel((prev) => ({ ...prev, ...patch }));

  const focusClusterPanel = (id: string, fallback: PanelPlacement) => {
    bumpZ(id);
    const panel = panelStates()[id] ?? fallback;
    zoomPan.focusRect(panel, CLUSTER_FOCUS_PAD);
  };

  const thumbSrc = (i: number) => imageUrls()?.[i] ?? `/sample-images/${i + 1}.jpg`;
  const arrangePanels = () => {
    const entries = Object.entries(panelStates());
    const n = entries.length;
    if (!n) return;

    const { x: panX, y: panY, scale } = zoomPan.getView();

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // --- screen-space layout targets ---
    const padL = CLUSTER_LAYOUT_PAD_LEFT;
    const padR = CLUSTER_LAYOUT_PAD_RIGHT;
    const padT = CLUSTER_LAYOUT_PAD_TOP;
    const padB = CLUSTER_LAYOUT_PAD_BOTTOM;
    const gapX = CLUSTER_LAYOUT_GAP_X;
    const gapY = CLUSTER_LAYOUT_GAP_Y;

    const availW = Math.max(1, vw - padL - padR);
    const availH = Math.max(1, vh - padT - padB);

    // sqrt grid
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);

    // panel size in SCREEN pixels (so they fill the view)
    let panelScreenW = (availW - gapX * (cols - 1)) / cols;
    let panelScreenH = (availH - gapY * (rows - 1)) / rows;

    // clamp to something sane
    const minScreenW = ARRANGE_PANEL_MIN_SCREEN_WIDTH;
    const minScreenH = ARRANGE_PANEL_MIN_SCREEN_HEIGHT;
    const maxScreenW = ARRANGE_PANEL_MAX_SCREEN_WIDTH;
    const maxScreenH = ARRANGE_PANEL_MAX_SCREEN_HEIGHT;

    panelScreenW = Math.max(minScreenW, Math.min(maxScreenW, panelScreenW));
    panelScreenH = Math.max(minScreenH, Math.min(maxScreenH, panelScreenH));

    const colScreenW = panelScreenW + gapX;
    const rowScreenH = panelScreenH + gapY;

    // --- convert to WORLD space correctly ---
    // screen = world*scale + pan  => world = (screen - pan)/scale
    const baseWorldX = (padL - panX) / scale;
    const baseWorldY = (padT - panY) / scale;

    const panelWorldW = panelScreenW / scale;
    const panelWorldH = panelScreenH / scale;
    const colWorldW = colScreenW / scale;
    const rowWorldH = rowScreenH / scale;

    console.log("[arrangePanels]", {
      n,
      cols,
      rows,
      panX,
      panY,
      scale,
      panelScreenW,
      panelScreenH,
      baseWorldX,
      baseWorldY,
    });

    setPanelStates((prev) => {
      const next = { ...prev };
      entries.forEach(([id, panel], idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        next[id] = {
          ...panel,
          x: baseWorldX + col * colWorldW,
          y: baseWorldY + row * rowWorldH,
          width: panelWorldW,
          height: panelWorldH,
        };
      });
      return next;
    });
  };

  return (
    <div class="workspace-shell">
      <div class="brand-mark">
        <div class="brand-title">HueGraph</div>
        <div class="brand-subtitle">client-side color clustering</div>
      </div>

      <Show when={!ready()}>
        <div class="floating-hint">
          <div class="text-lg font-semibold">Loading samples</div>
          <Show when={progress()}>
            <div class="text-xs opacity-80">
              {progress()!.phase}: {progress()!.done}/{progress()!.total}
            </div>
          </Show>
        </div>
      </Show>

      <div
        class="workspace-canvas"
        ref={zoomPan.canvasRef}
        style={{ cursor: zoomPan.isPanning() ? "grabbing" : "grab" }}
      >
        <Show when={ready()}>
          <Show when={!controlPanelPinned()}>
            <ControlPanel
              state={controlPanel}
              style={floatingControlStyle()}
              bringToFront={() => bumpZ(CONTROL_PANEL_ID, true)}
              onUpdate={updateControlPanel}
              zoom={zoomPan.zoom}
              setZoom={zoomPan.setZoom}
              resetView={resetView}
              arrangePanels={arrangePanels}
              layer={layer()}
              setLayer={setLayer}
              method={method()}
              setMethod={setMethod}
              eps={eps()}
              setEps={setEps}
              minPts={minPts()}
              setMinPts={setMinPts}
              kMeansK={kMeansK()}
              setKMeansK={setKMeansK}
              isClustering={isClustering()}
              hasRun={hasRun()}
              runCluster={() => {
                setHasRun(true);
                runCluster();
              }}
              progress={progress()}
              ready={ready()}
              pinned={controlPanelPinned()}
              togglePin={toggleControlPanelPin}
            />
          </Show>

          <Show when={clusters().length === 0}>
            <div class="empty-hint">Run clustering to spawn draggable panels.</div>
          </Show>

          <For each={clusters()}>
            {([lab, idxs], order) => {
              const key = String(lab);
              const fallback = defaultPlacement(key, order());
              return (
                <ClusterPanel
                  label={lab}
                  count={idxs.length}
                  fallback={fallback}
                  items={idxs}
                  state={() => panelStates()[key]}
                  bringToFront={() => bumpZ(key)}
                  onUpdate={(patch) => updatePanel(key, patch)}
                  imageForIndex={thumbSrc}
                  distribution={clusterDists()[key] ?? []}
                  order={order()}
                  zoom={zoomPan.zoom}
                  onFocus={() => focusClusterPanel(key, fallback)}
                />
              );
            }}
          </For>
        </Show>

        <Show when={isClustering()}>
          <div class="status-chip">Clustering…</div>
        </Show>
      </div>
      <Show when={ready() && controlPanelPinned()}>
        <div class="hud-layer">
          <ControlPanel
            state={controlPanel}
            style={pinnedControlStyle()}
            bringToFront={() => bumpZ(CONTROL_PANEL_ID, true)}
            onUpdate={updateControlPanel}
            zoom={zoomPan.zoom}
            setZoom={zoomPan.setZoom}
            resetView={resetView}
            arrangePanels={arrangePanels}
            layer={layer()}
            setLayer={setLayer}
            method={method()}
            setMethod={setMethod}
            eps={eps()}
            setEps={setEps}
            minPts={minPts()}
            setMinPts={setMinPts}
            kMeansK={kMeansK()}
            setKMeansK={setKMeansK}
            isClustering={isClustering()}
            hasRun={hasRun()}
            runCluster={() => {
              setHasRun(true);
              runCluster();
            }}
            progress={progress()}
            ready={ready()}
            pinned={controlPanelPinned()}
            togglePin={toggleControlPanelPin}
          />
        </div>
      </Show>
      <ZoomWidget zoom={zoomPan.zoom} zoomIn={zoomPan.zoomIn} zoomOut={zoomPan.zoomOut} reset={resetView} />
    </div>
  );
}
