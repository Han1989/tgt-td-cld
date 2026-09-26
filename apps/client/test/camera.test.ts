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

  it('fits the map into a frame; the fitted zoom is the minimum and the map stays centred there', () => {
    const cam = new Camera(26 * 32, 50 * 32);
    cam.resize(1366, 768);
    const zoom = 752 / (50 * 32);
    const left = (1366 - 26 * 32 * zoom) / 2;
    cam.fit({ left, top: 8, right: 1366 - left, bottom: 760 }, zoom);
    expect(cam.worldToScreen(0, 0).x).toBeCloseTo(left);
    expect(cam.worldToScreen(0, 0).y).toBeCloseTo(8);
    cam.zoomAt(0.5, 683, 384);
    expect(cam.zoom).toBeCloseTo(zoom);
    cam.pan(500, 500);
    expect(cam.worldToScreen(0, 0).y).toBeCloseTo(8);
    // Zoomed in, the map can pan but always covers the frame.
    cam.zoomAt(2, 683, 384);
    cam.pan(-5000, -5000);
    expect(cam.worldToScreen(0, 0).x).toBeCloseTo(left);
    expect(cam.worldToScreen(0, 0).y).toBeCloseTo(8);
  });

  it('ignores player pan and zoom when locked', () => {
    const cam = new Camera(832, 1600);
    cam.resize(412, 839);
    cam.fit({ left: 0, top: 44, right: 412, bottom: 836 }, 412 / 832);
    cam.locked = true;
    const before = { x: cam.x, y: cam.y, zoom: cam.zoom };
    cam.pan(100, 100);
    cam.zoomAt(2, 0, 0);
    cam.centerOn(0, 0);
    expect({ x: cam.x, y: cam.y, zoom: cam.zoom }).toEqual(before);
    cam.place(0, 20);
    expect(cam.worldToScreen(0, 0).y).toBeCloseTo(20);
  });
});
