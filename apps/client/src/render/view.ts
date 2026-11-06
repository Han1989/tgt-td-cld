// The tilted camera (V-08b, Han's pick of 6 Nov 2026: B, 30° from straight down; docs/ART.md §16 "The camera"): one
// orthographic camera looking up the map from the south, the map's +y toward the bottom of the screen as before. Pure,
// so every conversion here is unit-tested.
//
// At any pitch the ground maps onto the screen affinely: x unchanged, y × cos(pitch); a point z world px above the
// ground is drawn z × sin(pitch) higher. This is the mapping "before the camera's own fit and zoom": the camera
// (input/camera.ts) works in these view px and scales and moves them onto the screen.
//
// - Ground space: the plate, the pads' tints, the light pools, every ring and circle on the ground and the shadows are
//   drawn in world px under one container squashed by cos(pitch) (`WorldRenderer`'s ground plane), or as ellipses
//   (`groundEllipse`) where they hang off an upright sprite.
// - Billboards: heroes, creeps, towers, the Heart, the portals and projectiles stand upright, unsquashed, at their
//   ground point's view position (`worldToScreen`), drawn back to front by `depth`.
// - Taps land on the ground plane (`screenToWorld` / `screenToTile`, the inverse at z 0).
//
// The pitch is one constant: one camera in every build (V-08b build 3 removed the browser tests' `?pitch=0`).
//
// Things that fall or rise (V-08b build 3): their height is a screen offset over their ground point's view position
// (`overGround`), so a meteor or an arrow falls straight down the screen onto the point it lands on, and the effects
// that take a ground point and a height in world px (`liftToGround`) land where the ground is drawn.

import { TILE_PX } from '@tdt/sim';

/** The camera's tilt from straight down (degrees): Han's pick B (docs/art/camera-options.md). */
export const CAMERA_PITCH = 30;

/** World px a pad's top stands over the ground (the plate's `padH`, tools/blender/tdt3d/map.py PAD_H; a test checks). */
export const PAD_TOP = 8;

const pitchDeg = CAMERA_PITCH;
const cosP = Math.cos((CAMERA_PITCH * Math.PI) / 180);
const sinP = Math.sin((CAMERA_PITCH * Math.PI) / 180);

/** The pitch in use (degrees). */
export function viewPitch(): number {
  return pitchDeg;
}

/** cos(pitch): how tall one world px of ground is on screen, before the camera's zoom. */
export function viewCos(): number {
  return cosP;
}

/** sin(pitch): how high one world px of height is drawn. */
export function viewSin(): number {
  return sinP;
}

/** cos of a pitch in degrees (the layout takes a pitch so its tests can ask for any). */
export function pitchCos(deg: number = pitchDeg): number {
  return deg === pitchDeg ? cosP : Math.cos((deg * Math.PI) / 180);
}

export interface Pt {
  x: number;
  y: number;
}

/**
 * A ground point (x, y) with a height z above it, all in the same units (world px, or tiles), to the view: x unchanged,
 * y · cos(pitch) − z · sin(pitch). Before the camera's own fit and zoom.
 */
export function worldToScreen(x: number, y: number, z = 0, cos = cosP, sin = sinP): Pt {
  return { x, y: y * cos - z * sin };
}

/** The inverse of `worldToScreen` at z 0: a view point to the ground point under it (taps land on the ground). */
export function screenToWorld(x: number, y: number, cos = cosP): Pt {
  return { x, y: cos > 0 ? y / cos : y };
}

/** A view point in world px to the ground tile under it (tiles, fractional). */
export function screenToTile(x: number, y: number, cos = cosP): Pt {
  const w = screenToWorld(x, y, cos);
  return { x: w.x / TILE_PX, y: w.y / TILE_PX };
}

/** A ground y (world px or tiles) to its view y: `worldToScreen`'s y at z 0. */
export function viewY(y: number, cos = cosP): number {
  return y * cos;
}

/**
 * The draw order of an upright thing standing on the ground at `y` (tiles or world px): further up the map draws first,
 * so a larger depth is drawn over a smaller one. `lift` (same units) puts something just over what stands where it is
 * (a projectile over the tower it left).
 */
export function depth(y: number, lift = 0): number {
  return y + lift;
}

/** A circle of radius `r` on the ground, as drawn: an ellipse `r` wide and `r · cos(pitch)` tall (half-axes). */
export function groundEllipse(r: number, cos = cosP): { rx: number; ry: number } {
  return { rx: r, ry: r * cos };
}

/** A square of side `size` on the ground centred on (x, y) (world px or tiles), as drawn: `size` wide, `size · cos` tall. */
export function groundRect(x: number, y: number, size: number, cos = cosP): { left: number; top: number; right: number; bottom: number } {
  const half = size / 2;
  return { left: x - half, top: (y - half) * cos, right: x + half, bottom: (y + half) * cos };
}

/** A direction on screen (dx, dy) to the ground direction it shows (same length on screen): (dx, dy / cos). */
export function screenDirToGround(dx: number, dy: number, cos = cosP): Pt {
  return { x: dx, y: cos > 0 ? dy / cos : dy };
}

/** A direction on the ground (dx, dy) to the angle it is drawn at on screen (radians). */
export function groundAngle(dx: number, dy: number, cos = cosP): number {
  return Math.atan2(dy * cos, dx);
}

/**
 * The ground y to hand to something that draws a ground point at its view position (y × cos: `Effects.emit`, the
 * weather's layers) so that it shows `up` view px (screen px before the camera's zoom) over the ground point at `y`:
 * y − up / cos. A meteor's head, an arrow starting its fall, a star over a creep's feet: their height is a screen
 * offset, never squashed, so they fall and rise straight up and down the screen (world px or tiles, as `y` is).
 */
export function overGround(y: number, up: number, cos = cosP): number {
  return cos > 0 ? y - up / cos : y - up;
}

/**
 * A vertical face looking south (a portal's arch, V-08b build 3), as drawn: its height sin(pitch) as tall as its width
 * (a height z is drawn z · sin higher). Something round painted on it is an ellipse this tall.
 */
export function archRatio(sin = sinP): number {
  return sin;
}

/** View px a pad's top is drawn over the ground: `PAD_TOP` · sin(pitch) (its zone tints, the painted slab's top). */
export function padLift(sin = sinP): number {
  return PAD_TOP * sin;
}

/**
 * A pad of side `size` centred on (x, y) as the plate draws it (V-08b build 2), in view units (world px or tiles, as
 * the arguments are; `lift` view px in the same units): its raised top from its back edge to its front edge, `lift`
 * over the ground, and its south face from the top's front edge down to the ground. The box a tap on it lands in runs
 * from `top` to `foot`; the painted slab (V-08b build 3) is drawn to the same box.
 */
export function padDrawn(
  x: number,
  y: number,
  size: number,
  lift: number,
  cos = cosP,
): { left: number; right: number; top: number; front: number; foot: number } {
  const g = groundRect(x, y, size, cos);
  return { left: g.left, right: g.right, top: g.top - lift, front: g.bottom - lift, foot: g.bottom };
}
