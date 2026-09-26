// Hits and damage numbers for effects (pure, tested).
//
// Flashes: a creep whose HP dropped between two rendered snapshots was hit, whoever hit it.
// Numbers: the sim's `damage` events say who dealt how much to which creep; the renderer feeds
// the ones it wants shown (solo: all; online: only yours) into `addDamage`. Damage is summed
// into at most one number per creep every `numberEveryMs`, so a creep under fire doesn't
// spray digits.

import type { GameEvent, PlayerId } from '@tdt/protocol';

export interface HpSample {
  id: number;
  hp: number;
  x: number;
  y: number;
}

export interface Hit {
  id: number;
  x: number;
  y: number;
  damage: number;
}

interface Track {
  /** NaN until the creep has been seen in a rendered snapshot. */
  hp: number;
  x: number;
  y: number;
  /** Damage to show that isn't shown yet. */
  pending: number;
  /** Earliest time the next number may show. */
  nextAt: number;
  /** A crit number was shown for this creep: swallow the damage that comes with it. */
  suppressed: boolean;
  seen: number;
}

/** Numbers under this much damage are not shown (the flash still is). */
const MIN_NUMBER = 1;

export class HitTracker {
  private tracks = new Map<number, Track>();
  private generation = 0;

  constructor(readonly numberEveryMs = 300) {}

  /**
   * Feeds one batch of events: the damage to show (everyone's in solo, only `me`'s online) and
   * the crits to show, which are returned. A crit's number replaces the plain number of the
   * creep it hit, so crits are marked before the damage is added.
   */
  feed(events: readonly GameEvent[], me: PlayerId | null, solo: boolean): { x: number; y: number; damage: number }[] {
    const crits: { x: number; y: number; damage: number }[] = [];
    for (const e of events) {
      if (e.type !== 'crit' || !(solo || e.by === me)) continue;
      this.suppressNear(e.x, e.y);
      crits.push({ x: e.x, y: e.y, damage: e.damage });
    }
    for (const e of events) {
      if (e.type !== 'damage' || !(solo || e.by === me)) continue;
      for (let i = 0; i + 1 < e.hits.length; i += 2) this.addDamage(e.hits[i]!, e.hits[i + 1]!);
    }
    return crits;
  }

  /** Damage to show for a creep (from a `damage` event). */
  addDamage(id: number, amount: number): void {
    let t = this.tracks.get(id);
    if (!t) {
      t = { hp: NaN, x: NaN, y: NaN, pending: 0, nextAt: 0, suppressed: false, seen: this.generation };
      this.tracks.set(id, t);
    }
    if (!t.suppressed) t.pending += amount;
  }

  /**
   * A newly rendered snapshot's creeps. Returns every creep that lost HP since the previous one
   * (`hits`, for the flash) and the damage numbers that are due (`numbers`).
   */
  update(creeps: readonly HpSample[], now: number): { hits: Hit[]; numbers: Hit[] } {
    const gen = ++this.generation;
    const hits: Hit[] = [];
    const numbers: Hit[] = [];
    for (const c of creeps) {
      let t = this.tracks.get(c.id);
      if (!t) {
        t = { hp: c.hp, x: c.x, y: c.y, pending: 0, nextAt: 0, suppressed: false, seen: gen };
        this.tracks.set(c.id, t);
      }
      t.seen = gen;
      // A crit's suppression covers only the damage delivered with it.
      t.suppressed = false;
      t.x = c.x;
      t.y = c.y;
      const lost = t.hp - c.hp;
      t.hp = c.hp;
      if (lost > 0) hits.push({ id: c.id, x: c.x, y: c.y, damage: lost });
      if (now >= t.nextAt && t.pending >= MIN_NUMBER) {
        numbers.push({ id: c.id, x: c.x, y: c.y, damage: Math.round(t.pending) });
        t.pending = 0;
        t.nextAt = now + this.numberEveryMs;
      }
    }
    for (const [id, t] of this.tracks) if (t.seen !== gen) this.tracks.delete(id);
    return { hits, numbers };
  }

  /** A creep died: the damage not shown yet (the killing blow included), and forgets it. */
  take(id: number): number {
    const t = this.tracks.get(id);
    if (!t) return 0;
    this.tracks.delete(id);
    return Math.round(t.pending);
  }

  /**
   * A crit landed at (x, y) and its number is shown by the caller: the nearest creep's damage
   * fed before the next `update` shows none. Call it before feeding that tick's damage.
   */
  suppressNear(x: number, y: number, maxDist = 1): void {
    let best: Track | undefined;
    let bestD = maxDist;
    for (const t of this.tracks.values()) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d <= bestD) {
        best = t;
        bestD = d;
      }
    }
    if (best) best.suppressed = true;
  }

  reset(): void {
    this.tracks.clear();
  }
}
