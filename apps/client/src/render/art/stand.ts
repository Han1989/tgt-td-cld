// Heroes standing still, drawn with no rig and no atlas (docs/ART.md §12, the lobby's hero stage).
// A hero's art file describes its standing pose (`HeroArt.stand`); this file turns that into plain
// placements, measures them and fits them into an area. Pure: no DOM, no Pixi. The canvas that
// draws them is lobby/heroStage.ts.

import type { HeroArt, StandPose } from './registry';

/** A 2D transform in canvas order: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Mat = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** Move to (x, y), then turn by `rot` radians. */
function moved(x: number, y: number, rot: number): Mat {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [c, s, -s, c, x, y];
}

function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** One thing a standing pose placed, in the hero's own space (world px, the hero at (0, 0), facing +x). */
export type StandItem =
  | { kind: 'part'; frame: string; w: number; h: number; m: Mat }
  | { kind: 'line'; x0: number; y0: number; x1: number; y1: number; color: number; width: number };

/** Everything a hero's standing pose places at time `now`, back to front. Throws on a frame the hero doesn't have. */
export function standItems(art: HeroArt, now: number): StandItem[] {
  const out: StandItem[] = [];
  const stack: Mat[] = [IDENTITY];
  const top = (): Mat => stack[stack.length - 1]!;
  const to: StandPose = {
    part(frame, x, y, rot = 0) {
      const def = art.frames[frame];
      if (!def) throw new Error(`${art.id}: standing pose uses a missing frame "${frame}"`);
      out.push({ kind: 'part', frame, w: def.w, h: def.h, m: mul(top(), moved(x, y, rot)) });
    },
    line(x0, y0, x1, y1, color, width) {
      const [ax, ay] = apply(top(), x0, y0);
      const [bx, by] = apply(top(), x1, y1);
      out.push({ kind: 'line', x0: ax, y0: ay, x1: bx, y1: by, color, width });
    },
    push(x, y, rot) {
      stack.push(mul(top(), moved(x, y, rot)));
    },
    pop() {
      if (stack.length === 1) throw new Error(`${art.id}: standing pose pops more than it pushes`);
      stack.pop();
    },
  };
  art.stand(to, now);
  if (stack.length !== 1) throw new Error(`${art.id}: standing pose leaves a push open`);
  return out;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The box a standing hero fills (world px around the hero): every frame's rectangle where the pose puts it. */
export function standBounds(items: readonly StandItem[]): Box {
  const b: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (x: number, y: number) => {
    b.x0 = Math.min(b.x0, x);
    b.y0 = Math.min(b.y0, y);
    b.x1 = Math.max(b.x1, x);
    b.y1 = Math.max(b.y1, y);
  };
  for (const it of items) {
    if (it.kind === 'line') {
      add(it.x0, it.y0);
      add(it.x1, it.y1);
      continue;
    }
    for (const [x, y] of [
      [-it.w / 2, -it.h / 2],
      [it.w / 2, -it.h / 2],
      [it.w / 2, it.h / 2],
      [-it.w / 2, it.h / 2],
    ] as const) {
      add(...apply(it.m, x, y));
    }
  }
  return b;
}

/** How much room standing heroes need, so one scale fits them all: the widest, and the tallest above its feet. */
export interface StandRoom {
  width: number;
  above: number;
}

export function standRoom(arts: readonly HeroArt[]): StandRoom {
  let width = 0;
  let above = 0;
  for (const art of arts) {
    const b = standBounds(standItems(art, 0));
    width = Math.max(width, b.x1 - b.x0);
    above = Math.max(above, art.feet - b.y0);
  }
  return { width, above };
}

/** Where a hero stands in an area: px per world px, and where its position (0, 0) goes. */
export interface StandFit {
  scale: number;
  x: number;
  y: number;
}

/**
 * Fits a hero into a `w` × `h` area (px): its feet on the ground line `ground` px from the top, the
 * figure centred, at the scale that lets the widest and the tallest hero (`room`) fit under `top`
 * px of headroom. Every hero gets the same scale, so they keep their sizes next to each other.
 */
export function fitStand(
  art: HeroArt,
  room: StandRoom,
  area: { w: number; h: number; ground: number; top: number; side: number },
): StandFit {
  const scale = Math.max(0, Math.min((area.ground - area.top) / room.above, (area.w - 2 * area.side) / room.width));
  const b = standBounds(standItems(art, 0));
  return { scale, x: area.w / 2 - ((b.x0 + b.x1) / 2) * scale, y: area.ground - art.feet * scale };
}
