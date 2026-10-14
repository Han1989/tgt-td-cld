// How much larger than their map size units are drawn, as a pure function of the tile size (docs/ART.md §6).
//
// On a phone a tile is ~16 px, so units are drawn larger to stay readable; where a tile is 25 px or more
// (desktop, tablet) nothing is scaled. Heroes, creeps and towers have their own scales. The camera is not
// involved: the whole map stays on screen and the camera stays still (docs/MOBILE.md §4).

/** Tile size (px) from which nothing is scaled up. */
export const ENTITY_TILE_PX = 25;
/** The base scale (what every unit had before V-04) is never more than this. */
export const MAX_BASE_SCALE = 1.6;
/** Towers are never drawn larger than this, so they stay inside their pad. */
export const MAX_TOWER_SCALE = 1.2;
/** Phone-size extra on top of the base scale: heroes, and creeps (bosses with them, so they keep their size relative to other creeps). */
export const HERO_BOOST = 1.4;
export const CREEP_BOOST = 1.2;
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

export function entityScales(tilePx: number): EntityScales {
  const base = clamp(ENTITY_TILE_PX / Math.max(1, tilePx), 1, MAX_BASE_SCALE);
  const phone = clamp((ENTITY_TILE_PX - tilePx) / (ENTITY_TILE_PX - FULL_BOOST_TILE_PX), 0, 1);
  return {
    hero: base * (1 + (HERO_BOOST - 1) * phone),
    creep: base * (1 + (CREEP_BOOST - 1) * phone),
    tower: Math.min(base, MAX_TOWER_SCALE),
  };
}
