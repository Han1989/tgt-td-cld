// Touch input recognition as pure functions (docs/MOBILE.md §5, §8): joystick and
// the floating stick, tap vs drag, smart-cast targeting, drag-to-aim and cancel,
// snap-to-nearest, hold-to-sell, tap-to-build vs hold-to-preview, taps that count
// as taps when a frame is late, overlay hit tests and radial menu placement. No DOM, so every rule here is unit-tested; `touchControls.ts`
// wires them to pointer events.

import type { SkillSnap } from '@tdt/protocol';
import { clamp, FLOAT_R, inRect, type Rect } from '../layout';

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
/**
 * Joystick feel (px of finger travel from the base centre).
 * `STICK_DEAD` is the wobble that does not walk. `STICK_FULL` is a full push: the base is larger
 * than this, so the thumb does not have to reach the rim. `STICK_AHEAD` is how far ahead of the
 * hero a full push aims (tiles).
 */
export const STICK_DEAD = 5;
export const STICK_FULL = 22;
export const STICK_AHEAD = 2.5;
/**
 * Stick feel presets (⚙ → Stick feel). `dead` is the wobble that does not walk; `full` is the
 * finger travel that already means full speed. Normal is the default. The base stays 50 px.
 */
export const STICK_FEELS = {
  light: { dead: 4, full: 16 },
  normal: { dead: STICK_DEAD, full: STICK_FULL },
  firm: { dead: 10, full: 36 },
} as const;
export type StickFeelName = keyof typeof STICK_FEELS;
export type StickFeel = (typeof STICK_FEELS)[StickFeelName];
/** Resend the move at least this often while the stick is held, or sooner when it turns this much. */
export const STICK_RESEND_MS = 100;
export const STICK_TURN_RAD = 0.25;
/** Drag distance (px) from a skill button that aims at the skill's full range. */
export const AIM_DRAG_PX = 90;
/** Hold Sell this long (ms). */
export const SELL_HOLD_MS = 500;
/** Hold a still finger on the map this long (ms) to ping. A drag cancels it. */
export const PING_HOLD_MS = 450;
/** Hold a build button this long (ms) to preview the tower on its pad. A quicker tap builds. */
export const BUILD_PREVIEW_MS = 300;
/** Hold a skill button this long (ms), without dragging, to open its description. A shorter tap casts. */
export const SKILL_INFO_MS = 380;
/**
 * A frame this long (ms) after the one before it follows a stall. A hold is not decided on that frame: a lift
 * queued during the stall has not been handled yet, so the next frame decides.
 */
export const HITCH_MS = 100;
/** Floating stick: the base's radius (px, `layout.ts`). It is drawn this size, and trails the thumb once it goes further. */
export { FLOAT_R };

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
export function stickMoveTarget(hero: Pt, v: StickVec, r: number, ahead = STICK_AHEAD, feel: StickFeel = STICK_FEELS.normal): Pt | null {
  const len = Math.hypot(v.dx, v.dy);
  if (len < feel.dead || len === 0) return null;
  // A short drag is already a full lead. The base radius is only the grab area.
  const full = Math.min(Math.max(1, r), feel.full);
  const push = Math.min(1, (len - feel.dead) / Math.max(1, full - feel.dead));
  const reach = ahead * (0.65 + 0.35 * push);
  // Screen and world axes point the same way (the map is never rotated).
  return { x: hero.x + (v.dx / len) * reach, y: hero.y + (v.dy / len) * reach };
}

/**
 * Where to draw the knob. Finger travel is amplified so a push that has already reached full
 * speed looks like a full push, and the knob still stays inside the base.
 */
export function stickKnobOffset(v: StickVec, radius: number, full: number = STICK_FULL): Pt {
  const len = Math.hypot(v.dx, v.dy);
  if (len === 0 || radius <= 0) return { x: 0, y: 0 };
  const shown = Math.min(radius, (len / Math.max(1, full)) * radius * 0.92);
  return { x: (v.dx / len) * shown, y: (v.dy / len) * shown };
}

