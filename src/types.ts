export type HierKey = "xkcd_color" | "design_color" | "common_color" | "color_family";
export type ClusterMethod = "dbscan" | "kmeans";

export type PanelPlacement = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};

export type ClusterColorPart = { name: string; pct: number; color: string };

export type ClusterDistribution = { id: number; parts: ClusterColorPart[] };

export type PanelPlacementMap = Record<string, PanelPlacement>;
export type ClusterDistributionMap = Record<string, ClusterColorPart[]>;
