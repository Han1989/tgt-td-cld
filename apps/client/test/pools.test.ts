// V-07c's light pools (render/fx/pools.ts; docs/ART.md §6): the sheet's numbers, the two layers, which towers light
// their pad, the fade in and the portal's flare.

import { describe, expect, it } from 'vitest';
import {
  POOL_FADE_MS,
  POOL_GLOW,
  POOL_STOPS,
  POOL_STRENGTH,
  POOL_TINT,
  poolAlphas,
  poolFadeIn,
  POOLS,
  portalPoolLevel,
  towerLit,
} from '../src/render/fx/pools';
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

  it('are a tint at half the alpha under a glow at 0.7 of it', () => {
    const heart = poolAlphas('heart');
    expect(heart.tint).toBeCloseTo(0.36 * 1.3 * POOL_TINT);
    expect(heart.glow).toBeCloseTo(0.36 * 1.3 * POOL_GLOW);
    expect(heart.tint).toBeLessThan(heart.glow);
    expect(poolAlphas('tower', 0)).toEqual({ tint: 0, glow: 0 });
    expect(poolAlphas('portal', 0.5).glow).toBeCloseTo(poolAlphas('portal').glow / 2);
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
