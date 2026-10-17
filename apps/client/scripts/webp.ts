// A lossless WebP (VP8L) decoder for the tests and asset scripts, beside png.ts: the 3D creep sheets are lossless
// WebP (docs/ART.md §15), and the tests read their pixels. The whole of RFC 9649's lossless format: the transforms
// (predictor, colour, subtract green, colour indexing), the colour cache, meta prefix codes and LZ77 backward
// references. Lossy WebP (VP8) is not read: nothing the tests decode is lossy.

import type { Image } from './png';

/** Reads past the end as zero bits (the decoder never trusts the stream's length beyond what it needs). */
class Bits {
  private readonly buf: Uint8Array;
  private pos = 0;
  constructor(data: Uint8Array) {
    this.buf = new Uint8Array(data.length + 8);
    this.buf.set(data);
  }

  /** The next n bits (n ≤ 24), least significant first, without consuming them. */
  peek(n: number): number {
    const at = this.pos >>> 3;
    const b = this.buf;
    const word = (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> (this.pos & 7);
    return word & ((1 << n) - 1);
  }

  skip(n: number): void {
    this.pos += n;
  }

  read(n: number): number {
    if (n === 0) return 0;
    const v = this.peek(n);
    this.pos += n;
    return v;
  }
}

const LUT_BITS = 10;
const MAX_LENGTH = 15;

/** A canonical prefix code (codes MSB first in the stream, as deflate's): a lookup for the short codes, then bit by bit. */
class Prefix {
  /** The one symbol of a code with a single used symbol (read with no bits), else -1. */
  private readonly single: number;
  /** (symbol << 4) | length for codes up to LUT_BITS long, indexed by the next bits; -1 for the longer ones. */
  private readonly lut = new Int32Array(1 << LUT_BITS).fill(-1);
  private readonly count = new Uint16Array(MAX_LENGTH + 1);
  private readonly symbols: Uint16Array;

  constructor(lengths: ArrayLike<number>) {
    const used: number[] = [];
    for (let s = 0; s < lengths.length; s++) if (lengths[s]! > 0) used.push(s);
    if (used.length === 0) throw new Error('webp: an empty prefix code');
    this.single = used.length === 1 ? used[0]! : -1;
    this.symbols = new Uint16Array(used.length);
    for (const s of used) this.count[lengths[s]!]!++;
    const offs = new Uint16Array(MAX_LENGTH + 2);
    for (let len = 1; len <= MAX_LENGTH; len++) offs[len + 1] = offs[len]! + this.count[len]!;
    for (const s of used) this.symbols[offs[lengths[s]!]!++] = s;
    if (this.single >= 0) return;
    // Canonical codes, in length then symbol order; the short ones go into the lookup bit-reversed (the stream's order).
    let code = 0;
    let i = 0;
    for (let len = 1; len <= MAX_LENGTH; len++) {
      for (let k = 0; k < this.count[len]!; k++, i++, code++) {
        if (len > LUT_BITS) continue;
        let rev = 0;
        for (let b = 0; b < len; b++) rev |= ((code >> b) & 1) << (len - 1 - b);
        for (let r = rev; r < 1 << LUT_BITS; r += 1 << len) this.lut[r] = (this.symbols[i]! << 4) | len;
      }
      code <<= 1;
    }
  }

  read(br: Bits): number {
    if (this.single >= 0) return this.single;
    const e = this.lut[br.peek(LUT_BITS)]!;
    if (e >= 0) {
      br.skip(e & 15);
      return e >> 4;
    }
    // A long code: bit by bit (puff's canonical walk).
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= MAX_LENGTH; len++) {
      code |= br.read(1);
      const n = this.count[len]!;
      if (code - n < first) return this.symbols[index + (code - first)]!;
      index += n;
      first = (first + n) << 1;
      code <<= 1;
    }
    throw new Error('webp: a bad prefix code');
  }
}

const CODE_LENGTH_ORDER = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

