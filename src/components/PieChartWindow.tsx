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

  const currentSize = () => {
    const placement = props.placement();
    return {
      width: placement?.width ?? 320,
      height: placement?.height ?? 240,
    };
  };

  const ensureSize = () => {
    if (!canvasRef) return;
    const { width, height } = currentSize();
    if (canvasRef.width !== width || canvasRef.height !== height) {
      canvasRef.width = width;
      canvasRef.height = height;
      chart?.resize();
    }
  };

  const ensureChart = () => {
    if (!canvasRef) return;
    ensureSize();
    if (!props.data || props.data.length === 0) {
      chart?.destroy();
      chart = undefined;
      return;
    }
    if (!chart) {
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
          responsive: false,
          maintainAspectRatio: false,
          animation: false,
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
      return;
    }
    chart.data.labels = props.data.map((p) => p.name);
    const dataset = chart.data.datasets[0];
    dataset.data = props.data.map((p) => p.pct * 100);
    dataset.backgroundColor = props.data.map((p) => p.color);
    chart.update("none");
  };

  createEffect(ensureChart);

  createEffect(() => {
    const { width, height } = currentSize();
    width;
    height;
    ensureSize();
  });

  onCleanup(() => {
    chart?.destroy();
  });

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
      <div class="chart-card-body pie-window-chart">
        <canvas ref={canvasRef} class="pie-window-canvas" />
      </div>
    </WindowBase>
  );
}
