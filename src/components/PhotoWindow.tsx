import type { Accessor } from "solid-js";
import { onCleanup, onMount } from "solid-js";
import interact from "interactjs";
import type { PanelPlacement } from "../types";
import { CLUSTER_RESIZE_MIN_HEIGHT, CLUSTER_RESIZE_MIN_WIDTH } from "../appConfig";

export type PhotoWindowProps = {
  state: Accessor<PanelPlacement | undefined>;
  style: Record<string, string>;
  bringToFront: () => void;
  onUpdate: (patch: Partial<PanelPlacement>) => void;
  onClose: () => void;
  imageSrc: string;
  zoom: Accessor<number>;
};

export default function PhotoWindow(props: PhotoWindowProps) {
  let panelRef: HTMLDivElement | undefined;

  onMount(() => {
    if (!panelRef) return;
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
          },
          end() {
            document.body.classList.remove("no-select");
          },
        },
      });
    onCleanup(() => interaction.unset());
  });

  return (
    <div
      ref={panelRef}
      class="panel-window photo-window"
      style={props.style}
      onMouseDown={props.bringToFront}
      onTouchStart={props.bringToFront}
    >
      <div class="panel-header">
        <div>
          <div class="panel-title">Photo preview</div>
          <div class="panel-subtitle">double click thumbnail to reopen</div>
        </div>
        <div class="panel-header-actions">
          <button class="close-button" onClick={props.onClose} aria-label="Close">
            ×
          </button>
        </div>
      </div>
      <div class="panel-body photo-window-body">
        <img src={props.imageSrc} alt="" />
      </div>
    </div>
  );
}
