// Screen shake (pure, tested): "trauma" in 0..1 that effects add to and that decays over
// time; the offset grows with trauma² so small bumps stay subtle and big impacts kick.

/** Trauma lost per second. */
const DECAY_PER_S = 1.8;

/**
 * Trauma a twin ultimate adds: a live `syncCast`, or the cast-overlap ribbon when that event is missing.
 * About 5 px at the peak (9 px × 0.75²), gone in ~0.4 s. The ribbon used to add 0.2: under half a pixel.
 */
export const SYNC_CAST_TRAUMA = 0.75;

/**
 * How hard each moment kicks the screen at Normal (trauma 0..1; the offset grows with its square, so 0.5 is about
 * 2 px on a phone and 1 about 9). Strong multiplies it (`STRONG_SHAKE`); Off and reduced motion drop it.
 */
export const SHAKE_AT = {
  /** An ultimate cast, anyone's: the Meteor kicks hardest, Arrow Storm is a lighter rain. */
  arrowStorm: 0.5,
  meteor: 0.65,
  ironVow: 0.65,
  /** Two ultimates fused: on top of the cast's own kick. */
  combo: 0.8,
  /** Boss abilities: Ironhorn's stomp, the Matriarch's hatch and Shardback's shifting hide. */
  stomp: 0.55,
  hatch: 0.35,
  hideShift: 0.35,
} as const;

/** The Heart took a leak of `damage`: a kick of 0.4 for a 1 HP leak, more for a boss's 20 (never past 1). */
export function heartShake(damage: number): number {
  return Math.min(1, 0.4 + Math.max(0, damage) * 0.03);
}

/** Heart hits kick the screen at most this often (ms): a pack of leaks is one thud, not a rumble. */
export const HEART_SHAKE_GAP_MS = 250;

/** The device asks for less motion (the OS "reduce motion" switch). False where the browser cannot say. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Trauma for segment `segment` of a twin-ultimate ribbon chain. The chain kicks once (its first segment), and
 * not at all under reduced motion: the ribbon, the edge glow and the sound still show the moment.
 */
export function twinShake(segment: number, reducedMotion: boolean): number {
  return segment === 0 && !reducedMotion ? SYNC_CAST_TRAUMA : 0;
}

export class Shake {
  trauma = 0;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  /** Decays trauma by `dtMs` and returns the offset (px, within ±maxPx) at time `now` (ms). */
  offset(now: number, dtMs: number, maxPx: number): { x: number; y: number } {
    this.trauma = Math.max(0, this.trauma - (DECAY_PER_S * dtMs) / 1000);
    if (this.trauma <= 0) return { x: 0, y: 0 };
    const k = this.trauma * this.trauma * maxPx;
    // Two incommensurate sines per axis: jittery but continuous, and always within ±1.
    const t = now / 1000;
    const nx = (Math.sin(t * 71.3) + Math.sin(t * 43.7 + 1.3)) / 2;
    const ny = (Math.sin(t * 67.1 + 2.1) + Math.sin(t * 39.9 + 0.4)) / 2;
    return { x: nx * k, y: ny * k };
  }

  reset(): void {
    this.trauma = 0;
  }
}
