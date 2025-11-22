import type { Accessor } from "solid-js";
import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import interact from "interactjs";
import Muuri from "muuri";
import ActionMenu from "./ActionMenu";
import PieChartWindow from "./PieChartWindow";
import type { PanelPlacement, ClusterColorPart } from "../types";
import { styleFor } from "../utils/panelStyle";
import {
  CLUSTER_RESIZE_MIN_HEIGHT,
  CLUSTER_RESIZE_MIN_WIDTH,
  CLUSTER_THUMB_MARGIN,
  CLUSTER_THUMB_SIZE,
} from "../appConfig";

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
  let panelRef: HTMLDivElement | undefined;
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
          modifiers: [
            interact.modifiers!.restrictSize({
              min: { width: CLUSTER_RESIZE_MIN_WIDTH, height: CLUSTER_RESIZE_MIN_HEIGHT },
            }),
          ],
          listeners: {
            start() {
              document.body.classList.add("no-select");
            },
            move(ev) {
              const cur = props.state();
              if (!cur) return;
              props.bringToFront();
              const scale = props.zoom();
              const nextW = Math.max(CLUSTER_RESIZE_MIN_WIDTH, cur.width + (ev.deltaRect?.width ?? 0) / scale);
              const nextH = Math.max(CLUSTER_RESIZE_MIN_HEIGHT, cur.height + (ev.deltaRect?.height ?? 0) / scale);
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
    props.zoom();
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
    <>
      <div
        ref={panelRef}
        class="panel-window cluster-panel"
        style={styleFor(panelState())}
        onMouseDown={() => props.bringToFront()}
        onTouchStart={() => props.bringToFront()}
      >
        <div
          class="panel-header"
          onDblClick={(e) => {
            e.stopPropagation();
            props.onMaximizeToggle();
          }}
        >
          <div>
            <div class="panel-title">{titleFor()}</div>
            <div class="panel-subtitle">{props.count} items</div>
          </div>
          <div class="cluster-actions">
            <ActionMenu onSelect={handleAction} />
          </div>
        </div>
        <div ref={bodyRef} class="panel-body">
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
        </div>
        <div class="resize-handle" />
      </div>
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
