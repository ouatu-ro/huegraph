import type { PanelPlacement } from "../types";

export const styleFor = (panel?: PanelPlacement): Record<string, string> =>
  panel
    ? {
        left: `${panel.x}px`,
        top: `${panel.y}px`,
        width: `${panel.width}px`,
        height: `${panel.height}px`,
        "z-index": `${panel.zIndex}`,
      }
    : {};
