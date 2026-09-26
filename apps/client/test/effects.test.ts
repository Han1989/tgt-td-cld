import { describe, expect, it } from 'vitest';
import { Counter } from '../src/hud/counter';
import { HitTracker } from '../src/render/fx/hits';
import { bitAlpha, bitScale, newBit, stepBit } from '../src/render/fx/motion';
import { damageText, GLYPHS, layoutGlyphs } from '../src/render/fx/numbers';
import { Shake } from '../src/render/fx/shake';
import { mixColor } from '../src/render/palette';
import { fxLevel } from '../src/render/quality';
import { parseSettings } from '../src/settings';

describe('particle motion', () => {
  it('moves with velocity, gravity and drag, and dies after its life', () => {
    const b = { ...newBit(), vx: 100, vy: 0, gravity: 200, life: 500 };
    expect(stepBit(b, 100)).toBe(true);
    expect(b.x).toBeCloseTo(10);
    expect(b.vy).toBeCloseTo(20);
    const d = { ...newBit(), vx: 100, drag: 5, life: 500 };
    stepBit(d, 100);
    expect(d.vx).toBeCloseTo(50);
    expect(stepBit(b, 400)).toBe(false);
  });

  it('points aligned bits along their velocity and spins the others', () => {
    const a = { ...newBit(), vx: 0, vy: 10, align: true, life: 1000 };
    stepBit(a, 16);
    expect(a.rotation).toBeCloseTo(Math.PI / 2);
    const s = { ...newBit(), spin: 2, life: 1000 };
    stepBit(s, 500);
    expect(s.rotation).toBeCloseTo(1);
  });

  it('eases scale from start to end and holds alpha before fading', () => {
    const b = { ...newBit(), life: 1000, scale0: 2, scale1: 0, alpha0: 1, alpha1: 0, hold: 0.5 };
    expect(bitScale(b)).toBe(2);
    b.age = 400;
    expect(bitAlpha(b)).toBe(1);
    expect(bitScale(b)).toBeLessThan(2);
    b.age = 750;
    expect(bitAlpha(b)).toBeCloseTo(0.5);
    b.age = 1000;
    expect(bitScale(b)).toBe(0);
    expect(bitAlpha(b)).toBe(0);
  });
});

describe('hit tracker', () => {
  const at = (id: number, hp: number) => ({ id, hp, x: id, y: 0 });

  it('reports HP drops as hits and throttles numbers per creep, summing the damage', () => {
    const t = new HitTracker(300);
    expect(t.update([at(1, 100)], 0)).toEqual({ hits: [], numbers: [] });
    const a = t.update([at(1, 90)], 50);
    expect(a.hits).toEqual([{ id: 1, x: 1, y: 0, damage: 10 }]);
    expect(a.numbers).toEqual([{ id: 1, x: 1, y: 0, damage: 10 }]);
    // Within the throttle window: a hit, but no number; the damage is kept for later.
    const b = t.update([at(1, 85)], 100);
    expect(b.hits).toHaveLength(1);
    expect(b.numbers).toEqual([]);
    const c = t.update([at(1, 80)], 400);
    expect(c.numbers).toEqual([{ id: 1, x: 1, y: 0, damage: 10 }]);
  });

  it('ignores healing and new creeps, and forgets creeps that are gone', () => {
    const t = new HitTracker();
    t.update([at(1, 50)], 0);
    expect(t.update([at(1, 60), at(2, 10)], 10).hits).toEqual([]);
    t.update([at(2, 10)], 20);
    expect(t.take(1)).toBeUndefined();
  });

  it('gives the killing blow the HP that was left plus damage not shown yet', () => {
    const t = new HitTracker(300);
    t.update([at(1, 100)], 0);
    t.update([at(1, 90)], 10); // number of 10 shown
    t.update([at(1, 70)], 20); // 20 pending
    expect(t.take(1)).toEqual({ damage: 90, x: 1, y: 0 });
    expect(t.take(1)).toBeUndefined();
  });

  it('swallows the number of a creep a crit number was shown for', () => {
    const t = new HitTracker(0);
    t.update([at(1, 100), at(5, 100)], 0);
    t.suppressNear(1.2, 0);
    const r = t.update([at(1, 40), at(5, 90)], 10);
    expect(r.hits).toHaveLength(2);
    expect(r.numbers.map((n) => n.id)).toEqual([5]);
    // The crit killed it: no second number for the killing blow.
    t.suppressNear(1, 0);
    expect(t.take(1)?.damage).toBe(0);
  });
});

