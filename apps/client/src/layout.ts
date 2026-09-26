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

/** Joystick base radius and knob radius (px). */
export const JOY_R = 50;
export const KNOB_R = 22;
/** Skill button and E badge diameters (px). */
export const SKILL_PX = 52;
export const BADGE_PX = 34;
/** Distance from the joystick (one thumb) or the corner pivot (two thumbs) to the skill buttons. */
export const ARC_R = 84;
/** Gap between the controls and the bottom / side edges (px), on top of the safe-area insets. */
export const EDGE_GAP = 8;
/** Room above the buttons for the skill-learn "+" badges (px). */
export const LEARN_ALLOWANCE = 4;

export type ThumbLayout = 'one' | 'two' | 'twoLeft';
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
  thumbs: ThumbLayout;
  /** Map size in tiles and the first safe-zone row. */
  mapW: number;
  mapH: number;
  safeFromY: number;
}

export interface Controls {
  joystick: Circle;
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

/** Points on an arc of radius ARC_R around `c`; angles in degrees, 0 = right, 90 = up. */
function onArc(c: { x: number; y: number }, angle: number, size: number): Circle {
  return { x: c.x + ARC_R * Math.cos(deg(angle)), y: c.y - ARC_R * Math.sin(deg(angle)), r: size / 2 };
}

/** One thumb: joystick with Q / W / R arcing over it and the E badge at the right end of the arc. */
function oneThumb(cx: number, bottom: number): { joystick: Circle; skills: Record<ControlSlot, Circle> } {
  const joystick = { x: cx, y: bottom - JOY_R, r: JOY_R };
  return {
    joystick,
    skills: {
      Q: onArc(joystick, 172, SKILL_PX),
      W: onArc(joystick, 130, SKILL_PX),
      R: onArc(joystick, 50, SKILL_PX),
      E: onArc(joystick, 8, BADGE_PX),
    },
  };
}

/**
 * Two thumbs: the joystick near one bottom corner and the skills in a quarter arc around the
 * other corner (E in the corner). `stickX` / `pivotX` are the joystick centre and the pivot.
 */
function twoThumbs(stickX: number, pivotX: number, bottom: number, mirror: boolean): { joystick: Circle; skills: Record<ControlSlot, Circle> } {
  const joystick = { x: stickX, y: bottom - JOY_R, r: JOY_R };
  const pivot = { x: pivotX, y: bottom - 36 };
  const at = (a: number, size: number) => onArc(pivot, mirror ? 180 - a : a, size);
  return {
    joystick,
    skills: { Q: at(180, SKILL_PX), W: at(135, SKILL_PX), R: at(90, SKILL_PX), E: { x: pivot.x, y: pivot.y, r: BADGE_PX / 2 } },
  };
}

function finish(parts: { joystick: Circle; skills: Record<ControlSlot, Circle> }): Controls {
  const circles = [parts.joystick, ...Object.values(parts.skills)];
  const rects = circles.map((c) => rect(c.x - c.r, c.y - c.r - (c === parts.joystick ? 0 : LEARN_ALLOWANCE), c.x + c.r, c.y + c.r));
  return { ...parts, rects, top: Math.min(...rects.map((r) => r.top)) };
}

function tallControls(input: LayoutInput): Controls {
  const { w, h, insets, thumbs } = input;
  const bottom = h - Math.max(EDGE_GAP, insets.bottom);
  if (thumbs === 'one') return finish(oneThumb(w / 2, bottom));
  const left = insets.left + EDGE_GAP;
  const right = w - insets.right - EDGE_GAP;
  const mirror = thumbs === 'twoLeft';
  const stickX = mirror ? right - JOY_R : left + JOY_R;
  const pivotX = mirror ? left + 32 : right - 32;
  return finish(twoThumbs(stickX, pivotX, bottom, mirror));
}

/** Wide layout on a touch screen: the controls sit in the side margins. */
function wideControls(input: LayoutInput, margin: number): Controls {
  const { w, h, insets, thumbs } = input;
  const bottom = h - Math.max(EDGE_GAP * 2, insets.bottom);
  // One thumb: the whole cluster in the right margin.
  if (thumbs === 'one') return finish(oneThumb(w - margin / 2, bottom));
  const mirror = thumbs === 'twoLeft';
  const stickX = mirror ? w - margin / 2 : margin / 2;
  const pivotX = mirror ? insets.left + 48 : w - insets.right - 48;
  return finish(twoThumbs(stickX, pivotX, bottom, mirror));
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
