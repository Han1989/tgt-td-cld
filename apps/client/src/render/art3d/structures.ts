// The towers, the Heart and the portals made in 3D and rendered ahead of time (docs/ART.md §15, V-05d; the game's own
// Meshy models since V-06l): what the Blender pipeline wrote (tools/blender, `npm run art:3d -- structures`, the
// structure table tools/blender/structures.py: the towers' Meshy bodies, turrets and branch turrets with the kit's
// additions, the Heart and the portals), and the pure rules Tower3DRig and the Heart's and portals' 3D views play
// them by. Nothing 3D runs here: they are one sheet of pictures. Generated files, not edited by
// hand: structures.json and structures-match.webp in this folder.

import type { TowerBranch, TowerKind } from '@tdt/protocol';

/**
 * A frame of the sheet: at (x, y), w × h, trimmed to what it covers, and its anchor (ax, ay, sheet px from the cell's
 * top left): the world point it stands on (a tower's centre, its turret's pivot, the Heart's or a portal's point on
 * the map). `res`: its own sheet px per world px when it is not the sheet's (the glow layers, kept at half).
 */
export interface StructureCell {
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  res?: number;
}

/** A point of a building as drawn: world px right and down from its anchor. */
export interface StructurePoint {
  x: number;
  y: number;
}

export interface StructureMatchLayout {
  file: string;
  /** Sheet px per world px (3, as the bosses': every frame fits one 2048 × 2048 page). */
  res: number;
  w: number;
  h: number;
  /**
   * Every frame by key: `<tower kind>/<1|2|3|branch>/base` and `…/turret0..3` (at rest, then its recoil a third of
   * the way each); `heart/stage0..2` (whole, cracked, ruined) and `heart/flash0..2` (their white twins),
   * `heart/rubble1..2`, `heart/glow` (its light), `heart/fire0..2` (the flames); `portal/body`, `portal/glow`.
   */
  cells: Record<string, StructureCell>;
  heart: { points: { chest: StructurePoint; keep: StructurePoint } };
  portal: { points: { opening: StructurePoint } };
}

export interface StructuresLayout {
  id: 'structures';
  match: StructureMatchLayout;
  /** The fringe check over every frame of the build (fringe.py): how many, its samples, the worst shares, and each
   * frame's (the share of fringe pixels on its silhouette, of hard alpha steps). */
  checks: { frames: number; samples: number; worstFringe: number; worstHard: number; byFrame: Record<string, { fringe: number; hard: number }> };
}

/** The variant of a tower kind a tier and branch show: '1', '2', '3' or the branch (the fourth tier). */
export function towerVariant(tier: number, branch: TowerBranch | null): string {
  return branch ?? String(Math.max(1, Math.min(3, tier)));
}

/** A tower variant's frame keys: its base, and its turret at rest and at the three steps of its recoil. */
export function towerKeys(kind: TowerKind, variant: string): { base: string; turret: [string, string, string, string] } {
  const k = `${kind}/${variant}`;
  return { base: `${k}/base`, turret: [`${k}/turret0`, `${k}/turret1`, `${k}/turret2`, `${k}/turret3`] };
}

/** The renderer's biggest recoil kick, px (world.ts: RECOIL_PX × 1.2, the 2D gun's slide). */
export const RECOIL_MAX = 4.8;

/**
 * Which turret frame a recoil kick shows: 0 at rest, 3 at the full kick. The renderer eases the kick back from its
 * peak over 140 ms, so the frames run 3, 2, 1, 0 after a shot.
 */
export function recoilFrame(kick: number): 0 | 1 | 2 | 3 {
  const f = Math.round((Math.max(0, kick) / RECOIL_MAX) * 3);
  return Math.min(3, f) as 0 | 1 | 2 | 3;
}

/** The flames over the burning Heart: which of its three frames shows at `now` (a new one every FLICKER_MS, never the
 * same twice in a row), and its brightness (0.75..1). Pure: the same moment gives the same flame. */
export const FLICKER_MS = 110;

export function flameFrame(now: number): { i: number; alpha: number } {
  const step = Math.floor(Math.max(0, now) / FLICKER_MS);
  // 0 1 2, 1 2 0, 2 0 1, …: one on each step, and across blocks two on, so never the same twice in a row.
  const i = (step + Math.floor(step / 3)) % 3;
  const h = Math.imul(step ^ 0x5bd1e995, 0x27d4eb2d) >>> 0;
  return { i, alpha: 0.75 + 0.25 * (((h >>> 16) % 1000) / 1000) };
}

/**
 * Each tower variant's reach at scale 1, world px from its centre: the farther of its base's half width and its
 * turret's radius at rest or in recoil (the turret turns), over the drawing's opaque pixels (alpha 200 and up, its soft
 * shadow and glow aside), rounded up to half a world px. Measured from structures-match.webp (a test keeps it so).
 * `towerScale` (entityScale.ts) stops a tower's phone scale where this reaches its pad's edge (V-07e).
 */
export const TOWER_REACH: Record<TowerKind, Record<string, number>> = {
  arrow: { '1': 26, '2': 28, '3': 29, sniper: 42.5, volley: 45 },
  cannon: { '1': 35.5, '2': 39, '3': 39.5, mortar: 39.5, shrapnel: 42 },
  frost: { '1': 28, '2': 30, '3': 33, blizzard: 30, glacier: 43 },
  arcane: { '1': 30, '2': 37, '3': 34, prism: 46, void: 35.5 },
  flak: { '1': 30, '2': 32, '3': 34, hailstorm: 43.5, skyguard: 42 },
};

/** The 2D towers' reach (the fallback until the sheet is in): drawn TOWER_SIZE (2.4) tiles across, under 40 px a side. */
export const TOWER_2D_REACH = 40;

/** A tower's reach at scale 1 (world px): its 3D variant's, or the 2D art's. */
export function towerReach(kind: TowerKind, tier: number, branch: TowerBranch | null, is3d: boolean): number {
  return is3d ? (TOWER_REACH[kind][towerVariant(tier, branch)] ?? TOWER_2D_REACH) : TOWER_2D_REACH;
}
