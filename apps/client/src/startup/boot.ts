// Start-up watchdog (docs/ART.md "The boot splash", docs/ANALYTICS.md "Crash reports"): a player is never left on
// "Loading…" for ever. Pure: no DOM; main.ts wires it to the splash and to the crash reports.
//
// A start-up that throws already shows "The game could not start". These are the two that do not throw:
// - slow: the game has not reached `ready()` after `BOOT_SLOW_MS` of the page being on screen. The splash says so and
//   offers Reload; the start-up keeps going, and `ready()` removes the splash as usual.
// - failed: the graphics are known to be gone (no WebGL, or the context lost while starting). Said at once.
// Each reason is reported once, as a fixed word (no stack, nothing about the player).

/** How long the page may be visible and still not ready before the splash admits it. */
export const BOOT_SLOW_MS = 15_000;

/** The graphics are gone; shown at once. */
export type BootFailure = 'webgl_unavailable' | 'webgl_context_lost';
/** What a crash report carries as its message (the server groups on it). */
export type BootReason = 'boot_timeout' | BootFailure;
export type BootPhase = 'starting' | 'slow' | 'failed' | 'ready';

export const BOOT_COPY = {
  slow: 'Still loading. This can take longer on a slow connection.',
  graphics: "This browser could not start the game's graphics.",
  /** A start-up that threw (main.ts). */
  threw: 'The game could not start. Refresh to try again.',
} as const;

/** `GameView.create` throws this when the renderer cannot come up; main.ts says so plainly and reports `reason`. */
export class GraphicsUnavailableError extends Error {
  readonly reason: BootFailure;
  constructor(reason: BootFailure, cause?: unknown) {
    super(reason, cause === undefined ? undefined : { cause });
    this.name = 'GraphicsUnavailableError';
    this.reason = reason;
  }
}

export interface BootWatchdogOptions {
  /** The start-up is taking long: say so, with a Reload button. */
  onSlow(): void;
  /** The graphics are gone: say so, with a Reload button. */
  onFailed(reason: BootFailure): void;
  /** Once per reason: send it as a crash report. */
  onReport(reason: BootReason): void;
}

export interface BootWatchdog {
  phase(): BootPhase;
  /** The first screen is up. Wins over every other state: the splash goes as normal. */
  ready(): void;
  /** The graphics cannot start. Only the first one counts, and not after `ready()`. */
  fail(reason: BootFailure): void;
  /** The page went to or came back from the background; time in the background does not count. */
  visible(isVisible: boolean): void;
}

export function createBootWatchdog(options: BootWatchdogOptions): BootWatchdog {
  let phase: BootPhase = 'starting';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let remaining = BOOT_SLOW_MS;
  let armedAt = 0;

  const disarm = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const arm = () => {
    disarm();
    armedAt = Date.now();
    timer = setTimeout(() => {
      timer = null;
      if (phase !== 'starting') return;
      phase = 'slow';
      options.onSlow();
      options.onReport('boot_timeout');
    }, Math.max(0, remaining));
  };
  arm();

  return {
    phase: () => phase,
    ready() {
      phase = 'ready';
      disarm();
    },
    fail(reason) {
      if (phase !== 'starting' && phase !== 'slow') return;
      phase = 'failed';
      disarm();
      options.onFailed(reason);
      options.onReport(reason);
    },
    visible(isVisible) {
      if (phase !== 'starting') return;
      if (isVisible) {
        if (timer === null) arm();
      } else if (timer !== null) {
        remaining -= Date.now() - armedAt;
        disarm();
      }
    },
  };
}
