// Loading the map plate (docs/ART.md §16): fetched and decoded off the main thread once the first screen is up (the
// service worker has it precached with the shell), then one texture (1664 × 3200 for Spire: under every phone's
// 4096 px limit) and the patches' textures. Until it has decoded, or if it fails, the painted ground (ground.ts) is
// drawn instead.

import { ImageSource, Rectangle, Texture } from 'pixi.js';
import { plateUrl, SPIRE_PLATE, type PlateFile, type PlateLayout } from './layout';

export interface Plate {
  layout: PlateLayout;
  /** The whole plate (plate px: draw it at 1 / res). */
  texture: Texture;
  /** Each patch by its pad's id, with where it goes (plate px). */
  patches: Map<number, { texture: Texture; x: number; y: number }>;
}

let plate: Plate | null = null;
let started: Promise<Plate | null> | null = null;
const waiting = new Set<(p: Plate) => void>();

/** The plate, once it has decoded. */
export function mapPlate(): Plate | null {
  return plate;
}

/** Calls `cb` once the plate has decoded (at once if it has); returns a function that cancels the call. */
export function onPlate(cb: (p: Plate) => void): () => void {
  if (plate) {
    cb(plate);
    return () => {};
  }
  waiting.add(cb);
  return () => waiting.delete(cb);
}

/** Loads the plate (once). A failure is logged and leaves the painted ground in place. */
export function loadPlate(layout: PlateLayout = SPIRE_PLATE): Promise<Plate | null> {
  started ??= (async () => {
    try {
      const whole = await bitmap(layout.file, layout.width, layout.height);
      const patches = new Map<number, { texture: Texture; x: number; y: number }>();
      if (layout.extra && layout.extra.patches.length > 0) {
        const atlas = new ImageSource({ resource: await bitmap(layout.extra.file), scaleMode: 'linear' });
        for (const p of layout.extra.patches) {
          const frame = new Rectangle(p.atlas[0]!, p.atlas[1]!, p.w, p.h);
          patches.set(p.pad, { texture: new Texture({ source: atlas, frame }), x: p.x, y: p.y });
        }
      }
      plate = { layout, texture: new Texture({ source: new ImageSource({ resource: whole, scaleMode: 'linear' }) }), patches };
      performance.mark('tdt:plate');
      for (const cb of waiting) cb(plate);
      waiting.clear();
      return plate;
    } catch (e) {
      console.warn('The map plate did not load; the painted ground stays', e);
      return null;
    }
  })();
  return started;
}

/** Fetches and decodes a plate file; `tdt:decode:<name>` (a performance measure) is its decode (`npm run first-load`). */
async function bitmap(f: PlateFile, w?: number, h?: number): Promise<ImageBitmap> {
  const url = plateUrl(f);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const blob = await res.blob();
  const start = performance.now();
  const img = await createImageBitmap(blob);
  performance.measure(`tdt:decode:${f.name}`, { start, end: performance.now() });
  if (w !== undefined && (img.width !== w || img.height !== h)) throw new Error(`${f.name} is ${img.width}×${img.height}, its layout says ${w}×${h}`);
  return img;
}
