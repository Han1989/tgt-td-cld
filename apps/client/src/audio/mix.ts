// Mixing rules (pure, tested): which sounds may play right now, and how loud and where.
//
// - Your own hero, towers and kills play louder than a teammate's (`OTHERS_GAIN`).
// - Sounds on screen play at full level, panned a little towards their side; off screen they are
//   quieter the further away they are, and past `HEAR_MARGIN` tiles they are skipped (yours never are).
// - `VoiceGate` caps the voices: each sound has a cooldown and a most-at-once, and low-priority
//   sounds (shots, deaths) stop at `VOICE_CAPS[0]` voices so they never crowd out a warning.

import type { Priority } from './sounds';

/** Voices playing at once, most, by the priority of the sound that wants to start. */
export const VOICE_CAPS: Record<Priority, number> = { 0: 12, 1: 20, 2: 26 };
/** A teammate's sounds, against your own. */
export const OTHERS_GAIN = 0.5;
/** Tiles beyond the screen edge over which a sound fades out; further away it is skipped. */
export const HEAR_MARGIN = 8;
/** A sound just off screen starts this much quieter than one on screen. */
const OFF_SCREEN_GAIN = 0.6;
/** Most stereo pan (−1 left … 1 right). */
const MAX_PAN = 0.6;

/** The visible world area, in tiles. */
export interface ViewBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How loud (0–1) and where (pan) a sound at (x, y) plays, or null when it is too far off screen to hear. */
export function placement(x: number, y: number, view: ViewBox, mine: boolean): { gain: number; pan: number } | null {
  const dx = x < view.left ? view.left - x : x > view.right ? x - view.right : 0;
  const dy = y < view.top ? view.top - y : y > view.bottom ? y - view.bottom : 0;
  const d = Math.hypot(dx, dy);
  const half = Math.max(1, (view.right - view.left) / 2);
  const pan = Math.max(-MAX_PAN, Math.min(MAX_PAN, ((x - (view.left + view.right) / 2) / half) * 0.5));
  if (d === 0) return { gain: 1, pan };
  if (d >= HEAR_MARGIN) return mine ? { gain: OFF_SCREEN_GAIN * 0.4, pan } : null;
  return { gain: OFF_SCREEN_GAIN * (1 - (d / HEAR_MARGIN) * (mine ? 0.6 : 1)), pan };
}

export interface GateSpec {
  cooldown: number;
  max: number;
}

/** Voice cap and per-sound cooldowns. Times in ms (performance.now()). */
export class VoiceGate {
  private readonly last = new Map<string, number>();
  private voices: { id: string; end: number }[] = [];

  /**
   * Whether sound `id` may start now (and if so, counts it): `key` is the cooldown's key (yours and
   * others' use different keys), `ms` how long it rings.
   */
  admit(id: string, key: string, spec: GateSpec, priority: Priority, ms: number, now: number): boolean {
    if (now - (this.last.get(key) ?? -Infinity) < spec.cooldown) return false;
    if (this.voices.length > 0 && this.voices[0]!.end <= now) this.voices = this.voices.filter((v) => v.end > now);
    if (this.voices.length >= VOICE_CAPS[priority]) return false;
    let same = 0;
    for (const v of this.voices) if (v.id === id) same++;
    if (same >= spec.max) return false;
    this.last.set(key, now);
    // Kept sorted by end time, so the check above finds ended voices at the front.
    const end = now + ms;
    let i = this.voices.length;
    while (i > 0 && this.voices[i - 1]!.end > end) i--;
    this.voices.splice(i, 0, { id, end });
    return true;
  }

  /** Voices still playing at `now`. */
  active(now: number): number {
    return this.voices.filter((v) => v.end > now).length;
  }

  reset(): void {
    this.last.clear();
    this.voices = [];
  }
}

// ---------------------------------------------------------------------------
// Takes: every play of a sound a little different
// ---------------------------------------------------------------------------

/** How one play of a sound differs from the last: which baked variant, pitch, level, a few ms of timing, reverb. */
export interface Take {
  variant: number;
  rate: number;
  gain: number;
  /** Seconds after now. */
  delay: number;
  wet: number;
}

/** A play's level spread (dB, ±). */
export const TAKE_GAIN_DB = 1.5;
/** A play's timing spread (s): up to this late (warnings and the UI: a third of it). */
export const TAKE_DELAY = 0.014;

/**
 * Picks each play's take (seeded, so tests are repeatable): never the same variant twice in a row,
 * the pitch within the sound's `pitch` spread, ±1.5 dB, 0–14 ms late, and the reverb send ±20%.
 */
export class Takes {
  private seed: number;
  private readonly last = new Map<string, number>();

  constructor(seed = 1) {
    this.seed = seed;
  }

  private r(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  next(id: string, spec: { variants: number; pitch: number; wet: number; priority: Priority }): Take {
    let variant = 0;
    if (spec.variants > 1) {
      const last = this.last.get(id) ?? -1;
      variant = last < 0 ? Math.floor(this.r() * spec.variants) : (last + 1 + Math.floor(this.r() * (spec.variants - 1))) % spec.variants;
      this.last.set(id, variant);
    }
    return {
      variant,
      rate: 1 + (this.r() * 2 - 1) * spec.pitch,
      gain: Math.pow(10, ((this.r() * 2 - 1) * TAKE_GAIN_DB) / 20),
      delay: this.r() * TAKE_DELAY * (spec.priority === 2 ? 1 / 3 : 1),
      wet: spec.wet * (0.8 + 0.4 * this.r()),
    };
  }
}
