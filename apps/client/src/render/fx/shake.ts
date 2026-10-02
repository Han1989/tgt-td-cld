// Screen shake (pure, tested): "trauma" in 0..1 that effects add to and that decays over
// time; the offset grows with trauma^power so small bumps stay subtle and big impacts kick.
//
// Two channels. Ordinary bumps (a single Meteor thump, a boss wave, the Heart) share `trauma`.
// A twin ultimate — a live `syncCast`, or the cast-overlap ribbon — uses `heavy`, so turning
// that kick up does not enlarge every other shake.
//
// #48 put the twin on the ordinary channel: trauma 0.75, cap 9 px, power 2, decay 1.8/s.
// The envelope peaked at 9 × 0.75² ≈ 5 px, fell under 1 px by ~0.25 s and was still by ~0.4 s,
// on a ~7–11 Hz buzz a phone frame barely caught. Playtesters could not see it.

/** Trauma the ordinary channel loses per second. */
export const SHAKE_DECAY_PER_S = 1.8;

/** Ordinary cap (px). Single-R thumps, bosses and the Heart stay on this. */
export const SHAKE_MAX_PX = 9;

/** Ordinary curve. Offset = trauma^power × cap, so a 0.3 Meteor thump is under 1 px. */
export const SHAKE_POWER = 2;

/**
 * Trauma a twin ultimate adds on the first ribbon segment.
 * Full scale: the cap below is the peak, not a fraction of it.
 */
export const SYNC_CAST_TRAUMA = 1;

/**
 * Twin cap (px). At trauma 1 the envelope peak is this whole value (~4× the old 5 px).
 * The HUD does not move with the world, so a phone's skill buttons stay put.
 */
export const SYNC_CAST_MAX_PX = 20;

/** Twin decay. 1 / this ≈ 1.2 s until the kick is still (the old one died at ~0.4 s). */
export const SYNC_CAST_DECAY_PER_S = 0.85;

/**
 * Twin curve, milder than the ordinary square so the kick is still several pixels
 * after half a second instead of collapsing at once.
 */
export const SYNC_CAST_POWER = 1.4;

/**
 * Twin oscillator speed relative to the ordinary buzz (~7–11 Hz).
 * 0.42 is about 3–5 Hz: a slow slam a 60 Hz phone can actually show.
 */
export const SYNC_CAST_FREQ = 0.42;

/** The device asks for less motion (the OS "reduce motion" switch). False where the browser cannot say. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Trauma for segment `segment` of a twin-ultimate ribbon chain. The chain kicks once (its first segment).
 * Reduced motion (`prefers-reduced-motion`, `FxLevel.calm`) adds nothing: the ribbon, edge glow and sound stay.
 */
export function twinShake(segment: number, reducedMotion: boolean): number {
  return segment === 0 && !reducedMotion ? SYNC_CAST_TRAUMA : 0;
}

/** Cap (px) for the twin channel. Zero under reduced motion, so a leftover kick cannot play. */
export function twinShakeMaxPx(reducedMotion: boolean): number {
  return reducedMotion ? 0 : SYNC_CAST_MAX_PX;
}

/** Peak offset (px) for a trauma on a channel, before the oscillator. `trauma` is clamped to 0..1. */
export function shakeEnvelope(trauma: number, maxPx: number, power: number): number {
  if (trauma <= 0 || maxPx <= 0) return 0;
  const t = trauma > 1 ? 1 : trauma;
  return t ** power * maxPx;
}

export class Shake {
  /** Ordinary bumps. */
  trauma = 0;
  /** Twin / syncCast only. Does not mix into `trauma`. */
  heavy = 0;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  /** Twin / syncCast kick. Same 0..1 scale as `add`, drawn with the heavy cap and decay. */
  addHeavy(amount: number): void {
    this.heavy = Math.min(1, this.heavy + Math.max(0, amount));
  }

  clearHeavy(): void {
    this.heavy = 0;
  }

  /**
   * Decays both channels by `dtMs` and returns the offset (px) at time `now` (ms).
   * `maxPx` caps the ordinary channel. `heavyMaxPx` caps the twin channel (0 hides it,
   * which is what reduced motion passes). The sum stays within the larger of the two caps.
   */
  offset(now: number, dtMs: number, maxPx: number, heavyMaxPx = 0): { x: number; y: number } {
    this.trauma = Math.max(0, this.trauma - (SHAKE_DECAY_PER_S * dtMs) / 1000);
    this.heavy = Math.max(0, this.heavy - (SYNC_CAST_DECAY_PER_S * dtMs) / 1000);
    if (this.trauma <= 0 && (this.heavy <= 0 || heavyMaxPx <= 0)) return { x: 0, y: 0 };
    const light = this.trauma > 0 ? this.wave(now, shakeEnvelope(this.trauma, maxPx, SHAKE_POWER), 1) : { x: 0, y: 0 };
    const slam =
      this.heavy > 0 && heavyMaxPx > 0
        ? this.wave(now, shakeEnvelope(this.heavy, heavyMaxPx, SYNC_CAST_POWER), SYNC_CAST_FREQ)
        : { x: 0, y: 0 };
    if (slam.x === 0 && slam.y === 0) return light;
    const cap = Math.max(maxPx, heavyMaxPx);
    return { x: clamp(light.x + slam.x, -cap, cap), y: clamp(light.y + slam.y, -cap, cap) };
  }

  reset(): void {
    this.trauma = 0;
    this.heavy = 0;
  }

  /** `amp` px, `freq` 1 = the ordinary buzz. Each axis stays within ±amp. */
  private wave(now: number, amp: number, freq: number): { x: number; y: number } {
    const t = now / 1000;
    const nx = (Math.sin(t * 71.3 * freq) + Math.sin(t * 43.7 * freq + 1.3)) / 2;
    const ny = (Math.sin(t * 67.1 * freq + 2.1) + Math.sin(t * 39.9 * freq + 0.4)) / 2;
    return { x: nx * amp, y: ny * amp };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
