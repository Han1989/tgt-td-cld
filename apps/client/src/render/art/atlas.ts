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
/**
 * Atlas px kept round a frame's drawn pixels when its texture is trimmed to them: the linear filter's reach (so the
 * edges draw as before) and Bright's fainter shadow tails (a tenth of a px narrower or wider than Normal's).
 */
export const TRIM_MARGIN = 2;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The box (page px) round the pixels a frame drew (alpha above 0) inside `rect`, `margin` px wider on each side and
 * kept inside `rect`; null if it drew nothing. `data` is the page's RGBA bytes, `pageW` px wide. Pure (tested).
 */
export function drawnBox(data: ArrayLike<number>, pageW: number, rect: Box, margin: number): Box | null {
  const drawn = (x: number, y: number) => data[(y * pageW + x) * 4 + 3]! > 0;
  const row = (y: number) => {
    for (let x = rect.x; x < rect.x + rect.w; x++) if (drawn(x, y)) return true;
    return false;
  };
  let top = rect.y;
  while (top < rect.y + rect.h && !row(top)) top++;
  if (top === rect.y + rect.h) return null;
  let bottom = rect.y + rect.h - 1;
  while (!row(bottom)) bottom--;
  const column = (x: number) => {
    for (let y = top; y <= bottom; y++) if (drawn(x, y)) return true;
    return false;
  };
  let left = rect.x;
  while (!column(left)) left++;
  let right = rect.x + rect.w - 1;
  while (!column(right)) right--;
  const x0 = Math.max(rect.x, left - margin);
  const y0 = Math.max(rect.y, top - margin);
  const x1 = Math.min(rect.x + rect.w, right + 1 + margin);
  const y1 = Math.min(rect.y + rect.h, bottom + 1 + margin);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

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

  // Each frame's texture is trimmed to what it drew (docs/ART.md §15 "V-07e"): a sprite's quad covers its drawing, not
  // the frame's transparent margin (a shot's frame is three to five times its drawing), so a software GPU fills a
  // third as many pixels for it; the anchor and the size stay the frame's (`orig`). Measured once: a re-bake (Display)
  // changes colours and shadow alpha, never where a drawing reaches (TRIM_MARGIN covers the rest). Reading the pages
  // back makes the canvas draw the bake at once, so it never runs before the first screen (`tdt:ready`, main.ts; the
  // atlas is made before it): until then a frame's texture is its whole frame, as before (the 2D Heart and portals the
  // game view makes at once, until the 3D sheet replaces them); after it the trim runs in an idle moment, or at the
  // first frame asked for, whichever comes first.
  const texturesFor = (drawn: ReadonlyMap<string, Box | null>): Map<string, Texture> => {
    const out = new Map<string, Texture>();
    for (const [name, s] of slots) {
      const r = s.rect;
      const b = drawn.get(name) ?? { x: r.x, y: r.y, w: r.width, h: r.height };
      const frame = new Rectangle(b.x / ART_RES, b.y / ART_RES, b.w / ART_RES, b.h / ART_RES);
      const whole = b.w === r.width && b.h === r.height;
      out.set(
        name,
        whole
          ? new Texture({ source: sources[s.page]!, frame })
          : new Texture({
              source: sources[s.page]!,
              frame,
              orig: new Rectangle(0, 0, r.width / ART_RES, r.height / ART_RES),
              trim: new Rectangle((b.x - r.x) / ART_RES, (b.y - r.y) / ART_RES, b.w / ART_RES, b.h / ART_RES),
            }),
      );
    }
    return out;
  };
  let whole: Map<string, Texture> | null = null;
  let trimmed: Map<string, Texture> | null = null;
  const trim = (): Map<string, Texture> => {
    if (trimmed) return trimmed;
    const start = performance.now();
    const drawn = new Map<string, Box | null>();
    canvases.forEach((canvas, page) => {
      const mine = [...slots].filter(([, s]) => s.page === page);
      const rows = Math.max(1, ...mine.map(([, s]) => s.rect.y + s.rect.height));
      const data = canvas.getContext('2d')!.getImageData(0, 0, PAGE_PX, rows).data;
      for (const [name, s] of mine) {
        const { x, y, width: w, height: h } = s.rect;
        drawn.set(name, drawnBox(data, PAGE_PX, { x, y, w, h }, TRIM_MARGIN));
      }
    });
    trimmed = texturesFor(drawn);
    performance.measure('tdt:art-trim', { start, detail: { pages: pageCount } });
    return trimmed;
  };
  const firstScreenUp = () => performance.getEntriesByName('tdt:ready').length > 0;
  const soon = () => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => trim(), { timeout: 3000 });
    else setTimeout(() => trim(), 1000);
  };
  if (firstScreenUp()) soon();
  else if (typeof PerformanceObserver === 'function') {
    const firstScreen = new PerformanceObserver((list) => {
      if (list.getEntriesByName('tdt:ready').length === 0) return;
      firstScreen.disconnect();
      soon();
    });
    firstScreen.observe({ type: 'mark' });
  }
  const textures = () => trimmed ?? (firstScreenUp() ? trim() : (whole ??= texturesFor(new Map())));

  return {
    frame(name) {
      const t = textures().get(name);
      if (!t) throw new Error(`no art frame ${name}`);
      return t;
    },
    has: (name) => slots.has(name),
    bake,
    pages: pageCount,
  };
}
