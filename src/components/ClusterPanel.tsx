import type { Accessor } from "solid-js";
import { For, createEffect, onCleanup, onMount } from "solid-js";
import interact from "interactjs";
import Muuri from "muuri";
import ColorBar from "./ColorBar";
import type { PanelPlacement, ClusterColorPart } from "../types";
import { styleFor } from "../utils/panelStyle";

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
};

export default function ClusterPanel(props: ClusterPanelProps) {
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
            transform: `scale(${1 / props.zoom()})`,
            "transform-origin": "0 0",
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
