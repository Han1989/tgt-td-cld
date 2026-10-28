// V-07c's light pools (render/fx/pools.ts; docs/ART.md §6): the sheet's numbers, the tint and the glow in one quad,
// which towers light their pad, the fade in and the portal's flare.

import { describe, expect, it } from 'vitest';
import {
  POOL_COVER,
  POOL_FADE_MS,
  POOL_GLOW,
  POOL_PX,
  POOL_STOPS,
  POOL_STRENGTH,
  POOL_TINT,
  poolAlpha,
  poolFadeIn,
  POOLS,
  poolShare,
  poolTexels,
  portalPoolLevel,
  towerLit,
  type PoolKind,
} from '../src/render/fx/pools';
import { JUICE } from '../src/render/fx/juice';
import { FX } from '../src/render/palette';
import { RL } from '../src/render/art/tokens';

describe('light pools', () => {
  it('are the sheet’s: the falloff, the radii and peaks, Spring meadow’s strength', () => {
    expect(POOL_STOPS).toEqual([
      [0, 1],
      [0.3, 0.72],
      [0.6, 0.3],
      [0.82, 0.08],
      [1, 0],
    ]);
    expect(POOLS).toEqual({
      heart: { radius: 3.4, peak: 0.36 },
      portal: { radius: 2.6, peak: 0.38 },
      tower: { radius: 2.4, peak: 0.3 },
    });
    expect(POOL_STRENGTH).toBe(1.3);
    expect([FX.poolHeart, FX.poolPortal, FX.poolRune]).toEqual([RL.heart, RL.portal, RL.rune]);
  });

  it('are a tint at half the alpha under a glow at 0.7 of it, in one quad', () => {
    expect([POOL_TINT, POOL_GLOW]).toEqual([0.5, 0.7]);
    expect(poolAlpha('heart')).toBeCloseTo(0.36 * 1.3 * (POOL_TINT + POOL_GLOW));
    expect(poolAlpha('tower', 0)).toBe(0);
    expect(poolAlpha('portal', 0.5)).toBeCloseTo(poolAlpha('portal') / 2);
    // Over ground g, a pool of colour c and share s at its alpha a (premultiplied, the normal blend: source + ground ×
    // (1 − source alpha)) draws what the tint (normal, T of the alpha) under the glow (add, G of it) drew in two quads.
    const T = POOL_TINT;
    const G = POOL_GLOW;
    for (const kind of ['heart', 'portal', 'tower'] as PoolKind[]) {
      const peak = POOLS[kind].peak * POOL_STRENGTH;
      for (const [g, c, s] of [[0.39, 0.91, 1], [0.58, 0.29, 0.72], [0.25, 0.8, 0.08], [0.9, 0.1, 0.3]] as const) {
        const tint = g * (1 - peak * T * s) + c * peak * T * s;
        const twoQuads = tint + c * peak * G * s;
        const a = poolAlpha(kind);
        const oneQuad = c * s * a + g * (1 - s * POOL_COVER * a);
        expect(oneQuad).toBeCloseTo(twoQuads, 12);
      }
    }
  });

  it('never ask for an alpha over 1, a boss portal’s flare included', () => {
    for (const kind of ['heart', 'portal', 'tower'] as PoolKind[]) {
      expect(poolAlpha(kind, portalPoolLevel(1, JUICE.bossFlare))).toBeLessThanOrEqual(1);
    }
  });

  it('fall off straight between the sheet’s stops, to 0 at the rim and past it', () => {
    for (const [at, share] of POOL_STOPS) expect(poolShare(at)).toBeCloseTo(share);
    expect(poolShare(0.15)).toBeCloseTo((1 + 0.72) / 2);
    expect(poolShare(0.91)).toBeCloseTo(0.04);
    expect(poolShare(1.2)).toBe(0);
  });

  it('are one texture whose colour is the light and whose alpha is the tint’s part of it', () => {
    const size = POOL_PX * 2;
    const px = poolTexels(size);
    expect(px.length).toBe(size * size * 4);
    const at = (x: number, y: number) => Array.from(px.subarray((y * size + x) * 4, (y * size + x) * 4 + 4));
    const middle = at(POOL_PX, POOL_PX);
    expect(middle.slice(0, 3)).toEqual([255, 255, 255].map(() => middle[0]));
    expect(middle[0]).toBeGreaterThan(250);
    expect(middle[3]).toBe(Math.round(middle[0]! * POOL_COVER));
    expect(at(0, 0)).toEqual([0, 0, 0, 0]);
    expect(at(0, POOL_PX)[0]).toBeLessThanOrEqual(1);
    // Round, and nowhere is the alpha more than the light (it is premultiplied).
    expect(at(POOL_PX + 20, POOL_PX - 7)).toEqual(at(POOL_PX - 21, POOL_PX + 6));
    for (let i = 0; i < px.length; i += 4) expect(px[i + 3]!).toBeLessThanOrEqual(px[i]!);
  });

  it('light a tower’s pad from tier 3, a branch too', () => {
    expect([1, 2, 3, 4].map(towerLit)).toEqual([false, false, true, true]);
  });

  it('fade a tower’s pool in over 0.4 s', () => {
    expect(POOL_FADE_MS).toBe(400);
    expect(poolFadeIn(0)).toBe(0);
    expect(poolFadeIn(200)).toBeCloseTo(0.5);
    expect(poolFadeIn(400)).toBe(1);
    expect(poolFadeIn(5000)).toBe(1);
    expect(poolFadeIn(-10)).toBe(0);
  });

  it('brighten a portal’s pool with its wave-start flare only, a boss lane’s more', () => {
    expect(portalPoolLevel(0)).toBe(1);
    expect(portalPoolLevel(1)).toBeGreaterThan(1);
    expect(portalPoolLevel(1, 1.6)).toBeGreaterThan(portalPoolLevel(1));
    expect(portalPoolLevel(0, 1.6)).toBe(1);
  });
});
