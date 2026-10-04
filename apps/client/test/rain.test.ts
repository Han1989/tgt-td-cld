import { TILE_PX } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import { ZONE_KINDS } from '@tdt/protocol';
import { arrowRain, flight, pullMotes, rainPlan, skyRate, skyStreaks, type RainKind } from '../src/render/fx/rain';

const S = TILE_PX;
const KINDS: readonly RainKind[] = ZONE_KINDS;

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

  it('a Stun Storm strike is a denser volley of arrows than an Arrow Storm, from higher, still from the upper left', () => {
    const storm = rainPlan('arrowStorm', R, false, seeded());
    const stun = rainPlan('stunStorm', R, false, seeded());
    expect(arrowRain('stunStorm')).toBe(true);
    expect(stun.streaks.length).toBeGreaterThan(storm.streaks.length);
    for (const s of stun.streaks) {
      expect(Math.hypot(s.landX, s.landY)).toBeLessThanOrEqual(R * S);
      expect(s.fromX).toBeLessThan(0);
      expect(s.fromY).toBeLessThan(storm.streaks[0]!.fromY);
    }
  });

  it('a Shockwave strike is one comet onto the centre from the upper right, from higher than a Meteor', () => {
    const meteor = rainPlan('meteor', R, false, seeded()).streaks[0]!;
    const plan = rainPlan('shockwave', R, false, seeded());
    expect(arrowRain('shockwave')).toBe(false);
    expect(plan.streaks).toHaveLength(1);
    const s = plan.streaks[0]!;
    expect(s.landX).toBeCloseTo(0);
    expect(s.landY).toBeCloseTo(0);
    expect(s.fromX).toBeGreaterThan(0);
    expect(s.fromY).toBeLessThan(meteor.fromY);
  });

  it('only the arrow rains are volleys', () => {
    expect(KINDS.filter(arrowRain)).toEqual(['arrowStorm', 'stunStorm']);
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

  it('the combos thump harder than the rain they are built on: Stun Storm lightly, Shockwave hardest of all', () => {
    const shake = (kind: RainKind) => rainPlan(kind, R, false, seeded()).shake;
    expect(shake('stunStorm')).toBeGreaterThan(shake('arrowStorm'));
    expect(shake('stunStorm')).toBeLessThan(shake('meteorRain'));
    expect(shake('shockwave')).toBeGreaterThan(shake('meteor'));
    expect(shake('shockwave')).toBeLessThanOrEqual(0.4);
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
    expect(skyStreaks('stunStorm', view, 1, seeded())[0]!.fromX).toBeLessThan(0);
    expect(skyStreaks('shockwave', view, 1, seeded())[0]!.fromX).toBeGreaterThan(0);
  });

  it('a Meteor Rain is the densest and a Meteor the sparsest, and nothing falls with reduced motion', () => {
    expect(skyRate('meteorRain', false)).toBeGreaterThan(skyRate('arrowStorm', false));
    expect(skyRate('arrowStorm', false)).toBeGreaterThan(skyRate('meteor', false));
    for (const kind of KINDS) expect(skyRate(kind, true)).toBe(0);
  });

  it('each combo has a sky of its own, denser than the rain it is built on', () => {
    expect(skyRate('stunStorm', false)).toBeGreaterThan(skyRate('arrowStorm', false));
    expect(skyRate('shockwave', false)).toBeGreaterThan(skyRate('meteor', false));
    expect(skyRate('meteorRain', false)).toBeGreaterThanOrEqual(skyRate('stunStorm', false));
  });
});

describe("the Shockwave's pull", () => {
  it('dust starts on the pull circle, all round, and reaches the inner circle as it dies', () => {
    const motes = pullMotes(3.5, 0.9, false, seeded(13));
    expect(motes.length).toBeGreaterThanOrEqual(8);
    const quadrants = new Set<string>();
    for (const m of motes) {
      expect(Math.hypot(m.x, m.y)).toBeCloseTo(3.5 * S, 6);
      quadrants.add(`${Math.sign(m.x)},${Math.sign(m.y)}`);
      const t = m.life / 1000;
      const endX = m.x + Math.cos(m.angle) * m.speed * t;
      const endY = m.y + Math.sin(m.angle) * m.speed * t;
      expect(Math.hypot(endX, endY)).toBeCloseTo(0.9 * S, 6);
      // Inwards: it ends nearer the impact than it started.
      expect(Math.hypot(endX, endY)).toBeLessThan(Math.hypot(m.x, m.y));
    }
    expect(quadrants.size).toBe(4);
  });

  it('with reduced motion nothing rushes in', () => {
    expect(pullMotes(3.5, 0.9, true, seeded())).toEqual([]);
  });
});
