// Touch input recognition as pure functions (docs/MOBILE.md §5, §8): joystick,
// tap vs drag, smart-cast targeting, drag-to-aim and cancel, snap-to-nearest,
// hold-to-sell, overlay hit tests and radial menu placement. No DOM, so every
// rule here is unit-tested; `touchControls.ts` wires them to pointer events.

import type { SkillSnap } from '@tdt/protocol';
import { clamp, inRect, type Rect } from '../layout';

export interface Pt {
  x: number;
  y: number;
}

/** Finger travel (px) before a press counts as a drag. */
export const TAP_SLOP = 10;
/** Taps snap to the nearest pad / tower / creep within this many px (a 44 pt touch target). */
export const SNAP_PX = 44;
/** Candidates whose distances differ by less than this (px) are a tie: show the picker. */
export const TIE_PX = 6;
/** Joystick dead zone (px of knob travel) and how far ahead of the hero a move goes (tiles). */
export const STICK_DEAD = 8;
export const STICK_AHEAD = 2.5;
/** Resend the move at least this often while the stick is held, or sooner when it turns this much. */
export const STICK_RESEND_MS = 100;
export const STICK_TURN_RAD = 0.25;
/** Drag distance (px) from a skill button that aims at the skill's full range. */
export const AIM_DRAG_PX = 90;
/** Hold Sell this long (ms). */
export const SELL_HOLD_MS = 500;

// ---------------------------------------------------------------------------
// Joystick
// ---------------------------------------------------------------------------

export interface StickVec {
  /** Knob offset from the base centre (px), clamped to the base radius. */
  dx: number;
  dy: number;
  /** 0..1 of the base radius. */
  mag: number;
}

/** Knob offset for a finger at `p` on a joystick centred at `c` with radius `r`. */
export function stickVector(c: Pt, p: Pt, r: number): StickVec {
  let dx = p.x - c.x;
  let dy = p.y - c.y;
  const len = Math.hypot(dx, dy);
  if (len > r) {
    dx = (dx / len) * r;
    dy = (dy / len) * r;
  }
  return { dx, dy, mag: Math.min(1, len / r) };
}

/** Where to send the hero for a stick vector (tile units), or null inside the dead zone. */
export function stickMoveTarget(hero: Pt, v: StickVec, r: number, ahead = STICK_AHEAD): Pt | null {
  const len = Math.hypot(v.dx, v.dy);
  if (len < STICK_DEAD || len === 0) return null;
  // Screen and world axes point the same way (the map is never rotated).
  const reach = ahead * Math.max(0.4, Math.min(1, len / r));
  return { x: hero.x + (v.dx / len) * reach, y: hero.y + (v.dy / len) * reach };
}

/** True when a held stick should send a new move: it turned enough, or the last move is stale. */
export function shouldResendMove(lastDir: number | null, dir: number, lastSentMs: number, nowMs: number): boolean {
  if (lastDir === null) return true;
  const turn = Math.abs(Math.atan2(Math.sin(dir - lastDir), Math.cos(dir - lastDir)));
  return turn > STICK_TURN_RAD || nowMs - lastSentMs >= STICK_RESEND_MS;
}

// ---------------------------------------------------------------------------
// Tap vs drag
// ---------------------------------------------------------------------------

/** Has a press that started at `start` become a drag at `now`? Once a drag, always a drag. */
export function isDrag(start: Pt, now: Pt, wasDrag = false, slop = TAP_SLOP): boolean {
  return wasDrag || Math.hypot(now.x - start.x, now.y - start.y) > slop;
}

// ---------------------------------------------------------------------------
// Skills: smart cast and drag-to-aim
// ---------------------------------------------------------------------------

export interface CastTarget {
  x: number;
  y: number;
  flying: boolean;
}

export interface SmartCastRule {
  /** The skill can hit flying creeps. */
  air: boolean;
  /** A self-buff: always cast on the hero. */
  self?: boolean;
}

export type SmartCast =
  | { type: 'instant' }
  | { type: 'point'; x: number; y: number }
  /** Nothing to hit in range: shake the button, spend nothing. */
  | { type: 'none' };

/**
 * Tap on a skill (smart cast). Self-buffs cast on the hero; other instant skills cast when an
 * enemy they can hit is in reach; point skills aim at the densest group in range (the creep
 * with the most hittable creeps within the skill's radius; ties go to the group nearer the
 * Heart), centred on that group when the centre is still in range.
 */
export function smartCast(hero: Pt, skill: SkillSnap, rule: SmartCastRule, creeps: readonly CastTarget[], heart: Pt): SmartCast {
  if (rule.self) return { type: 'instant' };
  const hittable = creeps.filter((c) => rule.air || !c.flying);
  const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  if (!skill.targeted) {
    const reach = skill.range > 0 ? skill.range : skill.radius;
    return hittable.some((c) => d(c, hero) <= reach) ? { type: 'instant' } : { type: 'none' };
  }
  const inRange = hittable.filter((c) => d(c, hero) <= skill.range);
  if (inRange.length === 0) return { type: 'none' };
  const area = Math.max(1, skill.radius);
  let best: { seed: CastTarget; group: CastTarget[] } | null = null;
  for (const seed of inRange) {
    const group = hittable.filter((o) => d(o, seed) <= area);
    if (
      !best ||
      group.length > best.group.length ||
      (group.length === best.group.length && d(seed, heart) < d(best.seed, heart))
    ) {
      best = { seed, group };
    }
  }
  const { seed, group } = best!;
  const cx = group.reduce((s, c) => s + c.x, 0) / group.length;
  const cy = group.reduce((s, c) => s + c.y, 0) / group.length;
  const centre = { x: cx, y: cy };
  return d(centre, hero) <= skill.range ? { type: 'point', ...centre } : { type: 'point', x: seed.x, y: seed.y };
}