describe('screen shake', () => {
  it('is still without trauma, bounded by the max, and decays to nothing', () => {
    const s = new Shake();
    expect(s.offset(0, 16, 10)).toEqual({ x: 0, y: 0 });
    s.add(0.5);
    s.add(2);
    expect(s.trauma).toBe(1);
    for (let t = 0; t < 2000; t += 16) {
      const o = s.offset(t, 16, 10);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(10);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(10);
    }
    expect(s.trauma).toBe(0);
    expect(s.offset(3000, 16, 10)).toEqual({ x: 0, y: 0 });
  });

  it('grows with trauma squared', () => {
    const peak = (trauma: number) => {
      let max = 0;
      for (let t = 0; t < 200; t += 1) {
        const s = new Shake();
        s.add(trauma);
        max = Math.max(max, Math.abs(s.offset(t, 0, 10).x));
      }
      return max;
    };
    expect(peak(0.5)).toBeLessThan(peak(1) * 0.3);
  });
});

describe('floating numbers', () => {
  it('centres the glyphs and skips characters the atlas lacks', () => {
    const g = layoutGlyphs('12', () => 10);
    expect(g).toEqual([
      { ch: '1', x: -5 },
      { ch: '2', x: 5 },
    ]);
    expect(layoutGlyphs('+a5', () => 8).map((x) => x.ch)).toEqual(['+', '5']);
    expect([...damageText(123456, true)].every((ch) => GLYPHS.includes(ch))).toBe(true);
  });

  it('formats damage as whole numbers, crits with "!"', () => {
    expect(damageText(12.6, false)).toBe('13');
    expect(damageText(40, true)).toBe('40!');
    expect(damageText(-3, false)).toBe('0');
    expect(damageText(1e9, false)).toBe('99999');
  });
});

describe('smooth counter', () => {
  it('shows the first value at once, then chases changes and always arrives in time', () => {
    const c = new Counter(120, 600);
    c.set(100);
    expect(c.step(16)).toBe(100);
    c.set(1100);
    const first = c.step(16);
    expect(first).toBeGreaterThan(100);
    expect(first).toBeLessThan(1100);
    let shown = first;
    for (let t = 16; t < 600; t += 16) {
      const next = c.step(16);
      expect(next).toBeGreaterThanOrEqual(shown);
      shown = next;
    }
    expect(shown).toBe(1100);
    expect(c.moving).toBe(false);
  });

  it('counts down too, and jumps after a reset', () => {
    const c = new Counter();
    c.set(50);
    c.set(20);
    for (let i = 0; i < 60; i++) c.step(16);
    expect(c.step(16)).toBe(20);
    c.reset();
    c.set(500);
    expect(c.step(16)).toBe(500);
  });
});

describe('effect levels', () => {
  it('Low drops particles and shake; High follows the shake setting', () => {
    expect(fxLevel('low', true)).toMatchObject({ particles: false, shake: false });
    expect(fxLevel('high', true)).toMatchObject({ particles: true, shake: true });
    expect(fxLevel('high', false)).toMatchObject({ particles: true, shake: false });
    expect(fxLevel('low', true).maxNumbers).toBeLessThan(fxLevel('high', true).maxNumbers);
  });

  it('keeps the screen shake setting (on by default)', () => {
    expect(parseSettings(null).shake).toBe(true);
    expect(parseSettings(JSON.stringify({ shake: false })).shake).toBe(false);
    expect(parseSettings(JSON.stringify({ shake: 'no' })).shake).toBe(true);
  });

  it('mixes colours channel by channel', () => {
    expect(mixColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixColor(0x000000, 0xff8040, 0.5)).toBe(0x804020);
  });
});
