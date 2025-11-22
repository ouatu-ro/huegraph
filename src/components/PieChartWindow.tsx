import type { Accessor } from "solid-js";
import { createEffect, onCleanup, onMount } from "solid-js";
import { Chart } from "chart.js/auto";
import type { ClusterColorPart, PanelPlacement } from "../types";
import WindowBase from "./WindowBase";

export type PieChartWindowProps = {
  placement: PanelPlacement;
  data: ClusterColorPart[];
  onClose: () => void;
  onUpdate: (patch: Partial<PanelPlacement>) => void;
  bringToFront: () => void;
  zoom: Accessor<number>;
};

export default function PieChartWindow(props: PieChartWindowProps) {
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
        responsive: true,
        maintainAspectRatio: false,
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

  onMount(renderChart);

  createEffect(renderChart);

  createEffect(() => {
    const { width, height } = props.placement;
    width;
    height;
    requestAnimationFrame(() => chart?.resize());
  });

  onCleanup(() => {
    chart?.destroy();
  });

  return (
    <WindowBase
      placement={() => props.placement}
      onUpdate={props.onUpdate}
      bringToFront={props.bringToFront}
      zoom={props.zoom}
      title="Color families"
      subtitle="cluster distribution"
      onClose={props.onClose}
      bodyClass="pie-window-body"
    >
      <div class="chart-card-body pie-window-chart">
        <canvas ref={canvasRef} class="pie-window-canvas" />
      </div>
    </WindowBase>
  );
}
