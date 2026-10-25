// Buffers snapshots and renders the world a little in the past (100 ms online, 40 ms solo),
// interpolating entity positions between the two snapshots that bracket the render time.

import type { GameEvent, Snapshot } from '@tdt/protocol';

/** Online: room for network jitter. */
export const INTERP_DELAY_MS = 100;
/** Solo: the local sim has no network jitter, only the worker's timer (a few ms). */
export const SOLO_INTERP_DELAY_MS = 40;
/**
 * When the render time passes the newest snapshot, positions carry on along its last step for at
 * most this long (then hold). Solo's 40 ms delay is shorter than a 50 ms tick, so this covers the
 * last ~10 ms of every tick; online it covers small delays.
 */
export const MAX_EXTRAPOLATE_MS = 25;
/** A step longer than this between two snapshots (tiles) is a jump (respawn, a new match): never extrapolated. */
const MAX_EXTRAPOLATE_STEP = 2.5;
const MAX_BUFFERED = 30;

interface Entry {
  snap: Snapshot;
  /** Server time of this snapshot in ms (tick × tick length). */
  time: number;
}

export interface Positioned {
  id: number;
  x: number;
  y: number;
}

export interface InterpolatedView {
  /** Snapshot at or before the render time; supplies everything but positions. */
  from: Snapshot;
  /** Snapshot after the render time (same as `from` when none has arrived yet). */
  to: Snapshot;
  /** 0..1 between `from` and `to`; up to a little over 1 when extrapolating past `to` (MAX_EXTRAPOLATE_MS). */
  alpha: number;
}

export class SnapshotBuffer {
  private entries: Entry[] = [];
  /** Estimated (local clock − server clock) in ms. */
  private offset: number | null = null;
  private pendingEvents: { time: number; event: GameEvent }[] = [];

  /** How far behind the newest snapshot to render (ms): INTERP_DELAY_MS online, SOLO_INTERP_DELAY_MS solo. */
  constructor(public delayMs = INTERP_DELAY_MS) {}

  get latest(): Snapshot | undefined {
    return this.entries.at(-1)?.snap;
  }

  clear(): void {
    this.entries = [];
    this.offset = null;
    this.pendingEvents = [];
  }

  push(snap: Snapshot, receivedAt: number): void {
    const time = (snap.tick * 1000) / snap.tickRate;
    const last = this.entries.at(-1);
    // A new match restarts the tick counter.
    if (last && snap.tick < last.snap.tick) this.clear();
    if (last && snap.tick === last.snap.tick) {
      // A local host's opening hero and mode picks each start its match afresh, all at tick 0: the last is the match
      // (a solo start held for its art, V-07d, shows it until its first tick).
      if (snap.tick === 0) last.snap = snap;
      return;
    }

    const sample = receivedAt - time;
    // Follow earlier arrivals immediately and later ones slowly, so jitter
    // doesn't drag the render clock backwards.
    this.offset = this.offset === null || sample < this.offset ? sample : this.offset + (sample - this.offset) * 0.05;

    this.entries.push({ snap, time });
    if (this.entries.length > MAX_BUFFERED) this.entries.shift();
    for (const event of snap.events) this.pendingEvents.push({ time, event });
  }

  /** Server time currently being rendered. */
  renderTime(now: number): number {
    return now - (this.offset ?? now) - this.delayMs;
  }

  view(now: number): InterpolatedView | undefined {
    if (this.entries.length === 0) return undefined;
    const t = this.renderTime(now);
    const first = this.entries[0]!;
    if (t <= first.time) return { from: first.snap, to: first.snap, alpha: 0 };
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const a = this.entries[i]!;
      if (a.time <= t) {
        const b = this.entries[i + 1];
        if (!b) {
          // Past the newest snapshot: carry on along its last step for a moment, then hold.
          const p = this.entries[i - 1];
          if (!p || a.time <= p.time) return { from: a.snap, to: a.snap, alpha: 0 };
          const span = a.time - p.time;
          return { from: p.snap, to: a.snap, alpha: 1 + Math.min(t - a.time, MAX_EXTRAPOLATE_MS) / span };
        }
        return { from: a.snap, to: b.snap, alpha: (t - a.time) / (b.time - a.time) };
      }
    }
    return { from: first.snap, to: first.snap, alpha: 0 };
  }

  /** Events whose snapshot is now being rendered, oldest first. */
  drainEvents(now: number): GameEvent[] {
    const t = this.renderTime(now);
    const due: GameEvent[] = [];
    while (this.pendingEvents.length > 0 && this.pendingEvents[0]!.time <= t) due.push(this.pendingEvents.shift()!.event);
    return due;
  }
}

/** At most this much render time is held (hit-stop) in any HOLD_WINDOW_MS (ms). */
export const HOLD_BUDGET_MS = 150;
export const HOLD_WINDOW_MS = 1000;
/** After a hold or a slow-down the clock runs this much faster than real time until it has caught up. */
export const CATCH_UP_RATE = 1.25;

