import type { Accessor } from "solid-js";
import { createEffect, onCleanup, onMount } from "solid-js";
import interact from "interactjs";
import { Chart } from "chart.js/auto";
import type { ClusterColorPart, PanelPlacement } from "../types";
import { styleFor } from "../utils/panelStyle";
import { CLUSTER_RESIZE_MIN_HEIGHT, CLUSTER_RESIZE_MIN_WIDTH } from "../appConfig";

export type PieChartWindowProps = {
  placement: PanelPlacement;
  data: ClusterColorPart[];
  onClose: () => void;
  onUpdate: (patch: Partial<PanelPlacement>) => void;
  bringToFront: () => void;
  zoom: Accessor<number>;
};

export default function PieChartWindow(props: PieChartWindowProps) {
  let panelRef: HTMLDivElement | undefined;
  let canvasRef: HTMLCanvasElement | undefined;
  let chart: Chart | undefined;

  const renderChart = () => {
    if (!canvasRef) return;
    chart?.destroy();
    if (!props.data || props.data.length === 0) {
      chart = undefined;
      return;
    }
    chart = new Chart(canvasRef, {
      type: "pie",
      data: {
        labels: props.data.map((p) => p.name),
        datasets: [
          {
            data: props.data.map((p) => p.pct * 100),
            backgroundColor: props.data.map((p) => p.color),
            borderWidth: 1,
          },
        ],
      },
      options: {
        plugins: {
          legend: {
            position: "right",
            labels: { boxWidth: 14, color: "#0f172a" },
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                const label = ctx.label ?? "";
                const value = ctx.raw as number;
                return `${label}: ${value.toFixed(1)}%`;
              },
            },
          },
        },
      },
    });
  };

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
            const scale = props.zoom();
            props.bringToFront();
            props.onUpdate({
              x: props.placement.x + ev.dx / scale,
              y: props.placement.y + ev.dy / scale,
            });
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
            const scale = props.zoom();
            const nextW = Math.max(
              CLUSTER_RESIZE_MIN_WIDTH,
              props.placement.width + (ev.deltaRect?.width ?? 0) / scale
            );
            const nextH = Math.max(
              CLUSTER_RESIZE_MIN_HEIGHT,
              props.placement.height + (ev.deltaRect?.height ?? 0) / scale
            );
            props.bringToFront();
            props.onUpdate({
              x: props.placement.x + (ev.deltaRect?.left ?? 0) / scale,
              y: props.placement.y + (ev.deltaRect?.top ?? 0) / scale,
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

  createEffect(renderChart);
  onCleanup(() => chart?.destroy());

  createEffect(() => {
    props.zoom();
    chart?.resize();
  });

  return (
    <div
      ref={panelRef}
      class="panel-window"
      style={styleFor(props.placement)}
      onMouseDown={props.bringToFront}
      onTouchStart={props.bringToFront}
    >
      <div class="panel-header">
        <div>
          <div class="panel-title">Color families</div>
          <div class="panel-subtitle">cluster distribution</div>
        </div>
        <div class="panel-header-actions">
          <button class="close-button" onClick={props.onClose} aria-label="Close chart window">
            ×
          </button>
        </div>
      </div>
      <div class="panel-body pie-window-body">
        <div class="chart-card-body pie-window-chart">
          <canvas ref={canvasRef} class="pie-window-canvas" />
        </div>
      </div>
    </div>
  );
}
