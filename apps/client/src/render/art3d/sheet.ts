// The 3D heroes' match sheets (docs/ART.md §15): loaded once the first screen is up (never in its way), turned into
// textures, and from then on a hero that appears in a match gets its 3D rig. Until then, or if loading fails, it
// gets its 2D rig.

import type { HeroKind } from '@tdt/protocol';
import { ImageSource, Rectangle, Texture } from 'pixi.js';
import arcanistSheet from './arcanist-match.png?url';
import { HERO_3D, kindBox, type Cell, type LayerName, type MatchLayout } from './layout';
import rangerSheet from './ranger-match.png?url';
import wardenSheet from './warden-match.png?url';

const SHEETS: Partial<Record<HeroKind, string>> = { ranger: rangerSheet, warden: wardenSheet, arcanist: arcanistSheet };

export interface Frame {
  tex: Texture;
  flash: Texture;
  /** The anchor (the feet, or the arm layer's shoulder) in the cell, 0..1: frames of one kind share it. */
  ax: number;
  ay: number;
}

/** A layer's frames by kind (idle, walk, the attack and cast poses…), each with its white twin. */
export type Frames = Record<string, Frame[]>;

export interface HeroFrames {
  layout: MatchLayout;
  layers: Partial<Record<LayerName, Frames>> & { body: Frames; fall: Frames };
}

const loaded = new Map<HeroKind, HeroFrames>();
let started: Promise<void> | null = null;

/** The frames of a 3D hero, once its sheet has loaded. */
export function heroFrames(kind: HeroKind): HeroFrames | undefined {
  return loaded.get(kind);
}

/** Loads every 3D hero's sheet (once). Failures are logged and leave the 2D rigs in place. */
export function loadHeroSheets(): Promise<void> {
  started ??= Promise.all(
    (Object.keys(SHEETS) as HeroKind[]).map(async (kind) => {
      const layout = HERO_3D[kind]?.match;
      const url = SHEETS[kind];
      if (!layout || !url) return;
      try {
        loaded.set(kind, await load(url, layout));
      } catch (e) {
        console.warn(`3D ${kind}: the match sheet did not load; the 2D rig stays`, e);
      }
    }),
  ).then(() => undefined);
  return started;
}

async function load(url: string, layout: MatchLayout): Promise<HeroFrames> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const bitmap = await createImageBitmap(await res.blob());
  if (bitmap.width !== layout.w || bitmap.height !== layout.h) throw new Error(`sheet is ${bitmap.width}×${bitmap.height}, layout says ${layout.w}×${layout.h}`);
  const source = new ImageSource({ resource: bitmap, scaleMode: 'linear' });
  const layers: Partial<Record<LayerName, Frames>> = {};
  for (const [name, kinds] of Object.entries(layout.frames) as [LayerName, Record<string, Cell[]>][]) {
    const box = layout.layers[name];
    if (!box) continue;
    const frames: Frames = {};
    for (const [kind, cells] of Object.entries(kinds)) {
      const b = kindBox(box, kind);
      frames[kind] = cells.map((c) => ({
        tex: new Texture({ source, frame: new Rectangle(c.x, c.y, b.w, b.h) }),
        flash: new Texture({ source, frame: new Rectangle(c.fx, c.fy, b.w, b.h) }),
        ax: b.ax / b.w,
        ay: b.ay / b.h,
      }));
    }
    layers[name] = frames;
  }
  if (!layers.body || !layers.fall) throw new Error('the sheet has no body or fall layer');
  return { layout, layers: layers as HeroFrames['layers'] };
}
