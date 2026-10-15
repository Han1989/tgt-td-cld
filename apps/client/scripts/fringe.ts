// The fringe check (docs/ART.md §15), the same as tools/blender/tdt3d/fringe.py line for line: along the hero's
// silhouette in a finished stage frame there must be no ring of pixels brighter than both the hero side and the scene
// side (the light rim that makes a figure look cut out and pasted on), and no hard alpha step (a silhouette with no
// partly covered pixel, stair-stepped). It reads the frame and the hero mask pass (red: the hero's coverage, ink
// included, as composited; green: where his glow lights the frame, his bloom and the motes, light the scene really
// gets, so silhouette pixels in or near it are left out). It measures the rim: a pixel counts only if the coverage
// rises from it into the hero without dipping on the way (a thin part apart from the body is not the rim).

export const EDGE_LO = 0.04;
export const EDGE_HI = 0.96;
/** Luma levels (of 255) a silhouette pixel may stand above the brighter of its two sides. */
export const MARGIN = 12;
/** Px walked along the silhouette's normal, each way, to find a clean pixel on each side. */
export const REACH = 4;
const STEP = 0.5;
/** The walk into the hero may not fall under this share of the silhouette pixel's own coverage. */
const DIP = 0.6;
export const GLOW_REACH = 8;
/** Share of the measured silhouette pixels allowed above the margin. */
export const MAX_FRINGE = 0.01;
/** Share of the silhouette's crossings (neighbours either side of half cover) with nothing between. */
export const MAX_HARD = 0.05;

export interface FringeResult {
  measured: number;
  fringe: number;
  fringeShare: number;
  worst: number;
  crossings: number;
  hard: number;
  hardShare: number;
  pass: boolean;
}

/** `rgb`: w × h × 3 (0..255); `alpha` and `glow`: w × h (0..255). */
export function measureFringe(w: number, h: number, rgb: ArrayLike<number>, alpha: ArrayLike<number>, glow?: ArrayLike<number>): FringeResult {
  const a = new Float64Array(w * h);
  const y = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    a[i] = alpha[i]! / 255;
    y[i] = rgb[i * 3]! * 0.2126 + rgb[i * 3 + 1]! * 0.7152 + rgb[i * 3 + 2]! * 0.0722;
  }
  const nearGlow = new Uint8Array(w * h);
  if (glow) {
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        if (!(glow[gy * w + gx]! > 25)) continue;
        for (let dy = -GLOW_REACH; dy <= GLOW_REACH; dy++) {
          for (let dx = -GLOW_REACH; dx <= GLOW_REACH; dx++) {
            const yy = Math.min(h - 1, Math.max(0, gy + dy));
            const xx = Math.min(w - 1, Math.max(0, gx + dx));
            nearGlow[yy * w + xx] = 1;
          }
        }
      }
    }
  }
  // The silhouette's normal: a Sobel of the coverage (edges clamped), pointing out of the hero.
  const at = (x: number, yy: number) => a[Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, x))]!;
  // Silhouette pixels: partly covered, or either side of a step with nothing between.
  const hardPx = new Uint8Array(w * h);
  let crossings = 0;
  let hard = 0;
  for (const [dy, dx] of [
    [0, 1],
    [1, 0],
  ] as const) {
    for (let yy = 0; yy + dy < h; yy++) {
      for (let x = 0; x + dx < w; x++) {
        const i0 = yy * w + x;
        const i1 = (yy + dy) * w + x + dx;
        const p0 = a[i0]!;
        const p1 = a[i1]!;
        const cross = p0 >= 0.5 !== p1 >= 0.5;
        if (!cross) continue;
        const step = Math.min(p0, p1) <= EDGE_LO && Math.max(p0, p1) >= EDGE_HI;
        const keep = !(nearGlow[i0] || nearGlow[i1]);
        if (keep) {
          crossings++;
          if (step) hard++;
        }
        if (step) {
          hardPx[i0] = 1;
          hardPx[i1] = 1;
        }
      }
    }
  }
  let measured = 0;
  let fringe = 0;
  let worst = -255;
  const round = (v: number) => Math.floor(v + 0.5);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = py * w + px;
      const edge = ((a[i]! > EDGE_LO && a[i]! < EDGE_HI) || hardPx[i] === 1) && !nearGlow[i];
      if (!edge) continue;
      const sx =
        at(px + 1, py - 1) + 2 * at(px + 1, py) + at(px + 1, py + 1) - (at(px - 1, py - 1) + 2 * at(px - 1, py) + at(px - 1, py + 1));
      const sy =
        at(px - 1, py + 1) + 2 * at(px, py + 1) + at(px + 1, py + 1) - (at(px - 1, py - 1) + 2 * at(px, py - 1) + at(px + 1, py - 1));
      const g = Math.hypot(sx, sy);
      if (g < 1e-6) continue;
      const nx = -sx / g;
      const ny = -sy / g;
      let inner = -1;
      let outer = -1;
      let dip = false;
      for (let t = STEP; t <= REACH + 1e-9 && (inner < 0 || outer < 0) && !dip; t += STEP) {
        if (inner < 0) {
          const qx = round(px - nx * t);
          const qy = round(py - ny * t);
          if (qx >= 0 && qx < w && qy >= 0 && qy < h) {
            if (a[qy * w + qx]! >= EDGE_HI) inner = qy * w + qx;
            else if (a[qy * w + qx]! < a[i]! * DIP) dip = true;
          }
        }
        if (outer < 0) {
          const qx = round(px + nx * t);
          const qy = round(py + ny * t);
          if (qx >= 0 && qx < w && qy >= 0 && qy < h && a[qy * w + qx]! <= EDGE_LO) outer = qy * w + qx;
        }
      }
      // A thin part (the string, a limb seen edge on): no clean side to compare with.
      if (inner < 0 || outer < 0 || dip) continue;
      measured++;
      const excess = y[i]! - Math.max(y[inner]!, y[outer]!);
      worst = Math.max(worst, excess);
      if (excess > MARGIN) fringe++;
    }
  }
  const fringeShare = measured ? fringe / measured : 0;
  const hardShare = crossings ? hard / crossings : 0;
  return { measured, fringe, fringeShare, worst, crossings, hard, hardShare, pass: measured > 0 && fringeShare <= MAX_FRINGE && hardShare <= MAX_HARD };
}