function readPrefix(br: Bits, alphabet: number): Prefix {
  const lengths = new Uint8Array(alphabet);
  if (br.read(1)) {
    // A simple code: one or two symbols.
    const n = br.read(1) + 1;
    lengths[br.read(br.read(1) ? 8 : 1)] = 1;
    if (n === 2) lengths[br.read(8)] = 1;
    return new Prefix(lengths);
  }
  const clLengths = new Uint8Array(19);
  const n = br.read(4) + 4;
  for (let i = 0; i < n; i++) clLengths[CODE_LENGTH_ORDER[i]!] = br.read(3);
  const cl = new Prefix(clLengths);
  let max = alphabet;
  if (br.read(1)) {
    max = 2 + br.read(2 + 2 * br.read(3));
    if (max > alphabet) throw new Error('webp: too many code lengths');
  }
  let prev = 8;
  for (let s = 0; s < alphabet && max-- > 0; ) {
    const len = cl.read(br);
    if (len < 16) {
      lengths[s++] = len;
      if (len !== 0) prev = len;
      continue;
    }
    const repeat = len === 16 ? br.read(2) + 3 : len === 17 ? br.read(3) + 3 : br.read(7) + 11;
    if (s + repeat > alphabet) throw new Error('webp: code lengths overrun');
    lengths.fill(len === 16 ? prev : 0, s, s + repeat);
    s += repeat;
  }
  return new Prefix(lengths);
}

/** (dx, dy) of the 120 short distance codes: dist = dx + dy × width (dx > 0 is to the left). */
const PLANE = [
  0, 1, 1, 0, 1, 1, -1, 1, 0, 2, 2, 0, 1, 2, -1, 2, 2, 1, -2, 1, 2, 2, -2, 2, 0, 3, 3, 0, 1, 3, -1, 3, 3, 1, -3, 1, 2,
  3, -2, 3, 3, 2, -3, 2, 0, 4, 4, 0, 1, 4, -1, 4, 4, 1, -4, 1, 3, 3, -3, 3, 2, 4, -2, 4, 4, 2, -4, 2, 0, 5, 3, 4, -3,
  4, 4, 3, -4, 3, 5, 0, 1, 5, -1, 5, 5, 1, -5, 1, 2, 5, -2, 5, 5, 2, -5, 2, 4, 4, -4, 4, 3, 5, -3, 5, 5, 3, -5, 3, 0,
  6, 6, 0, 1, 6, -1, 6, 6, 1, -6, 1, 2, 6, -2, 6, 6, 2, -6, 2, 4, 5, -4, 5, 5, 4, -5, 4, 3, 6, -3, 6, 6, 3, -6, 3, 0,
  7, 7, 0, 1, 7, -1, 7, 5, 5, -5, 5, 7, 1, -7, 1, 4, 6, -4, 6, 6, 4, -6, 4, 2, 7, -2, 7, 7, 2, -7, 2, 3, 7, -3, 7, 7,
  3, -7, 3, 5, 6, -5, 6, 6, 5, -6, 5, 8, 0, 4, 7, -4, 7, 7, 4, -7, 4, 8, 1, 8, 2, 6, 6, -6, 6, 8, 3, 5, 7, -5, 7, 7,
  5, -7, 5, 8, 4, 6, 7, -6, 7, 7, 6, -7, 6, 8, 5, 7, 7, -7, 7, 8, 6, 8, 7,
];

/** A length or distance from its prefix symbol and extra bits. */
function prefixValue(br: Bits, sym: number): number {
  if (sym < 4) return sym + 1;
  const extra = (sym - 2) >> 1;
  return ((2 + (sym & 1)) << extra) + br.read(extra) + 1;
}

function distance(width: number, code: number): number {
  if (code > 120) return code - 120;
  const dx = PLANE[(code - 1) * 2]!;
  const dy = PLANE[(code - 1) * 2 + 1]!;
  return Math.max(1, dx + dy * width);
}

const div = (n: number, bits: number) => (n + (1 << bits) - 1) >> bits;

