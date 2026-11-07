// The 3D creeps' match sheets (docs/ART.md §15, V-05c): lossless WebP (round 2: a third smaller than the PNGs, the
// same pixels), loaded after the first screen (never in its way), one after another in the order the kinds first
// come in the waves (a match's first wave's kinds first, V-07d: `preferCreeps`), turned into textures and put on the
// GPU. No match starts before every kind is in (V-08b load-all, artLoad/gate.ts); the 2D rigs and the swap
// (`creepSheetsVersion`) are for the stress scene and the browser tests' `?creeps2d`.

import type { CreepKind } from '@tdt/protocol';
import { ImageSource, Rectangle, Texture } from 'pixi.js';
import { toGpu } from '../../artLoad/gpu';
import { fetchSheet, trackSheet } from '../../artLoad/track';
import archerSheet from './archer-match.webp?url';
import bruteSheet from './brute-match.webp?url';
import type { CreepCell, CreepMatchLayout, CreepState } from './creeps';
import gruntSheet from './grunt-match.webp?url';
import hatchlingSheet from './hatchling-match.webp?url';
import ironhornSheet from './ironhorn-match.webp?url';
import matriarchSheet from './matriarch-match.webp?url';
import runnerSheet from './runner-match.webp?url';
import shardbackSheet from './shardback-match.webp?url';
import wispSheet from './wisp-match.webp?url';

/** Each kind's sheet (a URL with its build hash). */
export const CREEP_SHEETS: Record<CreepKind, string> = {
  grunt: gruntSheet,
  runner: runnerSheet,
  archer: archerSheet,
  brute: bruteSheet,
  wisp: wispSheet,
  ironhorn: ironhornSheet,
  matriarch: matriarchSheet,
  hatchling: hatchlingSheet,
  shardback: shardbackSheet,
};

/** A frame and, on the flinch, its white twin. Both keep the frame box's size (trimmed), so the anchor is the feet. */
export interface CreepFrame {
  tex: Texture;
  flash: Texture | null;
}

export interface CreepFrames {
  layout: CreepMatchLayout;
  frames: Partial<Record<CreepState, CreepFrame[]>> & Record<'walk' | 'idle' | 'hit' | 'death', CreepFrame[]>;
  /** The Shardback's spines per frame (none while dying). */
  hide: Partial<Record<CreepState, Texture[]>> | null;
}

const loaded = new Map<CreepKind, CreepFrames>();
const pending = new Map<CreepKind, Promise<void>>();
let version = 0;
let started: Promise<void> | null = null;
/** Kinds a match wants first (its first wave's): the next to load among those still waiting. */
let preferred: readonly CreepKind[] = [];

/** The frames of a 3D creep kind, once its sheet has loaded. */
export function creepFrames(kind: CreepKind): CreepFrames | undefined {
  return loaded.get(kind);
}

/** Goes up each time a sheet comes in: the renderer swaps creeps drawn in 2D for their 3D rig. */
export function creepSheetsVersion(): number {
  return version;
}

/** Moves `kinds` to the front of the creep sheets still waiting, in their order (a match's kinds as its waves bring them). */
export function preferCreeps(kinds: readonly CreepKind[]): void {
  preferred = kinds;
}

/** Loads one creep kind's sheet (once; at once). A failure is logged and leaves that kind's 2D rig in place. */
export function loadCreepSheet(kind: CreepKind): Promise<void> {
  let p = pending.get(kind);
  if (!p) {
    p = (async () => {
      const track = trackSheet(`creep:${kind}`);
      try {
        // The layouts come with the sheets, not with the first screen. (Only the data: a lazy chunk that shared Pixi
        // with the first screen's would make the bundler split Pixi's renderers off it, a round trip more before the
        // first screen.)
        const { CREEP_3D } = await import('./creepData');
        const frames = await load(CREEP_SHEETS[kind], CREEP_3D[kind].match, track.bytes);
        toGpu(new Set(Object.values(frames.frames).flatMap((fs) => fs.map((f) => f.tex.source))));
        loaded.set(kind, frames);
        version++;
        track.done(true);
      } catch (e) {
        track.done(false);
        // Asked again (the wait's Retry) tries again.
        pending.delete(kind);
        console.warn(`3D ${kind}: the match sheet did not load`, e);
      }
    })();
    pending.set(kind, p);
  }
  return p;
}

/**
 * Loads every 3D creep's sheet (once), all at once (V-08b load-all: no match starts before all nine are in, so the line
 * is never left idle while one decodes), asked for in `preferCreeps`'s order, then the rest. Failures are logged.
 */
export function loadCreepSheets(): Promise<void> {
  started ??= (async () => {
    const { CREEP_3D } = await import('./creepData');
    const all = Object.keys(CREEP_3D) as CreepKind[];
    const order = [...preferred.filter((k) => all.includes(k)), ...all.filter((k) => !preferred.includes(k))];
    await Promise.all(order.map(loadCreepSheet));
  })();
  return started;
}

async function load(url: string, layout: CreepMatchLayout, onBytes: (received: number, expected: number | null) => void): Promise<CreepFrames> {
  const bitmap = await createImageBitmap(await fetchSheet(url, onBytes));
  if (bitmap.width !== layout.w || bitmap.height !== layout.h) throw new Error(`sheet is ${bitmap.width}×${bitmap.height}, layout says ${layout.w}×${layout.h}`);
  const source = new ImageSource({ resource: bitmap, scaleMode: 'linear' });
  const { box } = layout;
  const orig = new Rectangle(0, 0, box.w, box.h);
  const cut = (c: CreepCell, x: number, y: number) =>
    c.w > 0 && c.h > 0
      ? new Texture({ source, frame: new Rectangle(x, y, c.w, c.h), orig, trim: new Rectangle(c.dx, c.dy, c.w, c.h) })
      : Texture.EMPTY;
  const frames: Partial<Record<CreepState, CreepFrame[]>> = {};
  for (const [state, cells] of Object.entries(layout.frames) as [CreepState, CreepCell[]][]) {
    frames[state] = cells.map((c) => ({ tex: cut(c, c.x, c.y), flash: c.fx !== undefined && c.fy !== undefined ? cut(c, c.fx, c.fy) : null }));
  }
  if (!frames.walk?.length || !frames.idle?.length || !frames.hit?.[0]?.flash || !frames.death?.length) {
    throw new Error('the sheet lacks a walk, a stand, a flinch with its twin or a death');
  }
  let hide: CreepFrames['hide'] = null;
  if (layout.hide) {
    hide = {};
    for (const [state, cells] of Object.entries(layout.hide) as [CreepState, CreepCell[]][]) hide[state] = cells.map((c) => cut(c, c.x, c.y));
  }
  return { layout, frames: frames as CreepFrames['frames'], hide };
}
