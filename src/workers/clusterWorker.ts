/// <reference lib="webworker" />

import "./untarShim";
import pako from "pako";
import untar, { type UntarFile } from "js-untar";
import { Channels, extract } from "colorgram";
import { DBSCAN, KMEANS } from "density-clustering";

type TaxEntry = {
  rgb: [number, number, number];
  xkcd_color: string;
  design_color: string;
  common_color: string;
  color_family: string;
};

type RawTaxEntry = {
  xkcd_color: string;
  xkcd_r: number;
  xkcd_g: number;
  xkcd_b: number;
  design_color: string;
  common_color: string;
  color_family: string;
};

type HierKey = "xkcd_color" | "design_color" | "common_color" | "color_family";

type PaletteColor = {
  rgb: [number, number, number];
  proportion: number;
};

type ColorgramStat = [number, number, number, number];

type WorkerMsg =
  | { type: "INIT"; kColors?: number }
  | {
      type: "RUN_CLUSTER";
      layer: HierKey;
      method?: "dbscan" | "kmeans";
      eps: number;
      minPts: number;
      k?: number;
      runId?: number;
    };

type WorkerOut =
  | { type: "PROGRESS"; phase: string; done: number; total: number }
  | { type: "READY"; nImages: number; imageUrls?: string[] }
  | {
      type: "CLUSTERS";
      labels: number[];
      layer: HierKey;
      runId?: number;
      colorFamilyDist?: ClusterDistribution[];
    };

type ClusterDistribution = {
  id: number;
  parts: { name: string; pct: number; color: string }[];
};

let images: ImageBitmap[] = [];
let imageUrls: string[] = [];
let tax: TaxEntry[] = [];
let ordMaps: Record<HierKey, Map<string, number>> | null = null;
let ordLists: Record<HierKey, string[]> | null = null;
let distsCache: Record<HierKey, Float32Array[]> | null = null;
let colorFamilyPalette: string[] | null = null;

const LAYERS: readonly HierKey[] = ["xkcd_color", "design_color", "common_color", "color_family"];
const WORKER_TAG = "[clusterWorker]";

const logInfo = (message: string, data?: unknown) => {
  if (data !== undefined) {
    console.info(`${WORKER_TAG} ${message}`, data);
  } else {
    console.info(`${WORKER_TAG} ${message}`);
  }
};

const logError = (message: string, error: unknown) => {
  console.error(`${WORKER_TAG} ${message}`, error);
};

function fail(stage: string, error: unknown): never {
  const err = error instanceof Error ? error : new Error(String(error));
  logError(`${stage} failed`, err);
  (self as any).postMessage({
    type: "PROGRESS",
    phase: `${stage} failed: ${err.message}`,
    done: 0,
    total: 1,
  } satisfies WorkerOut);
  throw err;
}

// -------------------- helpers --------------------

