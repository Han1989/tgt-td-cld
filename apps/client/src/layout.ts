// Screen layout (docs/MOBILE.md §4) as a pure function of the viewport, so it is
// unit-tested without a DOM:
//
// - `tall`: phones held upright (and narrow windows / portrait tablets). A compact
//   one-row top bar, the map fitted to the width under it, and the touch controls
//   drawn over the map's safe zone (forest rows) at the bottom. If the map's
//   gameplay rows would reach under the controls (shorter phones), the camera
//   follows the hero vertically within `followRange`.
// - `wide`: tablets in landscape and desktop. The map is fitted to the height and
//   centred; the HUD sits in the side margins (and the touch controls too, on a
//   touch screen).
// - `rotate`: a phone held sideways; the page asks to rotate to portrait.

/** Top bar height (px, excluding the safe-area inset). Holds 44 px touch targets. */
export const TOP_BAR_H = 44;
/** A viewport whose short side is under this is a phone. */
export const PHONE_MAX_SHORT = 600;
/** Wide layout: each side margin is at least this wide (HUD panels), and the map is padded by WIDE_PAD. */
export const SIDE_MIN = 280;
export const WIDE_PAD = 8;
/** Wide layout needs at least this tile size (px); otherwise the tall layout is used. */
export const WIDE_MIN_TILE = 12;

/** Joystick base radius and knob radius (px). The base is the grab area; full speed is a shorter travel. */
export const JOY_R = 50;
export const KNOB_R = 22;
/** Skill button and E badge diameters (px). E is a real target so the passive can be read. */
export const SKILL_PX = 56;
export const BADGE_PX = 44;
/** Distance from the corner pivot (two thumbs) to the skill buttons. */
export const ARC_R = 88;
/** The floating stick's base radius (px): drawn at rest as a hint, and under the thumb while it steers. */
export const FLOAT_R = 40;
/** Around the stick: the least room (px) between two skill buttons, and between the stick and a button. */
export const SKILL_GAP = 24;
/** Gap between the controls and the bottom / side edges (px), on top of the safe-area insets. */
export const EDGE_GAP = 8;
/** Room above the buttons for the skill-learn "+" badges (px). */
export const LEARN_ALLOWANCE = 4;

/**
 * Controls layout (⚙ → Controls layout), two choices. The stick: `float` (the default) walks the hero from a drag
 * that starts anywhere on the map or the empty part of the control band, with the base under the thumb and a faint
 * resting stick as a hint only; `fixed` is a joystick that stays where it is drawn. The skills: `around` the stick
 * (the default, the one-thumb arc at the bottom, moved by `stickAnchor`), or in the `right` or `left` bottom corner
 * (the two-thumb arc, the stick in the other corner).
 */
export type StickMode = 'float' | 'fixed';
export type SkillsPlace = 'around' | 'right' | 'left';
export const STICK_MODES: readonly StickMode[] = ['float', 'fixed'];
export const SKILL_PLACES: readonly SkillsPlace[] = ['around', 'right', 'left'];
/** Where the skills-around-the-stick cluster sits. The corner layouts already pick a side. */
export type StickAnchor = 'left' | 'center' | 'right';
export type LayoutKind = 'tall' | 'wide' | 'rotate';
export type ControlSlot = 'Q' | 'W' | 'E' | 'R';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface LayoutInput {
  /** Viewport size in CSS px. */
  w: number;
  h: number;
  insets: Insets;
  /** Primary pointer is a finger (phones, tablets). */
  touch: boolean;
  /** The device is held sideways (from the screen orientation, not the viewport). */
  landscape: boolean;
  stick: StickMode;
  skills: SkillsPlace;
  /** Skills around the stick: the cluster sits left, center or right. Ignored for the corner layouts. */
  stickAnchor: StickAnchor;
  /** Map size in tiles and the first safe-zone row. */
  mapW: number;
  mapH: number;
  safeFromY: number;
}

