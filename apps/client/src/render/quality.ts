// Render quality (docs/MOBILE.md §7): the device pixel ratio is capped at 2, and
// "Low" renders at 1× with fewer effects. "Auto" starts at High and drops to Low
// for the rest of the session if the frame rate stays low. Pure, so it is tested.
// Effects follow the quality too (fxLevel): Low drops particles and screen shake.

import type { Quality, ShakeSetting } from '../settings';

/** Never render above this device pixel ratio. */
export const MAX_DPR = 2;
/** Auto drops to Low when the average frame rate over a window stays under this. */
export const AUTO_MIN_FPS = 45;
/** Length of one measuring window (ms); the first one after a (re)start is ignored as warm-up. */
export const WINDOW_MS = 3000;

/** Renderer resolution for a quality level. */
export function resolutionFor(quality: 'high' | 'low', dpr: number): number {
  return quality === 'low' ? 1 : Math.max(1, Math.min(MAX_DPR, dpr || 1));
}

/** Measures frame times and decides when Auto should drop to Low. */
export class FpsMonitor {
  private windowMs = 0;
  private frames = 0;
  private warm = false;
  /** Average fps of the last complete window (0 until one completes). */
  fps = 0;

  /** Records one frame of `dtMs`. Returns true once when a completed window averaged under `minFps`. */
  sample(dtMs: number, minFps = AUTO_MIN_FPS): boolean {
    // A long pause (tab hidden, debugger) is not a slow frame.
    if (dtMs > 500) return false;
    this.windowMs += dtMs;
    this.frames++;
    if (this.windowMs < WINDOW_MS) return false;
    this.fps = (this.frames * 1000) / this.windowMs;
    this.windowMs = 0;
    this.frames = 0;
    if (!this.warm) {
      this.warm = true;
      return false;
    }
    return this.fps < minFps;
  }

  reset(): void {
    this.windowMs = 0;
    this.frames = 0;
    this.warm = false;
  }
}

/** The quality actually used: Auto means High until the monitor has asked for Low. */
export function effectiveQuality(setting: Quality, autoDegraded: boolean): 'high' | 'low' {
  if (setting === 'auto') return autoDegraded ? 'low' : 'high';
  return setting;
}

/** What the effects layer may do (docs/GAME_DESIGN.md Decision Log, Phase 4b effects). */
export interface FxLevel {
  /** Sparks, debris, pops, trails, rain, motes, shimmer, coins. */
  particles: boolean;
  /** Screen shake (also needs the "Screen shake" setting, and is off under reduced motion). */
  shake: boolean;
  /** How hard the shake kicks: 0 off, 1 Normal, `STRONG_SHAKE` for Strong. */
  shakeScale: number;
  /** Floating damage numbers alive at once. */
  maxNumbers: number;
  /**
   * The device asks for reduced motion (`prefers-reduced-motion`). The Iron Vow ring and the rain effects
   * keep their rings and flashes but drop what moves: streaks, turning, blinking and shake.
   */
  calm: boolean;
}

/** Shake strength of the Strong setting, against 1 for Normal. */
export const STRONG_SHAKE = 1.6;

/** The shake strength a setting gives; reduced motion and Graphics → Low turn it off whatever the setting. */
export function shakeScale(setting: ShakeSetting, low: boolean, calm: boolean): number {
  if (low || calm || setting === 'off') return 0;
  return setting === 'strong' ? STRONG_SHAKE : 1;
}

/**
 * Effects for a quality level, the player's "Screen shake" setting and whether the device asks for
 * reduced motion (which turns the shake off, not just down).
 */
export function fxLevel(quality: 'high' | 'low', shakeSetting: ShakeSetting, calm = false): FxLevel {
  const scale = shakeScale(shakeSetting, quality === 'low', calm);
  return quality === 'low'
    ? { particles: false, shake: false, shakeScale: scale, maxNumbers: 10, calm }
    : { particles: true, shake: scale > 0, shakeScale: scale, maxNumbers: 36, calm };
}
