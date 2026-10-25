// The towers', the Heart's and the portals' 3D sheet (docs/ART.md §15, V-05d): one lossless WebP (V-07d: a third smaller
// than the PNG, the same pixels), precached with the shell, loaded after the map plate and before the creeps' sheets
// (never in the first screen's way), turned into textures. From then on a tower gets Tower3DRig
// and the Heart and the portals their 3D views (the renderer swaps those already drawn, `structuresVersion`); until
// then, or if loading fails, their 2D art.

import { ImageSource, Rectangle, Texture } from 'pixi.js';
import { fetchWithProgress, trackSheet } from '../../artLoad/track';
import sheetUrl from './structures-match.webp?url';
import type { StructureCell, StructureMatchLayout } from './structures';

/** A frame's texture, its anchor (0..1 of the frame, the world point it stands on) and the scale that draws it at
 * world px (1 / its sheet px per world px). */
export interface StructureFrame {
  tex: Texture;
  ax: number;
  ay: number;
  scale: number;
}

export interface StructureFrames {
  layout: StructureMatchLayout;
  frames: Map<string, StructureFrame>;
}

let loaded: StructureFrames | undefined;
let version = 0;
let started: Promise<void> | null = null;

/** The structures' frames, once the sheet has loaded. */
export function structureFrames(): StructureFrames | undefined {
  return loaded;
}

/** Goes up when the sheet comes in: the renderer swaps towers, the Heart and the portals drawn in 2D. */
export function structuresVersion(): number {
  return version;
}

/** Loads the sheet (once). A failure is logged and leaves the 2D art in place. */
export function loadStructureSheet(): Promise<void> {
  started ??= (async () => {
    const track = trackSheet('structures');
    try {
      // The layout comes with the sheet, not with the first screen (a chunk of data only, as the creeps').
      const { default: layout } = await import('./structures.json');
      loaded = await load(sheetUrl, layout.match as StructureMatchLayout, track.bytes);
      version++;
      track.done(true);
    } catch (e) {
      track.done(false);
      console.warn('3D structures: the sheet did not load; the 2D art stays', e);
    }
  })();
  return started;
}

async function load(url: string, layout: StructureMatchLayout, onBytes: (received: number, expected: number | null) => void): Promise<StructureFrames> {
  const bitmap = await createImageBitmap(await fetchWithProgress(url, onBytes));
  if (bitmap.width !== layout.w || bitmap.height !== layout.h) throw new Error(`sheet is ${bitmap.width}×${bitmap.height}, layout says ${layout.w}×${layout.h}`);
  const source = new ImageSource({ resource: bitmap, scaleMode: 'linear' });
  const frames = new Map<string, StructureFrame>();
  for (const [key, c] of Object.entries(layout.cells) as [string, StructureCell][]) {
    frames.set(key, {
      tex: new Texture({ source, frame: new Rectangle(c.x, c.y, c.w, c.h) }),
      ax: c.ax / c.w,
      ay: c.ay / c.h,
      scale: 1 / (c.res ?? layout.res),
    });
  }
  return { layout, frames };
}
