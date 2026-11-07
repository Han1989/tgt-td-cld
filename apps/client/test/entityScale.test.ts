import { TOWER_KINDS } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { TOWER_2D_REACH, TOWER_REACH } from '../src/render/art3d/structures';
import {
  CREEP_BOOST,
  ENTITY_TILE_PX,
  entityScales,
  HERO_BOOST,
  MAX_BASE_SCALE,
  HEART_SCALE,
  MAX_TOWER_SCALE,
  PAD_HALF_PX,
  PORTAL_DROP,
  PORTAL_SCALE,
  portalPoint,
  TOWER_SIZE,
  towerScale,
} from '../src/render/entityScale';

describe('entityScales (docs/ART.md §6)', () => {
  it('draws everything at map size where a tile is 25 px or more (desktop, tablets with big tiles)', () => {
    for (const tile of [25, 25.5, 32, 48, 100]) {
      expect(entityScales(tile)).toEqual({ hero: 1, creep: 1, tower: 1 });
    }
  });

  it('V-08c: on the reference phone (412 wide, 15.85 px tiles) heroes are 1.375× and creeps 1.329× the old 1.58, towers up to 1.3', () => {
    expect(HERO_BOOST).toBe(1.375);
    expect(CREEP_BOOST).toBe(1.329);
    expect(MAX_TOWER_SCALE).toBe(1.3);
    const tile = 412 / 26;
    const before = ENTITY_TILE_PX / tile;
    const s = entityScales(tile);
    expect(s.hero / before).toBeCloseTo(HERO_BOOST, 5);
    expect(s.creep / before).toBeCloseTo(CREEP_BOOST, 5);
    expect(s.tower).toBe(MAX_TOWER_SCALE);
    // A hero is about 2.2 tiles across (V-07e's 2.76), a creep 2.1 (2.29).
    expect(s.hero).toBeCloseTo(2.17, 2);
    expect(s.creep).toBeCloseTo(2.1, 2);
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

describe("V-08c: Han's pick of 7 Nov 2026 (column 3, the creeps a step smaller)", () => {
  it('draws the towers at 75%, the Heart at 130% and the portals at 135%, the portals 0.47 tiles of view lower', () => {
    expect(TOWER_SIZE).toBe(0.75);
    expect(HEART_SCALE).toBe(1.3);
    expect(PORTAL_SCALE).toBe(1.35);
    expect(PORTAL_DROP).toBe(0.47);
  });

  it('keeps the Warden over a Brute: the heroes 79% of V-07e on the phone, the creeps 92%', () => {
    const tile = 412 / 26;
    const before = ENTITY_TILE_PX / tile;
    const s = entityScales(tile);
    expect(s.hero / (before * 1.75)).toBeCloseTo(0.786, 3);
    expect(s.creep / (before * 1.45)).toBeCloseTo(0.917, 3);
    expect(s.hero).toBeGreaterThan(s.creep);
  });

  it('stands each portal a tile in front of its lane’s first waypoint, then 0.47 tiles of view lower (row 1.5 → about 2.0)', () => {
    const cos = Math.cos(Math.PI / 6);
    const at = portalPoint({ x: 4.5, y: 0.5 }, cos);
    expect(at.x).toBe(4.5);
    expect(at.y).toBeCloseTo(2.04, 2);
    // On screen (tiles of view): exactly PORTAL_DROP below where V-07e stood it.
    expect(at.y * cos - 1.5 * cos).toBeCloseTo(PORTAL_DROP, 9);
    // Grown 1.35× about its point the gatehouse's top would go 7.4 px under the bar on the 412 × 839 phone (tiles of
    // 15.85 px; docs/art/size-options.md, "The top row and the HUD"): the drop takes at least that back.
    expect(PORTAL_DROP).toBeGreaterThanOrEqual(7.4 / 15.85);
  });

  it('the towers shrink by TOWER_SIZE after the pad cap, on a phone and at map size alike', () => {
    for (const tile of [412 / 26, 19.6, 32]) {
      const layout = entityScales(tile).tower;
      for (const reach of [26, 40, 45.5]) {
        expect(towerScale(layout, reach)).toBeCloseTo(Math.min(layout, PAD_HALF_PX / reach) * TOWER_SIZE, 9);
      }
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

  it('the widest, the Prism (45.5 world px on its pad through the tilted camera, V-08b build 2), stops at its pad on a phone; small towers get the whole 1.3', () => {
    const widest = all.reduce((a, b) => (b.reach > a.reach ? b : a));
    expect(widest.id).toBe('arcane/prism');
    expect(towerScale(phone, widest.reach)).toBeCloseTo((48 / 45.5) * TOWER_SIZE, 5);
    expect(towerScale(phone, TOWER_REACH.arrow['1']!)).toBeCloseTo(MAX_TOWER_SCALE * TOWER_SIZE, 9);
    // The 2D art (the fallback) keeps V-04's 1.2 before V-08c's factor.
    expect(towerScale(phone, TOWER_2D_REACH)).toBeCloseTo(1.2 * TOWER_SIZE, 5);
    // Most tier 1–3 bodies get the whole 1.3 before the factor (the Cannon at tiers 2 and 3 and the Arcane at tier 2 stop at their pads).
    const tiers = all.filter((t) => /\/\d$/.test(t.id));
    expect(tiers.filter((t) => towerScale(phone, t.reach) === MAX_TOWER_SCALE * TOWER_SIZE).length).toBeGreaterThanOrEqual(10);
  });

  it('draws them TOWER_SIZE of map size where tiles are big (desktop, tablets): the pad cap never binds there', () => {
    for (const { reach } of all) expect(towerScale(1, reach)).toBe(TOWER_SIZE);
  });
});
