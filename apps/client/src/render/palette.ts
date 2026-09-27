// Shared colours: effects, HUD, and the shapes of entities without art yet. The ground, pads and
// restyled entities take their colours from the Runelight tokens (art/tokens.ts, docs/ART.md); the
// effect colours here follow ART.md §8 and reuse those tokens where a meaning is shared (the
// Heart, portals, embers, runes), so effects match the art and read on the dark ground.

import type { AoeEffect, CreepKind, HeroKind, TowerKind, ZoneKind } from '@tdt/protocol';
import { RL } from './art/tokens';

export const COLORS = {
  background: 0x0b0f14,
  heart: RL.heart,
  portal: RL.portal,
  heroRing: 0xffffff,
  shield: 0xffd24a,
  towerBase: 0x2c343f,
  hpHigh: 0x4cd964,
  hpMid: 0xf5c542,
  hpLow: 0xff453a,
  mana: 0x4a8cff,
  slow: 0x8fd3ff,
  root: 0xc8a165,
  stun: 0xffe066,
  good: 0x5bff9c,
  bad: 0xff5b5b,
  gold: 0xffd24a,
  tierPip: 0xffd24a,
  /** The top-tier branch's pip (after the three gold ones). */
  branchPip: 0xffffff,
} as const;

/**
 * Effect colours (docs/ART.md §8). Light is warm (embers) or cool (moonlight), never plain white
 * except white-hot cores; dust and smoke are lighter than the moss so they read on the dark
 * ground; burn marks are ink.
 */
export const FX = {
  /** White-hot cores: flashes, the middle of a pop, crit sparks. */
  hot: 0xfff6e6,
  /** Impact sparks (a warm light ember). */
  spark: 0xffdca6,
  /** Neutral light: swipes, respawns, plain rings (moonlight). */
  moon: RL.moon,
  moonLight: 0xe8f4ff,
  /** Player-side magic (runes): portal flares, wave starts. */
  rune: RL.rune,
  ember: RL.ember,
  emberLight: 0xffc070,
  fire: 0xff8a3d,
  fireDeep: 0xff5a1f,
  gold: 0xffd24a,
  goldLight: 0xfff1b8,
  goldDeep: 0xffb13d,
  frost: 0x9fe3ff,
  frostLight: 0xdff6ff,
  badLight: 0xff8a8a,
  /** Dust thrown up (lanes are packed earth). */
  dust: 0x9a8566,
  /** Debris: earth and wood. */
  debris: RL.pebble,
  debrisDark: RL.woodDark,
  /** Smoke: cool grey-violet, lighter than the moss. */
  smoke: 0x6e6a80,
  /** Soot of fire and meteors. */
  soot: 0x4a403c,
  /** Burn marks on the ground. */
  scorch: RL.ink,
  /** Tower rubble when sold. */
  rubble: [RL.stoneDark, RL.stone, RL.woodDark] as readonly number[],
  vine: 0x9ccf5a,
  vineDark: 0x6fae3a,
  /** Damage numbers: warm white fill (the glyphs carry an ink outline); crits are pale gold. */
  number: 0xfff6e6,
  crit: 0xfff07a,
  /** Motes drawn into a portal. */
  portalMote: 0xe9d5ff,
  /** The Heart: warning ring, the blaze under 30% HP, ruby shards when it cracks. */
  heartWarn: 0xff2a4a,
  heartBlaze: 0xff5a4a,
  heartShard: 0xffb0c0,
} as const;

/** Pad-zone tints by seat (index in the snapshot's player list). */
export const PLAYER_COLORS = [0x4f9dff, 0xff9f43, 0xb56cff, 0x3ddc84] as const;

export const CREEP_COLORS: Record<CreepKind, number> = {
  grunt: RL.grunt,
  archer: 0xf0a04b,
  runner: 0xf5d547,
  brute: RL.brute,
  wisp: 0x7fe7ff,
  hatchling: 0xe8866a,
  ironhorn: 0xa24bd6,
  matriarch: 0xd64b8a,
  shardback: 0x6d8fb0,
};

/** Shardback's two hides. */
export const HIDE_COLORS = { stone: 0xc9b58a, ether: 0x9f7bff } as const;

export const HERO_COLORS: Record<HeroKind, { fill: number; edge: number }> = {
  ranger: { fill: RL.leaf, edge: RL.leafDark },
  warden: { fill: 0x4f9dff, edge: 0x0d2a55 },
  arcanist: { fill: 0xff8fd8, edge: 0x5a1747 },
};

export const AOE_COLORS: Record<AoeEffect, number> = {
  cleave: 0xdfe8f5,
  taunt: 0xff5b5b,
  lastStand: 0xffd24a,
  fireball: 0xff8a3d,
  frostNova: 0x9fe3ff,
  meteor: 0xff5a1f,
  arrowStorm: 0xe6ff7a,
  blizzard: 0xcff4ff,
};

export const ZONE_COLORS: Record<ZoneKind, number> = {
  arrowStorm: 0xe6ff7a,
  meteor: 0xff5a1f,
};

export const TOWER_COLORS: Record<TowerKind, number> = {
  arrow: 0xd4b483,
  cannon: 0x9aa5b1,
  frost: 0x8fd3ff,
  arcane: 0xc77dff,
  flak: 0xff8c42,
};

export const PROJECTILE_COLORS: Record<string, number> = {
  arrow: 0xf1e3c6,
  cannon: 0x20242a,
  frost: 0xbfeaff,
  arcane: 0xe0aaff,
  flak: 0xffb870,
  ranger: 0xb6ff9e,
  arcanist: 0xffb3ea,
  crit: 0xffffff,
  fireball: 0xff8a3d,
  multishot: 0xe6ff7a,
  archer: 0xffb36b,
};

/** Projectile trails that differ from the projectile (a dark cannonball leaves a stone-grey trail). */
export const TRAIL_COLORS: Partial<Record<string, number>> = {
  cannon: RL.stone,
};

export const TOWER_NAMES: Record<TowerKind, string> = {
  arrow: 'Arrow',
  cannon: 'Cannon',
  frost: 'Frost',
  arcane: 'Arcane',
  flak: 'Flak',
};

export const CREEP_NAMES: Record<CreepKind, string> = {
  grunt: 'Grunt',
  archer: 'Archer',
  runner: 'Runner',
  brute: 'Brute',
  wisp: 'Wisp',
  hatchling: 'Hatchling',
  ironhorn: 'Ironhorn',
  matriarch: 'Matriarch',
  shardback: 'Shardback',
};

export function hpColor(frac: number): number {
  if (frac > 0.5) return COLORS.hpHigh;
  if (frac > 0.25) return COLORS.hpMid;
  return COLORS.hpLow;
}

export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Blends colour `a` towards `b` by `t` (0..1), channel by channel. */
export function mixColor(a: number, b: number, t: number): number {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const ch = (shift: number) => {
    const x = (a >> shift) & 0xff;
    const y = (b >> shift) & 0xff;
    return Math.round(x + (y - x) * t) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}
