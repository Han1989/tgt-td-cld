import { TICK_RATE } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import { NO_VOW, VOW_BLOOM_MS, VOW_END_TICKS, VOW_WARN_TICKS, vowLook } from '../src/render/fx/vow';

/** Ticks of vow left that are comfortably before the warning. */
const PLENTY = 6 * TICK_RATE;

describe('the Iron Vow ring', () => {
  it('is gone when no vow is left', () => {
    expect(vowLook(0, 5000, 5000, false)).toEqual(NO_VOW);
    expect(vowLook(-3, 5000, 5000, true)).toEqual(NO_VOW);
  });

  it('blooms in: bigger and dimmer at first, settled after the bloom', () => {
    const first = vowLook(PLENTY, 0, 1000, false);
    const mid = vowLook(PLENTY, VOW_BLOOM_MS / 2, 1000, false);
    const done = vowLook(PLENTY, VOW_BLOOM_MS, 1000, false);
    expect(first.outer).toBe(0);
    expect(first.scale).toBeGreaterThan(mid.scale);
    expect(mid.scale).toBeGreaterThan(done.scale);
    expect(done.scale).toBe(1);
    expect(mid.outer).toBeGreaterThan(first.outer);
    expect(done.outer).toBeGreaterThan(mid.outer);
  });

  it('is steady while there is plenty of vow left: it turns and the glow breathes, the rings stay as bright', () => {
    const a = vowLook(PLENTY, 5000, 6000, false);
    const b = vowLook(PLENTY, 5000, 6137, false);
    expect(b.outer).toBe(a.outer);
    expect(b.inner).toBe(a.inner);
    expect(b.spin).toBeGreaterThan(a.spin);
    expect(b.glow).not.toBe(a.glow);
  });

  it('blinks over its last 1.5 seconds and dims to nothing as the vow ends', () => {
    expect(VOW_WARN_TICKS).toBe(1.5 * TICK_RATE);
    const left = VOW_WARN_TICKS - 4;
    // 125 ms apart: one is the bright half of the blink, the other the dim half.
    const x = vowLook(left, 5000, 4000, false);
    const y = vowLook(left, 5000, 4125, false);
    expect(Math.max(x.outer, y.outer)).toBeGreaterThan(Math.min(x.outer, y.outer) * 2);
    const steady = vowLook(PLENTY, 5000, 4000, false).outer;
    expect(Math.max(x.outer, y.outer)).toBeLessThan(steady);
    // The same moment of the blink, closer to the end: dimmer.
    expect(vowLook(2, 5000, 4000, false).outer).toBeLessThan(vowLook(left, 5000, 4000, false).outer);
  });

  it('dims out over its last 0.3 seconds instead of cutting off, blinking or not', () => {
    expect(VOW_END_TICKS).toBe(0.3 * TICK_RATE);
    for (const calm of [false, true]) {
      // Same phase of the blink at every sample, so only the ending differs.
      const at = (left: number) => vowLook(left, 5000, 4000, calm).outer;
      expect(at(VOW_END_TICKS)).toBeGreaterThan(at(Math.ceil(VOW_END_TICKS / 2)));
      expect(at(Math.ceil(VOW_END_TICKS / 2))).toBeGreaterThan(at(1));
      expect(at(1)).toBeGreaterThan(0);
    }
  });

  it('with reduced motion appears and fades without the bloom, the turn, the breathing or the blink', () => {
    const a = vowLook(PLENTY, 0, 1000, true);
    const b = vowLook(PLENTY, 5000, 9000, true);
    expect(a.scale).toBe(1);
    expect(b.scale).toBe(1);
    expect(a.spin).toBe(0);
    expect(b.spin).toBe(0);
    // No breathing: the glow is the same at any time.
    expect(vowLook(PLENTY, 5000, 6000, true).glow).toBe(vowLook(PLENTY, 5000, 6137, true).glow);
    // No blink: the same brightness 125 ms apart in the warning, and a steady fade towards the end.
    const warn = VOW_WARN_TICKS - 4;
    expect(vowLook(warn, 5000, 4000, true).outer).toBe(vowLook(warn, 5000, 4125, true).outer);
    expect(vowLook(10, 5000, 4000, true).outer).toBeGreaterThan(vowLook(5, 5000, 4000, true).outer);
    expect(vowLook(1, 5000, 4000, true).outer).toBeGreaterThan(0);
  });

  it('stays within 0 and 1 at any time', () => {
    for (const calm of [false, true]) {
      for (const left of [1, 5, VOW_WARN_TICKS, PLENTY, 10 * PLENTY]) {
        for (let t = 0; t < 2000; t += 37) {
          const v = vowLook(left, t, t * 3, calm);
          for (const k of [v.outer, v.inner, v.glow]) {
            expect(k).toBeGreaterThanOrEqual(0);
            expect(k).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});
