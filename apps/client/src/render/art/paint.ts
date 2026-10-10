// The Runelight painter (docs/ART.md §3). Art files describe *shapes* (a Path2D and a base colour);
// the painter decides how a shape is rendered: a body that darkens downwards, a cool moonlit rim on
// the upper left, an ink outline, and glowing accents. Everything here runs once, at bake time, on a
// Canvas 2D context; nothing is drawn per frame.

import { LIGHTING, RL, type Lighting } from './tokens';

export type Ctx = CanvasRenderingContext2D;
/** x0, y0, x1, y1 of a shape (for its gradient and rim light). */
export type Box = readonly [number, number, number, number];

/** Outline widths (world px) — docs/ART.md §3. */
export const LINE = {
  /** Body parts. Scale with `opts.line` (0.6–1.2) for smaller or bigger parts. */
  part: 2.4,
  /** Small details (eyes, rivets, planks). */
  detail: 1.1,
} as const;

/**
 * Glow radius of accents: px of blur on the canvas. A canvas blur ignores the drawing's scale, so this
 * is sized for the atlas (frames baked at 2×, atlas.ts); a drawing at another scale passes `glow` to
 * `createPainter` to keep the same look.
 */
const GLOW_BLUR = 7;

export function css(hex: number, a = 1): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

/** Lighten (t > 0, towards white) or darken (t < 0, towards black). */
export function shade(hex: number, t: number): number {
  const to = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const ch = (s: number) => Math.round(((hex >> s) & 0xff) + (to - ((hex >> s) & 0xff)) * k) << s;
  return ch(16) | ch(8) | ch(0);
}

export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 0xff) + (((b >> s) & 0xff) - ((a >> s) & 0xff)) * t) << s;
  return ch(16) | ch(8) | ch(0);
}

/** Deterministic hash → 0..1, for scattering decorations (never Math.random: the art must bake the same every time). */
export function hash(a: number, b = 0, c = 0): number {
  let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function circle(x: number, y: number, r: number): Path2D {
  const p = new Path2D();
  p.arc(x, y, r, 0, Math.PI * 2);
  return p;
}

export function ellipse(x: number, y: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D();
  p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  return p;
}

export function rrect(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  p.roundRect(x, y, w, h, rr);
  return p;
}

/** A polygon with rounded corners (radius r; 0 = sharp). */
export function poly(pts: readonly number[], r = 0): Path2D {
  const p = new Path2D();
  const n = pts.length / 2;
  if (r <= 0) {
    p.moveTo(pts[0]!, pts[1]!);
    for (let i = 1; i < n; i++) p.lineTo(pts[i * 2]!, pts[i * 2 + 1]!);
    p.closePath();
    return p;
  }
  const at = (i: number) => [pts[((i + n) % n) * 2]!, pts[((i + n) % n) * 2 + 1]!] as const;
  const [ax, ay] = at(0);
  const [bx, by] = at(-1);
  p.moveTo((ax + bx) / 2, (ay + by) / 2);
  for (let i = 0; i < n; i++) {
    const [cx, cy] = at(i);
    const [nx, ny] = at(i + 1);
    p.arcTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2, r);
  }
  p.closePath();
  return p;
}

/** Regular polygon (n sides) of radius r, rotated by rot. */
export function ngon(x: number, y: number, r: number, n: number, rot = 0, round = 0): Path2D {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * Math.PI * 2) / n;
    pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  return poly(pts, round);
}

/** An open polyline through x0, y0, x1, y1, … */
export function pathLine(pts: readonly number[]): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i]!, pts[i + 1]!);
  return p;
}

export const box = (x0: number, y0: number, x1: number, y1: number): Box => [x0, y0, x1, y1];

/** A soft radial fill (ellipse rx × ry) with colour stops, e.g. glows and shadows. */
export function radialFill(c: Ctx, x: number, y: number, rx: number, ry: number, stops: [number, string][]): void {
  c.save();
  c.translate(x, y);
  c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  for (const [at, col] of stops) g.addColorStop(at, col);
  c.fillStyle = g;
  c.fillRect(-rx, -rx, rx * 2, rx * 2);
  c.restore();
}

