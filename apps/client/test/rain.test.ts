import { TILE_PX } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import { flight, rainPlan, skyRate, skyStreaks, type RainKind } from '../src/render/fx/rain';

const S = TILE_PX;
const KINDS: RainKind[] = ['arrowStorm', 'meteor', 'meteorRain'];

/** A repeatable pseudo-random sequence in [0, 1). */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('falling rain impacts', () => {
  const R = 1.6;

  it('an Arrow Storm strike is a volley that lands inside the strike circle, falling from the upper left', () => {
    const plan = rainPlan('arrowStorm', R, false, seeded());
    expect(plan.streaks).toHaveLength(5);
    for (const s of plan.streaks) {
      expect(Math.hypot(s.landX, s.landY)).toBeLessThanOrEqual(R * S);
      expect(s.fromY).toBeLessThan(0);
      expect(s.fromX).toBeLessThan(0);
      expect(s.life).toBeGreaterThanOrEqual(60);
      expect(s.life).toBeLessThanOrEqual(80);
    }
    // Not all in one spot.
    expect(new Set(plan.streaks.map((s) => Math.round(s.landX))).size).toBeGreaterThan(1);
  });

  it('a Meteor is one long streak onto the centre from the upper right; a Meteor Rain strike is shorter and quicker', () => {
    const meteor = rainPlan('meteor', R, false, seeded());
    const rain = rainPlan('meteorRain', 1.5, false, seeded());
    expect(meteor.streaks).toHaveLength(1);
    expect(rain.streaks).toHaveLength(1);
    const m = meteor.streaks[0]!;
    const r = rain.streaks[0]!;
    expect(m.landX).toBeCloseTo(0);
    expect(m.landY).toBeCloseTo(0);
    expect(m.fromX).toBeGreaterThan(0);
    expect(m.fromY).toBe(-6 * S);
    expect(r.fromY).toBe(-4 * S);
    expect(r.life).toBeLessThan(m.life);
    expect(Math.hypot(r.fromX, r.fromY)).toBeLessThan(Math.hypot(m.fromX, m.fromY));
  });

  it('every streak flies downwards onto its landing spot', () => {
    for (const kind of KINDS) {
      for (const s of rainPlan(kind, R, false, seeded(3)).streaks) {
        // The way it travels is from the start to the landing: the opposite of `from`.
        expect(-s.fromY).toBeGreaterThan(0);
      }
    }
  });

  it('thumps lightly: none for Arrow Storm, and a Meteor harder than one strike of a Meteor Rain', () => {
    const shake = (kind: RainKind) => rainPlan(kind, R, false, seeded()).shake;
    expect(shake('arrowStorm')).toBe(0);
    expect(shake('meteorRain')).toBeGreaterThan(0);
    expect(shake('meteor')).toBeGreaterThan(shake('meteorRain'));
    // A strike used to add 0.8, so a rain kept the screen at full shake for its whole length.
    expect(shake('meteor')).toBeLessThanOrEqual(0.4);
  });

  it('with reduced motion nothing flies and nothing thumps', () => {
    for (const kind of KINDS) {
      expect(rainPlan(kind, R, true, seeded())).toEqual({ streaks: [], shake: 0 });
    }
  });
});

describe('the flight of a streak', () => {
  it('starts above and to the side of its landing and reaches it exactly when its life is up', () => {
    for (const kind of KINDS) {
      for (const s of rainPlan(kind, 1.6, false, seeded(5)).streaks) {
        const f = flight(100, 200, s);
        const t = s.life / 1000;
        expect(f.x + Math.cos(f.angle) * f.speed * t).toBeCloseTo(100 + s.landX, 6);
        expect(f.y + Math.sin(f.angle) * f.speed * t).toBeCloseTo(200 + s.landY, 6);
        expect(f.y).toBeLessThan(200 + s.landY);
        expect(f.speed).toBeGreaterThan(0);
      }
    }
  });

  it('a strike arrives within about a tenth of a second, so it lands almost with the flash', () => {
    for (const kind of KINDS) {
      for (const s of rainPlan(kind, 1.6, false, seeded(9)).streaks) expect(s.life).toBeLessThanOrEqual(120);
    }
  });
});

describe('the sky of a running rain', () => {
  const view = { left: -100, top: 50, right: 400, bottom: 900 };

  it('streaks land inside the visible area and start above it, leaning the way their rain does', () => {
    for (const kind of KINDS) {
      const streaks = skyStreaks(kind, view, 40, seeded(11));
      expect(streaks).toHaveLength(40);
      for (const s of streaks) {
        expect(s.landX).toBeGreaterThanOrEqual(view.left);
        expect(s.landX).toBeLessThanOrEqual(view.right);
        expect(s.landY).toBeGreaterThanOrEqual(view.top);
        expect(s.landY).toBeLessThanOrEqual(view.bottom);
        expect(s.fromY).toBeLessThan(0);
        expect(s.life).toBeGreaterThan(0);
      }
    }
    expect(skyStreaks('arrowStorm', view, 1, seeded())[0]!.fromX).toBeLessThan(0);
    expect(skyStreaks('meteor', view, 1, seeded())[0]!.fromX).toBeGreaterThan(0);
  });

  it('a Meteor Rain is the densest and a Meteor the sparsest, and nothing falls with reduced motion', () => {
    expect(skyRate('meteorRain', false)).toBeGreaterThan(skyRate('arrowStorm', false));
    expect(skyRate('arrowStorm', false)).toBeGreaterThan(skyRate('meteor', false));
    for (const kind of KINDS) expect(skyRate(kind, true)).toBe(0);
  });
});
