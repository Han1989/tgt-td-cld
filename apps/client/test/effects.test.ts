import type { GameEvent } from '@tdt/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Counter } from '../src/hud/counter';
import { HitTracker } from '../src/render/fx/hits';
import { bitAlpha, bitScale, newBit, stepBit } from '../src/render/fx/motion';
import { damageText, GLYPHS, layoutGlyphs } from '../src/render/fx/numbers';
import {
  prefersReducedMotion,
  Shake,
  shakeEnvelope,
  SHAKE_MAX_PX,
  SHAKE_POWER,
  SYNC_CAST_DECAY_PER_S,
  SYNC_CAST_MAX_PX,
  SYNC_CAST_POWER,
  SYNC_CAST_TRAUMA,
  twinShake,
  twinShakeMaxPx,
} from '../src/render/fx/shake';
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

describe('twin-ultimate shake', () => {
  afterEach(() => vi.unstubAllGlobals());

  /**
   * Largest |offset| (px) over start times. `dt` 0 so trauma does not decay during the scan:
   * this is the oscillator's reach at the full envelope, not a single unlucky phase.
   */
  const peakPx = (kick: (s: Shake) => void, heavyMax: number, windowMs = 2000) => {
    let max = 0;
    for (let t = 0; t < windowMs; t += 1) {
      const s = new Shake();
      kick(s);
      const o = s.offset(t, 0, SHAKE_MAX_PX, heavyMax);
      max = Math.max(max, Math.abs(o.x), Math.abs(o.y));
    }
    return max;
  };

  const ordinaryPeak = (trauma: number) => peakPx((s) => s.add(trauma), 0, 400);

  const twinPeak = () => peakPx((s) => s.addHeavy(SYNC_CAST_TRAUMA), SYNC_CAST_MAX_PX);

  it('keeps a single-R thump on the small channel (Meteor 0.3, Meteor Rain strike 0.14)', () => {
    expect(SHAKE_MAX_PX).toBe(9);
    expect(SHAKE_POWER).toBe(2);
    // #48's twin, if it were still on this channel: 9 × 0.75² ≈ 5 px. It is not.
    expect(shakeEnvelope(0.75, SHAKE_MAX_PX, SHAKE_POWER)).toBeCloseTo(5.06, 1);
    expect(shakeEnvelope(0.3, SHAKE_MAX_PX, SHAKE_POWER)).toBeLessThan(1);
    expect(ordinaryPeak(0.3)).toBeLessThan(1.2);
    expect(ordinaryPeak(0.14)).toBeLessThan(0.4);
    expect(ordinaryPeak(0.2)).toBeLessThan(0.5);
  });

  it('is a much louder kick than the #48 5 px / 0.4 s twin, and stays inside its own cap', () => {
    const oldEnvelope = shakeEnvelope(0.75, 9, 2);
    const envelope = shakeEnvelope(SYNC_CAST_TRAUMA, SYNC_CAST_MAX_PX, SYNC_CAST_POWER);
    expect(oldEnvelope).toBeCloseTo(5.06, 1);
    expect(envelope).toBeGreaterThanOrEqual(16);
    expect(envelope).toBeGreaterThan(oldEnvelope * 3);
    expect(twinPeak()).toBeGreaterThanOrEqual(12);
    expect(twinPeak()).toBeLessThanOrEqual(SYNC_CAST_MAX_PX);
    expect(twinPeak()).toBeGreaterThan(ordinaryPeak(0.75) * 2);
  });

  it('stays a visible slam past half a second, then is dead still within about 1.2 s', () => {
    expect(SYNC_CAST_DECAY_PER_S).toBeLessThan(1.2);
    for (const start of [0, 137, 2500, 98765]) {
      const s = new Shake();
      s.addHeavy(SYNC_CAST_TRAUMA);
      let still = -1;
      let aliveAt400 = false;
      for (let t = 0; t <= 1600; t += 16) {
        const o = s.offset(start + t, 16, SHAKE_MAX_PX, SYNC_CAST_MAX_PX);
        if (t === 400) aliveAt400 = s.heavy > 0.4;
        if (o.x === 0 && o.y === 0) {
          still = t;
          break;
        }
      }
      expect(aliveAt400).toBe(true);
      expect(still).toBeGreaterThan(700);
      expect(still).toBeLessThanOrEqual(1400);
    }
    // Envelope (before the oscillator) is still several pixels at 400 ms. The #48 kick was under 1 px by then.
    const traumaAt400 = Math.max(0, SYNC_CAST_TRAUMA - (SYNC_CAST_DECAY_PER_S * 400) / 1000);
    expect(shakeEnvelope(traumaAt400, SYNC_CAST_MAX_PX, SYNC_CAST_POWER)).toBeGreaterThan(8);
  });

  it('does not let a stacked ordinary bump push the twin past its cap', () => {
    const s = new Shake();
    s.add(1);
    s.addHeavy(1);
    for (let t = 0; t < 500; t += 1) {
      const o = s.offset(t, 0, SHAKE_MAX_PX, SYNC_CAST_MAX_PX);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(SYNC_CAST_MAX_PX);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(SYNC_CAST_MAX_PX);
      s.trauma = 1;
      s.heavy = 1;
    }
  });

  it('kicks once per ribbon chain, and not at all when the device asks for reduced motion', () => {
    expect(twinShake(0, false)).toBe(SYNC_CAST_TRAUMA);
    expect(twinShake(1, false)).toBe(0);
    expect(twinShake(2, false)).toBe(0);
    expect(twinShake(0, true)).toBe(0);
    expect(twinShake(1, true)).toBe(0);
    expect(twinShakeMaxPx(false)).toBe(SYNC_CAST_MAX_PX);
    expect(twinShakeMaxPx(true)).toBe(0);
    // A leftover heavy kick is hidden when the frame passes a zero cap (FxLevel.calm).
    const s = new Shake();
    s.addHeavy(SYNC_CAST_TRAUMA);
    expect(s.offset(200, 0, SHAKE_MAX_PX, twinShakeMaxPx(true))).toEqual({ x: 0, y: 0 });
    s.clearHeavy();
    s.addHeavy(twinShake(0, true));
    expect(s.heavy).toBe(0);
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
    expect(fxLevel('low', true)).toMatchObject({ particles: false, shake: false });
    expect(fxLevel('high', true)).toMatchObject({ particles: true, shake: true });
    expect(fxLevel('high', false)).toMatchObject({ particles: true, shake: false });
    expect(fxLevel('low', true).maxNumbers).toBeLessThan(fxLevel('high', true).maxNumbers);
  });

  it('carries the reduced-motion flag through every quality (off unless the device asks)', () => {
    expect(fxLevel('high', true).calm).toBe(false);
    expect(fxLevel('low', true).calm).toBe(false);
    expect(fxLevel('high', true, true).calm).toBe(true);
    expect(fxLevel('low', false, true).calm).toBe(true);
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
