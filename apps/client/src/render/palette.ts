import type { CreepKind, TowerKind } from '@tdt/protocol';

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
  hero: 0x3ddc84,
  heroRing: 0xffffff,
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

export const CREEP_COLORS: Record<CreepKind, number> = {
  grunt: 0xd9534f,
  archer: 0xf0a04b,
  runner: 0xf5d547,
  brute: 0x9c3b3b,
  wisp: 0x7fe7ff,
  boss: 0xa24bd6,
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
  hero: 0xb6ff9e,
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
  boss: 'Boss',
};

export function hpColor(frac: number): number {
  if (frac > 0.5) return COLORS.hpHigh;
  if (frac > 0.25) return COLORS.hpMid;
  return COLORS.hpLow;
}

export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
