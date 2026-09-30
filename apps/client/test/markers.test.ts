import { describe, expect, it } from 'vitest';
import { placeMarker } from '../src/hud/markers';

const view = { left: 0, top: 44, right: 400, bottom: 700 };

describe('placeMarker', () => {
  it('keeps an on-screen ping on its point', () => {
    expect(placeMarker({ x: 200, y: 300 }, view)).toEqual({ x: 200, y: 300, off: false, angle: 0 });
  });

  it('pins an off-screen ping to the edge, pointing toward it', () => {
    const right = placeMarker({ x: 900, y: 372 }, view);
    expect(right.off).toBe(true);
    expect(right.x).toBeCloseTo(400 - 22);
    expect(right.y).toBeCloseTo(372);
    expect(right.angle).toBeCloseTo(0);

    const up = placeMarker({ x: 200, y: -400 }, view);
    expect(up.off).toBe(true);
    expect(up.y).toBeCloseTo(44 + 22);
    expect(up.angle).toBeCloseTo(-Math.PI / 2);

    const corner = placeMarker({ x: -200, y: 2000 }, view);
    expect(corner.off).toBe(true);
    expect(corner.x).toBeGreaterThanOrEqual(view.left + 22 - 0.01);
    expect(corner.x).toBeLessThanOrEqual(view.right - 22 + 0.01);
    expect(corner.y).toBeGreaterThanOrEqual(view.top + 22 - 0.01);
    expect(corner.y).toBeLessThanOrEqual(view.bottom - 22 + 0.01);
  });
});