export interface Controls {
  /** The fixed joystick, or the floating stick's resting place (a faint hint; a drag anywhere walks). */
  joystick: Circle;
  /** Floating stick: map drags walk the hero, and the joystick is only where it rests. */
  floating: boolean;
  skills: Record<ControlSlot, Circle>;
  /** Bounding boxes of the joystick and the buttons (learn badges included); taps here never reach the map. */
  rects: Rect[];
  /** Screen y above which the controls never reach (tall layout: the map must keep gameplay above this). */
  top: number;
}

export interface Layout {
  kind: LayoutKind;
  /** Tile size on screen (px). */
  tilePx: number;
  /** The map's screen rect with the camera at rest. */
  map: Rect;
  /** Tall layout: bottom of the top bar (safe-area inset included). */
  topBarBottom: number;
  /** Wide layout: width of each side margin. */
  margin: number;
  /** Touch overlay geometry, or null when there is none (desktop wide layout, rotate screen). */
  controls: Controls | null;
  /** Tall layout: how far (px) the map may scroll up to keep the hero clear of the controls; 0 = static. */
  followRange: number;
  /** Screen y where the map's gameplay rows end (safe zone starts), camera at rest. */
  gameplayBottom: number;
}

export function isPhone(w: number, h: number): boolean {
  return Math.min(w, h) < PHONE_MAX_SHORT;
}

export function computeLayout(input: LayoutInput): Layout {
  const { w, h, insets, touch, mapW, mapH } = input;
  const phone = touch && isPhone(w, h);
  if (phone && input.landscape) {
    return { kind: 'rotate', tilePx: 0, map: rect(0, 0, 0, 0), topBarBottom: 0, margin: 0, controls: null, followRange: 0, gameplayBottom: 0 };
  }

  const wideTile = Math.min((h - 2 * WIDE_PAD) / mapH, (w - 2 * SIDE_MIN) / mapW);
  if (!phone && wideTile >= WIDE_MIN_TILE) {
    const mw = mapW * wideTile;
    const mh = mapH * wideTile;
    const left = (w - mw) / 2;
    const top = (h - mh) / 2;
    const margin = left;
    const controls = touch ? wideControls(input, margin) : null;
    return {
      kind: 'wide',
      tilePx: wideTile,
      map: rect(left, top, left + mw, top + mh),
      topBarBottom: 0,
      margin,
      controls,
      followRange: 0,
      gameplayBottom: top + input.safeFromY * wideTile,
    };
  }

  // Tall: phones fit the width (the camera follows vertically if the map is too tall);
  // portrait tablets and narrow windows fit the whole map.
  const topBarBottom = insets.top + TOP_BAR_H;
  const widthFit = (w - insets.left - insets.right) / mapW;
  const heightFit = (h - topBarBottom) / mapH;
  const tilePx = phone ? widthFit : Math.min(widthFit, heightFit);
  const mw = mapW * tilePx;
  const left = (w - mw) / 2;
  const map = rect(left, topBarBottom, left + mw, topBarBottom + mapH * tilePx);
  const controls = tallControls(input);
  const gameplayBottom = topBarBottom + input.safeFromY * tilePx;
  return {
    kind: 'tall',
    tilePx,
    map,
    topBarBottom,
    margin: left,
    controls,
    followRange: Math.max(0, gameplayBottom - controls.top),
    gameplayBottom,
  };
}

/**
 * Camera offset (px the map scrolls up, 0..followRange) for the tall layout: keeps the hero
 * in the middle of the band between the top bar and the controls, when the map can't show
 * every gameplay row at once.
 */
export function followOffset(layout: Layout, heroY: number | null): number {
  if (layout.followRange <= 0 || heroY === null || !layout.controls) return 0;
  const bandMid = (layout.topBarBottom + layout.controls.top) / 2;
  const heroScreen = layout.map.top + heroY * layout.tilePx;
  return clamp(heroScreen - bandMid, 0, layout.followRange);
}

