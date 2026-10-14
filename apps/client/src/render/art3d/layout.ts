// Heroes made in 3D and rendered ahead of time (docs/ART.md §15): what the Blender pipeline wrote for each one
// (tools/blender, `npm run art:3d -- <hero>`), and the pure rules the rig and the lobby's stage use to play it.
// Nothing 3D runs here: the stage is a video, the match a sheet of pictures. Generated files, not edited by hand:
// <hero>.json (both layouts) and <hero>-match.png (the sheet) in this folder, the stage files in public/stage/.

import type { HeroKind } from '@tdt/protocol';
import ranger from './ranger.json';

/** A cell of the sheet: the frame at (x, y), its white twin (the hit flash) at (fx, fy); sizes are the layer's. */
export interface Cell {
  x: number;
  y: number;
  fx: number;
  fy: number;
}

export interface MatchLayout {
  file: string;
  /** Sheet px per world px. */
  res: number;
  w: number;
  h: number;
  /** The body layer's cell size and where the feet are in it (sheet px). */
  body: { w: number; h: number; feetX: number; feetY: number };
  /** The bow layer's cell size and its pivot, the shoulder (sheet px). */
  bow: { w: number; h: number; pivotX: number; pivotY: number };
  frames: { idle: Cell[]; walk: Cell[]; cast: Cell[] };
  bowFrames: { draw: Cell[]; loose: Cell[] };
  /** Where the bow layer hangs in each body frame: world px from the feet (x right, y down). */
  shoulders: { idle: { x: number; y: number }[]; walk: { x: number; y: number }[]; cast: { x: number; y: number }[] };
  /** World px the body moves over one walk cycle (two steps) with no foot sliding. */
  walkStride: number;
  /** One idle cycle (the breath), ms. */
  idleMs: number;
}

export interface StageLayout {
  /** The video's size (px), frame rate, frame count and loop length. */
  w: number;
  h: number;
  fps: number;
  frames: number;
  loopMs: number;
  /** The hero's feet in the video (px): x, and the ground line under them. */
  feetX: number;
  groundY: number;
  /** The box the hero fills over the whole loop (ink included, the flying arrow left out), video px. */
  figure: { x0: number; y0: number; x1: number; y1: number };
  /** The files in public/stage/: the loop (H.264 MP4, and VP9 WebM for browsers without H.264), its first frame
   * (the poster) and the empty clearing; each with its size and a hash of its bytes (the `?v=` in its URL). */
  files: Record<StageFile, { name: string; bytes: number; hash: string }>;
}

export type StageFile = 'mp4' | 'webm' | 'poster' | 'clearing';

export interface HeroLayout {
  id: string;
  match: MatchLayout;
  stage: StageLayout;
}

/** The heroes made in 3D so far. The Warden and the Arcanist follow in V-05b. */
export const HERO_3D: Partial<Record<HeroKind, HeroLayout>> = { ranger: ranger as HeroLayout };

// ---------------------------------------------------------------------------------------------------------------
// The rig's rules
// ---------------------------------------------------------------------------------------------------------------

/** Frame `i` of `n` for a cycle at `phase` (radians, one cycle per 2π). */
export function cycleFrame(phase: number, n: number): number {
  const tau = Math.PI * 2;
  const u = (((phase % tau) + tau) % tau) / tau;
  return Math.min(n - 1, Math.floor(u * n));
}

/** The draw step (0..steps-1) for a string drawn `draw` (0..1) of full. */
export function drawStep(draw: number, steps: number): number {
  return Math.max(0, Math.min(steps - 1, Math.round(draw * (steps - 1))));
}

/**
 * Walk cycles per second so the planted foot doesn't slide: the hero's ground speed in the rig's own px (world px
 * divided by how much larger the rig is drawn) over the stride, capped where a faster cadence would only flicker.
 * On a phone (heroes drawn about 2.2×) a Ranger at full speed takes about 4 strides a second and his feet hold the
 * ground; where heroes are drawn at their map size (desktop) the cap is reached and the feet slide a little.
 */
export function walkCadence(speedTilesPerS: number, drawScale: number, stride: number, max = 5): number {
  if (!(speedTilesPerS > 0) || !(stride > 0)) return 0;
  const local = (speedTilesPerS * 32) / Math.max(1e-3, drawScale);
  return Math.min(max, local / stride);
}

// ---------------------------------------------------------------------------------------------------------------
// The stage's fit
// ---------------------------------------------------------------------------------------------------------------

export interface StageBox {
  /** The stage's size, CSS px. */
  w: number;
  h: number;
  /** The figure's feet stand on this line (CSS px from the stage's top). */
  ground: number;
  /** The figure may reach up to here (the title's bottom), CSS px from the top. */
  top: number;
  /** Room kept clear at each side, CSS px. */
  side: number;
}

export interface StageFit {
  /** CSS px per video px. */
  scale: number;
  /** Where the video's top-left corner goes, CSS px from the stage's top-left. */
  left: number;
  top: number;
  /** The video covers the whole stage at this fit. */
  covers: boolean;
}

/**
 * Places the stage video so the hero stands on the stage's ground line, centred, as large as fits between the title
 * and the ground and between the sides: the same rule as the 2D figures (`fitStand`), applied to the video's figure
 * box. The clearing still uses the same fit, so switching heroes never moves the background. If the stage is wider
 * or taller than the video at that size the fit still keeps the hero whole; the clearing's CSS shows at the edges.
 */
export function fitStage(s: StageLayout, box: StageBox): StageFit {
  const fig = s.figure;
  const up = s.groundY - fig.y0;
  const half = Math.max(s.feetX - fig.x0, fig.x1 - s.feetX);
  const byHeight = (box.ground - box.top) / Math.max(1, up);
  const byWidth = (box.w / 2 - box.side) / Math.max(1, half);
  const scale = Math.max(0.01, Math.min(byHeight, byWidth));
  const left = box.w / 2 - s.feetX * scale;
  const top = box.ground - s.groundY * scale;
  const covers = left <= 0.5 && top <= 0.5 && left + s.w * scale >= box.w - 0.5 && top + s.h * scale >= box.h - 0.5;
  return { scale, left, top, covers };
}
