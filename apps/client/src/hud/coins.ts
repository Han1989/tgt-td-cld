// Coins that fly from a kill to the gold counter (Phase 4b effects). DOM elements, so they
// pass over the top bar; a small fixed pool, animated with transforms only. Every kill of yours that pays a bounty
// launches one, at most COINS_PER_SECOND a second: past that, kills join one bigger coin (`CoinBatcher`, pure, tested).

/** Single coins a second; past this, kills are batched into one bigger coin. */
export const COINS_PER_SECOND = 5;
const COIN_WINDOW_MS = 1000;

/** A coin to launch: where from (screen px), how many kills it carries, how big it is drawn. */
export interface CoinLaunch {
  x: number;
  y: number;
  kills: number;
  size: number;
}

/** A batched coin's size: a quarter bigger per kill past the first, at most twice a coin's. */
export function coinSize(kills: number): number {
  return Math.min(2, 1 + 0.25 * Math.max(0, kills - 1));
}

/**
 * The kill coins' rate: at most COINS_PER_SECOND coins in any second. A kill past that joins the batch, which flies as
 * one bigger coin (from where its last kill fell) as soon as a coin of the last second has landed its slot back.
 */
export class CoinBatcher {
  private launched: number[] = [];
  private batch: { x: number; y: number; kills: number } | null = null;

  /** A kill paid you a bounty at screen point (x, y): the coins to launch now (none while it waits in the batch). */
  kill(x: number, y: number, now: number): CoinLaunch[] {
    if (!this.batch && this.free(now)) {
      this.launched.push(now);
      return [{ x, y, kills: 1, size: 1 }];
    }
    if (this.batch) {
      this.batch.kills++;
      this.batch.x = x;
      this.batch.y = y;
    } else this.batch = { x, y, kills: 1 };
    return this.update(now);
  }

  /** Every frame: the batched coin, once a slot is free. */
  update(now: number): CoinLaunch[] {
    const b = this.batch;
    if (!b || !this.free(now)) return [];
    this.batch = null;
    this.launched.push(now);
    return [{ x: b.x, y: b.y, kills: b.kills, size: coinSize(b.kills) }];
  }

  /** Kills waiting in the batch. */
  get waiting(): number {
    return this.batch?.kills ?? 0;
  }

  reset(): void {
    this.launched = [];
    this.batch = null;
  }

  /** A coin may launch at `now`: fewer than COINS_PER_SECOND in the last second. */
  private free(now: number): boolean {
    while (this.launched.length > 0 && now - this.launched[0]! >= COIN_WINDOW_MS) this.launched.shift();
    return this.launched.length < COINS_PER_SECOND;
  }
}

interface Flight {
  el: HTMLElement;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  born: number;
  dur: number;
  /** Sideways bow of the flight path (px). */
  bow: number;
  /** Drawn this much bigger than a coin (a batched coin). */
  size: number;
}

const MAX_COINS = 12;
/** Re-read the counter's position at most this often (ms). */
const TARGET_TTL_MS = 500;

export class CoinFlyer {
  private readonly free: HTMLElement[] = [];
  private live: Flight[] = [];
  private target: { x: number; y: number } | null = null;
  private targetAt = -Infinity;
  /** Coins launched so far (browser tests count these: a coin is on screen for under a second). */
  launched = 0;

  constructor(
    parent: HTMLElement,
    private readonly counter: HTMLElement,
    private readonly onArrive: () => void,
  ) {
    for (let i = 0; i < MAX_COINS; i++) {
      const el = document.createElement('div');
      el.className = 'fly-coin hidden';
      parent.appendChild(el);
      this.free.push(el);
    }
  }

  /** Launches a coin from a screen point (px), `size` times a coin's size; does nothing when every coin is in the air. */
  fly(x: number, y: number, now: number, size = 1): void {
    const el = this.free.pop();
    if (!el) return;
    const to = this.targetPos(now);
    if (!to) {
      this.free.push(el);
      return;
    }
    el.classList.remove('hidden');
    this.launched++;
    const dist = Math.hypot(to.x - x, to.y - y);
    this.live.push({ el, x0: x, y0: y, x1: to.x, y1: to.y, born: now, dur: 420 + Math.min(360, dist * 0.6), bow: (Math.random() - 0.5) * 120, size });
    this.place(this.live[this.live.length - 1]!, 0);
  }

  update(now: number): void {
    if (this.live.length === 0) return;
    this.live = this.live.filter((f) => {
      const t = (now - f.born) / f.dur;
      if (t >= 1) {
        f.el.classList.add('hidden');
        this.free.push(f.el);
        this.onArrive();
        return false;
      }
      this.place(f, Math.max(0, t));
      return true;
    });
  }

  /** Lands every coin at once (e.g. leaving the match). */
  clear(): void {
    for (const f of this.live) {
      f.el.classList.add('hidden');
      this.free.push(f.el);
    }
    this.live = [];
  }

  private place(f: Flight, t: number): void {
    // Ease in (the coin speeds up towards the counter) along a bowed quadratic curve.
    const e = t * t;
    const mx = (f.x0 + f.x1) / 2 + f.bow;
    const my = Math.min(f.y0, f.y1) - 40;
    const x = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * mx + e * e * f.x1;
    const y = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * my + e * e * f.y1;
    const s = (1.15 - 0.45 * e) * f.size;
    f.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(2)})`;
  }

  private targetPos(now: number): { x: number; y: number } | null {
    if (now - this.targetAt > TARGET_TTL_MS) {
      this.targetAt = now;
      // The coin icon if it shows (the phone top bar hides it), else the number, else the whole stat.
      this.target = null;
      for (const el of [this.counter.querySelector('.coin'), this.counter.querySelector('#gold'), this.counter]) {
        const r = el?.getBoundingClientRect();
        if (r && r.width > 0) {
          this.target = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          break;
        }
      }
    }
    return this.target;
  }
}
