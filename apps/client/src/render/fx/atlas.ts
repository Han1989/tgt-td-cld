// The effects atlas: every particle shape (sparks, rings, shards, coins, digits…) drawn
// once into one canvas at start-up, so all effects share one texture source. Particle
// containers need that, and it lets every effect batch into a handful of draw calls.
// Code-drawn shapes only; no image files.

import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import { GLYPHS } from './numbers';

export type FxFrame =
  | 'dot'
  | 'glow'
  | 'spark'
  | 'square'
  | 'shard'
  | 'disc'
  | 'ring'
  | 'shock'
  | 'dashRing'
  | 'star'
  | 'flake'
  | 'coin'
  | 'arc'
  | 'smoke'
  | 'trail'
  | 'arrow'
  | 'leaf';

/** Glyph height in the atlas (px); numbers are scaled from it. */
export const GLYPH_PX = 34;
/** Radius of the ring frames (px), for scaling rings to a radius. */
export const RING_PX = 60;
/** Radius of the disc and glow frames (px). */
export const DISC_PX = 30;

export interface FxAtlas {
  source: CanvasSource;
  frames: Record<FxFrame, Texture>;
  glyphs: Map<string, Texture>;
  /** Advance width of each glyph (px). */
  advance(ch: string): number;
}

type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;

const SIZE = 512;

