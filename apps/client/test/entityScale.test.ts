import { describe, expect, it } from 'vitest';
import {
  CREEP_BOOST,
  ENTITY_TILE_PX,
  entityScales,
  HERO_BOOST,
  MAX_BASE_SCALE,
  MAX_TOWER_SCALE,
} from '../src/render/entityScale';

describe('entityScales (docs/ART.md §6)', () => {
  it('draws everything at map size where a tile is 25 px or more', () => {
    for (const tile of [25, 25.5, 32, 48, 100]) {
      expect(entityScales(tile)).toEqual({ hero: 1, creep: 1, tower: 1 });
    }
  });

  it('on the reference phone (412 wide, 15.85 px tiles) heroes are ~1.4× and creeps ~1.2× the old 1.58', () => {
    const tile = 412 / 26;
    const before = ENTITY_TILE_PX / tile;
    const s = entityScales(tile);
    expect(s.hero / before).toBeCloseTo(HERO_BOOST, 5);
    expect(s.creep / before).toBeCloseTo(CREEP_BOOST, 5);
    // Towers are as they were.
    expect(s.tower).toBe(MAX_TOWER_SCALE);
  });

  it('is capped on the smallest phones (360 wide, 13.85 px tiles)', () => {
    const s = entityScales(360 / 26);
    expect(s.hero).toBeCloseTo(MAX_BASE_SCALE * HERO_BOOST, 5);
    expect(s.creep).toBeCloseTo(MAX_BASE_SCALE * CREEP_BOOST, 5);
    expect(s.tower).toBe(MAX_TOWER_SCALE);
    // Nothing grows past the caps however small the tile.
    expect(entityScales(4)).toEqual(entityScales(8));
  });

  it('never shrinks as tiles get smaller, heroes stay the largest and towers never pass their cap', () => {
    let last = entityScales(60);
    for (let tile = 59; tile >= 8; tile -= 0.5) {
      const s = entityScales(tile);
      expect(s.hero).toBeGreaterThanOrEqual(last.hero);
      expect(s.creep).toBeGreaterThanOrEqual(last.creep);
      expect(s.tower).toBeGreaterThanOrEqual(last.tower);
      expect(s.hero).toBeGreaterThanOrEqual(s.creep);
      expect(s.tower).toBeLessThanOrEqual(MAX_TOWER_SCALE);
      last = s;
    }
  });
});
