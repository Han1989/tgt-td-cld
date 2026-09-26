// Render quality (docs/MOBILE.md §7): the device pixel ratio is capped at 2, and
// "Low" renders at 1× with fewer effects. "Auto" starts at High and drops to Low
// for the rest of the session if the frame rate stays low. Pure, so it is tested.

import type { Quality } from '../settings';

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
