import type { Accessor } from "solid-js";
import { createEffect, onCleanup } from "solid-js";
import { Chart } from "chart.js/auto";
import type { ClusterColorPart, PanelPlacement } from "../types";
import WindowBase from "./WindowBase";

export type PieChartWindowProps = {
  placement: Accessor<PanelPlacement | undefined>;
  data: ClusterColorPart[];
  onClose: () => void;
  onUpdate: (patch: Partial<PanelPlacement>) => void;
  bringToFront: () => void;
  zoom: Accessor<number>;
  onMaximizeToggle: () => void;
};

export default function PieChartWindow(props: PieChartWindowProps) {
  let canvasRef: HTMLCanvasElement | undefined;
  let chart: Chart | undefined;
  function syncCanvasSize(canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, rect.width);
    canvas.height = Math.max(1, rect.height);
  }



  createEffect(() => {
    const data = props.data;
    if (!canvasRef) return;

    syncCanvasSize(canvasRef);

    if (!chart) {
      chart = new Chart(canvasRef, {
        type: "pie",
        data: {
          labels: data.map((p) => p.name),
          datasets: [
            {
              data: data.map((p) => p.pct * 100),
              backgroundColor: data.map((p) => p.color),
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: {
              position: "right",
              labels: {
                boxWidth: 14,
                color: "#0f172a",
              },
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
      return;
    }

    chart.data.labels = data.map((p) => p.name);
    const dataset = chart.data.datasets[0];
    dataset.data = data.map((p) => p.pct * 100);
    dataset.backgroundColor = data.map((p) => p.color);
    chart.update("none");
  });

  onCleanup(() => chart?.destroy());

  return (
    <WindowBase
      placement={props.placement}
      onUpdate={props.onUpdate}
      bringToFront={props.bringToFront}
      zoom={props.zoom}
      title="Color families"
      subtitle="cluster distribution"
      onClose={props.onClose}
      bodyClass="pie-window-body"
      onHeaderDblClick={(e) => {
        e.stopPropagation();
        props.onMaximizeToggle();
      }}
    >
      <div class="pie-window-chart">
        <canvas ref={canvasRef} class="pie-window-canvas" />
      </div>
    </WindowBase>
  );
}
