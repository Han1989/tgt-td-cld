// Buffers snapshots and renders the world ~100 ms in the past, interpolating
// entity positions between the two snapshots that bracket the render time.

import type { GameEvent, Snapshot } from '@tdt/protocol';

export const INTERP_DELAY_MS = 100;
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
  /** 0..1 between `from` and `to`. */
  alpha: number;
}

export class SnapshotBuffer {
  private entries: Entry[] = [];
  /** Estimated (local clock − server clock) in ms. */
  private offset: number | null = null;
  private pendingEvents: { time: number; event: GameEvent }[] = [];

  constructor(private readonly delayMs = INTERP_DELAY_MS) {}

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
        if (!b) return { from: a.snap, to: a.snap, alpha: 0 };
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
 * Interpolates positions of entities present in `from` and `to`. Entities only
 * in `from` are dropped (they are gone by `to`); entities only in `to` appear
 * at their first known position.
 */
export function lerpEntities<T extends Positioned>(from: readonly T[], to: readonly T[], alpha: number): T[] {
  if (alpha <= 0) return from.slice();
  const prev = new Map(from.map((e) => [e.id, e]));
  return to.map((e) => {
    const p = prev.get(e.id);
    if (!p) return e;
    return { ...e, x: p.x + (e.x - p.x) * alpha, y: p.y + (e.y - p.y) * alpha };
  });
}