// ---------------------------------------------------------------------------
// Control geometry
// ---------------------------------------------------------------------------

const deg = (d: number) => (d * Math.PI) / 180;

type Pt = { x: number; y: number };
type Parts = { joystick: Circle; skills: Record<ControlSlot, Circle> };

/** Points on an arc of radius ARC_R around `c`; angles in degrees, 0 = right, 90 = up. */
function onArc(c: Pt, angle: number, size: number): Circle {
  return { x: c.x + ARC_R * Math.cos(deg(angle)), y: c.y - ARC_R * Math.sin(deg(angle)), r: size / 2 };
}

/** Height of the two-thumb pivot (E) above the bottom edge (px). */
const TWO_THUMB_LIFT = 36;
/**
 * The floating stick's corner arc sits a little lower, so R's top stays under the gameplay rows and the whole map
 * still fits a 412 × 839 phone with no panning. Q's lower edge stays above the bottom gap.
 */
const FLOAT_LIFT = 30;
/**
 * Around the stick: W's and R's centres sit this far above the bottom edge, as high as on the first one-thumb arc and
 * no higher, so the whole map still fits a 412 × 839 phone with no panning.
 */
const AROUND_TOP = 111;

/** The stick's radius: the floating stick's base (its resting hint is drawn at that size) or the fixed joystick. */
function stickR(stick: StickMode): number {
  return stick === 'float' ? FLOAT_R : JOY_R;
}

/** The x on `side` (-1 left, 1 right) at height `y` that is at least `d` from every centre `c`. */
function clearX(y: number, side: -1 | 1, keep: { c: Pt; d: number }[]): number {
  let x = side < 0 ? Infinity : -Infinity;
  for (const { c, d } of keep) {
    const dx = Math.sqrt(Math.max(0, d * d - (y - c.y) ** 2));
    x = side < 0 ? Math.min(x, c.x - dx) : Math.max(x, c.x + dx);
  }
  return x;
}

/** The lower on screen of the two points that are `da` from `a` and `db` from `b`. */
function lowerMeet(a: Pt, da: number, b: Pt, db: number): Pt {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const along = (d * d + da * da - db * db) / (2 * d);
  const off = Math.sqrt(Math.max(0, da * da - along * along));
  const ux = (b.x - a.x) / d;
  const uy = (b.y - a.y) / d;
  const mx = a.x + along * ux;
  const my = a.y + along * uy;
  const p = { x: mx - off * uy, y: my + off * ux };
  const q = { x: mx + off * uy, y: my - off * ux };
  return p.y >= q.y ? p : q;
}

/**
 * Skills around the stick (one thumb): W and R over the stick, Q and the E badge at the ends of the arc, every
 * button SKILL_GAP from the stick and from its neighbours. W and R sit no higher than AROUND_TOP; Q and E go as close
 * to the stick as the gaps allow, never under the bottom edge. The arc spreads sideways for the room.
 */
function aroundStick(cx: number, bottom: number, r: number): Parts {
  const joystick = { x: cx, y: bottom - r, r };
  const btn = SKILL_PX / 2;
  const badge = BADGE_PX / 2;
  const y = bottom - AROUND_TOP;
  const dx = Math.sqrt((r + SKILL_GAP + btn) ** 2 - (joystick.y - y) ** 2);
  const W = { x: cx - dx, y, r: btn };
  const R = { x: cx + dx, y, r: btn };
  // Q (and E) touch both the stick's and the top button's keep-out circles, or sit on the bottom edge.
  const end = (top: Circle, size: number, side: -1 | 1): Circle => {
    const keep = [
      { c: joystick, d: r + SKILL_GAP + size },
      { c: top, d: top.r + SKILL_GAP + size },
    ];
    const meet = lowerMeet(joystick, keep[0]!.d, top, keep[1]!.d);
    const ey = Math.min(meet.y, bottom - size);
    return { x: clearX(ey, side, keep), y: ey, r: size };
  };
  return { joystick, skills: { Q: end(W, btn, -1), W, R, E: end(R, badge, 1) } };
}

