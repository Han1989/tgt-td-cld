// Baked art atlas (docs/ART.md §8): every registered frame is drawn once with Canvas 2D into
// shelf-packed 1024 px pages, so styled sprites share a few texture sources and batch together.
// Switching Display (Normal / Bright) re-bakes the same pages in place: sprites keep their textures.

import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import { createPainter } from './paint';
import type { ArtEntry, Draw } from './registry';
import { LIGHTING, RL, type Display } from './tokens';

/** Atlas pixels per world pixel. */
export const ART_RES = 2;
export const PAGE_PX = 1024;
const PAD = 4;

interface Slot {
  page: number;
  rect: Rectangle;
  draw: Draw;
  /** Paint the drawing white (hit-flash silhouette). */
  flash: boolean;
}

export interface ArtAtlas {
  /** The texture of `<id>/<frame>` (or `<id>/<frame>.flash`). Throws if unknown. */
  frame(name: string): Texture;
  has(name: string): boolean;
  /** Redraws every frame for a display mode. */
  bake(display: Display): void;
  readonly pages: number;
}

/** Frame names and sizes (px) in bake order: tallest first, so the shelves pack tightly. */
export function atlasFrames(entries: readonly ArtEntry[]): { name: string; w: number; h: number; draw: Draw; flash: boolean }[] {
  const out: { name: string; w: number; h: number; draw: Draw; flash: boolean }[] = [];
  for (const e of entries) {
    for (const [frame, def] of Object.entries(e.frames)) {
      const name = `${e.id}/${frame}`;
      const w = Math.ceil(def.w * ART_RES);
      const h = Math.ceil(def.h * ART_RES);
      out.push({ name, w, h, draw: def.draw, flash: false });
      if (def.flash) out.push({ name: `${name}.flash`, w, h, draw: def.flash === true ? def.draw : def.flash, flash: true });
    }
  }
  return out.sort((a, b) => b.h - a.h || a.name.localeCompare(b.name));
}

/** Shelf packing of frames (px) into pages; returns each frame's page and rectangle. Pure (tested). */
export function packFrames(frames: readonly { name: string; w: number; h: number }[], size = PAGE_PX): Map<string, { page: number; x: number; y: number }> {
  const out = new Map<string, { page: number; x: number; y: number }>();
  let page = 0;
  let x = PAD;
  let y = PAD;
  let rowH = 0;
  for (const f of frames) {
    if (f.w + 2 * PAD > size || f.h + 2 * PAD > size) throw new Error(`art frame ${f.name} is larger than an atlas page`);
    if (x + f.w + PAD > size) {
      x = PAD;
      y += rowH + PAD;
      rowH = 0;
    }
    if (y + f.h + PAD > size) {
      page++;
      x = PAD;
      y = PAD;
      rowH = 0;
    }
    out.set(f.name, { page, x, y });
    x += f.w + PAD;
    rowH = Math.max(rowH, f.h);
  }
  return out;
}

export function createArtAtlas(entries: readonly ArtEntry[], display: Display): ArtAtlas {
  const frames = atlasFrames(entries);
  const packed = packFrames(frames);
  const pageCount = Math.max(1, ...[...packed.values()].map((p) => p.page + 1));
  const canvases: HTMLCanvasElement[] = [];
  const sources: CanvasSource[] = [];
  for (let i = 0; i < pageCount; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_PX;
    canvas.height = PAGE_PX;
    canvases.push(canvas);
  }
  const slots = new Map<string, Slot>();
  for (const f of frames) {
    const p = packed.get(f.name)!;
    slots.set(f.name, { page: p.page, rect: new Rectangle(p.x, p.y, f.w, f.h), draw: f.draw, flash: f.flash });
  }

  const bake = (d: Display) => {
    const painter = createPainter(LIGHTING[d]);
    for (const canvas of canvases) canvas.getContext('2d')!.clearRect(0, 0, PAGE_PX, PAGE_PX);
    for (const s of slots.values()) {
      const ctx = canvases[s.page]!.getContext('2d')!;
      const { x, y, width: pw, height: ph } = s.rect;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, pw, ph);
      ctx.clip();
      ctx.translate(x + pw / 2, y + ph / 2);
      ctx.scale(ART_RES, ART_RES);
      s.draw(ctx, painter, RL);
      if (s.flash) {
        // Hit-flash silhouette: everything drawn in this frame, painted white.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, y, pw, ph);
      }
      ctx.restore();
    }
    for (const s of sources) s.update();
  };

  bake(display);
  // resolution: frames come out in world px, so sprites need no extra scale.
  for (const canvas of canvases) sources.push(new CanvasSource({ resource: canvas, resolution: ART_RES }));
  const textures = new Map<string, Texture>();
  for (const [name, s] of slots) {
    const r = s.rect;
    textures.set(
      name,
      new Texture({ source: sources[s.page]!, frame: new Rectangle(r.x / ART_RES, r.y / ART_RES, r.width / ART_RES, r.height / ART_RES) }),
    );
  }
  return {
    frame(name) {
      const t = textures.get(name);
      if (!t) throw new Error(`no art frame ${name}`);
      return t;
    },
    has: (name) => textures.has(name),
    bake,
    pages: pageCount,
  };
}