/** True when a held stick should send a new move: it turned enough, or the last move is stale. */
export function shouldResendMove(lastDir: number | null, dir: number, lastSentMs: number, nowMs: number): boolean {
  if (lastDir === null) return true;
  const turn = Math.abs(Math.atan2(Math.sin(dir - lastDir), Math.cos(dir - lastDir)));
  return turn > STICK_TURN_RAD || nowMs - lastSentMs >= STICK_RESEND_MS;
}

// ---------------------------------------------------------------------------
// Floating stick
// ---------------------------------------------------------------------------

/**
 * The floating stick's base after the thumb moved to `finger`: where it was, or, once the thumb is further than
 * `radius` from it, pulled along so the thumb sits on its rim. Reversing direction is then a short move.
 */
export function trailBase(base: Pt, finger: Pt, radius: number = FLOAT_R): Pt {
  const dx = finger.x - base.x;
  const dy = finger.y - base.y;
  const len = Math.hypot(dx, dy);
  if (len <= radius || len === 0) return { x: base.x, y: base.y };
  const k = (len - radius) / len;
  return { x: base.x + dx * k, y: base.y + dy * k };
}

/** One step of the floating stick: the trailed base and the knob vector for a thumb at `finger`. */
export function floatStick(base: Pt, finger: Pt, radius: number = FLOAT_R): { base: Pt; vec: StickVec } {
  const next = trailBase(base, finger, radius);
  return { base: next, vec: stickVector(next, finger, radius) };
}

/**
 * What a touch on the map is, as it moves. It stays a `press` (a tap, or a ping once held still) until it moves past
 * the tap slop; then, with the floating stick, it becomes the `stick` (its base where the touch started), and with a
 * fixed stick a `drag` that does nothing. Distance decides, never time, so a late frame cannot turn a drag into a tap.
 * `stickFree` is false while another finger already steers.
 */
export function mapTouchKind(start: Pt, now: Pt, was: MapTouchKind, floating: boolean, stickFree: boolean): MapTouchKind {
  if (was !== 'press') return was;
  if (!isDrag(start, now)) return 'press';
  return floating && stickFree ? 'stick' : 'drag';
}
export type MapTouchKind = 'press' | 'stick' | 'drag';

// ---------------------------------------------------------------------------
// Press length from the events' own timestamps
// ---------------------------------------------------------------------------

/**
 * How long a press lasted (ms), from its pointerdown and pointerup `event.timeStamp`s. Those are when the finger went
 * down and up, not when the handlers ran, so a stalled page does not stretch a tap into a hold.
 */
export function pressLength(downStamp: number, upStamp: number): number {
  return Math.max(0, upStamp - downStamp);
}

/**
 * A frame's verdict on a held press: it has lasted `holdMs` since its down stamp, and this frame did not come
 * straight after a stall (`frameGapMs` > HITCH_MS), when the lift may still be queued.
 */
export function holdReached(downStamp: number, nowMs: number, frameGapMs: number, holdMs: number): boolean {
  return nowMs - downStamp >= holdMs && frameGapMs <= HITCH_MS;
}

export type SkillRelease =
  /** A tap: smart cast. `closeSheet` when a late frame opened the description although the press was short. */
  | { type: 'cast'; closeSheet: boolean }
  /** A tap while the description card was already open: show that skill's row, cast nothing. */
  | { type: 'showRow' }
  /** A real hold: the description stays (or opens) at this skill, nothing is cast. */
  | { type: 'read' }
  /** A drag released away from the button: cast where it aimed. */
  | { type: 'aimCast' }
  | { type: 'none' };

/**
 * Lifting a finger from a skill button. Tap or hold is decided here, from the press's real length: a description
 * that opened only because a frame was late is closed again and the skill is cast.
 */
export function skillRelease(
  p: { pressMs: number; drag: boolean; sheetWasOpen: boolean; infoOpened: boolean; cancel: boolean },
  holdMs = SKILL_INFO_MS,
): SkillRelease {
  if (p.drag) return p.cancel ? { type: 'none' } : { type: 'aimCast' };
  if (p.pressMs >= holdMs) return { type: 'read' };
  if (p.sheetWasOpen) return { type: 'showRow' };
  return { type: 'cast', closeSheet: p.infoOpened };
}

