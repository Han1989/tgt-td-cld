// Falling rain impacts (pure, tested). Arrow Storm, Meteor and Meteor Rain are global rains
// (protocol 16): every strike is its own `aoe` event with a spot and a strike radius, and the
// zone itself has no circle (radius 0). This decides where each streak starts and how long it
// flies, how hard a landing thumps, and where the faint sky streaks of a running rain fall.
// `effects.ts` does the drawing.

import { TILE_PX } from '@tdt/sim';

const S = TILE_PX;
const TAU = Math.PI * 2;

export type RainKind = 'arrowStorm' | 'meteor' | 'meteorRain';

/** One thing falling onto the ground. */
export interface Streak {
  /** Where it lands, relative to the impact (px). */
  landX: number;
  landY: number;
  /** Where it starts, relative to where it lands (px): up, and to one side. */
  fromX: number;
  fromY: number;
  /** Flight time (ms). */
  life: number;
}

export interface RainPlan {
  streaks: Streak[];
  /** Screen shake the landing adds (0..1). */
  shake: number;
}

/**
 * How each rain falls. Arrow Storm is a volley of short arrows from the upper left (as its old
 * circle was drawn); a Meteor is one long streak from the upper right; a Meteor Rain strike is
 * a shorter, quicker one, since there are six or seven a second. `tiles` is the height it falls
 * from, `lean` the sideways run per unit of fall, `life` the flight time range (ms).
 *
 * The sim does not say a strike is coming, only that it landed, so the landing (ring, flash) is
 * drawn when the event arrives and the streak flies in beside it. The flights are short (about
 * 60 to 120 ms) so the streak arrives almost with the flash.
 */
const FALL: Record<RainKind, { count: number; tiles: number; lean: number; life: readonly [number, number]; shake: number }> = {
  arrowStorm: { count: 5, tiles: 3, lean: -0.35, life: [60, 80], shake: 0 },
  meteor: { count: 1, tiles: 6, lean: 0.55, life: [100, 120], shake: 0.3 },
  meteorRain: { count: 1, tiles: 4, lean: 0.55, life: [70, 90], shake: 0.14 },
};

/** Ambient streaks a second across the screen while a rain of this kind is running. */
const SKY_RATE: Record<RainKind, number> = { arrowStorm: 12, meteor: 4, meteorRain: 18 };

/** The sky streaks are slower and longer than the strikes themselves. */
const SKY_FALL_TILES = 5;
const SKY_LIFE: readonly [number, number] = [240, 320];

const between = (range: readonly [number, number], rand: () => number): number => range[0] + (range[1] - range[0]) * rand();

/**
 * The streaks of one strike landing within `radius` tiles of the impact. With `calm` (the device asks
 * for reduced motion) nothing flies and nothing thumps: the landing ring and flash still show where it hit.
 */
export function rainPlan(kind: RainKind, radius: number, calm: boolean, rand: () => number = Math.random): RainPlan {
  if (calm) return { streaks: [], shake: 0 };
  const f = FALL[kind];
  const fall = f.tiles * S;
  const streaks: Streak[] = [];
  for (let i = 0; i < f.count; i++) {
    // A single streak (Meteor) lands on the centre; a volley spreads evenly over the circle.
    const spread = f.count > 1;
    const d = spread ? Math.sqrt(rand()) * radius * S * 0.9 : 0;
    const a = rand() * TAU;
    streaks.push({
      landX: Math.cos(a) * d,
      landY: Math.sin(a) * d,
      fromX: fall * f.lean,
      fromY: -fall,
      life: between(f.life, rand),
    });
  }
  return { streaks, shake: f.shake };
}

/** The sky streaks to add in `dtMs` over the visible world rectangle (px). */
export function skyStreaks(
  kind: RainKind,
  view: { left: number; top: number; right: number; bottom: number },
  count: number,
  rand: () => number = Math.random,
): Streak[] {
  const f = FALL[kind];
  const fall = SKY_FALL_TILES * S;
  const out: Streak[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      landX: view.left + (view.right - view.left) * rand(),
      landY: view.top + (view.bottom - view.top) * rand(),
      fromX: fall * f.lean,
      fromY: -fall,
      life: between(SKY_LIFE, rand),
    });
  }
  return out;
}

/**
 * Where a streak starts (px), which way it flies (radians) and how fast (px/s), so that it
 * reaches its landing spot `life` ms later. `(originX, originY)` is the impact (px).
 */
export function flight(originX: number, originY: number, s: Streak): { x: number; y: number; angle: number; speed: number } {
  return {
    x: originX + s.landX + s.fromX,
    y: originY + s.landY + s.fromY,
    angle: Math.atan2(-s.fromY, -s.fromX),
    speed: (Math.hypot(s.fromX, s.fromY) / s.life) * 1000,
  };
}

/** Sky streaks a second for a rain (0 when calm). */
export function skyRate(kind: RainKind, calm: boolean): number {
  return calm ? 0 : SKY_RATE[kind];
}
