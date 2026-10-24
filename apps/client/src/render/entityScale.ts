// How much larger than their map size units are drawn, as a pure function of the tile size (docs/ART.md §6).
//
// On a phone a tile is ~16 px, so units are drawn larger to stay readable; where a tile is 25 px or more
// (desktop, tablet) nothing is scaled. Heroes, creeps and towers have their own scales (V-04, one step bigger in
// V-07e). The scales follow the fitted tile size only: a phone's pinch zoom (docs/MOBILE.md §4) enlarges the map and
// everything on it together, so units keep their size against the map at any zoom. A tower is also never drawn past
// its pad: its scale stops where its widest part (its base, or its turret at any angle) reaches the pad's edge.

/** Tile size (px) from which nothing is scaled up. */
export const ENTITY_TILE_PX = 25;
/** The base scale (what every unit had before V-04) is never more than this. */
export const MAX_BASE_SCALE = 1.6;
/** Towers are never drawn larger than this, and never past their pad (`towerScale`). */
export const MAX_TOWER_SCALE = 1.3;
/**
 * Phone-size extra on top of the base scale: heroes, and creeps (bosses with them, so they keep their size relative to
 * other creeps). V-04's 1.4 and 1.2 became 1.75 and 1.45 in V-07e (Han, 24 Oct 2026: the art at a size you can see).
 */
export const HERO_BOOST = 1.75;
export const CREEP_BOOST = 1.45;
/** The extra grows linearly as tiles shrink from `ENTITY_TILE_PX` and is whole at this size (the reference phone's 15.85 px). */
export const FULL_BOOST_TILE_PX = 16;

export interface EntityScales {
  hero: number;
  /** Creeps and bosses, and what flies or lies with them (shots, snare traps). */
  creep: number;
  tower: number;
}

export const UNIT_SCALES: EntityScales = { hero: 1, creep: 1, tower: 1 };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** A pad's half side (world px): `map.padSize` (3) tiles of 32. */
export const PAD_HALF_PX = 48;

/**
 * A tower's drawn scale: the layout's tower scale, but never so large that its widest part, `reach` world px from its
 * centre at scale 1 (its base's half width, or its turret's radius, which turns), passes its pad's edge.
 */
export function towerScale(scale: number, reach: number): number {
  return Math.min(scale, PAD_HALF_PX / Math.max(1, reach));
}

export function entityScales(tilePx: number): EntityScales {
  const base = clamp(ENTITY_TILE_PX / Math.max(1, tilePx), 1, MAX_BASE_SCALE);
  const phone = clamp((ENTITY_TILE_PX - tilePx) / (ENTITY_TILE_PX - FULL_BOOST_TILE_PX), 0, 1);
  return {
    hero: base * (1 + (HERO_BOOST - 1) * phone),
    creep: base * (1 + (CREEP_BOOST - 1) * phone),
    tower: Math.min(base, MAX_TOWER_SCALE),
  };
}