/** An entropy-coded image of w × h ARGB pixels; `top` (the main image) may carry meta prefix codes. */
function decodePixels(br: Bits, w: number, h: number, top: boolean): Uint32Array {
  const cacheBits = br.read(1) ? br.read(4) : 0;
  if (cacheBits > 11) throw new Error('webp: a bad colour cache');
  let metaBits = 0;
  let meta: Uint32Array | null = null;
  let groups = 1;
  if (top && br.read(1)) {
    metaBits = br.read(3) + 2;
    meta = decodePixels(br, div(w, metaBits), div(h, metaBits), false);
    for (let i = 0; i < meta.length; i++) {
      meta[i] = (meta[i]! >> 8) & 0xffff;
      groups = Math.max(groups, meta[i]! + 1);
    }
  }
  const cacheSize = cacheBits ? 1 << cacheBits : 0;
  const codes: Prefix[][] = [];
  for (let g = 0; g < groups; g++) {
    codes.push([256 + 24 + cacheSize, 256, 256, 256, 40].map((n) => readPrefix(br, n)));
  }
  const cache = new Uint32Array(cacheSize);
  const shift = 32 - cacheBits;
  const mw = div(w, metaBits);
  const out = new Uint32Array(w * h);
  let cached = 0;
  const flush = (to: number) => {
    for (; cached < to; cached++) cache[Math.imul(out[cached]!, 0x1e35a7bd) >>> shift] = out[cached]!;
  };
  for (let pos = 0; pos < out.length; ) {
    const x = pos % w;
    const y = (pos - x) / w;
    // The group's codes: green (with the lengths and the cache), red, blue, alpha, distance.
    const c = codes[meta ? meta[(y >> metaBits) * mw + (x >> metaBits)]! : 0]!;
    const g = c[0]!.read(br);
    if (g < 256) {
      const r = c[1]!.read(br);
      const b = c[2]!.read(br);
      const a = c[3]!.read(br);
      out[pos++] = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
    } else if (g < 256 + 24) {
      const len = prefixValue(br, g - 256);
      const d = distance(w, prefixValue(br, c[4]!.read(br)));
      if (d > pos || pos + len > out.length) throw new Error('webp: a backward reference out of the image');
      for (let k = 0; k < len; k++, pos++) out[pos] = out[pos - d]!;
    } else {
      if (!cacheSize) throw new Error('webp: a cache code with no cache');
      flush(pos);
      out[pos++] = cache[g - 280]!;
    }
    if (cacheSize) flush(pos);
  }
  return out;
}

type Transform =
  | { kind: 'predictor' | 'colour'; bits: number; w: number; data: Uint32Array }
  | { kind: 'green' }
  | { kind: 'index'; w: number; bits: number; table: Uint32Array };

/** Per-channel helpers on ARGB words. */
const ch = (p: number, s: number) => (p >>> s) & 0xff;
const add = (a: number, b: number) =>
  ((((ch(a, 24) + ch(b, 24)) & 0xff) << 24) | (((ch(a, 16) + ch(b, 16)) & 0xff) << 16) | (((ch(a, 8) + ch(b, 8)) & 0xff) << 8) | ((a + b) & 0xff)) >>> 0;
const avg = (a: number, b: number) => ((((a ^ b) & 0xfefefefe) >>> 1) + (a & b)) >>> 0;
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
function select(l: number, t: number, tl: number): number {
  let d = 0;
  for (let s = 0; s < 32; s += 8) d += Math.abs(ch(l, s) - ch(tl, s)) - Math.abs(ch(t, s) - ch(tl, s));
  return d <= 0 ? t : l;
}
function addSubFull(a: number, b: number, c: number): number {
  let v = 0;
  for (let s = 0; s < 32; s += 8) v |= clamp(ch(a, s) + ch(b, s) - ch(c, s)) << s;
  return v >>> 0;
}
function addSubHalf(a: number, b: number): number {
  let v = 0;
  for (let s = 0; s < 32; s += 8) v |= clamp(ch(a, s) + Math.trunc((ch(a, s) - ch(b, s)) / 2)) << s;
  return v >>> 0;
}

function predict(mode: number, px: Uint32Array, i: number, w: number): number {
  const L = px[i - 1]!;
  const T = px[i - w]!;
  const TL = px[i - w - 1]!;
  // The top-right of the last column is the first pixel of this row (the next one in memory after the row above).
  const TR = px[i - w + 1]!;
  switch (mode) {
    case 1: return L;
    case 2: return T;
    case 3: return TR;
    case 4: return TL;
    case 5: return avg(avg(L, TR), T);
    case 6: return avg(L, TL);
    case 7: return avg(L, T);
    case 8: return avg(TL, T);
    case 9: return avg(T, TR);
    case 10: return avg(avg(L, TL), avg(T, TR));
    case 11: return select(L, T, TL);
    case 12: return addSubFull(L, T, TL);
    case 13: return addSubHalf(avg(L, T), TL);
    default: return 0xff000000;
  }
}

const delta = (t: number, c: number) => (((t << 24) >> 24) * ((c << 24) >> 24)) >> 5;

