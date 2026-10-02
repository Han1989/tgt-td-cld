// Screen shake (pure, tested): "trauma" in 0..1 that effects add to and that decays over
// time; the offset grows with trauma² so small bumps stay subtle and big impacts kick.

/** Trauma lost per second. */
const DECAY_PER_S = 1.8;

/**
 * Trauma a twin ultimate adds: a live `syncCast`, or the cast-overlap ribbon when that event is missing.
 * About 5 px at the peak (9 px × 0.75²), gone in ~0.4 s. The ribbon used to add 0.2: under half a pixel.
 */
export const SYNC_CAST_TRAUMA = 0.75;

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