/**
 * Skills in a corner (two thumbs): the stick near one bottom corner and the skills in a quarter arc around the
 * other corner (E in the corner). `stickX` / `pivotX` are the stick centre and the pivot; `lift` is the pivot's
 * height above the bottom edge.
 */
function inCorner(stickX: number, r: number, pivotX: number, bottom: number, mirror: boolean, lift: number): Parts {
  const joystick = { x: stickX, y: bottom - r, r };
  const pivot = { x: pivotX, y: bottom - lift };
  const at = (a: number, size: number) => onArc(pivot, mirror ? 180 - a : a, size);
  return {
    joystick,
    skills: { Q: at(180, SKILL_PX), W: at(135, SKILL_PX), R: at(90, SKILL_PX), E: { x: pivot.x, y: pivot.y, r: BADGE_PX / 2 } },
  };
}

function finish(parts: Parts, floating: boolean): Controls {
  const circles = [parts.joystick, ...Object.values(parts.skills)];
  const rects = circles.map((c) =>
    rect(c.x - c.r, c.y - c.r - (c === parts.joystick ? 0 : LEARN_ALLOWANCE), c.x + c.r, c.y + c.r),
  );
  return { ...parts, floating, rects, top: Math.min(...rects.map((r) => r.top)) };
}

/** Stick x so the skills-around-the-stick cluster stays on screen. */
function aroundX(w: number, insets: Insets, anchor: StickAnchor, r: number): number {
  const probe = aroundStick(0, 0, r);
  const circles = [probe.joystick, ...Object.values(probe.skills)];
  const minLeft = Math.min(...circles.map((c) => c.x - c.r));
  const maxRight = Math.max(...circles.map((c) => c.x + c.r));
  const lo = insets.left + EDGE_GAP - minLeft;
  const hi = w - insets.right - EDGE_GAP - maxRight;
  const cx = anchor === 'left' ? lo : anchor === 'right' ? hi : w / 2;
  return Math.min(hi, Math.max(lo, cx));
}

function tallControls(input: LayoutInput): Controls {
  const { w, h, insets, stick, skills } = input;
  const bottom = h - Math.max(EDGE_GAP, insets.bottom);
  const floating = stick === 'float';
  const r = stickR(stick);
  if (skills === 'around') return finish(aroundStick(aroundX(w, insets, input.stickAnchor, r), bottom, r), floating);
  const left = insets.left + EDGE_GAP;
  const right = w - insets.right - EDGE_GAP;
  const mirror = skills === 'left';
  const stickX = mirror ? right - r : left + r;
  const pivotX = mirror ? left + 32 : right - 32;
  return finish(inCorner(stickX, r, pivotX, bottom, mirror, floating ? FLOAT_LIFT : TWO_THUMB_LIFT), floating);
}

/** Wide layout on a touch screen: the controls sit in the side margins. */
function wideControls(input: LayoutInput, margin: number): Controls {
  const { w, h, insets, stick, skills } = input;
  const bottom = h - Math.max(EDGE_GAP * 2, insets.bottom);
  const floating = stick === 'float';
  const r = stickR(stick);
  // Around the stick: the whole cluster in one margin (the right one unless the stick is set to the left).
  if (skills === 'around') return finish(aroundStick(input.stickAnchor === 'left' ? margin / 2 : w - margin / 2, bottom, r), floating);
  const mirror = skills === 'left';
  const stickX = mirror ? w - margin / 2 : margin / 2;
  const pivotX = mirror ? insets.left + 48 : w - insets.right - 48;
  return finish(inCorner(stickX, r, pivotX, bottom, mirror, floating ? FLOAT_LIFT : TWO_THUMB_LIFT), floating);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function rect(left: number, top: number, right: number, bottom: number): Rect {
  return { left, top, right, bottom };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
