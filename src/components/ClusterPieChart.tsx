import { Show, createEffect, onCleanup, onMount } from "solid-js";
import { Chart } from "chart.js/auto";
import type { ClusterColorPart } from "../types";

export default function ClusterPieChart(props: { parts: ClusterColorPart[]; onClose: () => void }) {
  let canvasRef: HTMLCanvasElement | undefined;
  let chart: Chart | undefined;

  const renderChart = () => {
    if (!props.parts || props.parts.length === 0) {
      chart?.destroy();
      chart = undefined;
      return;
    }
    if (!canvasRef) return;
    chart?.destroy();
    chart = new Chart(canvasRef, {
      type: "pie",
      data: {
        labels: props.parts.map((p) => p.name),
        datasets: [
          {
            data: props.parts.map((p) => p.pct * 100),
            backgroundColor: props.parts.map((p) => p.color),
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

  onMount(renderChart);
  createEffect(renderChart);
  onCleanup(() => chart?.destroy());

  return (
    <div class="chart-card">
      <div class="chart-card-header">
        <div class="panel-title">Color families</div>
        <button class="ghost-button small" onClick={props.onClose}>
          Close chart
        </button>
      </div>
      <div class="chart-card-body">
        <Show when={props.parts && props.parts.length > 0} fallback={<div class="muted-text">No distribution available</div>}>
          <canvas ref={canvasRef} width={240} height={180} />
        </Show>
      </div>
    </div>
  );
}
