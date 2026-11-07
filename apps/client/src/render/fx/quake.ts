// Rampart Slam's lane quake, as drawn (round 8; docs/ART.md §6 "The lane quake"). Pure: where the two fronts are, and
// which crack marks a frame stamps. The sim's `quake` event carries the lane, the progress at the Warden's feet and the
// ticks to the far end; the front's speed is the tuning's (`rampartSlam.quakeSpeed`), so the drawn front passes each
// creep on the tick the sim hits it. `WorldRenderer` stamps the marks through `Effects.quakeCrack` (pooled particles).

import { lanePointAt, type GameMap } from '@tdt/sim';
import { groundAngle, viewCos, worldToScreen, type Pt } from '../view';

type Lane = GameMap['lanes'][number];

/** Tiles between two crack marks along the lane. */
export const QUAKE_MARK_SPACING = 0.7;

/** A quake being drawn: its lane's length, the progress it started at, its speed and when it started (render ms). */
export interface QuakeRun {
  lane: number;
  from: number;
  length: number;
  /** Tiles a second. */
  speed: number;
  startMs: number;
  /** Tiles from `from` of each front's last mark (toward the portal, toward the Heart); the cast point is the Heart-ward
   * front's first mark. */
  stamped: [number, number];
  /** Under reduced motion the whole lane fades in at once (no travel). */
  calm: boolean;
}

export function quakeRun(lane: number, from: number, length: number, speed: number, startMs: number, calm: boolean): QuakeRun {
  return { lane, from: Math.max(0, Math.min(length, from)), length, speed, startMs, stamped: [0, -QUAKE_MARK_SPACING], calm };
}

/** How far each front can travel before its lane ends: toward the portal (`from`), toward the Heart (`length − from`). */
export function frontLimits(run: QuakeRun): [number, number] {
  return [run.from, run.length - run.from];
}

/** One crack mark: its lane progress, which way its front runs (−1 toward the portal, +1 toward the Heart). */
export interface QuakeMark {
  progress: number;
  dir: -1 | 1;
  /** The mark is a front's leading one this frame (it gets the front's glow). */
  lead: boolean;
}

/**
 * The marks this frame stamps at render time `nowMs`, and the run's `stamped` moved on: every `QUAKE_MARK_SPACING`
 * tiles each front has crossed since the last frame, up to the lane's ends. Calm: every mark of the lane at once, on
 * the first frame (they fade where they lie, nothing travels). A front's last mark this frame is its `lead`.
 */
export function quakeMarks(run: QuakeRun, nowMs: number): QuakeMark[] {
  const limits = frontLimits(run);
  const reach = run.calm ? Infinity : Math.max(0, ((nowMs - run.startMs) / 1000) * run.speed);
  const marks: QuakeMark[] = [];
  for (const side of [0, 1] as const) {
    const dir = side === 0 ? -1 : 1;
    const upTo = Math.min(reach, limits[side]);
    let last = -1;
    for (let d = run.stamped[side] + QUAKE_MARK_SPACING; d <= upTo + 1e-9; d += QUAKE_MARK_SPACING) {
      marks.push({ progress: run.from + dir * d, dir, lead: false });
      last = marks.length - 1;
      run.stamped[side] = d;
    }
    if (last >= 0) marks[last]!.lead = true;
  }
  return marks;
}

/** Whether both fronts have reached their lane's ends (the run can be dropped). */
export function quakeDone(run: QuakeRun, nowMs: number): boolean {
  if (run.calm) return run.stamped[1] >= 0;
  const [a, b] = frontLimits(run);
  return ((nowMs - run.startMs) / 1000) * run.speed >= Math.max(a, b);
}

/**
 * A crack mark on the ground (V-08b build 3): its lane point (tiles) and the lane's direction there on the ground
 * (radians). The marks lie in the world's ground plane (squashed by cos(pitch)), so a mark turned by its ground angle is
 * drawn along the lane's screen path: `markOnScreen` says where and at what angle.
 */
export function markOnGround(lane: Lane, progress: number): { x: number; y: number; angle: number } {
  const p = lanePointAt(lane, progress);
  const q = lanePointAt(lane, progress + 0.05);
  const r = lanePointAt(lane, progress - 0.05);
  return { x: p.x, y: p.y, angle: Math.atan2(q.y - r.y, q.x - r.x) };
}

/** A crack mark as drawn: its view point (tiles, before the camera's fit) and its angle on screen (radians). */
export function markOnScreen(lane: Lane, progress: number, cos = viewCos()): Pt & { angle: number } {
  const g = markOnGround(lane, progress);
  const at = worldToScreen(g.x, g.y, 0, cos);
  return { x: at.x, y: at.y, angle: groundAngle(Math.cos(g.angle), Math.sin(g.angle), cos) };
}