/** Builds the atlas (needs a DOM canvas). */
export function createFxAtlas(): FxAtlas {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const rects = new Map<string, Rectangle>();

  // Shelf packing: left to right, then the next row.
  let x = 1;
  let y = 1;
  let rowH = 0;
  const place = (name: string, w: number, h: number, draw: Draw) => {
    if (x + w + 1 > SIZE) {
      x = 1;
      y += rowH + 2;
      rowH = 0;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    draw(ctx, w, h);
    ctx.restore();
    rects.set(name, new Rectangle(x, y, w, h));
    x += w + 2;
    rowH = Math.max(rowH, h);
  };

  const radial = (c: CanvasRenderingContext2D, w: number, h: number, stops: [number, string][]) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2);
    for (const [at, color] of stops) g.addColorStop(at, color);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  };

  // Big frames first so the shelves pack tightly.
  place('ring', 128, 128, (c, w, h) => {
    c.strokeStyle = '#fff';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(w / 2, h / 2, RING_PX, 0, Math.PI * 2);
    c.stroke();
  });
  place('shock', 128, 128, (c, w, h) => {
    // A soft shockwave band, brightest at the rim.
    const g = c.createRadialGradient(w / 2, h / 2, RING_PX - 16, w / 2, h / 2, RING_PX + 3);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.8, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
  place('arc', 128, 128, (c, w, h) => {
    // A crescent swipe, thick in the middle and thin at the tips (opens to the right).
    for (let i = 0; i < 24; i++) {
      const t = i / 23;
      const a = -1.1 + t * 2.2;
      const thick = Math.sin(t * Math.PI);
      c.fillStyle = `rgba(255,255,255,${0.25 + 0.75 * thick})`;
      c.beginPath();
      c.arc(w / 2 + Math.cos(a) * 50, h / 2 + Math.sin(a) * 50, 2 + 8 * thick, 0, Math.PI * 2);
      c.fill();
    }
  });
  place('disc', 64, 64, (c, w, h) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(w / 2, h / 2, DISC_PX, 0, Math.PI * 2);
    c.fill();
  });
  place('glow', 64, 64, (c, w, h) =>
    radial(c, w, h, [
      [0, 'rgba(255,255,255,1)'],
      [0.35, 'rgba(255,255,255,0.55)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
  );
  place('dashRing', 64, 64, (c, w, h) => {
    c.strokeStyle = '#fff';
    c.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      c.beginPath();
      c.arc(w / 2, h / 2, 28, a, a + 0.5);
      c.stroke();
    }
  });
  place('smoke', 48, 48, (c, w, h) =>
    radial(c, w, h, [
      [0, 'rgba(255,255,255,0.7)'],
      [0.6, 'rgba(255,255,255,0.35)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
  );
  place('trail', 64, 10, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.9)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, h / 2);
    c.lineTo(w, 1);
    c.lineTo(w, h - 1);
    c.closePath();
    c.fill();
  });
  place('dot', 24, 24, (c, w, h) =>
    radial(c, w, h, [
      [0, 'rgba(255,255,255,1)'],
      [0.5, 'rgba(255,255,255,0.8)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
  );
  place('spark', 32, 8, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0.6)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(w / 2, h / 2, w / 2, h / 2 - 1, 0, 0, Math.PI * 2);
    c.fill();
  });
  place('arrow', 28, 6, (c, w, h) => {
    c.fillStyle = '#fff';
    c.fillRect(0, h / 2 - 1, w - 6, 2);
    c.beginPath();
    c.moveTo(w, h / 2);
    c.lineTo(w - 7, 0);
    c.lineTo(w - 7, h);
    c.closePath();
    c.fill();
  });
  place('square', 8, 8, (c, w, h) => {
    c.fillStyle = '#fff';
    c.fillRect(0, 0, w, h);
  });
  place('shard', 16, 10, (c, w, h) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(w, h / 2);
    c.lineTo(0, 0);
    c.lineTo(3, h / 2);
    c.lineTo(0, h);
    c.closePath();
    c.fill();
  });
  place('star', 28, 28, (c, w, h) => {
    c.fillStyle = '#fff';
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? w / 2 : w / 7;
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      c.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  });
  place('flake', 22, 22, (c, w, h) => {
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      c.beginPath();
      c.moveTo(w / 2 - Math.cos(a) * 9, h / 2 - Math.sin(a) * 9);
      c.lineTo(w / 2 + Math.cos(a) * 9, h / 2 + Math.sin(a) * 9);
      c.stroke();
    }
  });
  place('leaf', 14, 8, (c, w, h) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
    c.fill();
  });
  place('coin', 22, 22, (c, w, h) => {
    // Drawn in colour (not tinted): a gold coin with a shine.
    const g = c.createRadialGradient(w * 0.38, h * 0.35, 1, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#fff6c0');
    g.addColorStop(0.55, '#ffd24a');
    g.addColorStop(1, '#b8860b');
    c.fillStyle = g;
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(90,60,0,0.8)';
    c.lineWidth = 1.5;
    c.stroke();
  });

  // Digits: white with a dark outline, so a tint colours the fill and the outline stays dark.
  const glyphRects = new Map<string, Rectangle>();
  const widths = new Map<string, number>();
  ctx.font = `800 ${GLYPH_PX - 6}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  for (const ch of GLYPHS) {
    const w = Math.ceil(ctx.measureText(ch).width) + 8;
    widths.set(ch, w - 6);
    place(`glyph:${ch}`, w, GLYPH_PX, (c, cw, ch2) => {
      c.font = `800 ${GLYPH_PX - 6}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.lineWidth = 5;
      c.strokeStyle = 'rgba(0,0,0,0.85)';
      c.strokeText(ch, cw / 2, ch2 / 2 + 1);
      c.fillStyle = '#fff';
      c.fillText(ch, cw / 2, ch2 / 2 + 1);
    });
    glyphRects.set(ch, rects.get(`glyph:${ch}`)!);
  }

  const source = new CanvasSource({ resource: canvas });
  const tex = (r: Rectangle) => new Texture({ source, frame: r });
  const frames = {} as Record<FxFrame, Texture>;
  for (const [name, r] of rects) if (!name.startsWith('glyph:')) frames[name as FxFrame] = tex(r);
  const glyphs = new Map<string, Texture>();
  for (const [ch, r] of glyphRects) glyphs.set(ch, tex(r));
  return { source, frames, glyphs, advance: (ch) => widths.get(ch) ?? GLYPH_PX / 2 };
}
