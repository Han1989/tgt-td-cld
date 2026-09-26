// Camera state and screen <-> world conversion. World coordinates here are
// pixels (tile × TILE_PX).
//
// The layout (`layout.ts`) gives the camera a `frame`: the screen rect the map is
// fitted into. The fitted zoom is the minimum zoom, so the whole map is always
// visible; desktop can still zoom in (mouse wheel) and pan inside the frame. On
// phones the layout locks the camera and moves it itself (vertical hero follow).

import type { Rect } from '../layout';

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;

export class Camera {
  /** World point at the centre of the screen. */
  x: number;
  y: number;
  zoom = 1;
  viewW = 1;
  viewH = 1;
  minZoom = MIN_ZOOM;
  /** Screen rect the map is framed in; null = the whole view. */
  frame: Rect | null = null;
  /** No player pan or zoom (phones: the layout drives the camera). */
  locked = false;

  constructor(
    readonly worldW: number,
    readonly worldH: number,
  ) {
    this.x = worldW / 2;
    this.y = worldH / 2;
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.clamp();
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: this.x + (sx - this.viewW / 2) / this.zoom, y: this.y + (sy - this.viewH / 2) / this.zoom };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.x) * this.zoom + this.viewW / 2, y: (wy - this.y) * this.zoom + this.viewH / 2 };
  }

  /**
   * Frames the map in `frame` at `zoom` (the fitted zoom, which becomes the minimum), with the
   * map's top-left at the frame's top-left.
   */
  fit(frame: Rect, zoom: number): void {
    this.frame = frame;
    this.minZoom = zoom;
    this.zoom = zoom;
    this.place(frame.left, frame.top);
    this.clamp();
  }

  /** Moves the camera so that world (0, 0) is at screen (sx, sy). */
  place(sx: number, sy: number): void {
    this.x = this.viewW / 2 / this.zoom - sx / this.zoom;
    this.y = this.viewH / 2 / this.zoom - sy / this.zoom;
  }

  /** Pans by a screen-space delta. */
  pan(dx: number, dy: number): void {
    if (this.locked) return;
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
    this.clamp();
  }

  /** Zooms by `factor`, keeping the world point under (sx, sy) fixed. */
  zoomAt(factor: number, sx: number, sy: number): void {
    if (this.locked) return;
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(MAX_ZOOM, Math.max(this.minZoom, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  centerOn(wx: number, wy: number): void {
    if (this.locked) return;
    this.x = wx;
    this.y = wy;
    this.clamp();
  }

  /** Keeps the map covering the frame; centres it in the frame along an axis where it is smaller. */
  clamp(): void {
    const f = this.frame ?? { left: 0, top: 0, right: this.viewW, bottom: this.viewH };
    this.x = axis(this.x, this.worldW, this.zoom, f.left, f.right, this.viewW);
    this.y = axis(this.y, this.worldH, this.zoom, f.top, f.bottom, this.viewH);
  }
}

/** Camera centre along one axis so the map [0, world] covers the frame [lo, hi] (or is centred in it). */
function axis(c: number, world: number, zoom: number, lo: number, hi: number, view: number): number {
  const span = world * zoom;
  const frame = hi - lo;
  // Camera centre that puts world coordinate `w` at screen coordinate `s`.
  const at = (w: number, s: number) => w - (s - view / 2) / zoom;
  if (span <= frame + 1e-6) return at(world / 2, (lo + hi) / 2);
  // The map's near edge no further in than lo, its far edge no further in than hi.
  return Math.min(at(world, hi), Math.max(at(0, lo), c));
}