/** How long [a, b) and [c, d) overlap (ms; 0 when they don't). */
function overlap(a: number, b: number, c: number, d: number): number {
  return Math.max(0, Math.min(b, d) - Math.max(a, c));
}

/**
 * The render clock (V-07b, docs/ART.md §6 "Juice"): the time the snapshot buffer renders at and the world animates
 * by. It follows real time, except that it can hold (a hit-stop: creeps, rigs and effects stand still) or run slow for
 * a moment; then it runs at CATCH_UP_RATE until the time lost is made up, so the render delay returns to its usual
 * length. The sim, the network, the HUD, the input and your own hero's prediction never read it. Never more than
 * HOLD_BUDGET_MS held in any HOLD_WINDOW_MS. Pure (no DOM), tested.
 */
export class RenderClock {
  /** The clock's time (ms), null until the first tick. */
  private t: number | null = null;
  /** Real time of the last tick. */
  private last = 0;
  /** The hold in progress (real ms): [holdFrom, holdUntil). */
  private holdFrom = 0;
  private holdUntil = -Infinity;
  /** The slow-down after it: [slowFrom, slowUntil) at slowRate. */
  private slowFrom = 0;
  private slowUntil = -Infinity;
  private slowRate = 1;
  /** Holds granted (real ms), the last one possibly still running; kept for the budget's window. */
  private holds: { from: number; until: number }[] = [];

  /** Advances to real time `now` and returns the clock's time (the first call starts it at `now`). */
  tick(now: number): number {
    if (this.t === null) {
      this.t = now;
      this.last = now;
      return now;
    }
    const a = this.last;
    if (now <= a) return this.t;
    this.last = now;
    const held = overlap(a, now, this.holdFrom, this.holdUntil);
    const both = overlap(a, now, Math.max(this.holdFrom, this.slowFrom), Math.min(this.holdUntil, this.slowUntil));
    const slowed = overlap(a, now, this.slowFrom, this.slowUntil) - both;
    const free = now - a - held - slowed;
    const behind = a - this.t > 0.001;
    this.t = Math.min(now, this.t + slowed * this.slowRate + free * (behind ? CATCH_UP_RATE : 1));
    return this.t;
  }

  /**
   * Holds the clock for `ms` from `now` (a hold already running is extended to the later end, not added to), within
   * the budget: the extension granted (ms; 0 when the budget is spent or the running hold already covers it).
   */
  hold(now: number, ms: number): number {
    if (!(ms > 0)) return 0;
    const running = this.holdUntil > now;
    const start = running ? this.holdUntil : now;
    const want = now + ms - start;
    if (want <= 0) return 0;
    this.holds = this.holds.filter((h) => h.until > now - HOLD_WINDOW_MS);
    let used = 0;
    for (const h of this.holds) used += h.until - Math.max(h.from, now - HOLD_WINDOW_MS);
    const grant = Math.min(want, HOLD_BUDGET_MS - used);
    if (grant <= 0) return 0;
    if (running) this.holds[this.holds.length - 1]!.until = start + grant;
    else {
      this.holdFrom = now;
      this.holds.push({ from: now, until: now + grant });
    }
    this.holdUntil = start + grant;
    return grant;
  }

  /** Runs the clock at `rate` (0..1) for `ms`, from the end of the hold in progress (or from `now`). */
  slow(now: number, ms: number, rate: number): void {
    if (!(ms > 0)) return;
    this.slowFrom = Math.max(now, this.holdUntil);
    this.slowUntil = this.slowFrom + ms;
    this.slowRate = Math.max(0, Math.min(1, rate));
  }

  /** Whether the clock stands still at real time `now`. */
  holding(now: number): boolean {
    return now >= this.holdFrom && now < this.holdUntil;
  }

  /** How far the clock is behind real time (ms), as of the last tick. */
  get lag(): number {
    return this.t === null ? 0 : this.last - this.t;
  }

  /** Back to real time with nothing held (a new match, leaving one). */
  reset(): void {
    this.t = null;
    this.holdUntil = -Infinity;
    this.slowUntil = -Infinity;
    this.holds = [];
  }
}

/**
 * Interpolates positions of entities present in `from` and `to` (alpha > 1 extrapolates past `to`,
 * except across a jump). Entities only in `from` are dropped (they are gone by `to`); entities only
 * in `to` appear at their first known position.
 */
export function lerpEntities<T extends Positioned>(from: readonly T[], to: readonly T[], alpha: number): T[] {
  if (alpha <= 0) return from.slice();
  const prev = new Map(from.map((e) => [e.id, e]));
  return to.map((e) => {
    const p = prev.get(e.id);
    if (!p) return e;
    if (alpha > 1 && Math.abs(e.x - p.x) + Math.abs(e.y - p.y) > MAX_EXTRAPOLATE_STEP) return e;
    return { ...e, x: p.x + (e.x - p.x) * alpha, y: p.y + (e.y - p.y) * alpha };
  });
}
