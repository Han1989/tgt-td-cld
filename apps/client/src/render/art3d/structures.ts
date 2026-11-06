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
  /** Which page of the sheet (structures-match-<page>.webp). */
  page: number;
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

/** A page of the sheet: its file (lossless WebP, in this folder) and size. */
export interface StructurePage {
  file: string;
  w: number;
  h: number;
  bytes: number;
}

/**
 * A tower variant's turret and reach, as the build measured them (world px of the view, from the tower's ground point):
 * `axis` where its turret turns (its frames' anchor; up is negative), `side` / `down` / `up` how far the base and the
 * turret at every heading reach sideways, toward the camera and up, `reach` its reach on the pad (TOWER_REACH).
 */
export interface StructureTower {
  axis: number;
  side: number;
  down: number;
  up: number;
  reach: number;
  /** Where its base's runes glow (its tier's pillar caps, a branch's braziers), brightest first: the lanterns' places. */
  lamps: number[][];
}

export interface StructureMatchLayout {
  /** Sheet px per world px (2.75: a tower is drawn about 1.8 device px per world px on a 3× phone). */
  res: number;
  /** The camera it was rendered through (render/view.ts CAMERA_PITCH) and the turrets' headings (8, every 45°). */
  pitch: number;
  headings: number;
  pages: StructurePage[];
  /**
   * Every frame by key: `<tower kind>/<1|2|3|branch>/base` and `…/h<0..7>/turret0..3` (the turret at heading k, at rest,
   * then its recoil a third of the way each); `heart/stage0..2` (whole, cracked, ruined) and `heart/flash0..2` (their
   * white twins), `heart/rubble1..2`, `heart/glow` (its light), `heart/fire0..2` (the flames); `portal/body`, `portal/glow`.
   */
  cells: Record<string, StructureCell>;
  /** Each tower variant by `<kind>/<variant>`. */
  towers: Record<string, StructureTower>;
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

/** The turrets' rendered headings on the ground (every 45°, V-08b build 2). */
export const HEADINGS = 8;

/**
 * A tower variant's frame keys: its base, and at each heading (`turret[k]`, k = 0..HEADINGS − 1) its turret at rest and
 * at the three steps of its recoil.
 */
export function towerKeys(kind: TowerKind, variant: string): { base: string; turret: [string, string, string, string][] } {
  const k = `${kind}/${variant}`;
  return {
    base: `${k}/base`,
    turret: Array.from({ length: HEADINGS }, (_, h) => [0, 1, 2, 3].map((f) => `${k}/h${h}/turret${f}`) as [string, string, string, string]),
  };
}

/**
 * Which rendered heading a turret aimed at `screen` (radians, the direction on screen it points: `groundAngle`) shows,
 * and how far its sprite turns in the plane to point there: the ground direction under the screen one (y ÷ cos), the
 * nearest of the HEADINGS (heading k is the ground angle k · 45°, y down), and what is left on screen between that
 * heading as drawn and the aim (at most about ±22.5° at 30°: the lie camera-options.md measured is that small).
 */
export function turretHeading(screen: number, cos: number): { k: number; turn: number } {
  const ground = Math.atan2(Math.sin(screen) / Math.max(1e-6, cos), Math.cos(screen));
  const step = (2 * Math.PI) / HEADINGS;
  const k = (((Math.round(ground / step) % HEADINGS) + HEADINGS) % HEADINGS) as number;
  const drawn = Math.atan2(Math.sin(k * step) * cos, Math.cos(k * step));
  return { k, turn: Math.atan2(Math.sin(screen - drawn), Math.cos(screen - drawn)) };
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
 * Each tower variant's reach on its pad at scale 1, world px of ground from its centre: through the tilted camera
 * (V-08b build 2), the farther of how far its base or its turret at any heading, at rest or in recoil, reaches sideways
 * and how far it reaches down the screen toward its pad's south edge (÷ cos 30°: the pad's half is 48 world px of ground
 * either way), over the drawing's opaque pixels (alpha 200 and up, its soft shadow and glow aside), rounded up to half
 * a world px. Its roof may rise over the ground behind (TOWER_TOP). Measured from structures-match-*.webp (a test keeps
 * it so). `towerScale` (entityScale.ts) stops a tower's phone scale where this reaches its pad's edge (V-07e).
 */
export const TOWER_REACH: Record<TowerKind, Record<string, number>> = {
  arrow: { '1': 26, '2': 28, '3': 29.5, sniper: 43, volley: 45 },
  cannon: { '1': 36, '2': 38, '3': 39.5, mortar: 39.5, shrapnel: 42 },
  frost: { '1': 28, '2': 29.5, '3': 33, blizzard: 29.5, glacier: 43 },
  arcane: { '1': 30.5, '2': 32, '3': 34, prism: 45.5, void: 35.5 },
  flak: { '1': 30.5, '2': 32, '3': 34, hailstorm: 43, skyguard: 42 },
};

/** The 2D towers' reach (the fallback until the sheet is in): drawn TOWER_SIZE (2.4) tiles across, under 40 px a side. */
export const TOWER_2D_REACH = 40;

/** A tower's reach at scale 1 (world px): its 3D variant's, or the 2D art's. */
export function towerReach(kind: TowerKind, tier: number, branch: TowerBranch | null, is3d: boolean): number {
  return is3d ? (TOWER_REACH[kind][towerVariant(tier, branch)] ?? TOWER_2D_REACH) : TOWER_2D_REACH;
}

/**
 * A tower's reach above its ground point at scale 1 (view world px): how far its roof or turret rises up the screen
 * through the tilted camera (V-08b build 2), measured from structures-match-*.webp (a test keeps it so). A tap there is
 * the tower (`WorldRenderer.towerRise`), over the ground behind it. The 2D art stands TOWER_2D_REACH above its point.
 */
export const TOWER_TOP: Record<TowerKind, Record<string, number>> = {
  arrow: { '1': 70, '2': 75, '3': 78, sniper: 90.5, volley: 75 },
  cannon: { '1': 62.5, '2': 66.5, '3': 69, mortar: 60, shrapnel: 63 },
  frost: { '1': 61.5, '2': 64.5, '3': 68, blizzard: 66.5, glacier: 64 },
  arcane: { '1': 53.5, '2': 60, '3': 60, prism: 60.5, void: 62 },
  flak: { '1': 46.5, '2': 49.5, '3': 52, hailstorm: 52, skyguard: 72 },
};

/** How far a tower rises above its ground point at scale 1 (view world px): its 3D variant's, or the 2D art's. */
export function towerTop(kind: TowerKind, tier: number, branch: TowerBranch | null, is3d: boolean): number {
  return is3d ? (TOWER_TOP[kind][towerVariant(tier, branch)] ?? TOWER_2D_REACH) : TOWER_2D_REACH;
}

/**
 * A tower's two lanterns (V-08a) on its 3D body (view world px from its ground point, at scale 1): of its lit runes as
 * the sheet measured them, the one furthest up and left and the one furthest down and right (the two caps on a
 * diagonal, as the 2D art's); null with fewer than two.
 */
export function lanternLamps(lamps: readonly (readonly number[])[] | undefined): [[number, number], [number, number]] | null {
  if (!lamps || lamps.length < 2) return null;
  let a = lamps[0]!;
  let b = lamps[0]!;
  for (const p of lamps) {
    if (p[0]! + p[1]! < a[0]! + a[1]!) a = p;
    if (p[0]! + p[1]! > b[0]! + b[1]!) b = p;
  }
  if (a === b) b = lamps[1]!;
  return [
    [a[0]!, a[1]!],
    [b[0]!, b[1]!],
  ];
}
