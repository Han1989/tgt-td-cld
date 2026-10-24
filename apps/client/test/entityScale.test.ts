import { TOWER_KINDS } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { TOWER_2D_REACH, TOWER_REACH } from '../src/render/art3d/structures';
import {
  CREEP_BOOST,
  ENTITY_TILE_PX,
  entityScales,
  HERO_BOOST,
  MAX_BASE_SCALE,
  MAX_TOWER_SCALE,
  PAD_HALF_PX,
  towerScale,
} from '../src/render/entityScale';

describe('entityScales (docs/ART.md §6)', () => {
  it('draws everything at map size where a tile is 25 px or more (desktop, tablets with big tiles)', () => {
    for (const tile of [25, 25.5, 32, 48, 100]) {
      expect(entityScales(tile)).toEqual({ hero: 1, creep: 1, tower: 1 });
    }
  });

  it('V-07e: on the reference phone (412 wide, 15.85 px tiles) heroes are 1.75× and creeps 1.45× the old 1.58, towers up to 1.3', () => {
    expect(HERO_BOOST).toBe(1.75);
    expect(CREEP_BOOST).toBe(1.45);
    expect(MAX_TOWER_SCALE).toBe(1.3);
    const tile = 412 / 26;
    const before = ENTITY_TILE_PX / tile;
    const s = entityScales(tile);
    expect(s.hero / before).toBeCloseTo(HERO_BOOST, 5);
    expect(s.creep / before).toBeCloseTo(CREEP_BOOST, 5);
    expect(s.tower).toBe(MAX_TOWER_SCALE);
    // A hero is about 2.8 tiles across where V-04 drew it 2.2.
    expect(s.hero).toBeCloseTo(2.76, 2);
    expect(s.creep).toBeCloseTo(2.29, 2);
  });

  it('is capped on the smallest phones (360 wide, 13.85 px tiles)', () => {
    const s = entityScales(360 / 26);
    expect(s.hero).toBeCloseTo(MAX_BASE_SCALE * HERO_BOOST, 5);
    expect(s.creep).toBeCloseTo(MAX_BASE_SCALE * CREEP_BOOST, 5);
    expect(s.tower).toBe(MAX_TOWER_SCALE);
    // Nothing grows past the caps however small the tile.
    expect(entityScales(4)).toEqual(entityScales(8));
  });

  it('a portrait tablet (768 × 1024, 19.6 px tiles) is part way up the ramp: bigger than map size, smaller than a phone', () => {
    const tile = (1024 - 44) / 50;
    const tablet = entityScales(tile);
    const phone = entityScales(412 / 26);
    expect(tablet.hero).toBeGreaterThan(ENTITY_TILE_PX / tile);
    expect(tablet.hero).toBeLessThan(phone.hero);
    expect(tablet.creep).toBeLessThan(phone.creep);
    expect(tablet.tower).toBeCloseTo(Math.min(MAX_TOWER_SCALE, ENTITY_TILE_PX / tile), 5);
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

describe('towerScale: never past the pad (V-07e)', () => {
  const phone = entityScales(412 / 26).tower;
  const all = TOWER_KINDS.flatMap((kind) => Object.entries(TOWER_REACH[kind]).map(([v, reach]) => ({ id: `${kind}/${v}`, reach })));

  it('keeps every 3D variant and the 2D art inside its 48 px half pad at any tile size', () => {
    for (const tile of [360 / 26, 412 / 26, 19.6, 25, 32]) {
      const s = entityScales(tile).tower;
      for (const { id, reach } of [...all, { id: '2d', reach: TOWER_2D_REACH }]) {
        expect(towerScale(s, reach) * reach, `${id} at ${tile.toFixed(2)} px tiles`).toBeLessThanOrEqual(PAD_HALF_PX + 1e-9);
      }
    }
  });

  it('the widest, the Prism (its base 46 world px from its centre), stops at its pad on a phone; small towers get the whole 1.3', () => {
    const widest = all.reduce((a, b) => (b.reach > a.reach ? b : a));
    expect(widest.id).toBe('arcane/prism');
    expect(towerScale(phone, widest.reach)).toBeCloseTo(48 / 46, 5);
    expect(towerScale(phone, TOWER_REACH.arrow['1']!)).toBe(MAX_TOWER_SCALE);
    // The 2D art (the fallback) keeps V-04's 1.2.
    expect(towerScale(phone, TOWER_2D_REACH)).toBeCloseTo(1.2, 5);
    // Most tier 1–3 bodies are drawn at the full 1.3 (the Cannon at tiers 2 and 3 and the Arcane at tier 2 stop at their pads).
    const tiers = all.filter((t) => /\/\d$/.test(t.id));
    expect(tiers.filter((t) => towerScale(phone, t.reach) === MAX_TOWER_SCALE).length).toBeGreaterThanOrEqual(10);
  });

  it('changes nothing where towers are drawn at map size (desktop, tablets with big tiles)', () => {
    for (const { reach } of all) expect(towerScale(1, reach)).toBe(1);
  });
});
