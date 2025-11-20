declare module "js-untar" {
  export type UntarFile = {
    name: string;
    buffer: ArrayBuffer;
    size?: number;
    type?: string;
  };

  export default function untar(buffer: ArrayBuffer): Promise<UntarFile[]>;
}

declare module "density-clustering" {
  export type DistanceFn = (a: number[], b: number[]) => number;

  export class DBSCAN {
    run(data: number[][], eps: number, minPts: number, distance?: DistanceFn): number[][];
    noise: number[];
    clusters: number[][];
  }

  export class KMEANS {
    run(data: number[][], k: number, epsilon?: number): number[][];
    clusters: number[][];
    centroids: number[][];
  }
}
