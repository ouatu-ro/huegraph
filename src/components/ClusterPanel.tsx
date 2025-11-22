import type { Accessor } from "solid-js";
import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import Muuri from "muuri";
import ActionMenu from "./ActionMenu";
import PieChartWindow from "./PieChartWindow";
import WindowBase from "./WindowBase";
import type { PanelPlacement, ClusterColorPart } from "../types";
import { CLUSTER_RESIZE_MIN_HEIGHT, CLUSTER_RESIZE_MIN_WIDTH, CLUSTER_THUMB_MARGIN, CLUSTER_THUMB_SIZE } from "../appConfig";

export type ClusterPanelProps = {
  label: number;
  count: number;
  items: number[];
  imageForIndex: (idx: number) => string;
  state: Accessor<PanelPlacement | undefined>;
  fallback: PanelPlacement;
  bringToFront: () => void;
  onUpdate: (patch: Partial<PanelPlacement>) => void;
  distribution: ClusterColorPart[];
  order: number;
  zoom: Accessor<number>;
  onFocus: () => void;
  onMaximizeToggle: () => void;
  onPhotoPreview: (idx: number) => void;
};

export default function ClusterPanel(props: ClusterPanelProps) {
  let gridRef: HTMLDivElement | undefined;
  let bodyRef: HTMLDivElement | undefined;
  let grid: Muuri | undefined;
  let resizeObserver: ResizeObserver | undefined;
  const [chartPlacement, setChartPlacement] = createSignal<PanelPlacement | null>(null);
  const [chartOpen, setChartOpen] = createSignal(false);
  const [chartZ, setChartZ] = createSignal(0);

  const panelState = () => props.state() ?? props.fallback;

  const titleFor = () => {
    if (props.label < 0) return "Ungrouped";
    return `Group ${props.label + 1}`;
  };

  const openChartWindow = () => {
    const existing = chartPlacement();
    if (existing) {
      const nextZ = Math.max(chartZ(), (existing.zIndex ?? 0) + 1);
      setChartZ(nextZ);
      setChartPlacement({ ...existing, zIndex: nextZ });
      setChartOpen(true);
      return;
    }
    const base = panelState();
    const width = 480;
    const height = 380;
    const centerX = (base?.x ?? 0) + (base?.width ?? width) / 2;
    const centerY = (base?.y ?? 0) + (base?.height ?? height) / 2;
    const nextZ = Math.max(chartZ(), (base?.zIndex ?? 0) + 1);
    setChartZ(nextZ);
    setChartPlacement({
      id: `chart-${props.label}`,
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
      zIndex: nextZ,
    });
    setChartOpen(true);
  };

  const bringChartToFront = () => {
    const nextZ = chartZ() + 1;
    setChartZ(nextZ);
    setChartPlacement((prev) => (prev ? { ...prev, zIndex: nextZ } : prev));
  };

  const handleAction = (value: string) => {
    if (value === "focus") props.onFocus();
    if (value === "chart") openChartWindow();
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
  });

  createEffect(() => {
    props.items.length;
    queueMicrotask(rebuildGrid);
  });

  createEffect(() => {
    const p = panelState();
    p?.width;
    p?.height;
    requestAnimationFrame(() => {
      grid?.refreshItems();
      grid?.layout();
    });
  });

  createEffect(() => {
    props.zoom();
    requestAnimationFrame(() => {
      grid?.refreshItems();
      grid?.layout();
    });
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    grid?.destroy();
  });

  return (
    <>
      <WindowBase
        placement={panelState}
        onUpdate={props.onUpdate}
        bringToFront={props.bringToFront}
        zoom={props.zoom}
        class="cluster-panel"
        title={titleFor()}
        subtitle={`${props.count} items`}
        headerActions={<div class="cluster-actions"><ActionMenu onSelect={handleAction} /></div>}
        onHeaderDblClick={(e) => {
          e.stopPropagation();
          props.onMaximizeToggle();
        }}
        bodyRef={(el) => {
          bodyRef = el;
        }}
        minWidth={CLUSTER_RESIZE_MIN_WIDTH}
        minHeight={CLUSTER_RESIZE_MIN_HEIGHT}
      >
        <div
          ref={gridRef}
          class="muuri-grid"
          style={{
            transform: `scale(${1 / props.zoom()})`,
            "transform-origin": "0 0",
            width: `${100 * props.zoom()}%`,
          }}
        >
          <For each={props.items}>
            {(idx) => (
              <div
                class="item"
                style={{
                  width: `${CLUSTER_THUMB_SIZE * props.zoom()}px`,
                  height: `${CLUSTER_THUMB_SIZE * props.zoom()}px`,
                  margin: `${CLUSTER_THUMB_MARGIN * props.zoom()}px`,
                }}
                onDblClick={() => props.onPhotoPreview(idx)}
              >
                <div class="item-content">
                  <img
                    class="thumb"
                    width={CLUSTER_THUMB_SIZE}
                    height={CLUSTER_THUMB_SIZE}
                    src={props.imageForIndex(idx)}
                    loading="lazy"
                    alt=""
                  />
                </div>
              </div>
            )}
          </For>
        </div>
      </WindowBase>
      <Show when={chartOpen() && chartPlacement()}>
        <PieChartWindow
          placement={chartPlacement()!}
          data={props.distribution}
          onClose={() => setChartOpen(false)}
          onUpdate={(patch) =>
            setChartPlacement((prev) => (prev ? { ...prev, ...patch } : prev))
          }
          bringToFront={bringChartToFront}
          zoom={props.zoom}
        />
      </Show>
    </>
  );
}
