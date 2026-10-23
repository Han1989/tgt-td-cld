// Heroes made in 3D and rendered ahead of time (docs/ART.md §15): what the Blender pipeline wrote for each one
// (tools/blender, `npm run art:3d -- <hero>`, from the Meshy models in the hero table tools/blender/hero.py), and the
// pure rules the rig and the lobby's stage use to play it. Nothing 3D runs here: the stage is a video, the match a
// sheet of pictures. Generated files, not edited by hand: <hero>.json (both layouts) and <hero>-match.png (the sheet)
// in this folder, the stage files in public/stage/.

import type { HeroKind } from '@tdt/protocol';
import arcanist from './arcanist.json';
import ranger from './ranger.json';
import warden from './warden.json';

/** A cell of the sheet: the frame at (x, y), its white twin (the hit flash) at (fx, fy); sizes are the layer's. */
export interface Cell {
  x: number;
  y: number;
  fx: number;
  fy: number;
}

/** A cell's size and its anchor in the cell (sheet px): the feet, or the shoulder the arm layer turns about. */
export interface CellBox {
  w: number;
  h: number;
  ax: number;
  ay: number;
}

/**
 * A layer's box: every frame of it together (where the figure can reach), and each kind's own (`kinds`: its frames
 * are cropped to what they fill, so the Warden's idle cells are not as wide as his slash's; V-06b).
 */
export interface LayerBox extends CellBox {
  kinds?: Record<string, CellBox>;
  /** The arm layer only: which way its weapon points as rendered (radians, y down), so the rig turns it from there. */
  aim?: number;
}

/** The cell box of a layer's frames of one kind: its own, or (a layout from before V-06b) the layer's. */
export function kindBox(layer: LayerBox, kind: string): CellBox {
  return layer.kinds?.[kind] ?? layer;
}

/**
 * The layers a rig draws, back to front: the body (3/4 view; the whole figure, or for the Ranger the figure without
 * its arms), the arm layer (the Ranger's arms and bow in profile, turned at the shoulder towards the target), the
 * head over it (so the bow never covers the face), and the fall (the whole figure dying), shown alone.
 */
export type LayerName = 'body' | 'arm' | 'head' | 'fall';

/** How the rig plays the frames: the 2D rig whose timing it keeps (render/art/entities/<hero>.ts). */
export type RigStyle = 'bow' | 'melee' | 'staff';

export interface Point {
  x: number;
  y: number;
}

export interface MatchLayout {
  file: string;
  /** Sheet px per world px. */
  res: number;
  w: number;
  h: number;
  style: RigStyle;
  layers: Partial<Record<LayerName, LayerBox>> & { body: LayerBox; fall: LayerBox };
  /** Each layer's frames by kind (idle, walk, hit, the hero's attack and cast poses; the head has one per body frame). */
  frames: Partial<Record<LayerName, Record<string, Cell[]>>> & { body: Record<string, Cell[]>; fall: Record<string, Cell[]> };
  /** Points on each body frame, world px from the feet (x right, y down): the shoulder the arm layer or the
   * Warden's slash hangs at, the Arcanist's gem. */
  points: Record<string, Record<string, Point[]>>;
  /** World px the body moves over one walk cycle (two steps) with no foot sliding. */
  walkStride: number;
  /** One idle cycle (the 2D breath), ms. */
  idleMs: number;
  timing: Record<string, number>;
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
  /** The box every hero's loop stays inside (ink included, the flying arrow left out), video px: the same for all
   * three, so the stage places each hero's video alike and switching heroes never moves the clearing. */
  figure: { x0: number; y0: number; x1: number; y1: number };
  /** The box this hero's own loop fills, inside `figure`. */
  own: { x0: number; y0: number; x1: number; y1: number };
  /** How far the hero's crown stands over the ground line in the poster frame, video px: the same for all three (V-06d:
   * the Warden's; weapons, the Arcanist's hat and the Ranger's leaf peak left out). And his size on the stage over his
   * match height. */
  crown: number;
  scale: number;
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

/** The heroes made in 3D: all three, the game's own designs generated in Meshy (V-06b; V-05b's were KayKit's). */
export const HERO_3D: Partial<Record<HeroKind, HeroLayout>> = {
  ranger: ranger as HeroLayout,
  warden: warden as HeroLayout,
  arcanist: arcanist as HeroLayout,
};

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
  return progressFrame(draw, steps);
}