function nearestTaxonomy(rgb: [number, number, number]) {
  if (!tax.length) throw new Error("taxonomy not loaded");
  if (!rgb) throw new Error("palette color missing rgb");
  if (!Array.isArray(rgb) || rgb.length < 3) throw new Error("palette color rgb malformed");
  if (rgb.some((v) => typeof v !== "number" || Number.isNaN(v))) throw new Error("palette color rgb non-numeric");
  // brute NN in RGB space (same spirit as your notebook)
  let best: TaxEntry | null = null;
  let bestD = Infinity;
  for (const e of tax) {
    const d =
      (rgb[0] - e.rgb[0]) ** 2 +
      (rgb[1] - e.rgb[1]) ** 2 +
      (rgb[2] - e.rgb[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best!;
}

async function bitmapToImageData(bmp: ImageBitmap) {
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, bmp.width, bmp.height);
}

async function extractPalette(bmp: ImageBitmap, kColors: number): Promise<PaletteColor[]> {
  const id = await bitmapToImageData(bmp);
  const pixelData = new Uint8Array(id.data.buffer, id.data.byteOffset, id.data.byteLength);

  // The library works on raw pixel buffers and returns palette entries shaped like [r, g, b, proportion].
  const stats = extract({ data: pixelData, channels: Channels.RGBAlpha }, kColors) as ColorgramStat[];

  const palette: PaletteColor[] = [];
  for (const entry of stats) {
    const [r, g, b, p] = entry ?? [];
    if ([r, g, b].some((v) => typeof v !== "number" || Number.isNaN(v))) {
      logError("dropping invalid palette entry", entry);
      continue;
    }
    palette.push({
      rgb: [r ?? 0, g ?? 0, b ?? 0],
      proportion: typeof p === "number" && Number.isFinite(p) ? p : 0,
    });
  }

  if (palette.length === 0) {
    logError("no palette colors extracted", { width: bmp.width, height: bmp.height });
  }

  return palette;
}

function buildOrdMaps() {
  const xkcd = new Map<string, number>();
  const design = new Map<string, number>();
  const common = new Map<string, number>();
  const fam = new Map<string, number>();

  const xkcdList: string[] = [];
  const designList: string[] = [];
  const commonList: string[] = [];
  const famList: string[] = [];

  let idx = 0;
  for (const e of tax) {
    if (!xkcd.has(e.xkcd_color)) {
      xkcd.set(e.xkcd_color, idx);
      xkcdList[idx] = e.xkcd_color;
      idx++;
    }
  }
  idx = 0;
  for (const e of tax) {
    if (!design.has(e.design_color)) {
      design.set(e.design_color, idx);
      designList[idx] = e.design_color;
      idx++;
    }
  }
  idx = 0;
  for (const e of tax) {
    if (!common.has(e.common_color)) {
      common.set(e.common_color, idx);
      commonList[idx] = e.common_color;
      idx++;
    }
  }
  idx = 0;
  for (const e of tax) {
    if (!fam.has(e.color_family)) {
      fam.set(e.color_family, idx);
      famList[idx] = e.color_family;
      idx++;
    }
  }

  ordMaps = {
    xkcd_color: xkcd,
    design_color: design,
    common_color: common,
    color_family: fam,
  };

  ordLists = {
    xkcd_color: xkcdList,
    design_color: designList,
    common_color: commonList,
    color_family: famList,
  };

  colorFamilyPalette = buildColorFamilyPalette(fam);
}

function rgbToHex(rgb: [number, number, number]) {
  return `#${rgb
    .map((v) => {
      const clamped = Math.max(0, Math.min(255, Math.round(v)));
      return clamped.toString(16).padStart(2, "0");
    })
    .join("")}`;
}

function buildColorFamilyPalette(famMap: Map<string, number>) {
  const accum = new Map<string, { sum: [number, number, number]; n: number }>();
  for (const entry of tax) {
    const key = entry.color_family;
    const cur = accum.get(key) ?? { sum: [0, 0, 0], n: 0 };
    cur.sum[0] += entry.rgb[0];
    cur.sum[1] += entry.rgb[1];
    cur.sum[2] += entry.rgb[2];
    cur.n += 1;
    accum.set(key, cur);
  }

  const palette: string[] = [];
  for (const [name, idx] of famMap.entries()) {
    const stats = accum.get(name);
    const avg: [number, number, number] = stats
      ? [stats.sum[0] / stats.n, stats.sum[1] / stats.n, stats.sum[2] / stats.n]
      : [148, 163, 184];
    palette[idx] = rgbToHex(avg);
  }
  return palette;
}

async function buildDistributions(kColors: number) {
  if (!ordMaps) buildOrdMaps();

  const maps = ordMaps!;
  // distribution per image per layer
  const dists: Record<HierKey, Float32Array[]> = {
    xkcd_color: [],
    design_color: [],
    common_color: [],
    color_family: [],
  };

  for (let i = 0; i < images.length; i++) {
    (self as any).postMessage({
      type: "PROGRESS",
      phase: "extracting palettes",
      done: i,
      total: images.length,
    } satisfies WorkerOut);

    const palette = await extractPalette(images[i], kColors);

    // accumulate proportions per taxonomy name
    const acc: Record<HierKey, Map<string, number>> = {
      xkcd_color: new Map(),
      design_color: new Map(),
      common_color: new Map(),
      color_family: new Map(),
    };

    for (const c of palette) {
      const rgb = c?.rgb;
      if (!Array.isArray(rgb) || rgb.length < 3 || rgb.some((v) => typeof v !== "number" || Number.isNaN(v))) {
        logError("skipping palette entry with invalid rgb", { paletteIndex: palette.indexOf(c), rgb });
        continue;
      }
      const nearest = nearestTaxonomy(rgb as [number, number, number]);
      LAYERS.forEach((layer) => {
        const key = nearest[layer];
        acc[layer].set(key, (acc[layer].get(key) ?? 0) + c.proportion);
      });
    }

    if (palette.length === 0) {
      logError("no valid palette entries for image", { imageIndex: i });
    }

    // to dense vectors
    LAYERS.forEach((layer) => {
      const size = maps[layer].size;
      const v = new Float32Array(size);
      for (const [name, p] of acc[layer]) {
        const j = maps[layer].get(name);
        if (j != null) v[j] = p;
      }
      dists[layer].push(v);
    });
  }

  return dists;
}

// -------------------- init samples --------------------

async function loadSamplesTarGz() {
  logInfo("fetching samples");
  const res = await fetch("/samples.tar.gz");
  if (!res.ok) {
    throw new Error(`Failed to fetch samples: ${res.status} ${res.statusText}`);
  }
  const gz = new Uint8Array(await res.arrayBuffer());
  let tarBytes: Uint8Array;
  if (gz.length >= 2 && gz[0] === 0x1f && gz[1] === 0x8b) {
    tarBytes = pako.ungzip(gz);
  } else {
    // dev servers sometimes decompress .gz on the fly; accept raw tar in that case
    tarBytes = gz;
    logInfo("samples already decompressed by server; skipping gunzip");
  }
  const files: UntarFile[] = await untar(tarBytes.buffer as ArrayBuffer);

  // filter & sort by numeric filename
  const jpgs = files
    .filter((f) => f.name.endsWith(".jpg"))
    .sort((a, b) => {
      const na = parseInt(a.name.match(/(\d+)\.jpg$/)?.[1] ?? "0", 10);
      const nb = parseInt(b.name.match(/(\d+)\.jpg$/)?.[1] ?? "0", 10);
      return na - nb;
    });

  images = [];
  imageUrls = [];
  for (let i = 0; i < jpgs.length; i++) {
    (self as any).postMessage({
      type: "PROGRESS",
      phase: "decoding samples",
      done: i,
      total: jpgs.length,
    } satisfies WorkerOut);

    const blob = new Blob([jpgs[i].buffer], { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    imageUrls.push(url);
    const bmp = await createImageBitmap(blob);
    images.push(bmp);
  }

  logInfo("sample archive decoded", { count: images.length });
}

async function loadTaxonomy() {
  logInfo("fetching taxonomy");
  const res = await fetch("/colornamer.json");
  const data: RawTaxEntry[] = await res.json();
  const parsed: TaxEntry[] = [];
  let dropped = 0;
  for (const entry of data) {
    const { xkcd_r, xkcd_g, xkcd_b } = entry;
    const rgb = [xkcd_r, xkcd_g, xkcd_b];
    if (rgb.some((v) => typeof v !== "number" || Number.isNaN(v))) {
      dropped++;
      continue;
    }
    parsed.push({
      rgb: rgb as [number, number, number],
      xkcd_color: entry.xkcd_color,
      design_color: entry.design_color,
      common_color: entry.common_color,
      color_family: entry.color_family,
    });
  }
  if (dropped > 0) {
    logError("dropped invalid taxonomy rows", { dropped, kept: parsed.length });
  }
  tax = parsed;
  buildOrdMaps();
  logInfo("taxonomy cached", { entries: tax.length });
}

// -------------------- message handler --------------------

self.onmessage = async (evt: MessageEvent<WorkerMsg>) => {
  const msg = evt.data;

  if (msg.type === "INIT") {
    const kColors = msg.kColors ?? 6;
    logInfo("INIT requested", { kColors });

    try {
      (self as any).postMessage({ type: "PROGRESS", phase: "loading taxonomy", done: 0, total: 1 });
      await loadTaxonomy();

      (self as any).postMessage({ type: "PROGRESS", phase: "loading samples", done: 0, total: 1 });
      await loadSamplesTarGz();

      (self as any).postMessage({ type: "READY", nImages: images.length, imageUrls } satisfies WorkerOut);
      logInfo("precomputing palette distributions");

      // cache distributions so clustering is instant on button press
      distsCache = await buildDistributions(kColors);
      logInfo("distributions cached", { layers: LAYERS.length });
    } catch (error) {
      fail("init", error);
    }
    return;
  }

  if (msg.type === "RUN_CLUSTER") {
    const layer = msg.layer;
    const eps = msg.eps;
    const minPts = msg.minPts;
    const method = msg.method ?? "dbscan";
    const k = msg.k ?? 8;
    const runId = msg.runId;
    logInfo("RUN_CLUSTER requested", { layer, eps, minPts, method, k });

    try {
      if (!distsCache) {
        throw new Error("Distribution cache empty. Did INIT finish?");
      }

      const vecs = distsCache[layer];

      // sqrt-transform (Hellinger embedding)
      const sqrtVecs = vecs.map((v) => {
        const out = new Float32Array(v.length);
        for (let i = 0; i < v.length; i++) out[i] = Math.sqrt(v[i]);
        return out;
      });

      const data = sqrtVecs.map((v) => Array.from(v));
      const labels = new Array<number>(sqrtVecs.length).fill(-1);
      let clusters: number[][] = [];

      if (method === "kmeans") {
        const kAdj = Math.max(1, Math.min(k, data.length));
        const km = new KMEANS();
        clusters = km.run(data, kAdj);
      } else {
        // DBSCAN with custom distance
        const db = new DBSCAN();
        clusters = db.run(
          data,
          eps,
          minPts,
          (a: number[], b: number[]) => {
            // Euclid in sqrt-space
            let s = 0;
            for (let i = 0; i < a.length; i++) {
              const d = a[i] - b[i];
              s += d * d;
            }
            return Math.sqrt(s);
          }
        );
      }

      clusters.forEach((cluster, ci) => {
        cluster.forEach((idx) => (labels[idx] = ci));
      });

      const colorFamilyDist = summarizeColorFamilies(labels);

      (self as any).postMessage({ type: "CLUSTERS", labels, layer, runId, colorFamilyDist } satisfies WorkerOut);
      logInfo("RUN_CLUSTER completed", { nClusters: clusters.length, method });
    } catch (error) {
      fail("cluster", error);
    }
  }
};

function summarizeColorFamilies(labels: number[]): ClusterDistribution[] | undefined {
  if (!distsCache || !ordLists || !colorFamilyPalette) return undefined;
  const famVecs = distsCache.color_family;
  if (!famVecs.length) return undefined;
  const nDims = famVecs[0].length;

  const agg = new Map<number, Float32Array>();
  const ensure = (id: number) => {
    if (!agg.has(id)) agg.set(id, new Float32Array(nDims));
    return agg.get(id)!;
  };

  labels.forEach((lab, i) => {
    const vec = famVecs[i];
    const target = ensure(lab);
    for (let j = 0; j < nDims; j++) target[j] += vec[j];
  });

  const result: ClusterDistribution[] = [];
  agg.forEach((vec, id) => {
    const total = vec.reduce((s, v) => s + v, 0);
    if (total <= 0) return;
    const parts = Array.from(vec)
      .map((v, idx) => ({ v, idx }))
      .filter((p) => p.v > 0)
      .sort((a, b) => b.v - a.v)
      .map((p) => ({
        name: ordLists!.color_family[p.idx] ?? `fam-${p.idx}`,
        pct: p.v / total,
        color: colorFamilyPalette![p.idx] ?? "#94a3b8",
      }));
    result.push({ id, parts });
  });

  return result;
}
