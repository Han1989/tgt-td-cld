// Hit detection for effects (pure, tested). The protocol has no per-hit event, so the
// client compares each creep's HP between the snapshots it renders: any drop is a hit
// (the creep flashes), and the damage is summed into floating numbers, at most one
// number per creep every `numberEveryMs` so a creep under fire doesn't spray digits.

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
  hp: number;
  x: number;
  y: number;
  /** Damage not shown yet. */
  pending: number;
  /** Earliest time the next number may show. */
  nextAt: number;
  /** A crit number was shown for this creep; swallow its next drop. */
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
   * A newly rendered snapshot's creeps. Returns every creep that lost HP since the previous one
   * (`hits`) and the damage numbers that are due (`numbers`).
   */
  update(creeps: readonly HpSample[], now: number): { hits: Hit[]; numbers: Hit[] } {
    const gen = ++this.generation;
    const hits: Hit[] = [];
    const numbers: Hit[] = [];
    for (const c of creeps) {
      const t = this.tracks.get(c.id);
      if (!t) {
        this.tracks.set(c.id, { hp: c.hp, x: c.x, y: c.y, pending: 0, nextAt: 0, suppressed: false, seen: gen });
        continue;
      }
      t.seen = gen;
      t.x = c.x;
      t.y = c.y;
      const lost = t.hp - c.hp;
      t.hp = c.hp;
      if (lost <= 0) continue;
      hits.push({ id: c.id, x: c.x, y: c.y, damage: lost });
      if (t.suppressed) {
        t.suppressed = false;
        continue;
      }
      t.pending += lost;
      if (now >= t.nextAt && t.pending >= MIN_NUMBER) {
        numbers.push({ id: c.id, x: c.x, y: c.y, damage: Math.round(t.pending) });
        t.pending = 0;
        t.nextAt = now + this.numberEveryMs;
      }
    }
    for (const [id, t] of this.tracks) if (t.seen !== gen) this.tracks.delete(id);
    return { hits, numbers };
  }

  /**
   * A creep died: the damage of the killing blow (the HP it had left) plus anything not shown yet,
   * or 0 if a crit number already covered it. Forgets the creep.
   */
  take(id: number): { damage: number; x: number; y: number } | undefined {
    const t = this.tracks.get(id);
    if (!t) return undefined;
    this.tracks.delete(id);
    return { damage: t.suppressed ? 0 : Math.round(t.hp + t.pending), x: t.x, y: t.y };
  }

  /** A crit landed at (x, y): its number is shown by the caller, so the nearest creep's next drop shows none. */
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
