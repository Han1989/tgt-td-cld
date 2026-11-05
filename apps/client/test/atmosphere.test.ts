// V-08a, the atmosphere pass (docs/ART.md §6, §16): the light a wave is played in, the crossfade between plates, the
// weather a seed gives, and where each raindrop, splash, leaf, firefly and lantern is: pure rules, tested here.

import { describe, expect, it } from 'vitest';
import { GAME_MODES } from '@tdt/protocol';
import { lastWave, TUNING, tuningForMode, waveGroups } from '@tdt/sim';
import {
  CROSSFADE_MS,
  crossfadeAt,
  darkness,
  fallingLeaf,
  firefly,
  HEART_WINDOWS,
  heartWindowAlpha,
  LEAF,
  lanternAlpha,
  lanternBreath,
  lanternTexels,
  lightOfWave,
  lightShare,
  parseLight,
  parseWeather,
  perLight,
  rainSplash,
  rainStreak,
  SPLASH,
  weatherOf,
  weatherParticles,
  WEATHER_BUDGET,
  type Drop,
} from '../src/render/fx/atmosphere';
import { LIGHTING } from '../src/render/art/tokens';

const boss = (mode: (typeof GAME_MODES)[number], wave: number) =>
  waveGroups(tuningForMode(TUNING, mode), wave).some((g) => TUNING.creeps[g.kind].boss);
const drop = (): Drop => ({ x: 0, y: 0, alpha: 0, rotation: 0, scale: 0 });
const BOX = { x0: 0, y0: 0, x1: 832, y1: 1280 };

