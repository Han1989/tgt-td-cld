// The HUD's smooth numbers (hud/counter.ts): the shown value chases the real one, and `set` says when a value already
// shown changed (the HUD pops the number then, docs/ART.md §12).

import { describe, expect, it } from 'vitest';
import { Counter } from '../src/hud/counter';

describe('Counter', () => {
  it('shows the first value at once, and says a change only for a value already shown', () => {
    const c = new Counter();
    expect(c.set(100)).toBe(false);
    expect(c.step(16)).toBe(100);
    expect(c.set(100)).toBe(false);
    expect(c.set(120)).toBe(true);
    expect(c.moving).toBe(true);
    c.reset();
    expect(c.set(40)).toBe(false);
    expect(c.step(16)).toBe(40);
  });

  it('counts towards a new value and always arrives within its longest time', () => {
    const c = new Counter(120, 600);
    c.set(0);
    c.step(16);
    c.set(1000);
    const first = c.step(16);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1000);
    let t = 16;
    while (c.moving && t < 1000) {
      c.step(16);
      t += 16;
    }
    expect(c.step(0)).toBe(1000);
    expect(t).toBeLessThanOrEqual(600);
  });
});
