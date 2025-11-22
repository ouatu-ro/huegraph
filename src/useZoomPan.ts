import Panzoom, {
  type CurrentValues,
  type PanzoomEventDetail,
  type PanzoomObject,
} from "@panzoom/panzoom";
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
  const workspaceW = opts.width;
  const workspaceH = opts.height;
  const minScale = opts.minZoom ?? 0.5;
  const maxScale = opts.maxZoom ?? 2.5;

  // Solid state
  const [zoom, setZoom] = createSignal(1);
  const [offset, setOffset] = createSignal<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = createSignal(false);

  // DOM/Panzoom refs
  let panzoom: PanzoomObject | null = null;
  let canvasEl: HTMLDivElement | null = null;
  let parentEl: HTMLElement | null = null;

  // cached panel rect
  let lastControlPanel: Rect | null = null;

  // listeners
  let changeHandler: ((e: Event) => void) | null = null;
  let startHandler: (() => void) | null = null;
  let endHandler: (() => void) | null = null;
  let wheelHandler: ((e: WheelEvent) => void) | null = null;

  // RAF throttle for sync
  let rafPending = false;
  const syncState = (detail?: { x: number; y: number; scale: number }) => {
    if (!panzoom) return;
    const pan = detail ? { x: detail.x, y: detail.y } : panzoom.getPan();
    const scale = detail ? detail.scale : panzoom.getScale();
    setOffset({ x: pan.x, y: pan.y });
    setZoom(scale);
  };
  const syncStateRaf = (detail?: { x: number; y: number; scale: number }) => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      syncState(detail);
    });
  };

  const isInsidePanel = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest(".panel-window");

  // ------------------------------------------------------------
  // View helpers
  // ------------------------------------------------------------

  const getView = () => {
    if (panzoom) {
      const pan = panzoom.getPan();
      const scale = panzoom.getScale();
      return { x: pan.x, y: pan.y, scale };
    }
    return { x: offset().x, y: offset().y, scale: zoom() };
  };

  const screenToWorld = (p: Point, view = getView()): Point => ({
    x: (p.x - view.x) / view.scale,
    y: (p.y - view.y) / view.scale,
  });

  const worldToScreen = (p: Point, view = getView()): Point => ({
    x: p.x * view.scale + view.x,
    y: p.y * view.scale + view.y,
  });

  // ------------------------------------------------------------
  // Keep control panel visible
  // ------------------------------------------------------------

  const ensureControlPanelVisible = (rect?: Rect) => {
    if (!panzoom) return;
    if (rect) lastControlPanel = rect;
    const r = rect ?? lastControlPanel;
    if (!r) return;

    const { x: panX, y: panY, scale } = getView();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    const left = r.x * scale + panX;
    const right = left + r.width * scale;
    const top = r.y * scale + panY;
    const bottom = top + r.height * scale;

    let dx = 0;
    let dy = 0;

    if (left < margin) dx = margin - left;
    else if (right > vw - margin) dx = vw - margin - right;

    if (top < margin) dy = margin - top;
    else if (bottom > vh - margin) dy = vh - margin - bottom;

    if (dx || dy) {
      const nextX = panX + dx;
      const nextY = panY + dy;
      panzoom.pan(nextX, nextY, { animate: false });
      syncStateRaf({ x: nextX, y: nextY, scale });
    }
  };

  // ------------------------------------------------------------
  // Centering
  // ------------------------------------------------------------

  const centerWorkspace = (controlPanel?: Rect) => {
    if (controlPanel) lastControlPanel = controlPanel;
    if (!panzoom) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const initialScale = 1;

    const tx = (vw - workspaceW * initialScale) / 2;
    const ty = (vh - workspaceH * initialScale) / 2;

    panzoom.zoom(initialScale, { animate: false, force: true });
    panzoom.pan(tx, ty, { animate: false, force: true });
    syncStateRaf({ x: tx, y: ty, scale: initialScale });
    ensureControlPanelVisible(controlPanel);
  };

  const resetView = (controlPanel?: Rect) => {
    centerWorkspace(controlPanel ?? lastControlPanel ?? undefined);
  };

  const focusRect = (rect: Rect, pad = 40) => {
    if (!panzoom) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const availableW = Math.max(1, vw - pad * 2);
    const availableH = Math.max(1, vh - pad * 2);
    const fitScale = Math.min(
      maxScale,
      Math.max(
        minScale,
        Math.min(availableW / rect.width, availableH / rect.height)
      )
    );
    panzoom.zoom(fitScale, { animate: false, force: true });
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const panX = vw / 2 - centerX * fitScale;
    const panY = vh / 2 - centerY * fitScale;
    panzoom.pan(panX, panY, { animate: false, force: true });
    syncStateRaf({ x: panX, y: panY, scale: fitScale });
  };

  // ------------------------------------------------------------
  // Zoom controls
  // ------------------------------------------------------------

  const zoomIn = () => {
    if (!panzoom) return;
    const { x: panX, y: panY, scale } = getView();
    const factor = 1.2;
    const targetScale = Math.min(maxScale, Math.max(minScale, scale * factor));
    if (targetScale === scale) return;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const world = { x: (cx - panX) / scale, y: (cy - panY) / scale };
    panzoom.zoom(targetScale, { animate: false, force: true });
    const nextX = cx - world.x * targetScale;
    const nextY = cy - world.y * targetScale;
    panzoom.pan(nextX, nextY, { animate: false, force: true });
    syncStateRaf({ x: nextX, y: nextY, scale: targetScale });
  };

  const zoomOut = () => {
    if (!panzoom) return;
    const { x: panX, y: panY, scale } = getView();
    const factor = 1 / 1.2;
    const targetScale = Math.min(maxScale, Math.max(minScale, scale * factor));
    if (targetScale === scale) return;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const world = { x: (cx - panX) / scale, y: (cy - panY) / scale };
    panzoom.zoom(targetScale, { animate: false, force: true });
    const nextX = cx - world.x * targetScale;
    const nextY = cy - world.y * targetScale;
    panzoom.pan(nextX, nextY, { animate: false, force: true });
    syncStateRaf({ x: nextX, y: nextY, scale: targetScale });
  };

  const setZoomLevel = (scale: number) => {
    if (!panzoom) return;
    panzoom.zoom(scale, { animate: false, force: true });
    syncStateRaf();
    ensureControlPanelVisible();
  };

  // ------------------------------------------------------------
  // Init Panzoom (Panzoom OWNS panning — no custom drag)
  // ------------------------------------------------------------

  const setupPanzoom = () => {
    if (!canvasEl || panzoom) return;

    if (!canvasEl.isConnected) {
      requestAnimationFrame(setupPanzoom);
      return;
    }

    parentEl = canvasEl.parentElement as HTMLElement | null;

    panzoom = Panzoom(canvasEl, {
      minScale,
      maxScale,
      startScale: 1,
      startX: 0,
      startY: 0,

      cursor: "grab",
      origin: "0 0",
      excludeClass: "panel-window",

      // keep transforms consistent & GPU friendly
      setTransform: (
        target: HTMLElement | SVGElement,
        { x, y, scale }: CurrentValues
      ) => {
        target.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
      },
    });

    changeHandler = (ev: Event) => {
      const detail = (ev as CustomEvent<PanzoomEventDetail>).detail;
      syncStateRaf(detail);
    };
    startHandler = () => setIsPanning(true);
    endHandler = () => setIsPanning(false);

    canvasEl.addEventListener("panzoomchange", changeHandler as EventListener);
    canvasEl.addEventListener("panzoomstart", startHandler);
    canvasEl.addEventListener("panzoomend", endHandler);

    // ----------------------------------------------
    // Cursor-anchored smooth wheel zoom
    // ----------------------------------------------
    wheelHandler = (ev: WheelEvent) => {
      if (!panzoom) return;

      // allow panel scroll normally
      if (isInsidePanel(ev.target)) return;

      ev.preventDefault();

      const { x: panX, y: panY, scale } = getView();

      // exponential zoom feels natural
      const ZOOM_SENSITIVITY = 0.0015;
      const zoomFactor = Math.exp(-ev.deltaY * ZOOM_SENSITIVITY);

      const newScale = Math.min(
        maxScale,
        Math.max(minScale, scale * zoomFactor)
      );

      // screen→world anchor point before zoom
      const worldBefore = {
        x: (ev.clientX - panX) / scale,
        y: (ev.clientY - panY) / scale,
      };

      // apply zoom (no animation)
      panzoom.zoom(newScale, { animate: false, force: true });

      // adjust pan so that worldBefore stays under cursor
      const newPanX = ev.clientX - worldBefore.x * newScale;
      const newPanY = ev.clientY - worldBefore.y * newScale;

      panzoom.pan(newPanX, newPanY, { animate: false, force: true });

      // sync signals
      syncStateRaf({ x: newPanX, y: newPanY, scale: newScale });
    };

    // attach to parent so wheel works even if cursor isn't exactly on canvas bg
    (parentEl ?? canvasEl).addEventListener("wheel", wheelHandler, {
      passive: false,
    });

    requestAnimationFrame(() => centerWorkspace());
  };

  const canvasRef = (el: HTMLDivElement) => {
    canvasEl = el;
    setupPanzoom();
  };

  // ------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------

  onCleanup(() => {
    if (canvasEl && changeHandler)
      canvasEl.removeEventListener(
        "panzoomchange",
        changeHandler as EventListener
      );
    if (canvasEl && startHandler)
      canvasEl.removeEventListener("panzoomstart", startHandler);
    if (canvasEl && endHandler)
      canvasEl.removeEventListener("panzoomend", endHandler);
    if ((parentEl ?? canvasEl) && wheelHandler)
      (parentEl ?? canvasEl)!.removeEventListener("wheel", wheelHandler);

    panzoom?.destroy();
    panzoom = null;
  });

  return {
    canvasRef,
    zoom,
    offset,
    isPanning,

    zoomIn,
    zoomOut,
    setZoom: setZoomLevel,

    resetView, // (controlPanel?: Rect) => void
    centerWorkspace, // (controlPanel?: Rect) => void
    ensureControlPanelVisible, // (rect?: Rect) => void
    focusRect, // (rect: Rect, pad?: number) => void

    getView, // () => { x, y, scale }
    screenToWorld, // (Point) => Point
    worldToScreen, // (Point) => Point
  };
}
