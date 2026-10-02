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
/** Distance from the joystick (one thumb) or the corner pivot (two thumbs) to the skill buttons. */
export const ARC_R = 88;
/** "Skills" button diameter (px): opens the description sheet. */
export const INFO_PX = 44;
/** Gap between the controls and the bottom / side edges (px), on top of the safe-area insets. */
export const EDGE_GAP = 8;
/** Room above the buttons for the skill-learn "+" badges (px). */
export const LEARN_ALLOWANCE = 4;

export type ThumbLayout = 'one' | 'two' | 'twoLeft';
/** Where the one-thumb cluster sits. Two-thumb layouts already pick a side. */
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
  thumbs: ThumbLayout;
  /** One-thumb cluster: left, center or right. Ignored for two-thumb layouts. */
  stickAnchor: StickAnchor;
  /** Map size in tiles and the first safe-zone row. */
  mapW: number;
  mapH: number;
  safeFromY: number;
}

export interface Controls {
  joystick: Circle;
  skills: Record<ControlSlot, Circle>;
  /** Opens the skill description sheet. Sits in a gap the thumbs can reach. */
  skillInfo: Circle;
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
  // The arc hangs a little below the stick centre so the buttons sit in the thumb's sweep,
  // not a reach up into the lanes.
  const arc = { x: joystick.x, y: joystick.y + 10 };
  return {
    joystick,
    skills: {
      Q: onArc(arc, 168, SKILL_PX),
      W: onArc(arc, 126, SKILL_PX),
      R: onArc(arc, 54, SKILL_PX),
      E: onArc(arc, 12, BADGE_PX),
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

function finish(
  parts: { joystick: Circle; skills: Record<ControlSlot, Circle> },
  area: { left: number; right: number },
): Controls {
  const skillInfo = placeSkillInfo(parts.joystick, parts.skills, area);
  const circles = [parts.joystick, ...Object.values(parts.skills), skillInfo];
  const rects = circles.map((c) =>
    rect(c.x - c.r, c.y - c.r - (c === parts.joystick || c === skillInfo ? 0 : LEARN_ALLOWANCE), c.x + c.r, c.y + c.r),
  );
  return { ...parts, skillInfo, rects, top: Math.min(...rects.map((r) => r.top)) };
}

/**
 * A 44 px "Skills" button in the widest gap that still clears the stick and the skill buttons.
 * `area` is the x-range it must stay inside (the screen on a phone, one side margin on a tablet).
 */
function placeSkillInfo(joystick: Circle, skills: Record<ControlSlot, Circle>, area: { left: number; right: number }): Circle {
  const r = INFO_PX / 2;
  const circles = [joystick, ...Object.values(skills)].sort((a, b) => a.x - b.x);
  const y = joystick.y;
  const gaps: { x: number; room: number }[] = [];
  let edge = area.left;
  for (const c of circles) {
    if (c.x + c.r < area.left || c.x - c.r > area.right) continue;
    const leftEdge = Math.max(area.left, edge);
    const room = Math.max(area.left, c.x - c.r) - leftEdge;
    if (room > 0) gaps.push({ x: leftEdge + room / 2, room });
    edge = Math.max(edge, c.x + c.r);
  }
  const tailLeft = Math.max(edge, area.left);
  const tail = area.right - tailLeft;
  if (tail > 0) gaps.push({ x: tailLeft + tail / 2, room: tail });
  gaps.sort((a, b) => b.room - a.room);
  for (const g of gaps) {
    if (g.room < r * 2 + 6) continue;
    const x = Math.min(area.right - r - 2, Math.max(area.left + r + 2, g.x));
    const clear = circles.every((o) => Math.hypot(o.x - x, o.y - y) >= o.r + r + 4);
    if (clear && x - r >= area.left - 0.5 && x + r <= area.right + 0.5) return { x, y, r };
  }
  const inside = circles.filter((c) => c.x >= area.left && c.x <= area.right);
  const top = inside.reduce((a, b) => (a.y - a.r < b.y - b.r ? a : b), inside[0] ?? joystick);
  const x = Math.min(area.right - r - 2, Math.max(area.left + r + 2, top.x));
  return { x, y: top.y - top.r - 8 - r, r };
}

/** Joystick x so the one-thumb cluster (stick plus the skill arc) stays on screen. */
function oneThumbX(w: number, insets: Insets, anchor: StickAnchor): number {
  const probe = oneThumb(0, 0);
  const circles = [probe.joystick, ...Object.values(probe.skills)];
  const minLeft = Math.min(...circles.map((c) => c.x - c.r));
  const maxRight = Math.max(...circles.map((c) => c.x + c.r));
  const lo = insets.left + EDGE_GAP - minLeft;
  const hi = w - insets.right - EDGE_GAP - maxRight;
  const cx = anchor === 'left' ? lo : anchor === 'right' ? hi : w / 2;
  return Math.min(hi, Math.max(lo, cx));
}

function tallControls(input: LayoutInput): Controls {
  const { w, h, insets, thumbs } = input;
  const bottom = h - Math.max(EDGE_GAP, insets.bottom);
  const area = { left: insets.left, right: w - insets.right };
  if (thumbs === 'one') return finish(oneThumb(oneThumbX(w, insets, input.stickAnchor), bottom), area);
  const left = insets.left + EDGE_GAP;
  const right = w - insets.right - EDGE_GAP;
  const mirror = thumbs === 'twoLeft';
  const stickX = mirror ? right - JOY_R : left + JOY_R;
  const pivotX = mirror ? left + 32 : right - 32;
  return finish(twoThumbs(stickX, pivotX, bottom, mirror), area);
}

/** Wide layout on a touch screen: the controls sit in the side margins. */
function wideControls(input: LayoutInput, margin: number): Controls {
  const { w, h, insets, thumbs } = input;
  const bottom = h - Math.max(EDGE_GAP * 2, insets.bottom);
  const parts = (() => {
    // One thumb: the whole cluster in the right margin.
    if (thumbs === 'one') return oneThumb(input.stickAnchor === 'left' ? margin / 2 : w - margin / 2, bottom);
    const mirror = thumbs === 'twoLeft';
    const stickX = mirror ? w - margin / 2 : margin / 2;
    const pivotX = mirror ? insets.left + 48 : w - insets.right - 48;
    return twoThumbs(stickX, pivotX, bottom, mirror);
  })();
  const ax = Object.values(parts.skills).reduce((s, c) => s + c.x, 0) / 4;
  const spans = [
    { left: 0, right: margin },
    { left: w - margin, right: w },
  ].sort((a, b) => Math.abs((a.left + a.right) / 2 - ax) - Math.abs((b.left + b.right) / 2 - ax));
  return finish(parts, spans[0]!);
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
