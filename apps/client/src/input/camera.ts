// Camera state and screen <-> world conversion. World coordinates here are
// pixels (tile × TILE_PX).
//
// The layout (`layout.ts`) gives the camera a `frame`: the screen rect the map is
// fitted into. The fitted zoom is the minimum zoom, so the whole map is always
// visible; desktop can still zoom in (mouse wheel) and pan inside the frame. On
// phones the camera is locked against the wheel and drag-pan and the game view
// moves it itself: at the fitted zoom the vertical hero follow of shorter phones
// (`followOffset`), and, since V-07e, a pinch zoom up to MAX_PHONE_ZOOM that
// follows your hero in both axes (`PhoneZoom`, docs/MOBILE.md §4).

import type { Layout, Rect } from '../layout';

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
/** Phones: a pinch zooms in this far over the fitted zoom (V-07e). */
export const MAX_PHONE_ZOOM = 1.8;
/** While zoomed in, your hero is kept inside a centre box of this share of the view, on each axis. */
export const FOLLOW_BOX = 1 / 3;
/** Smoothing time (ms) of the hero follow: the vertical one at the fitted zoom, and the zoomed one. */
export const FOLLOW_MS = 150;
/** A double-tap on the ground, or the ⤢ button, brings the camera back to the fitted zoom over this long (ms). */
export const SNAP_BACK_MS = 200;
/** A pinch that ends this close to the fitted zoom ends at it (so the ⤢ button does not read 1.0×). */
export const FIT_SNAP = 1.02;

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

// ---------------------------------------------------------------------------
// Phones: pinch zoom and the zoomed hero follow (V-07e, docs/MOBILE.md §4)
// ---------------------------------------------------------------------------

export interface Pt {
  x: number;
  y: number;
}

/** Where the map is drawn: its top left on screen (px), at `level` times the fitted zoom. */
export interface MapView {
  level: number;
  left: number;
  top: number;
}

/**
 * The screen rect the map must cover at `level` times the fitted zoom, so the camera never shows past the map's edges:
 * the fitted map's rect, except that its bottom rises as far as it must for the last gameplay row to come above the
 * controls (the map's safe-zone rows, `map.bottom - gameplayBottom` at the fitted zoom, grow with the zoom). At the
 * fitted zoom on a shorter phone that is the vertical follow's range (`followRange`).
 */
export function zoomFrame(layout: Layout, level: number): Rect {
  const m = layout.map;
  const safe = (m.bottom - layout.gameplayBottom) * level;
  const bottom = layout.controls ? Math.min(m.bottom, layout.controls.top + safe) : m.bottom;
  return { left: m.left, top: m.top, right: m.right, bottom: Math.max(m.top + 1, bottom) };
}

/** The band your hero is kept in while zoomed in: across the map, under the top bar, above the controls. */
export function followBand(layout: Layout): Rect {
  const m = layout.map;
  return { left: m.left, top: layout.topBarBottom, right: m.right, bottom: layout.controls ? layout.controls.top : m.bottom };
}

/** The map's top left along one axis so a map `span` px long covers [lo, hi] (centred in it when shorter). */
function cover(at: number, span: number, lo: number, hi: number): number {
  if (span <= hi - lo + 1e-6) return (lo + hi - span) / 2;
  return Math.min(lo, Math.max(hi - span, at));
}

/** `origin` moved the least so a `w` × `h` px map covers `frame` (it never shows past its edges there). */
export function clampOrigin(origin: { left: number; top: number }, w: number, h: number, frame: Rect): { left: number; top: number } {
  return { left: cover(origin.left, w, frame.left, frame.right), top: cover(origin.top, h, frame.top, frame.bottom) };
}

/**
 * The zoomed hero follow: where the map's top left goes so that your hero (`hero`, tiles; `px` screen px a tile) is
 * inside the centre box, FOLLOW_BOX of `band` on each axis, moving the map the least, then clamped so the map covers
 * `frame`. Inside the box the map stays where it is (no drift while you fight in place).
 */
export function followZoomed(
  origin: { left: number; top: number },
  hero: Pt,
  px: number,
  band: Rect,
  frame: Rect,
  mapW: number,
  mapH: number,
  box = FOLLOW_BOX,
): { left: number; top: number } {
  const along = (o: number, h: number, lo: number, hi: number): number => {
    const mid = (lo + hi) / 2;
    const half = ((hi - lo) * box) / 2;
    const at = o + h * px;
    if (at < mid - half) return o + (mid - half - at);
    if (at > mid + half) return o - (at - (mid + half));
    return o;
  };
  const next = { left: along(origin.left, hero.x, band.left, band.right), top: along(origin.top, hero.y, band.top, band.bottom) };
  return clampOrigin(next, mapW * px, mapH * px, frame);
}

/**
 * The way back to the fitted zoom, `elapsedMs` into it: `mix` (0 → 1) is how far the zoom and the map have moved to
 * the fit, `alpha` the canvas's opacity. An ease-out over SNAP_BACK_MS; under reduced motion a fade instead: the
 * canvas dims to 0.4, the camera jumps to the fit halfway, and the canvas comes back.
 */
export function snapBack(elapsedMs: number, calm: boolean): { mix: number; alpha: number; done: boolean } {
  const t = Math.min(1, Math.max(0, elapsedMs / SNAP_BACK_MS));
  if (calm) return { mix: t >= 0.5 ? 1 : 0, alpha: 1 - 0.6 * (1 - Math.abs(2 * t - 1)), done: t >= 1 };
  return { mix: 1 - (1 - t) ** 3, alpha: 1, done: t >= 1 };
}

