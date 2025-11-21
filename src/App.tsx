import type { Accessor } from "solid-js";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import interact from "interactjs";
import Muuri from "muuri";
import { createZoomPan } from "./useZoomPan";
import ClusterWorker from "./workers/clusterWorker?worker";
import "./App.css";

type HierKey = "xkcd_color" | "design_color" | "common_color" | "color_family";
type ClusterMethod = "dbscan" | "kmeans";

type PanelPlacement = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};

type ClusterDistribution = { id: number; parts: { name: string; pct: number; color: string }[] };

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

const styleFor = (panel?: PanelPlacement): Record<string, string> =>
  panel
    ? {
      left: `${panel.x}px`,
      top: `${panel.y}px`,
      width: `${panel.width}px`,
      height: `${panel.height}px`,
      "z-index": `${panel.zIndex}`,
    }
    : {};

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

  const [panelStates, setPanelStates] = createSignal<Record<string, PanelPlacement>>({});
  const [controlPanel, setControlPanel] = createSignal<PanelPlacement>({
    id: CONTROL_PANEL_ID,
    x: 24,
    y: 24,
    width: 360,
    height: 310,
    zIndex: 100,
  });
  const [zTop, setZTop] = createSignal(120);
  const [clusterDists, setClusterDists] = createSignal<Record<string, { name: string; pct: number; color: string }[]>>(
    {}
  );
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
          const dist: Record<string, { name: string; pct: number; color: string }[]> = {};
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
      n, cols, rows, panX, panY, scale,
      panelScreenW, panelScreenH,
      baseWorldX, baseWorldY
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
        style={{
          cursor: zoomPan.isPanning() ? "grabbing" : "grab",
        }}
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

type ControlPanelProps = {
  state: Accessor<PanelPlacement>;
  style: Record<string, string>;
  bringToFront: () => void;
  onUpdate: (patch: Partial<PanelPlacement>) => void;
  zoom: Accessor<number>;
  setZoom: (z: number) => void;
  resetView: () => void;
  arrangePanels: () => void;
  layer: HierKey;
  setLayer: (v: HierKey) => void;
  method: ClusterMethod;
  setMethod: (v: ClusterMethod) => void;
  eps: number;
  setEps: (v: number) => void;
  minPts: number;
  setMinPts: (v: number) => void;
  kMeansK: number;
  setKMeansK: (v: number) => void;
  isClustering: boolean;
  hasRun: boolean;
  runCluster: () => void;
  progress: { phase: string; done: number; total: number } | null;
  ready: boolean;
};

