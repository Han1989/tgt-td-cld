import type { AoeEffect, CreepKind, HeroKind, TowerKind, ZoneKind } from '@tdt/protocol';

export const COLORS = {
  background: 0x0b0f14,
  open: 0x2f4a2c,
  openAlt: 0x2c4629,
  lane: 0x7a6546,
  laneAlt: 0x745f41,
  pad: 0x3e4d60,
  padEdge: 0x6f86a3,
  blocker: 0x172416,
  tree: 0x21381f,
  heart: 0xff4d6d,
  heartCore: 0xffc2cf,
  portal: 0x9b5de5,
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
} as const;

/** Pad-zone tints by seat (index in the snapshot's player list). */
export const PLAYER_COLORS = [0x4f9dff, 0xff9f43, 0xb56cff, 0x3ddc84] as const;

export const CREEP_COLORS: Record<CreepKind, number> = {
  grunt: 0xd9534f,
  archer: 0xf0a04b,
  runner: 0xf5d547,
  brute: 0x9c3b3b,
  wisp: 0x7fe7ff,
  hatchling: 0xe8866a,
  ironhorn: 0xa24bd6,
  matriarch: 0xd64b8a,
  shardback: 0x6d8fb0,
};

/** Shardback's two hides. */
export const HIDE_COLORS = { stone: 0xc9b58a, ether: 0x9f7bff } as const;

export const HERO_COLORS: Record<HeroKind, { fill: number; edge: number }> = {
  ranger: { fill: 0x3ddc84, edge: 0x0b3d20 },
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
