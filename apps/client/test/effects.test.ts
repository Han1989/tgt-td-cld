import type { GameEvent } from '@tdt/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Counter } from '../src/hud/counter';
import { HitTracker } from '../src/render/fx/hits';
import { bitAlpha, bitScale, newBit, stepBit } from '../src/render/fx/motion';
import { damageText, GLYPHS, layoutGlyphs } from '../src/render/fx/numbers';
import { heartShake, prefersReducedMotion, SHAKE_AT, Shake, SYNC_CAST_TRAUMA, twinShake } from '../src/render/fx/shake';
import { mixColor } from '../src/render/palette';
import { fxLevel, shakeScale, STRONG_SHAKE } from '../src/render/quality';
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

  it('flashes every HP drop, whoever dealt it, and ignores healing and new creeps', () => {
    const t = new HitTracker();
    expect(t.update([at(1, 100)], 0).hits).toEqual([]);
    expect(t.update([at(1, 90)], 10).hits).toEqual([{ id: 1, x: 1, y: 0, damage: 10 }]);
    expect(t.update([at(1, 95), at(2, 50)], 20).hits).toEqual([]);
  });

  it('shows only the damage it is fed, summed into one number per creep per window', () => {
    const t = new HitTracker(300);
    t.update([at(1, 100)], 0);
    t.addDamage(1, 10);
    // The number shows at the creep's position once the next snapshot is rendered.
    expect(t.update([at(1, 70)], 50).numbers).toEqual([{ id: 1, x: 1, y: 0, damage: 10 }]);
    t.addDamage(1, 4);
    expect(t.update([at(1, 60)], 100).numbers).toEqual([]);
    t.addDamage(1, 6);
    // Due again: the held damage shows even without a new drop.
    expect(t.update([at(1, 60)], 400).numbers).toEqual([{ id: 1, x: 1, y: 0, damage: 10 }]);
    // An HP drop nobody fed (a teammate's hit, online) flashes but shows no number.
    expect(t.update([at(1, 50)], 800)).toMatchObject({ hits: [{ id: 1 }], numbers: [] });
  });

  it('takes damage for creeps it has not rendered yet', () => {
    const t = new HitTracker();
    t.addDamage(7, 12);
    expect(t.update([at(7, 30)], 0).numbers).toEqual([{ id: 7, x: 7, y: 0, damage: 12 }]);
  });

  it('gives a dying creep the damage not shown yet, killing blow included, and forgets it', () => {
    const t = new HitTracker(300);
    t.update([at(1, 100)], 0);
    t.addDamage(1, 10);
    t.update([at(1, 90)], 10); // shows 10
    t.addDamage(1, 90); // the killing blow
    expect(t.take(1)).toBe(90);
    expect(t.take(1)).toBe(0);
  });

  it('swallows the damage delivered with a crit (its own number is shown), for that snapshot only', () => {
    const t = new HitTracker(0);
    t.update([at(1, 100), at(5, 100)], 0);
    t.suppressNear(1.2, 0);
    t.addDamage(1, 60);
    t.addDamage(5, 10);
    expect(t.update([at(1, 40), at(5, 90)], 10).numbers.map((n) => n.id)).toEqual([5]);
    t.addDamage(1, 5);
    expect(t.update([at(1, 35)], 20).numbers).toEqual([{ id: 1, x: 1, y: 0, damage: 5 }]);
    // A crit that kills: nothing more to show for it.
    t.suppressNear(1, 0);
    t.addDamage(1, 35);
    expect(t.take(1)).toBe(0);
  });
});