/**
 * Drag-to-aim: the drag vector from the button (px) sets the direction, and its length
 * (up to AIM_DRAG_PX) the distance, as a share of the skill's range.
 */
export function aimPoint(hero: Pt, range: number, drag: Pt, fullPx = AIM_DRAG_PX): Pt {
  const len = Math.hypot(drag.x, drag.y);
  if (len === 0 || range <= 0) return { x: hero.x, y: hero.y };
  const k = (Math.min(1, len / fullPx) * range) / len;
  return { x: hero.x + drag.x * k, y: hero.y + drag.y * k };
}

/** Releasing a drag back on the button (with a little slack) cancels the cast. */
export function isCancelRelease(p: Pt, button: Rect, slack = 6): boolean {
  return inRect({ left: button.left - slack, top: button.top - slack, right: button.right + slack, bottom: button.bottom + slack }, p.x, p.y);
}

// ---------------------------------------------------------------------------
// Map taps: snap to the nearest target
// ---------------------------------------------------------------------------

export type PickKind = 'pad' | 'tower' | 'creep';

export interface Candidate {
  kind: PickKind;
  id: number;
  /** Screen centre (px). */
  at: Pt;
  /** Pads and towers: half the box edge (px). Creeps: body radius (px). */
  half: number;
  shape: 'box' | 'circle';
}

export interface Scored extends Candidate {
  /** Distance from the tap to the candidate's edge (0 inside it), px. */
  d: number;
}

export type TapResult = { type: 'none' } | { type: 'pick'; pick: Scored } | { type: 'tie'; picks: Scored[] };

export function edgeDistance(p: Pt, c: Candidate): number {
  if (c.shape === 'circle') return Math.max(0, Math.hypot(p.x - c.at.x, p.y - c.at.y) - c.half);
  return Math.hypot(Math.max(0, Math.abs(p.x - c.at.x) - c.half), Math.max(0, Math.abs(p.y - c.at.y) - c.half));
}

/**
 * The target a tap at `p` means: the candidate with the nearest edge within `snap` px. When
 * several are within `tie` px of the best, returns them all (up to 4) for a picker.
 */
export function resolveTap(p: Pt, candidates: readonly Candidate[], snap = SNAP_PX, tie = TIE_PX): TapResult {
  const scored = candidates
    .map((c) => ({ ...c, d: edgeDistance(p, c) }))
    .filter((c) => c.d <= snap)
    .sort((a, b) => a.d - b.d || kindOrder(a.kind) - kindOrder(b.kind));
  const first = scored[0];
  if (!first) return { type: 'none' };
  const tied = scored.filter((c) => c.d - first.d < tie);
  if (tied.length > 1) return { type: 'tie', picks: tied.slice(0, 4) };
  return { type: 'pick', pick: first };
}

function kindOrder(k: PickKind): number {
  return k === 'tower' ? 0 : k === 'pad' ? 1 : 2;
}

/** Arrow from the tap towards a candidate, so the picker's rows can be told apart. */
export function arrowTo(from: Pt, to: Pt): string {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  return ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]!;
}

/** Taps inside the control overlay never select anything on the map. */
export function inOverlay(p: Pt, rects: readonly Rect[], controlTop: number | null): boolean {
  if (controlTop !== null && p.y >= controlTop) return true;
  return rects.some((r) => inRect(r, p.x, p.y));
}

// ---------------------------------------------------------------------------
// Hold to sell
// ---------------------------------------------------------------------------

/** Progress (0..1) of a hold that started at `startMs`; `done` once it has lasted `holdMs`. */
export function holdProgress(startMs: number, nowMs: number, holdMs = SELL_HOLD_MS): { progress: number; done: boolean } {
  const progress = clamp((nowMs - startMs) / holdMs, 0, 1);
  return { progress, done: progress >= 1 };
}

// ---------------------------------------------------------------------------
// Radial menus
// ---------------------------------------------------------------------------

export interface RadialBounds {
  /** Visible screen area for the menu (px). */
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** The controls' rects: the menu must not cover any of them. */
  avoid: readonly Rect[];
}

/**
 * Where to centre a radial menu of `extent` px (ring radius + button radius) that belongs to
 * a pad or tower at `anchor`, with `chipH` px of info chip above it: kept on screen and moved
 * up whenever it would overlap the controls.
 */
export function placeRadial(anchor: Pt, extent: number, chipH: number, b: RadialBounds): Pt {
  const x = clamp(anchor.x, b.left + extent, b.right - extent);
  let y = clamp(anchor.y, b.top + extent + chipH, b.bottom - extent);
  for (const r of b.avoid) {
    const box = { left: x - extent, top: y - extent, right: x + extent, bottom: y + extent };
    if (box.left < r.right && r.left < box.right && box.top < r.bottom && r.top < box.bottom) {
      y = Math.min(y, r.top - extent);
    }
  }
  return { x, y: Math.max(y, b.top + extent + chipH) };
}

/** Button centres around a radial menu: `n` buttons, the first at the top, clockwise. */
export function radialSpots(n: number, r: number, startDeg = -90): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = ((startDeg + (i * 360) / n) * Math.PI) / 180;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
}