function ControlPanel(props: ControlPanelProps) {
  let panelRef: HTMLDivElement | undefined;

  onMount(() => {
    if (!panelRef) return;
    const drag = interact(panelRef).draggable({
      inertia: false,
      allowFrom: ".panel-header",
      ignoreFrom: ".panel-body",
      listeners: {
        start() {
          document.body.classList.add("no-select");
        },
        move(ev) {
          props.bringToFront();
          const cur = props.state();
          const scale = props.zoom();
          props.onUpdate({ x: cur.x + ev.dx / scale, y: cur.y + ev.dy / scale });
        },
        end() {
          document.body.classList.remove("no-select");
        },
      },
    });
    onCleanup(() => drag.unset());
  });

  const statusText = () => {
    if (!props.ready) return "Loading…";
    if (props.isClustering) return "Clustering…";
    if (props.progress) return props.progress.phase;
    return "Ready";
  };

  return (
    <div
      ref={panelRef}
      class="panel-window control-panel"
      style={props.style}
      onMouseDown={() => props.bringToFront()}
      onTouchStart={() => props.bringToFront()}
    >
      <div class="panel-header">
        <div>
          <div class="panel-title">Controls</div>
          <div class="panel-subtitle">drag the bar to move</div>
        </div>
        <div class="chip muted">{statusText()}</div>
      </div>
      <div class="panel-body">
        <div class="pill-row">
          <ToggleGroup
            label="Layer"
            value={props.layer}
            options={[
              { label: "xkcd", value: "xkcd_color" },
              { label: "design", value: "design_color" },
              { label: "common", value: "common_color" },
              { label: "family", value: "color_family" },
            ]}
            onChange={(v) => props.setLayer(v as HierKey)}
          />
          <ToggleGroup
            label="Method"
            value={props.method}
            options={[
              { label: "DBSCAN", value: "dbscan" },
              { label: "K-Means", value: "kmeans" },
            ]}
            onChange={(v) => props.setMethod(v as ClusterMethod)}
          />
        </div>

        <div class="controls-grid">
          <Show when={props.method === "dbscan"}>
            <div class="slider-block">
              <div class="slider-label">
                <span class="slider-title">
                  <span>ε (eps)</span>
                  <span class="info" title="Neighborhood radius for DBSCAN; larger ε merges nearby groups.">i</span>
                </span>
                <span class="value">{props.eps.toFixed(2)}</span>
              </div>
              <input
                class="slider"
                type="range"
                min="0.05"
                max="1"
                step="0.01"
                value={props.eps}
                onInput={(e) => props.setEps(parseFloat(e.currentTarget.value))}
              />
            </div>

            <div class="slider-block">
              <div class="slider-label">
                <span class="slider-title">
                  <span>Min images</span>
                  <span class="info" title="Minimum samples required to form a DBSCAN cluster.">i</span>
                </span>
                <span class="value">{props.minPts}</span>
              </div>
              <input
                class="slider"
                type="range"
                min="2"
                max="20"
                step="1"
                value={props.minPts}
                onInput={(e) => props.setMinPts(parseInt(e.currentTarget.value))}
              />
            </div>
          </Show>

          <Show when={props.method === "kmeans"}>
            <div class="slider-block">
              <div class="slider-label">
                <span class="slider-title">
                  <span>k (clusters)</span>
                  <span class="info" title="Number of clusters to partition the images into.">i</span>
                </span>
                <span class="value">{props.kMeansK}</span>
              </div>
              <input
                class="slider"
                type="range"
                min="2"
                max="24"
                step="1"
                value={props.kMeansK}
                onInput={(e) => props.setKMeansK(parseInt(e.currentTarget.value) || 1)}
              />
            </div>
          </Show>
        </div>

        <button
          class={`run-button ${props.isClustering ? "waiting" : ""}`}
          disabled={props.isClustering}
          onClick={props.runCluster}
        >
          {props.isClustering ? "Running…" : props.hasRun ? "Re-run" : "Run"}
        </button>
        <div class="button-row">
          <button class="ghost-button" onClick={props.arrangePanels}>
            Arrange to fit
          </button>
          <button class="ghost-button" onClick={() => props.resetView()}>
            Reset view
          </button>
        </div>
      </div>
    </div>
  );
}

type ClusterPanelProps = {
  label: number;
  count: number;
  items: number[];
  imageForIndex: (i: number) => string;
  state: Accessor<PanelPlacement | undefined>;
  fallback: PanelPlacement;
  bringToFront: () => void;
  onUpdate: (patch: Partial<PanelPlacement>) => void;
  distribution: { name: string; pct: number; color: string }[];
  order: number;
  zoom: Accessor<number>;
};