// ---------------------------------------------------------------------------
// The painter
// ---------------------------------------------------------------------------

export interface PartOpts {
  /** Skip the outline, for inner parts that sit on a bigger outlined part. */
  noOutline?: boolean;
  /** Outline width multiplier (LINE.part × line). */
  line?: number;
  /** Skip the rim light (the body gradient only). */
  flat?: boolean;
}

export interface Painter {
  readonly lighting: Lighting;
  /** A body part: gradient body, moonlit rim on the upper left, ink outline. */
  part(c: Ctx, path: Path2D, color: number, box: Box, opts?: PartOpts): void;
  /** A small detail (eyes, rivets, planks): flat colour, thin ink outline. */
  detail(c: Ctx, path: Path2D, color: number, outline?: boolean): void;
  /** A glowing accent (rune, gem, fuse, eyes): a coloured glow and a hot core. */
  accent(c: Ctx, path: Path2D, color: number): void;
  /** A stroke (strings, plank seams, cracks). */
  line(c: Ctx, path: Path2D, color: number, width: number, alpha?: number): void;
  /** Soft contact shadow, an ellipse centred on (x, y). */
  shadow(c: Ctx, x: number, y: number, rx: number, ry: number): void;
}

function linear(c: Ctx, b: Box, stops: [number, string][], diag = 0.2): CanvasGradient {
  const [x0, y0, x1, y1] = b;
  const g = c.createLinearGradient(x0, y0, x0 + (x1 - x0) * diag, y1);
  for (const [at, col] of stops) g.addColorStop(at, col);
  return g;
}

/**
 * `glow` multiplies the accents' blur: the drawing's scale ÷ the atlas's (1 for the atlas and the icons).
 * `weight` multiplies the ink outlines' width: 1 at match size, less for a figure drawn several times
 * larger (the lobby's hero stage), where the full width would swallow the shapes.
 */
export function createPainter(lighting: Lighting = LIGHTING.normal, glow = 1, weight = 1): Painter {
  const ink = css(RL.ink);
  return {
    lighting,
    part(c, path, color, b, opts = {}) {
      const [x0, y0, x1, y1] = b;
      const body = linear(c, b, [
        [0, css(shade(color, 0.06))],
        [1, css(shade(color, -lighting.bodyDarken))],
      ]);
      if (opts.flat) {
        c.fillStyle = body;
        c.fill(path);
      } else {
        // Moonlight rim on the upper left: fill the part with the rim colour, then the body shifted down-right.
        const d = Math.max(1, Math.min(x1 - x0, y1 - y0) * 0.1);
        c.save();
        c.clip(path);
        c.fillStyle = css(mix(color, RL.moon, 0.6));
        c.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
        c.translate(d * 0.7, d * 0.8);
        c.fillStyle = body;
        c.fill(path);
        c.restore();
      }
      if (!opts.noOutline) {
        c.lineJoin = 'round';
        c.lineWidth = LINE.part * (opts.line ?? 1) * weight;
        c.strokeStyle = ink;
        c.stroke(path);
      }
    },
    detail(c, path, color, outline = true) {
      c.fillStyle = css(color);
      c.fill(path);
      if (outline) {
        c.lineWidth = LINE.detail * weight;
        c.strokeStyle = ink;
        c.stroke(path);
      }
    },
    accent(c, path, color) {
      c.save();
      c.shadowColor = css(color, 0.95);
      c.shadowBlur = GLOW_BLUR * glow;
      c.fillStyle = css(shade(color, 0.35));
      c.fill(path);
      c.fill(path);
      c.restore();
      c.fillStyle = css(shade(color, 0.7));
      c.globalAlpha = 0.6;
      c.fill(path);
      c.globalAlpha = 1;
    },
    line(c, path, color, width, alpha = 1) {
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.lineWidth = width;
      c.strokeStyle = css(color, alpha);
      c.stroke(path);
    },
    shadow(c, x, y, rx, ry) {
      const a = lighting.shadowAlpha;
      radialFill(c, x, y, rx, ry, [
        [0, css(RL.night, a)],
        [0.6, css(RL.night, a * 0.7)],
        [1, css(RL.night, 0)],
      ]);
    },
  };
}
