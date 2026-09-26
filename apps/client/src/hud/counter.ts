// Smoothly counting HUD numbers (pure, tested): the shown value chases the real one,
// fast at first and slowing down near it, and always arrives within `maxMs`.

export class Counter {
  private shown: number | null = null;
  private target = 0;
  /** Minimum speed (units per ms) for the current change, so it finishes within `maxMs`. */
  private floor = 0;

  constructor(
    /** Time constant of the chase (ms). */
    private readonly tauMs = 120,
    /** A change always finishes within this long. */
    private readonly maxMs = 600,
  ) {}

  /** Sets the real value. The first value (or one after a reset) shows at once. */
  set(value: number): void {
    if (value === this.target && this.shown !== null) return;
    this.target = value;
    if (this.shown === null) this.shown = value;
    this.floor = Math.abs(this.target - this.shown) / this.maxMs;
  }

  /** Forgets the shown value: the next `set` shows at once (e.g. a new match). */
  reset(): void {
    this.shown = null;
  }

  /** Advances by `dtMs` and returns the whole number to show. */
  step(dtMs: number): number {
    if (this.shown === null) return Math.round(this.target);
    const diff = this.target - this.shown;
    const dt = Math.max(0, dtMs);
    const move = Math.max(Math.abs(diff) * Math.min(1, dt / this.tauMs), this.floor * dt);
    this.shown = move >= Math.abs(diff) || Math.abs(diff) < 0.5 ? this.target : this.shown + Math.sign(diff) * move;
    return Math.round(this.shown);
  }

  /** True while the shown value is still moving. */
  get moving(): boolean {
    return this.shown !== null && this.shown !== this.target;
  }
}