describe('damage numbers online and solo', () => {
  const events: GameEvent[] = [
    { type: 'damage', by: 'me', hits: [1, 10, 2, 5] },
    { type: 'damage', by: 'mate', hits: [1, 30] },
    { type: 'damage', by: null, hits: [2, 7] },
    { type: 'crit', x: 3, y: 0, damage: 40, by: 'mate' },
  ];
  const creeps = [1, 2, 3].map((id) => ({ id, hp: 100, x: id, y: 0 }));

  it('online shows only your damage and your crits', () => {
    const t = new HitTracker(0);
    t.update(creeps, 0);
    expect(t.feed(events, 'me', false)).toEqual([]);
    expect(t.update(creeps, 10).numbers.map((n) => [n.id, n.damage])).toEqual([
      [1, 10],
      [2, 5],
    ]);
  });

  it('solo shows everything, and a crit replaces its creep\'s plain number', () => {
    const t = new HitTracker(0);
    t.update(creeps, 0);
    expect(t.feed([...events, { type: 'damage', by: 'mate', hits: [3, 40] }], 'me', true)).toEqual([{ x: 3, y: 0, damage: 40 }]);
    expect(t.update(creeps, 10).numbers.map((n) => [n.id, n.damage])).toEqual([
      [1, 40],
      [2, 12],
    ]);
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

describe('what shakes the screen', () => {
  const px = (trauma: number) => trauma * trauma * 9;

  it('every ultimate cast kicks the screen enough to feel on a phone (about 2 px or more)', () => {
    for (const k of ['arrowStorm', 'meteor', 'ironVow'] as const) expect(px(SHAKE_AT[k])).toBeGreaterThanOrEqual(2);
    expect(SHAKE_AT.combo).toBeGreaterThan(SHAKE_AT.arrowStorm);
  });

  it('boss abilities kick too', () => {
    for (const k of ['stomp', 'hatch', 'hideShift'] as const) expect(px(SHAKE_AT[k])).toBeGreaterThanOrEqual(1);
  });

  it('a Heart hit kicks more for a bigger leak, and never past full', () => {
    expect(px(heartShake(1))).toBeGreaterThanOrEqual(1);
    expect(heartShake(20)).toBeGreaterThan(heartShake(1));
    expect(heartShake(1000)).toBe(1);
    expect(heartShake(-5)).toBe(heartShake(0));
  });
});

describe('twin-ultimate shake', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** The largest offset (px) a kick of this trauma reaches at the game's 9 px max, over any start time in 400 ms. */
  const peakPx = (trauma: number) => {
    let max = 0;
    for (let t = 0; t < 400; t += 1) {
      const s = new Shake();
      s.add(trauma);
      const o = s.offset(t, 0, 9);
      max = Math.max(max, Math.abs(o.x), Math.abs(o.y));
    }
    return max;
  };

  it('is a clearly stronger kick than the 0.2 the ribbon used to add, and stays inside the max', () => {
    expect(SYNC_CAST_TRAUMA).toBeGreaterThan(0.2);
    expect(peakPx(0.2)).toBeLessThan(0.5);
    expect(peakPx(SYNC_CAST_TRAUMA)).toBeGreaterThanOrEqual(3);
    expect(peakPx(SYNC_CAST_TRAUMA)).toBeGreaterThan(peakPx(0.2) * 5);
    expect(peakPx(SYNC_CAST_TRAUMA)).toBeLessThanOrEqual(9);
  });

  it('settles: the screen is dead still within half a second, whenever the kick started', () => {
    for (const start of [0, 137, 2500, 98765]) {
      const s = new Shake();
      s.add(SYNC_CAST_TRAUMA);
      let still = -1;
      for (let t = 0; t <= 600; t += 16) {
        const o = s.offset(start + t, 16, 9);
        if (o.x === 0 && o.y === 0) {
          still = t;
          break;
        }
      }
      expect(still).toBeGreaterThan(0);
      expect(still).toBeLessThanOrEqual(500);
    }
  });

  it('kicks once per ribbon chain, and not at all when the device asks for reduced motion', () => {
    expect(twinShake(0, false)).toBe(SYNC_CAST_TRAUMA);
    expect(twinShake(1, false)).toBe(0);
    expect(twinShake(2, false)).toBe(0);
    expect(twinShake(0, true)).toBe(0);
    expect(twinShake(1, true)).toBe(0);
  });

  it('asks the reduced-motion media query, and says no where the browser has no matchMedia', () => {
    expect(prefersReducedMotion()).toBe(false);
    const asked: string[] = [];
    vi.stubGlobal('matchMedia', (query: string) => {
      asked.push(query);
      return { matches: true };
    });
    expect(prefersReducedMotion()).toBe(true);
    expect(asked).toEqual(['(prefers-reduced-motion: reduce)']);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
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
    expect(fxLevel('low', 'normal')).toMatchObject({ particles: false, shake: false, shakeScale: 0 });
    expect(fxLevel('high', 'normal')).toMatchObject({ particles: true, shake: true, shakeScale: 1 });
    expect(fxLevel('high', 'strong')).toMatchObject({ particles: true, shake: true, shakeScale: STRONG_SHAKE });
    expect(fxLevel('high', 'off')).toMatchObject({ particles: true, shake: false, shakeScale: 0 });
    expect(fxLevel('low', 'normal').maxNumbers).toBeLessThan(fxLevel('high', 'normal').maxNumbers);
  });

  it('Strong kicks harder than Normal, Off and reduced motion turn the shake off', () => {
    expect(STRONG_SHAKE).toBeGreaterThan(1);
    expect(shakeScale('strong', false, false)).toBeGreaterThan(shakeScale('normal', false, false));
    expect(shakeScale('off', false, false)).toBe(0);
    // Reduced motion wins over every setting, Strong included.
    for (const setting of ['off', 'normal', 'strong'] as const) {
      expect(shakeScale(setting, false, true)).toBe(0);
      expect(fxLevel('high', setting, true).shake).toBe(false);
    }
  });

  it('carries the reduced-motion flag through every quality (off unless the device asks)', () => {
    expect(fxLevel('high', 'normal').calm).toBe(false);
    expect(fxLevel('low', 'normal').calm).toBe(false);
    expect(fxLevel('high', 'normal', true).calm).toBe(true);
    expect(fxLevel('low', 'off', true).calm).toBe(true);
  });

  it('keeps the screen shake setting (Normal by default; the old on / off switch carries over)', () => {
    expect(parseSettings(null).shake).toBe('normal');
    for (const v of ['off', 'normal', 'strong']) expect(parseSettings(JSON.stringify({ shake: v })).shake).toBe(v);
    expect(parseSettings(JSON.stringify({ shake: true })).shake).toBe('normal');
    expect(parseSettings(JSON.stringify({ shake: false })).shake).toBe('off');
    expect(parseSettings(JSON.stringify({ shake: 'no' })).shake).toBe('normal');
  });

  it('mixes colours channel by channel', () => {
    expect(mixColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixColor(0x000000, 0xff8040, 0.5)).toBe(0x804020);
  });
});