function undo(t: Transform, px: Uint32Array, h: number): Uint32Array {
  if (t.kind === 'green') {
    for (let i = 0; i < px.length; i++) {
      const p = px[i]!;
      const g = ch(p, 8);
      px[i] = ((p & 0xff00ff00) | (((ch(p, 16) + g) & 0xff) << 16) | ((p + g) & 0xff)) >>> 0;
    }
    return px;
  }
  if (t.kind === 'index') {
    const out = new Uint32Array(t.w * h);
    const packed = div(t.w, t.bits);
    const per = 1 << t.bits;
    const size = 8 >> t.bits;
    const mask = (1 << size) - 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < t.w; x++) {
        const g = ch(px[y * packed + (x >> t.bits)]!, 8);
        out[y * t.w + x] = t.table[(g >> (size * (x & (per - 1)))) & mask] ?? 0;
      }
    }
    return out;
  }
  const { w, bits, data } = t;
  const bw = div(w, bits);
  if (t.kind === 'colour') {
    for (let i = 0; i < px.length; i++) {
      const x = i % w;
      const y = (i - x) / w;
      const m = data[(y >> bits) * bw + (x >> bits)]!;
      const p = px[i]!;
      const g = ch(p, 8);
      const r = (ch(p, 16) + delta(ch(m, 0), g)) & 0xff;
      const b = (ch(p, 0) + delta(ch(m, 8), g) + delta(ch(m, 16), r)) & 0xff;
      px[i] = ((p & 0xff00ff00) | (r << 16) | b) >>> 0;
    }
    return px;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const mode = y === 0 ? (x === 0 ? 0 : 1) : x === 0 ? 2 : (data[(y >> bits) * bw + (x >> bits)]! >> 8) & 0xf;
      px[i] = add(px[i]!, predict(mode, px, i, w));
    }
  }
  return px;
}

/** Decodes a lossless WebP file (a RIFF with one VP8L chunk, or VP8X with one) into RGBA. */
export function decodeWebp(file: Buffer): Image {
  if (file.toString('ascii', 0, 4) !== 'RIFF' || file.toString('ascii', 8, 12) !== 'WEBP') throw new Error('webp: not a WebP file');
  let at = 12;
  let chunk: Buffer | null = null;
  while (at + 8 <= file.length) {
    const kind = file.toString('ascii', at, at + 4);
    const size = file.readUInt32LE(at + 4);
    if (kind === 'VP8L') chunk = file.subarray(at + 8, at + 8 + size);
    if (kind === 'VP8 ') throw new Error('webp: lossy WebP is not read here');
    at += 8 + size + (size & 1);
  }
  if (!chunk || chunk[0] !== 0x2f) throw new Error('webp: no lossless image');
  const br = new Bits(chunk.subarray(1));
  const width = br.read(14) + 1;
  const height = br.read(14) + 1;
  br.read(1); // alpha is used: a hint only
  if (br.read(3) !== 0) throw new Error('webp: an unknown version');
  const transforms: Transform[] = [];
  let w = width;
  while (br.read(1)) {
    const kind = br.read(2);
    if (kind === 0 || kind === 1) {
      const bits = br.read(3) + 2;
      transforms.push({ kind: kind === 0 ? 'predictor' : 'colour', bits, w, data: decodePixels(br, div(w, bits), div(height, bits), false) });
    } else if (kind === 2) {
      transforms.push({ kind: 'green' });
    } else {
      const n = br.read(8) + 1;
      const table = decodePixels(br, n, 1, false);
      for (let i = 1; i < n; i++) table[i] = add(table[i]!, table[i - 1]!);
      const bits = n <= 2 ? 3 : n <= 4 ? 2 : n <= 16 ? 1 : 0;
      transforms.push({ kind: 'index', w, bits, table });
      w = div(w, bits);
    }
  }
  let px = decodePixels(br, w, height, true);
  for (let i = transforms.length - 1; i >= 0; i--) px = undo(transforms[i]!, px, height);
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < px.length; i++) {
    const p = px[i]!;
    data[i * 4] = ch(p, 16);
    data[i * 4 + 1] = ch(p, 8);
    data[i * 4 + 2] = ch(p, 0);
    data[i * 4 + 3] = ch(p, 24);
  }
  return { width, height, channels: 4, data };
}