function ClusterPanel(props: ClusterPanelProps) {
  let panelRef: HTMLDivElement | undefined;
  let gridRef: HTMLDivElement | undefined;
  let bodyRef: HTMLDivElement | undefined;
  let grid: Muuri | undefined;
  let resizeObserver: ResizeObserver | undefined;

  const panelState = () => props.state() ?? props.fallback;

  const titleFor = () => {
    if (props.label < 0) return "Ungrouped";
    return `Group ${props.label + 1}`;
  };

  const rebuildGrid = () => {
    if (!gridRef) return;
    grid?.destroy();
    gridRef.classList.add("muuri-live");
    grid = new Muuri(gridRef, {
      dragEnabled: false,
      layoutOnResize: false,
      layoutDuration: 220,
      layoutEasing: "ease-out",
    });
    grid.refreshItems();
    grid.layout(true);
  };

  onMount(() => {
    rebuildGrid();

    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        grid?.refreshItems();
        grid?.layout();
      });
    });
    if (bodyRef) resizeObserver.observe(bodyRef);

    if (panelRef) {
      const interaction = interact(panelRef)
        .draggable({
          inertia: false,
          allowFrom: ".panel-header",
          ignoreFrom: ".panel-body",
          listeners: {
            start() {
              document.body.classList.add("no-select");
            },
            move(ev) {
              const cur = props.state();
              if (!cur) return;
              props.bringToFront();
              const scale = props.zoom();
              props.onUpdate({ x: cur.x + ev.dx / scale, y: cur.y + ev.dy / scale });
            },
            end() {
              document.body.classList.remove("no-select");
            },
          },
        })
        .resizable({
          edges: { left: false, right: true, bottom: true, top: false },
          modifiers: [interact.modifiers!.restrictSize({ min: { width: 240, height: 220 } })],
          listeners: {
            start() {
              document.body.classList.add("no-select");
            },
            move(ev) {
              const cur = props.state();
              if (!cur) return;
              props.bringToFront();
              const scale = props.zoom();
              const nextW = Math.max(240, cur.width + (ev.deltaRect?.width ?? 0) / scale);
              const nextH = Math.max(220, cur.height + (ev.deltaRect?.height ?? 0) / scale);
              props.onUpdate({
                x: cur.x + (ev.deltaRect?.left ?? 0) / scale,
                y: cur.y + (ev.deltaRect?.top ?? 0) / scale,
                width: nextW,
                height: nextH,
              });
              grid?.refreshItems();
              grid?.layout();
            },
            end() {
              document.body.classList.remove("no-select");
            },
          },
        });

      onCleanup(() => interaction.unset());
    }
  });
  createEffect(() => {
    props.zoom(); // track zoom
    requestAnimationFrame(() => {
      grid?.refreshItems();
      grid?.layout();
    });
  });

  createEffect(() => {
    props.items.length;
    queueMicrotask(rebuildGrid);
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    grid?.destroy();
  });

  return (
    <div
      ref={panelRef}
      class="panel-window cluster-panel"
      style={styleFor(panelState())}
      onMouseDown={() => props.bringToFront()}
      onTouchStart={() => props.bringToFront()}
    >
      <div class="panel-header">
        <div>
          <div class="panel-title">{titleFor()}</div>
          <div class="panel-subtitle">{props.count} items</div>
          <ColorBar parts={props.distribution} />
        </div>
        <div class="chip">drag + resize</div>
      </div>
      <div ref={bodyRef} class="panel-body">
        <div
          ref={gridRef}
          class="muuri-grid"
          style={{
            // cancel outer panzoom scaling for grid contents
            transform: `scale(${1 / props.zoom()})`,
            "transform-origin": "0 0",

            // expand layout space so after inverse-scale it still fills panel
            width: `${100 * props.zoom()}%`,
          }}
        >
          <For each={props.items}>
            {(idx) => (
              <div class="item">
                <div class="item-content">
                  <img class="thumb" width={64} height={64} src={props.imageForIndex(idx)} loading="lazy" alt="" />
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
      <div class="resize-handle" />
    </div>
  );
}

function ColorBar(props: { parts: { name: string; pct: number; color: string }[] }) {
  if (!props.parts || props.parts.length === 0) return null;
  return (
    <div class="color-bar" title={props.parts.map((p) => `${p.name}: ${(p.pct * 100).toFixed(1)}%`).join("  ·  ")}>
      <For each={props.parts}>
        {(p) => <div class="color-segment" style={{ width: `${p.pct * 100}%`, "background-color": p.color }} />}
      </For>
    </div>
  );
}

function ZoomWidget(props: { zoom: Accessor<number>; zoomIn: () => void; zoomOut: () => void; reset: () => void }) {
  return (
    <div class="zoom-widget">
      <button class="zoom-button" onClick={props.zoomOut}>
        −
      </button>
      <div class="zoom-indicator">{Math.round(props.zoom() * 100)}%</div>
      <button class="zoom-button" onClick={props.zoomIn}>
        +
      </button>
      <button class="zoom-button" title="Reset view" onClick={props.reset}>
        ⤾
      </button>
    </div>
  );
}

function ToggleGroup<T extends string>(props: {
  label: string;
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="toggle-row">
      <span class="toggle-label">{props.label}</span>
      <div class="pill-group">
        <For each={props.options}>
          {(opt) => (
            <button class={`pill ${props.value === opt.value ? "active" : ""}`} onClick={() => props.onChange(opt.value)}>
              {opt.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
