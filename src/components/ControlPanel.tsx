import type { Accessor } from "solid-js";
import { For, Show, createEffect, createSignal } from "solid-js";
import interact from "interactjs";
import type { ClusterMethod, HierKey, PanelPlacement } from "../types";
import {
  EPS_MAX,
  EPS_MIN,
  EPS_STEP,
  KMEANS_MAX,
  KMEANS_MIN,
  KMEANS_STEP,
  MIN_PTS_MAX,
  MIN_PTS_MIN,
  MIN_PTS_STEP,
} from "../appConfig";

export type ControlPanelProps = {
  state: Accessor<PanelPlacement>;
  style: Record<string, string>;
  bringToFront: () => void;
  onUpdate: (patch: Partial<PanelPlacement>) => void;
  zoom: Accessor<number>;
  setZoom: (z: number) => void;
  resetView: () => void;
  arrangePanels: () => void;
  layer: HierKey;
  setLayer: (value: HierKey) => void;
  method: ClusterMethod;
  setMethod: (value: ClusterMethod) => void;
  eps: number;
  setEps: (value: number) => void;
  minPts: number;
  setMinPts: (value: number) => void;
  kMeansK: number;
  setKMeansK: (value: number) => void;
  isClustering: boolean;
  hasRun: boolean;
  runCluster: () => void;
  progress: { phase: string; done: number; total: number } | null;
  ready: boolean;
  pinned: boolean;
  togglePin: () => void;
};

export default function ControlPanel(props: ControlPanelProps) {
  const [panelRef, setPanelRef] = createSignal<HTMLDivElement | undefined>();

  createEffect(() => {
    if (props.pinned) return;
    const panel = panelRef();
    if (!panel) return;
    const drag = interact(panel).draggable({
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
    return () => drag.unset();
  });

  const statusText = () => {
    if (!props.ready) return "Loading…";
    if (props.isClustering) return "Clustering…";
    if (props.progress) return props.progress.phase;
    return "Ready";
  };

  return (
    <div
      ref={setPanelRef}
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
        <div class="panel-header-actions">
          <button
            class={`pin-button ${props.pinned ? "active" : ""}`}
            onClick={props.togglePin}
            aria-pressed={props.pinned}
          >
            {props.pinned ? "Pinned" : "Pin"}
          </button>
          <div class="chip muted">{statusText()}</div>
        </div>
      </div>
      <div class="panel-body">
        <div class="pill-row">
          <ToggleGroup
            label="Layer"
            value={props.layer}
            options={[
              { label: "xkcd", value: "xkcd_color" as HierKey },
              { label: "design", value: "design_color" as HierKey },
              { label: "common", value: "common_color" as HierKey },
              { label: "family", value: "color_family" as HierKey },
            ]}
            onChange={props.setLayer}
          />
          <ToggleGroup
            label="Method"
            value={props.method}
            options={[
              { label: "DBSCAN", value: "dbscan" as ClusterMethod },
              { label: "K-Means", value: "kmeans" as ClusterMethod },
            ]}
            onChange={props.setMethod}
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
                min={EPS_MIN}
                max={EPS_MAX}
                step={EPS_STEP}
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
                min={MIN_PTS_MIN}
                max={MIN_PTS_MAX}
                step={MIN_PTS_STEP}
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
                min={KMEANS_MIN}
                max={KMEANS_MAX}
                step={KMEANS_STEP}
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
          <button class="ghost-button" onClick={props.resetView}>
            Reset view
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleGroup<T extends string>(props: {
  label: string;
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
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
