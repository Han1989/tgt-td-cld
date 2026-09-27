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
    if (last && snap.tick === last.snap.tick) return;

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