/** Frame `i` of `n` for progress `u` (0..1) through a pose (a wind-up, a swing, a raise). */
export function progressFrame(u: number, n: number): number {
  return Math.max(0, Math.min(n - 1, Math.round(u * (n - 1))));
}

/**
 * Walk cycles per second so the planted foot doesn't slide: the hero's ground speed in the rig's own px (world px
 * divided by how much larger the rig is drawn) over the stride, capped where a faster cadence would only flicker.
 * On a phone (heroes drawn about 2.2×) a Ranger at full speed takes about 2 running strides a second and his feet
 * hold the ground; drawn at his map size (desktop) about 4.7.
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
 * CSS px the rendered hero's top stays below the stage box's `top`. The stage lets a 2D figure's thin tip (a blade, a
 * staff's gem) reach 8 px up behind the title's last line (heroStage.ts); a rendered hero's top is his hood, a solid
 * shape that would sit on the letters, so it stays under the line wherever the video still covers the stage at that
 * size (on the shortest stages, a short phone's home card 190 px tall, it can't, and the hood may reach up to the
 * line, as a 2D figure may).
 */
export const STAGE_TITLE_CLEAR = 8;

/**
 * Places the stage video so the hero stands on the stage's ground line, as large as fits between the title and the
 * ground and between the sides, the box his whole loop fills (the bow drawn, the arrow loosed) centred: the same rule
 * as the 2D figures (`fitStand`), applied to the video's figure box. Where the video is only just wide enough (a short,
 * wide stage), centring the box would leave a sliver of the stage bare, so the video slides sideways as far as
 * covering needs, never so far that the hero leaves the room between the sides. The clearing still uses the same
 * fit, so switching heroes never moves the background. If the stage is wider or taller than the video at that size
 * the fit still keeps the hero whole; the clearing's CSS shows at the edges.
 */
export function fitStage(s: StageLayout, box: StageBox): StageFit {
  const fig = s.figure;
  const up = s.groundY - fig.y0;
  const half = (fig.x1 - fig.x0) / 2;
  const mid = (fig.x0 + fig.x1) / 2;
  const room = (box.ground - box.top) / Math.max(1, up);
  const clear = (box.ground - box.top - STAGE_TITLE_CLEAR) / Math.max(1, up);
  // The least scale at which the video still covers the stage (sliding sideways as far as it may).
  const cover = Math.max(box.w / s.w, box.ground / s.groundY, (box.h - box.ground) / Math.max(1, s.h - s.groundY));
  const byHeight = clear >= cover ? clear : Math.min(room, cover);
  const byWidth = (box.w / 2 - box.side) / Math.max(1, half);
  const scale = Math.max(0.01, Math.min(byHeight, byWidth));
  const centred = box.w / 2 - mid * scale;
  // Slide to cover (the video's left edge at or before the stage's, its right edge at or past the stage's), then
  // keep the hero whole between the sides, which wins.
  const slack = box.w - s.w * scale;
  const covering = slack <= 0 ? Math.min(0, Math.max(slack, centred)) : centred;
  const left = Math.min(box.w - box.side - fig.x1 * scale, Math.max(box.side - fig.x0 * scale, covering));
  const top = box.ground - s.groundY * scale;
  const covers = left <= 0.5 && top <= 0.5 && left + s.w * scale >= box.w - 0.5 && top + s.h * scale >= box.h - 0.5;
  return { scale, left, top, covers };
}
