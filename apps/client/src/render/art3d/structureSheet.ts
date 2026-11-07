// The towers', the Heart's and the portals' 3D sheet (docs/ART.md §15, V-05d): lossless WebP pages (V-07d: a third
// smaller than the PNG, the same pixels; V-08b build 2: the turrets' eight headings take several pages of 2048,
// `structures-match-<n>.webp`), loaded after the map plate and before the creeps' sheets (never in the first screen's
// way), turned into textures and put on the GPU. Precached again since V-08b load-all (Han, 7 Nov 2026): a first visit's
// page downloads them from the lobby and tells the service worker it has them (`structurePageUrls`, `keepSheets`); an
// update's worker carries them over or fetches them after the shell. No match starts before every page is in
// (artLoad/gate.ts), so a normal match draws Tower3DRig and the 3D Heart and portals from its first frame; the 2D art and
// the swap (`structuresVersion`) are for the stress scene and the browser tests' `?towers2d` only.

import { ImageSource, Rectangle, Texture } from 'pixi.js';
import { toGpu } from '../../artLoad/gpu';
import { fetchSheet, trackSheet } from '../../artLoad/track';
import type { StructureCell, StructureMatchLayout } from './structures';

/** The pages' URLs by file name (structures-match-0.webp…), as the build hashes them. */
const PAGE_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('./structures-match-*.webp', { query: '?url', import: 'default', eager: true })).map(([k, v]) => [
    k.slice(2),
    v,
  ]),
);

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

/** The pages' URLs once every page is in (for the service worker to keep, `keepSheets`), else none. */
export function structurePageUrls(): string[] {
  return loaded ? loaded.layout.pages.flatMap((page) => PAGE_URLS[page.file] ?? []) : [];
}

/** Goes up when the sheet comes in: the renderer swaps towers, the Heart and the portals drawn in 2D. */
export function structuresVersion(): number {
  return version;
}

/** Loads the sheet (once; again after a failure, the wait's Retry). A failure is logged. */
export function loadStructureSheet(): Promise<void> {
  started ??= (async () => {
    const track = trackSheet('structures');
    try {
      // The layout comes with the sheet, not with the first screen (a chunk of data only, as the creeps').
      const { default: layout } = await import('./structures.json');
      loaded = await load(layout.match as StructureMatchLayout, track.bytes);
      toGpu(new Set([...loaded.frames.values()].map((f) => f.tex.source)));
      version++;
      track.done(true);
    } catch (e) {
      track.done(false);
      started = null;
      console.warn('3D structures: the sheet did not load', e);
    }
  })();
  return started;
}

async function load(layout: StructureMatchLayout, onBytes: (received: number, expected: number | null) => void): Promise<StructureFrames> {
  // Every page at once; the bytes reported are all of them together (`expected` once every page has said its length).
  const got = layout.pages.map(() => ({ received: 0, expected: null as number | null }));
  const report = () => {
    const expected = got.every((g) => g.expected !== null) ? got.reduce((a, g) => a + g.expected!, 0) : null;
    onBytes(
      got.reduce((a, g) => a + g.received, 0),
      expected,
    );
  };
  const sources = await Promise.all(
    layout.pages.map(async (page, i) => {
      const url = PAGE_URLS[page.file];
      if (!url) throw new Error(`no page ${page.file} in the build`);
      const bitmap = await createImageBitmap(
        await fetchSheet(url, (received, expected) => {
          got[i] = { received, expected };
          report();
        }),
      );
      if (bitmap.width !== page.w || bitmap.height !== page.h) throw new Error(`${page.file} is ${bitmap.width}×${bitmap.height}, layout says ${page.w}×${page.h}`);
      return new ImageSource({ resource: bitmap, scaleMode: 'linear' });
    }),
  );
  const frames = new Map<string, StructureFrame>();
  for (const [key, c] of Object.entries(layout.cells) as [string, StructureCell][]) {
    frames.set(key, {
      tex: new Texture({ source: sources[c.page]!, frame: new Rectangle(c.x, c.y, c.w, c.h) }),
      ax: c.ax / c.w,
      ay: c.ay / c.h,
      scale: 1 / (c.res ?? layout.res),
    });
  }
  return { layout, frames };
}
