import Panzoom, { type CurrentValues, type PanzoomEventDetail, type PanzoomObject } from "@panzoom/panzoom";
import { createSignal, onCleanup } from "solid-js";

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

type ZoomPanOptions = {
  width: number;
  height: number;
  minZoom?: number;
  maxZoom?: number;
};

export function createZoomPan(opts: ZoomPanOptions) {
  const [zoom, setZoom] = createSignal(1);
  const [offset, setOffset] = createSignal<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = createSignal(false);

  const workspace = { width: opts.width, height: opts.height };
  const minScale = opts.minZoom ?? 0.5;
  const maxScale = opts.maxZoom ?? 2.5;

  let panzoom: PanzoomObject | undefined;
  let canvasEl: HTMLDivElement | null = null;
  let canvasParent: HTMLElement | null = null;
  let wheelHandler: ((event: WheelEvent) => void) | undefined;
  let changeHandler: ((event: Event) => void) | undefined;
  let startHandler: (() => void) | undefined;
  let endHandler: (() => void) | undefined;
  let lastControlPanelRect: Rect | undefined;
  let pendingInit: number | undefined;

  const syncState = (detail?: { x: number; y: number; scale: number }) => {
    if (!panzoom) return;
    const pan = detail ? { x: detail.x, y: detail.y } : panzoom.getPan();
    const scale = detail ? detail.scale : panzoom.getScale();
    setOffset({ x: pan.x, y: pan.y });
    setZoom(scale);
  };

  const ensureControlPanelVisible = (rect?: Rect) => {
    if (!panzoom) return;
    if (rect) lastControlPanelRect = rect;
    const target = rect ?? lastControlPanelRect;
    if (!target) return;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const scale = panzoom.getScale();
    const pan = panzoom.getPan();
    const margin = 12;

    const left = target.x * scale + pan.x;
    const right = left + target.width * scale;
    const top = target.y * scale + pan.y;
    const bottom = top + target.height * scale;

    let dx = 0;
    let dy = 0;
    if (left < margin) dx = margin - left;
    else if (right > viewportW - margin) dx = viewportW - margin - right;
    if (top < margin) dy = margin - top;
    else if (bottom > viewportH - margin) dy = viewportH - margin - bottom;

    if (dx !== 0 || dy !== 0) {
      const nextX = pan.x + dx;
      const nextY = pan.y + dy;
      panzoom.pan(nextX, nextY, { animate: false });
      syncState({ x: nextX, y: nextY, scale });
    }
  };

  const centerWorkspace = (controlPanelRect?: Rect) => {
    if (controlPanelRect) lastControlPanelRect = controlPanelRect;
    if (!panzoom) return;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const initialScale = 1;
    const tx = (viewportW - workspace.width * initialScale) / 2;
    const ty = (viewportH - workspace.height * initialScale) / 2;

    panzoom.zoom(initialScale, { animate: false, force: true });
    panzoom.pan(tx, ty, { animate: false, force: true });
    syncState({ x: tx, y: ty, scale: initialScale });
    ensureControlPanelVisible(controlPanelRect);
  };

  const zoomIn = () => {
    panzoom?.zoomIn({ animate: false });
    syncState();
  };

  const zoomOut = () => {
    panzoom?.zoomOut({ animate: false });
    syncState();
  };

  const resetView = (controlPanelRect?: Rect) => {
    centerWorkspace(controlPanelRect ?? lastControlPanelRect);
  };

  const setupPanzoom = () => {
    if (panzoom || !canvasEl) return;
    if (!canvasEl.isConnected || !document.body.contains(canvasEl)) {
      pendingInit = requestAnimationFrame(setupPanzoom);
      return;
    }

    const parent = canvasEl.parentElement as HTMLElement | null;
    if (!parent) {
      pendingInit = requestAnimationFrame(setupPanzoom);
      return;
    }
    canvasParent = parent;

    panzoom = Panzoom(canvasEl, {
      minScale,
      maxScale,
      startScale: 1,
      startX: 0,
      startY: 0,
      cursor: "grab",
      origin: "0 0",
      excludeClass: "panel-window",
      setTransform: (target: HTMLElement | SVGElement, { x, y, scale }: CurrentValues) => {
        target.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      },
    });

    changeHandler = (event: Event) => {
      const detail = (event as CustomEvent<PanzoomEventDetail>).detail;
      syncState(detail);
    };
    startHandler = () => setIsPanning(true);
    endHandler = () => setIsPanning(false);

    canvasEl.addEventListener("panzoomchange", changeHandler as EventListener);
    canvasEl.addEventListener("panzoomstart", startHandler);
    canvasEl.addEventListener("panzoomend", endHandler);

    wheelHandler = (event: WheelEvent) => panzoom?.zoomWithWheel(event);
    canvasParent.addEventListener("wheel", wheelHandler, { passive: false });

    centerWorkspace();
  };

  const canvasRef = (el: HTMLDivElement) => {
    canvasEl = el;
    setupPanzoom();
  };

  const cleanup = () => {
    if (canvasEl && changeHandler) {
      canvasEl.removeEventListener("panzoomchange", changeHandler as EventListener);
    }
    if (canvasEl && startHandler) {
      canvasEl.removeEventListener("panzoomstart", startHandler);
    }
    if (canvasEl && endHandler) {
      canvasEl.removeEventListener("panzoomend", endHandler);
    }
    if (canvasParent && wheelHandler) {
      canvasParent.removeEventListener("wheel", wheelHandler);
    }
    if (pendingInit != null) cancelAnimationFrame(pendingInit);
    panzoom?.destroy();
    panzoom = undefined;
  };

  onCleanup(cleanup);

  return {
    canvasRef,
    zoom,
    offset,
    zoomIn,
    zoomOut,
    resetView,
    centerWorkspace,
    ensureControlPanelVisible,
    isPanning,
    setZoom: (scale: number) => {
      if (!panzoom) return;
      panzoom.zoom(scale, { animate: false });
      syncState();
    },
  };
}
