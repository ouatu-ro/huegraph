import { For } from "solid-js";
import type { ClusterColorPart } from "../types";

export default function ColorBar(props: { parts: ClusterColorPart[] }) {
  if (!props.parts || props.parts.length === 0) return null;
  return (
    <div
      class="color-bar"
      title={props.parts.map((part) => `${part.name}: ${(part.pct * 100).toFixed(1)}%`).join("  ·  ")}>
      <For each={props.parts}>
        {(part) => (
          <div class="color-segment" style={{ width: `${part.pct * 100}%`, "background-color": part.color }} />
        )}
      </For>
    </div>
  );
}
