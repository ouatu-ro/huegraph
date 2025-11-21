import type { Accessor } from "solid-js";

export type ZoomWidgetProps = {
  zoom: Accessor<number>;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
};

export default function ZoomWidget(props: ZoomWidgetProps) {
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
