// The 3D heroes' match sheets (docs/ART.md §15): loaded once the first screen is up (never in its way), turned into
// textures, and from then on a hero that appears in a match gets its 3D rig. Until then, or if loading fails, it
// gets its 2D rig.

import type { HeroKind } from '@tdt/protocol';
import { ImageSource, Rectangle, Texture } from 'pixi.js';
import { HERO_3D, type Cell, type MatchLayout } from './layout';
import rangerSheet from './ranger-match.png?url';

const SHEETS: Partial<Record<HeroKind, string>> = { ranger: rangerSheet };

export interface Frame {
  tex: Texture;
  flash: Texture;
}

export interface HeroFrames {
  layout: MatchLayout;
  idle: Frame[];
  walk: Frame[];
  cast: Frame[];
  /** The head of each body frame, drawn over the bow layer. */
  heads: { idle: Frame[]; walk: Frame[]; cast: Frame[] };
  draw: Frame[];
  loose: Frame[];
  /** The draw hand of each bow frame, drawn over the head. */
  hands: { draw: Frame[]; loose: Frame[] };
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
  const cell = (c: Cell, w: number, h: number): Frame => ({
    tex: new Texture({ source, frame: new Rectangle(c.x, c.y, w, h) }),
    flash: new Texture({ source, frame: new Rectangle(c.fx, c.fy, w, h) }),
  });
  const body = (cs: Cell[]) => cs.map((c) => cell(c, layout.body.w, layout.body.h));
  const head = (cs: Cell[]) => cs.map((c) => cell(c, layout.head.w, layout.head.h));
  const bow = (cs: Cell[]) => cs.map((c) => cell(c, layout.bow.w, layout.bow.h));
  return {
    layout,
    idle: body(layout.frames.idle),
    walk: body(layout.frames.walk),
    cast: body(layout.frames.cast),
    heads: { idle: head(layout.heads.idle), walk: head(layout.heads.walk), cast: head(layout.heads.cast) },
    draw: bow(layout.bowFrames.draw),
    loose: bow(layout.bowFrames.loose),
    hands: { draw: bow(layout.handFrames.draw), loose: bow(layout.handFrames.loose) },
  };
}
