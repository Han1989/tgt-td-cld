// The Iron Vow ring an ally wears while the vow lasts (pure, tested). The snapshot says whether a
// living hero is covered (`shielded`) and for how many ticks more (`shieldFor`, the longest vow
// still running), so the ring needs no wire of its own: it blooms in when the vow lands, turns
// and breathes while it lasts, blinks over its last 1.5 seconds so nobody is surprised when the
// armour ends, and dims out over the last 0.3 s. With `calm` (the device asks for reduced motion)
// it appears and fades without the bloom, the turn, the breathing or the blink.

import { TICK_RATE } from '@tdt/sim';

/** Ticks left at which the ring starts to warn. */
export const VOW_WARN_TICKS = Math.round(1.5 * TICK_RATE);
/** The ring dims to nothing over the last 0.3 s, so it never just cuts off. */
export const VOW_END_TICKS = Math.round(0.3 * TICK_RATE);
/** How long the ring takes to bloom in (ms). */
export const VOW_BLOOM_MS = 280;
/** The blink: the ring dims every other 125 ms in the warning (4 times a second). */
const BLINK_MS = 125;
const BLINK_DIM = 0.2;
/** The dashed ring turns this fast (radians a second). */
const SPIN = 1.1;

export interface VowLook {
  /** 0..1: the dashed outer ring, the thin inner ring and the glow under the hero. */
  outer: number;
  inner: number;
  glow: number;
  /** Size of the whole ring, above 1 while it blooms in. */
  scale: number;
  /** Turn of the dashed ring (radians). */
  spin: number;
}

export const NO_VOW: VowLook = { outer: 0, inner: 0, glow: 0, scale: 1, spin: 0 };

/**
 * The ring's look. `shieldFor` is the ticks of vow left (0: none), `sinceMs` how long this hero has
 * been covered without a break, `nowMs` the clock.
 */
export function vowLook(shieldFor: number, sinceMs: number, nowMs: number, calm: boolean): VowLook {
  if (shieldFor <= 0) return NO_VOW;
  const bloom = Math.max(0, Math.min(1, sinceMs / VOW_BLOOM_MS));
  const eased = 1 - (1 - bloom) ** 3;
  // Steady until the warning. Then it blinks between bright (a little less each time) and dim, or, calm,
  // fades steadily; either way it dims out over the very last ticks.
  let fade = 1;
  if (shieldFor < VOW_WARN_TICKS) {
    const left = shieldFor / VOW_WARN_TICKS;
    fade = calm ? 0.4 + 0.6 * left : Math.floor(nowMs / BLINK_MS) % 2 === 0 ? 0.6 + 0.4 * left : BLINK_DIM;
  }
  fade *= Math.min(1, shieldFor / VOW_END_TICKS);
  const breath = calm ? 1 : 1 + 0.12 * Math.sin(nowMs / 220);
  return {
    outer: 0.9 * eased * fade,
    inner: 0.75 * eased * fade,
    glow: 0.28 * eased * fade * breath,
    scale: calm ? 1 : 1 + (1 - eased) * 0.6,
    spin: calm ? 0 : (nowMs / 1000) * SPIN,
  };
}
