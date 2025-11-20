import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import ClusterWorker from "./workers/clusterWorker?worker";
import "./App.css";

type HierKey = "xkcd_color" | "design_color" | "common_color" | "color_family";
type ClusterMethod = "dbscan" | "kmeans";

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

  const worker = new ClusterWorker();

  onMount(() => {
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
          setIsClustering(false);
          setProgress(null);
        }
      }
    };

    worker.postMessage({ type: "INIT", kColors: 6 });
  });

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

  return (
    <div class="page">
      <h1 class="page-title">HueGraph — client-side color clustering</h1>

      <Show when={!ready()}>
        <div class="text-sm opacity-80">
          Loading samples in worker…
          <Show when={progress()}>
            <div>
              {progress()!.phase}: {progress()!.done}/{progress()!.total}
            </div>
          </Show>
        </div>
      </Show>

      <Show when={ready()}>
        <div class="panel section">
          <div class="flex flex-wrap items-center gap-3">
            <ToggleGroup
              label="Layer"
              value={layer()}
              options={[
                { label: "xkcd", value: "xkcd_color" },
                { label: "design", value: "design_color" },
                { label: "common", value: "common_color" },
                { label: "family", value: "color_family" },
              ]}
              onChange={(v) => setLayer(v as HierKey)}
            />
            <ToggleGroup
              label="Method"
              value={method()}
              options={[
                { label: "DBSCAN", value: "dbscan" },
                { label: "K-Means", value: "kmeans" },
              ]}
              onChange={(v) => setMethod(v as ClusterMethod)}
            />
            <Show when={progress() || isClustering()}>
              <span class="status">{isClustering() ? "clustering…" : progress()!.phase}</span>
            </Show>
          </div>

          <div class="controls-grid text-sm">
            <Show when={method() === "dbscan"}>
              <div class="space-y-1 transition-opacity">
                <div class="slider-label">
                  <span>eps</span>
                  <span class="text-xs font-mono">{eps().toFixed(2)}</span>
                </div>
                <input
                  class="slider"
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.01"
                  value={eps()}
                  onInput={(e) => setEps(parseFloat(e.currentTarget.value))}
                />
              </div>

              <div class="space-y-1">
                <div class="slider-label">
                  <span>minPts</span>
                  <span class="text-xs font-mono">{minPts()}</span>
                </div>
                <input
                  class="slider"
                  type="range"
                  min="2"
                  max="20"
                  step="1"
                  value={minPts()}
                  onInput={(e) => setMinPts(parseInt(e.currentTarget.value))}
                />
              </div>
            </Show>

            <Show when={method() === "kmeans"}>
              <div class="space-y-1">
                <div class="slider-label">
                  <span>k</span>
                  <span class="text-xs font-mono">{kMeansK()}</span>
                </div>
                <input
                  class="slider"
                  type="range"
                  min="2"
                  max="24"
                  step="1"
                  value={kMeansK()}
                  onInput={(e) => setKMeansK(parseInt(e.currentTarget.value) || 1)}
                />
              </div>
            </Show>
          </div>

          <button
            class={`run-button ${isClustering() ? "bg-slate-200 text-slate-500 cursor-wait" : "bg-slate-900 text-white"}`}
            disabled={isClustering()}
            onClick={() => {
              setHasRun(true);
              runCluster();
            }}
          >
            {isClustering() ? "Running…" : hasRun() ? "Re-run" : "Run"}
          </button>
        </div>

        <Show when={imageUrls() && imageUrls()!.length > 0 && !hasRun()}>
          <AllImages imageUrls={imageUrls()!} />
        </Show>

        <Show when={labels()}>
          <Gallery labels={labels()!} imageUrls={imageUrls() ?? []} />
        </Show>
      </Show>
    </div>
  );
}

function Gallery(props: { labels: number[]; imageUrls: string[] }) {
  // group image indices by label
  const groups = () => {
    const m = new Map<number, number[]>();
    props.labels.forEach((lab, i) => {
      if (!m.has(lab)) m.set(lab, []);
      m.get(lab)!.push(i);
    });
    // sort clusters, put noise (-1) last
    return [...m.entries()].sort((a, b) => {
      if (a[0] === -1) return 1;
      if (b[0] === -1) return -1;
      return a[0] - b[0];
    });
  };

  return (
    <div class="space-y-6 section">
      <For each={groups()}>
        {([lab, idxs]) => (
          <div>
            <h2 class="text-sm font-medium mb-2">
              Cluster {lab} ({idxs.length})
            </h2>
            <div class="gallery-grid">
              <For each={idxs}>
                {(i) => (
                  <img
                    class="thumb"
                    width={64}
                    height={64}
                    src={props.imageUrls[i] ?? `/sample-images/${i + 1}.jpg`}
                    loading="lazy"
                  />
                )}
              </For>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function AllImages(props: { imageUrls: string[] }) {
  const srcAt = (i: number) => props.imageUrls[i] ?? `/sample-images/${i + 1}.jpg`;
  return (
    <div class="space-y-2 section">
      <h2 class="text-sm font-medium text-slate-800">All images ({props.imageUrls.length})</h2>
      <div class="grid-all">
        <For each={props.imageUrls}>
          {(_, i) => (
            <img
              class="thumb"
              width={64}
              height={64}
              src={srcAt(i())}
              loading="lazy"
              alt={`Sample ${i() + 1}`}
            />
          )}
        </For>
      </div>
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
    <div class="text-sm flex items-center gap-2">
      <span class="text-slate-700">{props.label}:</span>
      <div class="pill-group">
        <For each={props.options}>
          {(opt) => (
            <button
              class={`pill ${props.value === opt.value ? "active" : ""}`}
              onClick={() => props.onChange(opt.value)}
            >
              {opt.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
