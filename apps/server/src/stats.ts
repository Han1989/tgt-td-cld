/** Rolling average over the last `size` samples. */
export class RollingAverage {
  private samples: number[] = [];
  private sum = 0;

  constructor(private readonly size: number) {}

  add(value: number): void {
    this.samples.push(value);
    this.sum += value;
    if (this.samples.length > this.size) this.sum -= this.samples.shift()!;
  }

  get average(): number {
    return this.samples.length === 0 ? 0 : this.sum / this.samples.length;
  }

  get max(): number {
    return this.samples.reduce((m, v) => Math.max(m, v), 0);
  }
}