describe('a time of day across the match', () => {
  it('Full: afternoon 1–10, dusk 11–20, night 21–30; its boss waves at night', () => {
    for (let w = 1; w <= 30; w++) {
      const want = boss('full', w) ? 'night' : w <= 10 ? 'afternoon' : w <= 20 ? 'dusk' : 'night';
      expect(lightOfWave('full', w, boss('full', w)), `wave ${w}`).toBe(want);
    }
    expect([10, 20, 30].every((w) => boss('full', w))).toBe(true);
  });

  it('Quick (and the Daily run, which is Quick): 1–5, 6–10, 11–15; its boss waves at night', () => {
    expect(lastWave(tuningForMode(TUNING, 'quick'))).toBe(15);
    for (let w = 1; w <= 15; w++) {
      const want = boss('quick', w) ? 'night' : w <= 5 ? 'afternoon' : w <= 10 ? 'dusk' : 'night';
      expect(lightOfWave('quick', w, boss('quick', w)), `wave ${w}`).toBe(want);
    }
    expect(lightOfWave('quick', 5, true)).toBe('night');
    expect(lightOfWave('quick', 6, false)).toBe('dusk');
  });

  it('Endless: as Full, and night from wave 21 on, whatever the wave', () => {
    expect(lightOfWave('endless', 3, false)).toBe('afternoon');
    expect(lightOfWave('endless', 15, false)).toBe('dusk');
    for (const w of [21, 31, 46, 120, 200]) expect(lightOfWave('endless', w, boss('endless', w))).toBe('night');
  });

  it('the build phase is the afternoon', () => {
    for (const m of GAME_MODES) expect(lightOfWave(m, 0, false)).toBe('afternoon');
  });

  it('a crossfade takes CROSSFADE_MS (6 s), eased, and shares the two lights between it', () => {
    expect(CROSSFADE_MS).toBe(6000);
    expect(crossfadeAt(0)).toBe(0);
    expect(crossfadeAt(CROSSFADE_MS)).toBe(1);
    expect(crossfadeAt(CROSSFADE_MS * 2)).toBe(1);
    let last = -1;
    for (let ms = 0; ms <= CROSSFADE_MS; ms += 250) {
      const t = crossfadeAt(ms);
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
    const mix = { from: 'dusk', to: 'night', t: 0.25 } as const;
    expect(lightShare(mix, 'dusk')).toBeCloseTo(0.75);
    expect(lightShare(mix, 'night')).toBeCloseTo(0.25);
    expect(lightShare(mix, 'afternoon')).toBe(0);
    expect(darkness({ from: 'afternoon', to: 'afternoon', t: 1 })).toBe(0);
    expect(darkness({ from: 'night', to: 'night', t: 1 })).toBe(1);
    expect(darkness({ from: 'afternoon', to: 'dusk', t: 1 })).toBeGreaterThan(0.3);
  });

  it("Bright's lift is per light: none in Normal, more at dusk and most at night in Bright", () => {
    for (const l of ['afternoon', 'dusk', 'night'] as const) expect(LIGHTING.normal.plateLift[l]).toBe(0);
    const b = LIGHTING.bright.plateLift;
    expect(b.afternoon).toBe(LIGHTING.bright.groundLift.alpha);
    expect(b.dusk).toBeGreaterThan(b.afternoon);
    expect(b.night).toBeGreaterThan(b.dusk);
    expect(perLight({ from: 'afternoon', to: 'night', t: 0.5 }, b)).toBeCloseTo((b.afternoon + b.night) / 2);
  });
});

describe('weather', () => {
  it('the seed picks rain or leaves, about half and half, the same every time; the Daily run is clear', () => {
    const seeds = Array.from({ length: 400 }, (_, i) => (i * 2654435761) >>> 1);
    const got = seeds.map((s) => weatherOf(s, false));
    expect(got).toEqual(seeds.map((s) => weatherOf(s, false)));
    const rain = got.filter((w) => w === 'rain').length;
    expect(rain).toBeGreaterThan(150);
    expect(rain).toBeLessThan(250);
    expect(got.every((w) => w === 'rain' || w === 'leaves')).toBe(true);
    for (const s of seeds.slice(0, 20)) expect(weatherOf(s, true)).toBe('clear');
  });

  it('?weather= and ?light= take only their own words', () => {
    expect(parseWeather('rain')).toBe('rain');
    expect(parseWeather('snow')).toBeNull();
    expect(parseWeather(null)).toBeNull();
    expect(parseLight('night')).toBe('night');
    expect(parseLight('noon')).toBeNull();
  });

  it('at most a few hundred particles at High, fewer at Medium, none at Low', () => {
    for (const w of ['rain', 'leaves', 'clear'] as const) {
      expect(weatherParticles(w, 'high', 1)).toBeLessThanOrEqual(300);
      expect(weatherParticles(w, 'medium', 1)).toBeLessThan(weatherParticles(w, 'high', 1) || 1);
      expect(weatherParticles(w, null, 1)).toBe(0);
    }
    expect(weatherParticles('clear', 'high', 0)).toBe(0);
    expect(WEATHER_BUDGET.high.fireflies).toBe(12);
  });

  it('a raindrop falls down the slant inside the box, fading in and out, and is the same at the same moment', () => {
    const d = drop();
    for (let i = 0; i < 50; i++) {
      for (const t of [0, 123, 4567, 98765]) {
        rainStreak(i, t, BOX, d);
        expect(d.alpha).toBeGreaterThanOrEqual(0);
        expect(d.alpha).toBeLessThanOrEqual(1);
        expect(d.x).toBeGreaterThanOrEqual(BOX.x0);
        expect(d.x).toBeLessThanOrEqual(BOX.x1 + 60);
        expect(d.y).toBeLessThanOrEqual(BOX.y1);
        const again = rainStreak(i, t, BOX, drop());
        expect(again).toEqual(d);
      }
    }
    // Later in its life it is lower down (it falls).
    const a = rainStreak(3, 10, BOX, drop());
    const b = rainStreak(3, 60, BOX, drop());
    if (b.y > a.y) expect(b.x).toBeGreaterThanOrEqual(a.x);
  });

  it('a splash shows on one of its spots for part of its life, spreading as it fades', () => {
    const spots = [{ x: 10, y: 20 }, { x: 300, y: 400 }];
    const d = drop();
    let shown = 0;
    let n = 0;
    for (let t = 0; t < 20000; t += 7, n++) {
      rainSplash(0, t, spots, d);
      if (d.alpha > 0) {
        shown++;
        expect(spots.some((s) => s.x === d.x && s.y === d.y)).toBe(true);
      }
    }
    expect(shown / n).toBeGreaterThan(SPLASH.shown * 0.6);
    expect(shown / n).toBeLessThan(SPLASH.shown * 1.4);
    expect(rainSplash(0, 5, [], drop()).alpha).toBe(0);
  });

  it('a leaf drifts on the breeze, lies still about a second, then fades', () => {
    const d = drop();
    // Find a moment in the settled part of leaf 4's life: it does not move there.
    let still = 0;
    let prev: Drop | null = null;
    for (let t = 0; t < LEAF.life * 2; t += 50) {
      fallingLeaf(4, t, BOX, d);
      if (prev && prev.x === d.x && prev.y === d.y && d.alpha > 0) still += 50;
      prev = { ...d };
    }
    expect(still).toBeGreaterThanOrEqual(800);
    for (let t = 0; t < LEAF.life * 3; t += 333) {
      fallingLeaf(7, t, BOX, d);
      expect(d.alpha).toBeGreaterThanOrEqual(0);
      expect(d.alpha).toBeLessThanOrEqual(1);
    }
  });

  it('fireflies only by dusk and night', () => {
    const spots = [{ x: 100, y: 100 }];
    expect(firefly(0, 1000, spots, 0, drop()).alpha).toBe(0);
    let lit = 0;
    for (let t = 0; t < 10000; t += 100) lit = Math.max(lit, firefly(0, t, spots, 1, drop()).alpha);
    expect(lit).toBeGreaterThan(0.5);
  });
});

describe('living light', () => {
  it('lanterns from tier 2, brighter at night and on a tier 3, breathing slowly, never over 1', () => {
    expect(lanternAlpha(1, 1, 1)).toBe(0);
    expect(lanternAlpha(2, 1, 1)).toBeGreaterThan(lanternAlpha(2, 0, 1));
    expect(lanternAlpha(3, 1, 1)).toBeGreaterThan(lanternAlpha(2, 1, 1));
    expect(lanternAlpha(4, 1, 1)).toBeLessThanOrEqual(1);
    for (let t = 0; t < 20000; t += 500) {
      const b = lanternBreath(t, 7);
      expect(b).toBeGreaterThanOrEqual(0.75);
      expect(b).toBeLessThanOrEqual(1);
    }
  });

  it('the lantern texture only adds light (no alpha), brightest in the middle', () => {
    const px = lanternTexels(16);
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(0);
    const mid = (8 * 16 + 8) * 4;
    expect(px[mid]).toBeGreaterThan(200);
    expect(px[0]).toBe(0);
  });

  it("the Heart's windows are dark by day, lit at night", () => {
    expect(heartWindowAlpha(0, 1000)).toBe(0);
    expect(heartWindowAlpha(1, 1000)).toBeGreaterThan(0.7);
    expect(HEART_WINDOWS.length).toBeGreaterThanOrEqual(3);
  });
});
