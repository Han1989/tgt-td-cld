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
// The pitch is one constant. Browser-test builds take `?pitch=0` (the camera before V-08b) for one release, so the two
// can be compared in the same build (`setPitch`, called from main.ts in e2e builds only); the production build has one.

import { TILE_PX } from '@tdt/sim';

/** The camera's tilt from straight down (degrees): Han's pick B (docs/art/camera-options.md). */
export const CAMERA_PITCH = 30;

let pitchDeg = CAMERA_PITCH;
let cosP = Math.cos((CAMERA_PITCH * Math.PI) / 180);
let sinP = Math.sin((CAMERA_PITCH * Math.PI) / 180);

/** Browser-test builds only (`?pitch=0`): the camera's pitch for this page. Clamped to 0..60°. */
export function setPitch(deg: number): void {
  const d = Number.isFinite(deg) ? Math.min(60, Math.max(0, deg)) : CAMERA_PITCH;
  pitchDeg = d;
  cosP = Math.cos((d * Math.PI) / 180);
  sinP = Math.sin((d * Math.PI) / 180);
}

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
 * A ground ellipse drawn with a cheat before the tilted camera (a hero's ring and shadow 0.4–0.45 as tall as wide, a
 * rain splash 0.6), as it is drawn now: cos(pitch) tall, the ground's own; `legacy` at `?pitch=0`, so the two cameras
 * compare as they were.
 */
export function flatRatio(legacy: number): number {
  return pitchDeg > 0 ? cosP : legacy;
}
