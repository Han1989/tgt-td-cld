import { getMap } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import {
  Camera,
  FOLLOW_BOX,
  followBand,
  followZoomed,
  MAX_PHONE_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  PhoneZoom,
  SNAP_BACK_MS,
  snapBack,
  zoomFrame,
  zoomLabel,
} from '../src/input/camera';
import { computeLayout } from '../src/layout';

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

describe('phones: pinch zoom and the zoomed follow (V-07e)', () => {
  const map = getMap();
  const phone = (w: number, h: number) =>
    computeLayout({
      w,
      h,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      touch: true,
      landscape: false,
      stick: 'float',
      skills: 'around',
      stickAnchor: 'center',
      mapW: map.width,
      mapH: map.height,
      safeFromY: map.safeFromY,
    });
  const ref = phone(412, 839);
  const short = phone(375, 667);

  it('at the fit the zoom frame is the fitted map (the vertical follow\'s range on a shorter phone)', () => {
    expect(zoomFrame(ref, 1)).toEqual(ref.map);
    const f = zoomFrame(short, 1);
    expect(f.bottom).toBeCloseTo(short.map.bottom - short.followRange, 6);
  });

  it('keeps the hero inside a centre box a third of the view, moving the map the least', () => {
    expect(FOLLOW_BOX).toBeCloseTo(1 / 3);
    const level = 1.8;
    const px = ref.tilePx * level;
    const band = followBand(ref);
    const frame = zoomFrame(ref, level);
    const box = {
      left: (band.left + band.right) / 2 - (band.right - band.left) / 6,
      right: (band.left + band.right) / 2 + (band.right - band.left) / 6,
      top: (band.top + band.bottom) / 2 - (band.bottom - band.top) / 6,
      bottom: (band.top + band.bottom) / 2 + (band.bottom - band.top) / 6,
    };
    // A hero in the middle of the map, the map at its left edge so the hero is right of the box: the map moves left
    // until the hero is on the box's right edge.
    const hero = { x: 13, y: 22 };
    const o = followZoomed({ left: 0, top: 44 - 10 * px }, hero, px, band, frame, map.width, map.height);
    expect(o.left + hero.x * px).toBeCloseTo(box.right, 6);
    // And from the other side, onto its left edge.
    const p = followZoomed({ left: 412 - map.width * px, top: 44 - 10 * px }, hero, px, band, frame, map.width, map.height);
    expect(p.left + hero.x * px).toBeCloseTo(box.left, 6);
    const sy = o.top + hero.y * px;
    expect(sy).toBeGreaterThanOrEqual(box.top - 1e-6);
    expect(sy).toBeLessThanOrEqual(box.bottom + 1e-6);
    // Inside the box nothing moves.
    expect(followZoomed(o, { x: hero.x - 1, y: hero.y }, px, band, frame, map.width, map.height)).toEqual(o);
  });

  it('never shows past the map: at its corners the hero leaves the box rather than the map leaving the screen', () => {
    for (const layout of [ref, short]) {
      for (const level of [1.2, 1.5, 1.8]) {
        const px = layout.tilePx * level;
        const frame = zoomFrame(layout, level);
        for (const hero of [map.heroSpawn, map.heart, { x: 0.5, y: 0.5 }, { x: 25.5, y: 0.5 }, { x: 0.5, y: 39 }, { x: 25.5, y: 39 }]) {
          let o = { left: layout.map.left, top: layout.map.top };
          for (let i = 0; i < 3; i++) o = followZoomed(o, hero, px, followBand(layout), frame, map.width, map.height);
          expect(o.left).toBeLessThanOrEqual(frame.left + 1e-6);
          expect(o.left + map.width * px).toBeGreaterThanOrEqual(frame.right - 1e-6);
          expect(o.top).toBeLessThanOrEqual(frame.top + 1e-6);
          expect(o.top + map.height * px).toBeGreaterThanOrEqual(frame.bottom - 1e-6);
        }
      }
    }
  });

  it('at any zoom the camera can bring the last gameplay row above the controls, and the hero is never kept under them', () => {
    for (const layout of [ref, short, phone(360, 780), phone(390, 664)]) {
      const c = layout.controls!;
      for (const level of [1, 1.4, 1.8]) {
        const px = layout.tilePx * level;
        const frame = zoomFrame(layout, level);
        // Followed as far down as it goes (the hero at the Heart's foot), the gameplay rows end above the controls.
        let o = { left: layout.map.left, top: layout.map.top };
        for (let i = 0; i < 4; i++) o = followZoomed(o, { x: map.heart.x, y: map.safeFromY - 0.5 }, px, followBand(layout), frame, map.width, map.height);
        expect(o.top + map.safeFromY * px, `${layout.map.right} wide at ${level}×`).toBeLessThanOrEqual(c.top + 1e-6);
        // The centre box itself is above the controls and under the top bar.
        const band = followBand(layout);
        expect(band.bottom).toBe(c.top);
        expect(band.top).toBe(layout.topBarBottom);
      }
    }
  });

  it('a pinch zooms about its midpoint (the map point under the fingers stays under them), clamped to the map', () => {
    const z = new PhoneZoom();
    const fit = { left: ref.map.left, top: ref.map.top };
    z.frame(0, 16, ref, fit, map.heroSpawn);
    expect(z.drawnLevel).toBe(1);
    const mid = { x: 206, y: 400 };
    z.pinchStart(mid, ref);
    const under = { x: (mid.x - fit.left) / ref.tilePx, y: (mid.y - fit.top) / ref.tilePx };
    z.pinchTo(1.5, mid, ref);
    const v = z.frame(16, 16, ref, fit, map.heroSpawn);
    expect(v.level).toBe(1.5);
    expect(v.left + under.x * ref.tilePx * 1.5).toBeCloseTo(mid.x, 6);
    expect(v.top + under.y * ref.tilePx * 1.5).toBeCloseTo(mid.y, 6);
    // Past the top left corner: the map's corner stays at the frame's corner.
    z.pinchTo(1.8, { x: 900, y: 900 }, ref);
    const w = z.frame(32, 16, ref, fit, map.heroSpawn);
    expect(w.left).toBeCloseTo(ref.map.left, 6);
    expect(w.top).toBeCloseTo(ref.map.top, 6);
    // Ending close to the fit lands on it.
    z.pinchTo(1.01, mid, ref);
    z.pinchEnd();
    expect(z.zoomed).toBe(false);
    expect(z.frame(48, 16, ref, fit, map.heroSpawn)).toEqual({ level: 1, ...fit, alpha: 1 });
  });

  it('zoomed in, follows the hero after the pinch; back() eases to the fit over 200 ms, or fades under reduced motion', () => {
    for (const calm of [false, true]) {
      const z = new PhoneZoom();
      const fit = { left: ref.map.left, top: ref.map.top };
      z.frame(0, 16, ref, fit, map.heroSpawn);
      z.pinchStart({ x: 206, y: 300 }, ref);
      z.pinchTo(1.8, { x: 206, y: 300 }, ref);
      z.pinchEnd();
      expect(z.zoomed).toBe(true);
      // Many frames later the hero (at the spawn, near the bottom of the gameplay rows) is inside the centre box.
      let v = z.frame(16, 16, ref, fit, map.heroSpawn);
      for (let t = 32; t < 2000; t += 16) v = z.frame(t, 16, ref, fit, map.heroSpawn);
      const band = followBand(ref);
      const px = ref.tilePx * 1.8;
      const sy = v.top + map.heroSpawn.y * px;
      const frame = zoomFrame(ref, 1.8);
      const lowest = v.top + map.height * px <= frame.bottom + 0.5;
      expect(sy <= band.top + ((band.bottom - band.top) * 2) / 3 + 0.5 || lowest).toBe(true);
      expect(sy).toBeLessThan(band.bottom);
      z.back(2000, calm);
      const mid = z.frame(2100, 16, ref, fit, map.heroSpawn);
      if (calm) {
        expect(mid.alpha).toBeLessThan(0.5);
        expect(mid.level).toBe(1);
      } else {
        expect(mid.alpha).toBe(1);
        expect(mid.level).toBeGreaterThan(1);
        expect(mid.level).toBeLessThan(1.8);
      }
      const end = z.frame(2000 + SNAP_BACK_MS, 16, ref, fit, map.heroSpawn);
      expect(end).toEqual({ level: 1, ...fit, alpha: 1 });
      expect(z.zoomed).toBe(false);
    }
  });

  it('the snap back: an ease-out (fast first), or a dim-and-return fade with the jump halfway', () => {
    expect(snapBack(0, false)).toEqual({ mix: 0, alpha: 1, done: false });
    expect(snapBack(SNAP_BACK_MS / 2, false).mix).toBeGreaterThan(0.8);
    expect(snapBack(SNAP_BACK_MS, false)).toEqual({ mix: 1, alpha: 1, done: true });
    expect(snapBack(SNAP_BACK_MS * 0.25, true).mix).toBe(0);
    expect(snapBack(SNAP_BACK_MS / 2, true)).toEqual({ mix: 1, alpha: 0.4, done: false });
    expect(snapBack(SNAP_BACK_MS, true)).toEqual({ mix: 1, alpha: 1, done: true });
  });

  it('the ⤢ button reads nothing at the whole map and the zoom to a tenth while zoomed in', () => {
    expect(zoomLabel(1)).toBe('');
    expect(zoomLabel(1.04)).toBe('');
    expect(zoomLabel(1.4)).toBe('1.4×');
    expect(zoomLabel(MAX_PHONE_ZOOM)).toBe('1.8×');
  });
});
