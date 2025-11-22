import type { Accessor, JSX } from "solid-js";
import { createEffect, onCleanup, onMount } from "solid-js";
import interact from "interactjs";
import type { PanelPlacement } from "../types";
import { styleFor } from "../utils/panelStyle";
import {
  CLUSTER_RESIZE_MIN_HEIGHT,
  CLUSTER_RESIZE_MIN_WIDTH,
} from "../appConfig";

export type WindowBaseProps = {
  placement: Accessor<PanelPlacement | undefined>;
  onUpdate: (patch: Partial<PanelPlacement>) => void;
  bringToFront: () => void;
  zoom: Accessor<number>;
  title: string;
  subtitle?: string;
  headerActions?: JSX.Element;
  onClose?: () => void;
  onHeaderDblClick?: (ev: MouseEvent) => void;
  class?: string;
  bodyClass?: string;
  children: JSX.Element;
  bodyRef?: (el: HTMLDivElement) => void;
  minWidth?: number;
  minHeight?: number;
  allowResize?: boolean;
};

type PendingDelta = {
  dw: number;
  dh: number;
  dl: number;
  dt: number;
};

export default function WindowBase(props: WindowBaseProps) {
  let panelRef: HTMLDivElement | undefined;
  let rafId: number | null = null;
  let pending: PendingDelta = { dw: 0, dh: 0, dl: 0, dt: 0 };
  let lastPlacement: PanelPlacement | undefined;
  let interaction: ReturnType<typeof interact> | null = null;

  const minWidth = () => props.minWidth ?? CLUSTER_RESIZE_MIN_WIDTH;
  const minHeight = () => props.minHeight ?? CLUSTER_RESIZE_MIN_HEIGHT;
  const allowResize = () => props.allowResize !== false;

  createEffect(() => {
    const p = props.placement();
    if (p) lastPlacement = p;
    pending = { dw: 0, dh: 0, dl: 0, dt: 0 };
  });

  const flush = () => {
    rafId = null;
    const base = lastPlacement ?? props.placement();
    if (!base) {
      pending = { dw: 0, dh: 0, dl: 0, dt: 0 };
      return;
    }
    const next: Partial<PanelPlacement> = {
      x: base.x + pending.dl,
      y: base.y + pending.dt,
      width: base.width + pending.dw,
      height: base.height + pending.dh,
    };
    pending = { dw: 0, dh: 0, dl: 0, dt: 0 };
    lastPlacement = { ...base, ...next };
    props.onUpdate(next);
  };

  const enqueue = () => {
    if (rafId === null) rafId = requestAnimationFrame(flush);
  };

  onMount(() => {
    if (!panelRef) return;
    interaction = interact(panelRef)
      .draggable({
        inertia: false,
        allowFrom: ".panel-header",
        ignoreFrom: ".panel-body",
        listeners: {
          start() {
            document.body.classList.add("no-select");
            props.bringToFront();
          },
          move(ev) {
            const scale = props.zoom();
            const cur = props.placement();
            if (!cur) return;
            props.onUpdate({
              x: cur.x + ev.dx / scale,
              y: cur.y + ev.dy / scale,
            });
          },
          end() {
            document.body.classList.remove("no-select");
          },
        },
      })
      .resizable(
        allowResize()
          ? {
              edges: { left: false, right: true, bottom: true, top: false },
              modifiers: [
                interact.modifiers!.restrictSize({
                  min: { width: minWidth(), height: minHeight() },
                }),
              ],
              listeners: {
                start() {
                  document.body.classList.add("no-select");
                },
                move(ev) {
                  const scale = props.zoom();
                  pending.dw += (ev.deltaRect?.width ?? 0) / scale;
                  pending.dh += (ev.deltaRect?.height ?? 0) / scale;
                  pending.dl += (ev.deltaRect?.left ?? 0) / scale;
                  pending.dt += (ev.deltaRect?.top ?? 0) / scale;
                  enqueue();
                },
                end() {
                  document.body.classList.remove("no-select");
                },
              },
            }
          : false
      );
  });

  onCleanup(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    interaction?.unset();
  });

  return (
    <div
      ref={panelRef}
      class={`panel-window ${props.class ?? ""}`}
      style={props.placement() ? styleFor(props.placement()) : { display: "none" }}
      onMouseDown={props.bringToFront}
      onTouchStart={props.bringToFront}
    >
      <div class="panel-header" onDblClick={props.onHeaderDblClick}>
        <div>
          <div class="panel-title">{props.title}</div>
          <div class="panel-subtitle">{props.subtitle}</div>
        </div>
        <div class="panel-header-actions">
          {props.headerActions}
          {props.onClose ? (
            <button class="close-button" onClick={props.onClose} aria-label="Close">
              ×
            </button>
          ) : null}
        </div>
      </div>
      <div
        ref={(el) => {
          props.bodyRef?.(el);
        }}
        class={`panel-body ${props.bodyClass ?? ""}`}
      >
        {props.children}
      </div>
      {allowResize() ? <div class="resize-handle" /> : null}
    </div>
  );
}
