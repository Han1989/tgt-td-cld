// Camera state and screen <-> world conversion. World coordinates here are
// pixels (tile × TILE_PX).

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2;

export class Camera {
  /** World point at the centre of the screen. */
  x: number;
  y: number;
  zoom = 1;
  viewW = 1;
  viewH = 1;

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

  /** Pans by a screen-space delta. */
  pan(dx: number, dy: number): void {
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
    this.clamp();
  }

  /** Zooms by `factor`, keeping the world point under (sx, sy) fixed. */
  zoomAt(factor: number, sx: number, sy: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  centerOn(wx: number, wy: number): void {
    this.x = wx;
    this.y = wy;
    this.clamp();
  }

  /** Keeps the view over the map; centres the map when it is smaller than the view. */
  clamp(): void {
    const halfW = this.viewW / 2 / this.zoom;
    const halfH = this.viewH / 2 / this.zoom;
    // Generous margin so map edges can be scrolled clear of the HUD panels.
    const margin = 200;
    this.x = halfW * 2 >= this.worldW + margin * 2 ? this.worldW / 2 : clamp(this.x, halfW - margin, this.worldW - halfW + margin);
    this.y = halfH * 2 >= this.worldH + margin * 2 ? this.worldH / 2 : clamp(this.y, halfH - margin, this.worldH - halfH + margin);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