/** Lifting a still finger from the map pings once it was held `holdMs`. A drag never pings. */
export function pingRelease(pressMs: number, dragged: boolean, holdMs = PING_HOLD_MS): boolean {
  return !dragged && pressMs >= holdMs;
}

// ---------------------------------------------------------------------------
// Tap vs drag
// ---------------------------------------------------------------------------

/** Has a press that started at `start` become a drag at `now`? Once a drag, always a drag. */
export function isDrag(start: Pt, now: Pt, wasDrag = false, slop = TAP_SLOP): boolean {
  return wasDrag || Math.hypot(now.x - start.x, now.y - start.y) > slop;
}

/**
 * A map press that has not moved. `progress` grows 0..1 over `holdMs` (the ring under the finger); `ping` once it
 * has been held that long, and the ping goes out when the finger lifts (`pingRelease`). Any drag cancels it
 * (progress stays 0), so a swipe, or the floating stick, never pings.
 */
export function mapPing(elapsedMs: number, dragged: boolean, holdMs = PING_HOLD_MS): { progress: number; ping: boolean } {
  if (dragged || elapsedMs <= 0) return { progress: 0, ping: false };
  const progress = clamp(elapsedMs / holdMs, 0, 1);
  return { progress, ping: elapsedMs >= holdMs };
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

/**
 * Progress (0..1) of a hold that started at `startMs`; `done` once it has lasted `holdMs`. The frame loop only sells
 * on a frame that is not straight after a stall (`holdReached`), and a lift sells only after a real hold (`pressLength`).
 */
export function holdProgress(startMs: number, nowMs: number, holdMs = SELL_HOLD_MS): { progress: number; done: boolean } {
  const progress = clamp((nowMs - startMs) / holdMs, 0, 1);
  return { progress, done: progress >= 1 };
}

/**
 * A press on a build button, `elapsedMs` after the finger went down. Held past `holdMs` it shows the
 * preview, and lifting then does not build. A quick tap that did not drag builds on release. At release,
 * `elapsedMs` is the press's real length (`pressLength`), so a preview a late frame opened still builds.
 */
export function buildPress(elapsedMs: number, dragged: boolean, holdMs = BUILD_PREVIEW_MS): { preview: boolean; build: boolean } {
  const preview = elapsedMs >= holdMs;
  return { preview, build: !preview && !dragged };
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

/** A radial menu's buttons on screen: the ring's centre x and the top and bottom edges of its buttons (px). */
export interface RingSpan {
  x: number;
  top: number;
  bottom: number;
}

/** Gap between a radial menu's info chip and its buttons, and between the chip and the screen edge (px). */
export const CHIP_GAP = 4;

/**
 * Where a radial menu's info chip goes (its top-left, px), from its measured size: centred over the ring and
 * clamped inside the screen by its real half-width, its bottom edge just above the ring's top buttons. When there
 * is no room above (a top-row tower), it goes just below the ring's bottom buttons, clear of the controls. Either
 * way it never covers a ring button; only a screen too short for both falls back to the top of the screen.
 */
export function placeChip(ring: RingSpan, size: { w: number; h: number }, b: RadialBounds): Pt {
  const x = clamp(ring.x - size.w / 2, b.left + CHIP_GAP, b.right - CHIP_GAP - size.w);
  const above = ring.top - CHIP_GAP - size.h;
  if (above >= b.top + CHIP_GAP) return { x, y: above };
  const below = ring.bottom + CHIP_GAP;
  const box = { left: x, top: below, right: x + size.w, bottom: below + size.h };
  const clear = (r: Rect) => box.right <= r.left || r.right <= box.left || box.bottom <= r.top || r.bottom <= box.top;
  if (box.bottom <= b.bottom - CHIP_GAP && b.avoid.every(clear)) return { x, y: below };
  // No clear room on either side: below the ring over the controls (the chip takes no touches), else at the top.
  return box.bottom <= b.bottom ? { x, y: below } : { x, y: b.top + CHIP_GAP };
}

/** Button centres around a radial menu: `n` buttons, the first at the top, clockwise. */
export function radialSpots(n: number, r: number, startDeg = -90): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = ((startDeg + (i * 360) / n) * Math.PI) / 180;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
}