/** The ⤢ button's label: nothing at the whole map (under 1.05×), else the zoom to a tenth ("1.4×"). */
export function zoomLabel(level: number): string {
  return level < 1.05 ? '' : `${level.toFixed(1)}×`;
}

/** The map's size in tiles, from the layout's fitted rect. */
function mapTiles(layout: Layout): { w: number; h: number } {
  return { w: (layout.map.right - layout.map.left) / layout.tilePx, h: (layout.map.bottom - layout.map.top) / layout.tilePx };
}

/**
 * A phone's zoom for one match (V-07e). It starts at the fit; a pinch (`pinchTo`, from `gestures.ts`'s `pinch`) zooms
 * it about the pinch's midpoint, up to MAX_PHONE_ZOOM; while zoomed in it follows your hero (`followZoomed`); `back`
 * (a double-tap on the ground, the ⤢ button) returns it to the fit over SNAP_BACK_MS. No DOM: the game view gives it
 * the layout, the fitted placement and your hero each frame and places the camera where `frame` says.
 */
export class PhoneZoom {
  /** Times the fitted zoom (1 = the whole map's width). */
  level = 1;
  /** Zoomed in: the map's top left on screen (px); null at the fit. */
  private origin: { left: number; top: number } | null = null;
  /** A pinch: the map point under its first midpoint (tiles), kept under the fingers' midpoint. */
  private grip: { anchor: Pt } | null = null;
  private snap: { from: MapView; at: number; calm: boolean } | null = null;
  /** Where the map was drawn last frame. */
  private shown: MapView = { level: 1, left: 0, top: 0 };

  /** The zoom drawn last frame, times the fitted zoom (on the way back to the fit, part way there). */
  get drawnLevel(): number {
    return this.shown.level;
  }

  /** Zoomed in, or on the way back to the fit. */
  get zoomed(): boolean {
    return this.level > 1 || this.snap !== null;
  }

  get pinching(): boolean {
    return this.grip !== null;
  }

  /** Every match starts at the fit; so does a layout that does not zoom. */
  clear(): void {
    this.level = 1;
    this.origin = null;
    this.grip = null;
    this.snap = null;
    this.shown = { ...this.shown, level: 1 };
  }

  /** Two fingers came down on the map at `mid` (screen px): the map point under them stays under them. */
  pinchStart(mid: Pt, layout: Layout): void {
    const px = layout.tilePx * this.shown.level;
    this.snap = null;
    this.level = this.shown.level;
    this.origin = { left: this.shown.left, top: this.shown.top };
    this.grip = { anchor: { x: (mid.x - this.shown.left) / px, y: (mid.y - this.shown.top) / px } };
  }

  /** The pinch moved: `level` (already clamped, 1..MAX_PHONE_ZOOM) about the fingers' midpoint `mid`. */
  pinchTo(level: number, mid: Pt, layout: Layout): void {
    if (!this.grip) return;
    this.level = Math.min(MAX_PHONE_ZOOM, Math.max(1, level));
    const px = layout.tilePx * this.level;
    const size = mapTiles(layout);
    const origin = { left: mid.x - this.grip.anchor.x * px, top: mid.y - this.grip.anchor.y * px };
    this.origin = clampOrigin(origin, size.w * px, size.h * px, zoomFrame(layout, this.level));
  }

  pinchEnd(): void {
    this.grip = null;
    if (this.level < FIT_SNAP) this.clear();
  }

  /** Back to the fit over SNAP_BACK_MS (a fade under reduced motion). Nothing to do at the fit. */
  back(now: number, calm: boolean): void {
    if (this.snap || this.level <= 1) return;
    this.grip = null;
    this.snap = { from: { ...this.shown }, at: now, calm };
  }

  /**
   * Where to draw the map this frame (and the canvas's opacity): `fit` is the fitted placement (the vertical follow's,
   * on a shorter phone), `hero` your hero (tiles; null when you have none), `dtMs` the frame's length.
   */
  frame(now: number, dtMs: number, layout: Layout, fit: { left: number; top: number }, hero: Pt | null): MapView & { alpha: number } {
    let out: MapView & { alpha: number };
    if (this.snap) {
      const s = snapBack(now - this.snap.at, this.snap.calm);
      const f = this.snap.from;
      const mix = (a: number, b: number) => a + (b - a) * s.mix;
      out = { level: mix(f.level, 1), left: mix(f.left, fit.left), top: mix(f.top, fit.top), alpha: s.alpha };
      if (s.done) this.clear();
    } else if (this.level > 1 && this.origin) {
      const px = layout.tilePx * this.level;
      const size = mapTiles(layout);
      const frame = zoomFrame(layout, this.level);
      let o = clampOrigin(this.origin, size.w * px, size.h * px, frame);
      if (!this.grip && hero) {
        const target = followZoomed(o, hero, px, followBand(layout), frame, size.w, size.h);
        const k = Math.min(1, dtMs / FOLLOW_MS);
        o = { left: o.left + (target.left - o.left) * k, top: o.top + (target.top - o.top) * k };
      }
      this.origin = o;
      out = { level: this.level, left: o.left, top: o.top, alpha: 1 };
    } else {
      this.level = 1;
      this.origin = null;
      out = { level: 1, left: fit.left, top: fit.top, alpha: 1 };
    }
    this.shown = { level: out.level, left: out.left, top: out.top };
    return out;
  }
}
