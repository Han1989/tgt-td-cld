// Creeps and bosses made in 3D and rendered ahead of time (docs/ART.md §15, V-05c): what the Blender pipeline wrote
// for each kind (tools/blender, `npm run art:3d -- creeps`, from the CC0 KayKit Skeletons and Quaternius monsters in
// the creep table tools/blender/creeps.py), and the pure rules Creep3DRig plays them by. Nothing 3D runs here: a
// creep is a sheet of pictures. Generated files, not edited by hand: <kind>.json and <kind>-match.png in this folder.

import type { CreepKind } from '@tdt/protocol';
/**
 * A frame of the sheet: at (x, y), w × h, trimmed to what it covers; (dx, dy) is where it sits in the frame box every
 * frame shares, so frames swap without moving. (fx, fy): its white twin (the hit flash), on the flinch only.
 */
export interface CreepCell {
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
  fx?: number;
  fy?: number;
}

/** The 2D creep rig's states (render/art/rigs.ts), each a few clip moments. */
export type CreepState = 'walk' | 'idle' | 'attack' | 'hit' | 'death' | 'ability';

export interface CreepMatchLayout {
  file: string;
  /** Sheet px per world px: 4, bosses 3 (the nine sheets fit two 2048 × 2048 pages). */
  res: number;
  w: number;
  h: number;
  /** A walker (its contact shadow baked in), the flyer (its shadow its own sprite) or a boss (an ability). */
  style: 'walker' | 'flyer' | 'boss';
  /** The frame box every frame shares, and the feet in it (sheet px). */
  box: { w: number; h: number; ax: number; ay: number };
  frames: Partial<Record<CreepState, CreepCell[]>> & Record<'walk' | 'idle' | 'hit' | 'death', CreepCell[]>;
  /** The Shardback: its spines' coverage per frame (white), tinted by the hide it wears; none while it dies. */
  hide?: Partial<Record<CreepState, CreepCell[]>>;
  /** World px the body moves over one walk cycle with its planted foot still, or null (a flyer, a hopping blob). */
  walkStride: number | null;
  /** The walk clip's own cycle, ms (the pace when there is no stride). */
  cycleMs: number;
  /** The idle silhouette: its rendered radius (the disc of its area: the creep's radius in tuning), width and height,
   * and its top, world px above the feet (the HP bar goes over it). */
  radius: number;
  width: number;
  height: number;
  top: number | null;
  /** The clips each state shows (for the docs and the showcase). */
  clips: Partial<Record<CreepState, string[]>>;
}

export interface CreepLayout {
  id: CreepKind;
  match: CreepMatchLayout;
  /** The fringe check over every frame of the build (fringe.py): its sample count and the worst shares. */
  checks: { frames: number; samples: number; worstFringe: number; worstHard: number };
}

// ---------------------------------------------------------------------------------------------------------------
// The rig's rules
// ---------------------------------------------------------------------------------------------------------------

/**
 * The 3D death: the death clip, then the fade (Han, 17 Oct 2026). It opens on the flinch frame while the death's flash
 * fades (the flinch is the one frame with a white twin), falls through the death frames, holds the last one and fades
 * out. Longer than the 2D collapse (340 ms; bosses 800), so the fall reads.
 */
export const CREEP_DEATH = {
  creepMs: 480,
  bossMs: 1000,
  /** Share of the death on the flinch frame, its flash fading (the 2D death's flash fades over its first quarter). */
  flinch: 0.2,
  /** Share the fall takes after the flinch; the rest holds the last frame and fades. */
  fall: 0.4,
  /** The fade starts this far in. */
  fadeFrom: 0.55,
} as const;

/** Flash strength at the start of a death (the 2D death's: the hit flash's). */
const DEATH_FLASH = 0.6;

/** What a dying 3D creep shows at progress t (0..1): the flinch or a death frame, its alpha and its flash. Pure. */
export function creepDeathFrame(t: number, n: number): { state: 'hit' | 'death'; i: number; alpha: number; flash: number } {
  const { flinch, fall, fadeFrom } = CREEP_DEATH;
  const alpha = t <= fadeFrom ? 1 : Math.max(0, 1 - (t - fadeFrom) / (1 - fadeFrom));
  if (t < flinch) return { state: 'hit', i: 0, alpha, flash: DEATH_FLASH * (1 - t / flinch) };
  const u = Math.min(1, (t - flinch) / fall);
  return { state: 'death', i: Math.min(n - 1, Math.floor(u * n)), alpha, flash: 0 };
}

/**
 * Walk cycles per second. With a stride (the skeletons, the bosses): the planted foot holds the ground, from the
 * creep's speed in the rig's own px (world px divided by how much larger the creep is drawn: V-04's creep scale).
 * Without one (the Wisp's beat, the Hatchling's hop): the clip's own pace at the kind's speed in tuning, faster or
 * slower with the creep (slowed, hasted). Capped where a faster cadence would only flicker, and never slower than
 * `min`: a boss's stride is about its height and it walks under a tile a second, so on a phone the held foot would
 * make a 5–7 s cycle, a walk in slow motion; there the feet slide a little instead.
 */
export function creepCadence(
  speedTilesPerS: number,
  drawScale: number,
  stride: number | null,
  cycleMs: number,
  nominalSpeed: number,
  max = 4,
  min = 0.5,
): number {
  if (!(speedTilesPerS > 0)) return 0;
  const c = stride && stride > 0 ? (speedTilesPerS * 32) / Math.max(1e-3, drawScale) / stride : (1000 / cycleMs) * (speedTilesPerS / Math.max(1e-3, nominalSpeed));
  return Math.max(min, Math.min(max, c));
}

/** How long an attack's frames play (ms): up to the blow, at most half the cooldown, so the stand shows between. */
export function attackMs(cooldownS: number): number {
  return Math.min(420, cooldownS * 500);
}

/** A boss's ability (Stomp, Hatch, the hide shift): its frames over this long, from the event. */
export const ABILITY_MS = 660;
