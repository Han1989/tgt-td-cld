// The tilted camera (V-08b, render/view.ts): the pitch, the mapping and its inverse, the ellipse and the draw order.

import { describe, expect, it } from 'vitest';
import {
  CAMERA_PITCH,
  depth,
  groundAngle,
  groundEllipse,
  groundRect,
  pitchCos,
  screenDirToGround,
  screenToTile,
  screenToWorld,
  overGround,
  padDrawn,
  padLift,
  PAD_TOP,
  viewCos,
  viewPitch,
  viewSin,
  viewY,
  worldToScreen,
} from '../src/render/view';

const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;

describe('the tilted camera (render/view.ts)', () => {
  it("is Han's pick B: 30° from straight down", () => {
    expect(CAMERA_PITCH).toBe(30);
    expect(viewPitch()).toBe(30);
    expect(viewCos()).toBeCloseTo(COS, 12);
    expect(viewSin()).toBeCloseTo(SIN, 12);
    expect(pitchCos(40)).toBeCloseTo(Math.cos((40 * Math.PI) / 180), 12);
  });

  it('maps the ground affinely: x unchanged, y × cos, a height z drawn z × sin higher', () => {
    expect(worldToScreen(100, 200)).toEqual({ x: 100, y: 200 * viewCos() });
    expect(worldToScreen(100, 200, 40).y).toBeCloseTo(200 * COS - 40 * SIN, 9);
    expect(viewY(50)).toBeCloseTo(50 * COS, 12);
    // Affine: the midpoint of two ground points is drawn at the midpoint of their drawings.
    const a = worldToScreen(10, 30);
    const b = worldToScreen(70, 110);
    const m = worldToScreen(40, 70);
    expect(m.x).toBeCloseTo((a.x + b.x) / 2, 12);
    expect(m.y).toBeCloseTo((a.y + b.y) / 2, 12);
  });

  it('round-trips: a tap lands on the ground point it was drawn from (z 0), in world px and in tiles', () => {
    for (const [x, y] of [
      [0, 0],
      [416, 800],
      [831.5, 1599.5],
      [-12, 37.25],
    ] as const) {
      const s = worldToScreen(x, y);
      const g = screenToWorld(s.x, s.y);
      expect(g.x).toBeCloseTo(x, 9);
      expect(g.y).toBeCloseTo(y, 9);
      const t = screenToTile(s.x, s.y);
      expect(t.x).toBeCloseTo(x / 32, 9);
      expect(t.y).toBeCloseTo(y / 32, 9);
    }
    // A point drawn above the ground (z > 0) is read back further up the map: taps land on the ground plane.
    const up = worldToScreen(100, 400, 64);
    expect(screenToWorld(up.x, up.y).y).toBeCloseTo(400 - (64 * SIN) / COS, 9);
  });

  it('draws a ground circle as an ellipse 1 wide and cos tall, and a pad as a rectangle', () => {
    expect(groundEllipse(48)).toEqual({ rx: 48, ry: 48 * viewCos() });
    const pad = groundRect(5.5, 9.5, 3);
    expect(pad.right - pad.left).toBe(3);
    expect(pad.bottom - pad.top).toBeCloseTo(3 * COS, 12);
    expect((pad.top + pad.bottom) / 2).toBeCloseTo(9.5 * COS, 12);
  });

  it('turns a screen direction into the ground direction it shows, and back', () => {
    const g = screenDirToGround(30, -30);
    expect(g.x).toBe(30);
    expect(g.y).toBeCloseTo(-30 / COS, 9);
    expect(groundAngle(g.x, g.y)).toBeCloseTo(-Math.PI / 4, 12);
    expect(groundAngle(1, 0)).toBe(0);
    expect(groundAngle(0, 1)).toBeCloseTo(Math.PI / 2, 12);
  });

  it('orders the draw back to front: further up the map first, a lift in front', () => {
    expect(depth(10)).toBeLessThan(depth(10.5));
    expect(depth(10, 1.5)).toBeGreaterThan(depth(11));
    expect(depth(10, -1.5)).toBeLessThan(depth(9));
    const things = [{ y: 30 }, { y: 4 }, { y: 17 }];
    expect(things.sort((a, b) => depth(a.y) - depth(b.y)).map((t) => t.y)).toEqual([4, 17, 30]);
  });

  it('is one camera: nothing in the module changes the pitch (V-08b build 3 removed `?pitch=0`)', async () => {
    const mod = await import('../src/render/view');
    expect('setPitch' in mod).toBe(false);
    expect('flatRatio' in mod).toBe(false);
  });

  it('lifts a height off the ground as a screen offset: what falls falls straight down the screen onto its point', () => {
    // A thing `up` view px over the ground point (100, 400): drawn at the point's view y less `up`, x unchanged.
    for (const up of [0, 24, 96, 224]) {
      const y = overGround(400, up);
      expect(y * viewCos()).toBeCloseTo(worldToScreen(100, 400).y - up, 9);
    }
    // In tiles too: the same rule, whatever the unit.
    expect(overGround(12.5, 3) * COS).toBeCloseTo(12.5 * COS - 3, 12);
  });

  it("draws a pad as the plate does: its top PAD_TOP · sin over the ground, its south face down to the ground's edge", () => {
    expect(padLift()).toBeCloseTo(PAD_TOP * SIN, 12);
    const p = padDrawn(5.5 * 32, 9.5 * 32, 96, padLift());
    const g = groundRect(5.5 * 32, 9.5 * 32, 96);
    expect(p.left).toBe(g.left);
    expect(p.right).toBe(g.right);
    expect(p.top).toBeCloseTo(g.top - PAD_TOP * SIN, 9);
    // The top is the ground square's height (cos tall) and the face fills the lift: a tap box from the top to the foot.
    expect(p.front - p.top).toBeCloseTo(96 * COS, 9);
    expect(p.foot - p.front).toBeCloseTo(PAD_TOP * SIN, 9);
    expect(p.foot).toBe(g.bottom);
  });
});
