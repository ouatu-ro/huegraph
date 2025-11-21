import type { Accessor } from "solid-js";
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
import "./App.css";

const CONTROL_PANEL_ID = "control-panel";

const defaultPlacement = (id: string, order: number): PanelPlacement => {
  const col = order % 3;
  const row = Math.floor(order / 3);
  return {
    id,
    x: 420 + col * 380,
    y: 160 + row * 320 + (order % 2) * 14,
    width: 360,
    height: 300,
    zIndex: 10 + order,
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
  const [eps, setEps] = createSignal(0.35);
  const [minPts, setMinPts] = createSignal(3);
  const [kMeansK, setKMeansK] = createSignal(8);
  const [hasRun, setHasRun] = createSignal(false);
  const [runId, setRunId] = createSignal(0);

  const [panelStates, setPanelStates] = createSignal<PanelPlacementMap>({});
  const [controlPanel, setControlPanel] = createSignal<PanelPlacement>({
    id: CONTROL_PANEL_ID,
    x: 24,
    y: 24,
    width: 360,
    height: 310,
    zIndex: 100,
  });
  const [zTop, setZTop] = createSignal(120);
  const [clusterDists, setClusterDists] = createSignal<ClusterDistributionMap>({});
  const zoomPan = createZoomPan({ width: 6000, height: 4000, minZoom: 0.5, maxZoom: 2.5 });
  const resetView = () => zoomPan.resetView(controlPanel());

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

    worker.postMessage({ type: "INIT", kColors: 6 });
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

  const thumbSrc = (i: number) => imageUrls()?.[i] ?? `/sample-images/${i + 1}.jpg`;
  const arrangePanels = () => {
    const entries = Object.entries(panelStates());
    const n = entries.length;
    if (!n) return;

    const { x: panX, y: panY, scale } = zoomPan.getView();

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // --- screen-space layout targets ---
    const padL = 40;
    const padR = 40;
    const padT = 80;
    const padB = 40;
    const gapX = 18;
    const gapY = 18;

    const availW = Math.max(1, vw - padL - padR);
    const availH = Math.max(1, vh - padT - padB);

    // sqrt grid
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);

    // panel size in SCREEN pixels (so they fill the view)
    let panelScreenW = (availW - gapX * (cols - 1)) / cols;
    let panelScreenH = (availH - gapY * (rows - 1)) / rows;

    // clamp to something sane
    const minScreenW = 240;
    const minScreenH = 220;
    const maxScreenW = 520;
    const maxScreenH = 420;

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
          <ControlPanel
            state={controlPanel}
            style={styleFor(controlPanel())}
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
          />

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
                />
              );
            }}
          </For>
        </Show>

        <Show when={isClustering()}>
          <div class="status-chip">Clustering…</div>
        </Show>
      </div>
      <ZoomWidget zoom={zoomPan.zoom} zoomIn={zoomPan.zoomIn} zoomOut={zoomPan.zoomOut} reset={resetView} />
    </div>
  );
}
