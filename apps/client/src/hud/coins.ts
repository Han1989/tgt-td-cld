// Coins that fly from a kill to the gold counter (Phase 4b effects). DOM elements, so they
// pass over the top bar; a small fixed pool, animated with transforms only.

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
}

const MAX_COINS = 12;
/** Re-read the counter's position at most this often (ms). */
const TARGET_TTL_MS = 500;

export class CoinFlyer {
  private readonly free: HTMLElement[] = [];
  private live: Flight[] = [];
  private target: { x: number; y: number } | null = null;
  private targetAt = -Infinity;

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

  /** Launches a coin from a screen point (px); does nothing when every coin is in the air. */
  fly(x: number, y: number, now: number): void {
    const el = this.free.pop();
    if (!el) return;
    const to = this.targetPos(now);
    if (!to) {
      this.free.push(el);
      return;
    }
    el.classList.remove('hidden');
    const dist = Math.hypot(to.x - x, to.y - y);
    this.live.push({ el, x0: x, y0: y, x1: to.x, y1: to.y, born: now, dur: 420 + Math.min(360, dist * 0.6), bow: (Math.random() - 0.5) * 120 });
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
    const s = 1.15 - 0.45 * e;
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
