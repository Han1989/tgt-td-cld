// Colour quantization for ogImage.ts: a painted 1200 × 630 card is ~800 KB as true colour, and link
// previews want it small. Median cut over a 5-bit histogram picks the palette, a few k-means passes
// refine it, and a light Floyd–Steinberg dither keeps the glows and the vignette free of banding.

import type { Image } from './png';

type Rgb = [number, number, number];

interface Bin {
  n: number;
  c: Rgb;
}

function histogram(img: Image): Bin[] {
  const sums = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < img.width * img.height; i++) {
    const o = i * img.channels;
    const r = img.data[o]!;
    const g = img.data[o + 1]!;
    const b = img.data[o + 2]!;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const s = sums.get(key);
    if (s) {
      s.n++;
      s.r += r;
      s.g += g;
      s.b += b;
    } else {
      sums.set(key, { n: 1, r, g, b });
    }
  }
  return [...sums.values()].map((s) => ({ n: s.n, c: [s.r / s.n, s.g / s.n, s.b / s.n] }));
}

function mean(bins: readonly Bin[]): Rgb {
  let n = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const bin of bins) {
    n += bin.n;
    r += bin.c[0] * bin.n;
    g += bin.c[1] * bin.n;
    b += bin.c[2] * bin.n;
  }
  n = Math.max(1, n);
  return [r / n, g / n, b / n];
}

/** The widest channel of a box and how wide it is. */
function spread(bins: readonly Bin[]): { axis: number; range: number } {
  let axis = 0;
  let range = -1;
  for (let k = 0; k < 3; k++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const b of bins) {
      lo = Math.min(lo, b.c[k]!);
      hi = Math.max(hi, b.c[k]!);
    }
    if (hi - lo > range) {
      range = hi - lo;
      axis = k;
    }
  }
  return { axis, range };
}

function palette(bins: Bin[], colours: number): Rgb[] {
  const boxes: Bin[][] = [bins];
  while (boxes.length < colours) {
    let pick = -1;
    let score = 0;
    for (const [i, box] of boxes.entries()) {
      if (box.length < 2) continue;
      const n = box.reduce((s, b) => s + b.n, 0);
      const s = Math.sqrt(n) * spread(box).range;
      if (s > score) {
        score = s;
        pick = i;
      }
    }
    if (pick < 0) break;
    const box = boxes[pick]!;
    const { axis } = spread(box);
    box.sort((a, b) => a.c[axis]! - b.c[axis]!);
    const half = box.reduce((s, b) => s + b.n, 0) / 2;
    let at = 0;
    let cut = 1;
    for (; cut < box.length - 1; cut++) {
      at += box[cut - 1]!.n;
      if (at >= half) break;
    }
    boxes.splice(pick, 1, box.slice(0, cut), box.slice(cut));
  }
  const pal = boxes.map(mean);
  for (let pass = 0; pass < 4; pass++) {
    const groups: Bin[][] = pal.map(() => []);
    for (const b of bins) groups[nearest(pal, b.c)]!.push(b);
    for (const [i, group] of groups.entries()) if (group.length > 0) pal[i] = mean(group);
  }
  return pal;
}

function nearest(pal: readonly Rgb[], c: Rgb): number {
  let best = 0;
  let bestD = Infinity;
  for (const [i, p] of pal.entries()) {
    const dr = p[0] - c[0];
    const dg = p[1] - c[1];
    const db = p[2] - c[2];
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Quantizes an RGB(A) image to `colours` colours; `dither` is the share of the error passed on (0–1). */
export function quantize(img: Image, colours = 256, dither = 0.75): { indices: Uint8Array; palette: [number, number, number][] } {
  const pal = palette(histogram(img), colours);
  const out = pal.map((c) => c.map((v) => Math.max(0, Math.min(255, Math.round(v)))) as Rgb);
  const { width, height } = img;
  const indices = new Uint8Array(width * height);
  const cache = new Int16Array(1 << 18).fill(-1);
  let err = new Float32Array((width + 2) * 3);
  let next = new Float32Array((width + 2) * 3);
  for (let y = 0; y < height; y++) {
    const ltr = y % 2 === 0;
    for (let s = 0; s < width; s++) {
      const x = ltr ? s : width - 1 - s;
      const o = (y * width + x) * img.channels;
      const e = (x + 1) * 3;
      const at = (k: number) => Math.max(0, Math.min(255, img.data[o + k]! + err[e + k]!));
      const c: Rgb = [at(0), at(1), at(2)];
      const key = ((c[0] >> 2) << 12) | ((c[1] >> 2) << 6) | (c[2] >> 2);
      let i = cache[key]!;
      if (i < 0) cache[key] = i = nearest(pal, c);
      indices[y * width + x] = i;
      const dir = ltr ? 1 : -1;
      const got = out[i]!;
      for (let k = 0; k < 3; k++) {
        const d = (c[k]! - got[k]!) * dither;
        err[e + dir * 3 + k] = err[e + dir * 3 + k]! + (d * 7) / 16;
        next[e - dir * 3 + k] = next[e - dir * 3 + k]! + (d * 3) / 16;
        next[e + k] = next[e + k]! + (d * 5) / 16;
        next[e + dir * 3 + k] = next[e + dir * 3 + k]! + d / 16;
      }
    }
    [err, next] = [next, err];
    next.fill(0);
  }
  return { indices, palette: out };
}
