import { describe, expect, it } from 'vitest';
import { Camera, MAX_ZOOM, MIN_ZOOM } from '../src/input/camera';

describe('Camera', () => {
  it('converts between screen and world coordinates', () => {
    const cam = new Camera(2560, 1920);
    cam.resize(800, 600);
    cam.centerOn(1000, 1000);
    const w = cam.screenToWorld(400, 300);
    expect(w).toEqual({ x: 1000, y: 1000 });
    const s = cam.worldToScreen(1100, 1050);
    expect(cam.screenToWorld(s.x, s.y)).toEqual({ x: 1100, y: 1050 });
  });

  it('zooms around the cursor and clamps the zoom level', () => {
    const cam = new Camera(2560, 1920);
    cam.resize(800, 600);
    cam.centerOn(1000, 1000);
    const before = cam.screenToWorld(600, 200);
    cam.zoomAt(1.5, 600, 200);
    const after = cam.screenToWorld(600, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    cam.zoomAt(100, 0, 0);
    expect(cam.zoom).toBe(MAX_ZOOM);
    cam.zoomAt(0.0001, 0, 0);
    expect(cam.zoom).toBe(MIN_ZOOM);
  });

  it('keeps the view near the map', () => {
    const cam = new Camera(2560, 1920);
    cam.resize(800, 600);
    cam.centerOn(-10_000, 99_999);
    const topLeft = cam.screenToWorld(0, 0);
    const bottomRight = cam.screenToWorld(800, 600);
    expect(topLeft.x).toBeGreaterThan(-400);
    expect(bottomRight.y).toBeLessThan(1920 + 400);
  });
});
