import { getMap } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import {
  computeLayout,
  followOffset,
  overlaps,
  SKILL_PX,
  TOP_BAR_H,
  type Insets,
  type LayoutInput,
  type Rect,
  type ThumbLayout,
} from '../src/layout';

const map = getMap();
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

function input(w: number, h: number, over: Partial<LayoutInput> = {}): LayoutInput {
  return {
    w,
    h,
    insets: NO_INSETS,
    touch: true,
    landscape: w > h,
    thumbs: 'one',
    mapW: map.width,
    mapH: map.height,
    safeFromY: map.safeFromY,
    ...over,
  };
}

/** Screen rects of everything that is gameplay (pads, lanes, the Heart), camera at rest. */
function gameplayRects(tile: number, origin: { left: number; top: number }): Rect[] {
  const rects: Rect[] = [];
  const at = (tx: number, ty: number, w: number, h: number): Rect => ({
    left: origin.left + tx * tile,
    top: origin.top + ty * tile,
    right: origin.left + (tx + w) * tile,
    bottom: origin.top + (ty + h) * tile,
  });
  for (const p of map.pads) rects.push(at(p.tx, p.ty, map.padSize, map.padSize));
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) if (map.tiles[ty * map.width + tx] === 1) rects.push(at(tx, ty, 1, 1));
  }
  rects.push(at(map.heart.x - 2.2, map.heart.y - 2.2, 4.4, 4.4));
  return rects;
}

describe('computeLayout: phones held upright', () => {
  it('fits the whole 50-row map on a 412 × 839 screen under a 44 px top bar, with room to spare', () => {
    const l = computeLayout(input(412, 839));
    expect(l.kind).toBe('tall');
    expect(TOP_BAR_H).toBeLessThanOrEqual(47);
    expect(l.tilePx).toBeCloseTo(412 / 26, 5);
    expect(l.map.top).toBe(TOP_BAR_H);
    expect(l.map.bottom).toBeLessThanOrEqual(839);
    expect(l.followRange).toBe(0);
  });

  it('keeps the tile size at least round 4’s (412 / 26 px) on a 412-wide phone', () => {
    expect(computeLayout(input(412, 915)).tilePx).toBeGreaterThanOrEqual(412 / 26 - 1e-9);
  });

  for (const thumbs of ['one', 'two', 'twoLeft'] as ThumbLayout[]) {
    it(`keeps the ${thumbs} controls inside the screen, off the gameplay, and never overlapping each other`, () => {
      for (const [w, h, insets] of [
        [412, 839, NO_INSETS],
        [390, 844, { top: 47, right: 0, bottom: 34, left: 0 }],
        [360, 780, NO_INSETS],
        [430, 932, { top: 59, right: 0, bottom: 34, left: 0 }],
      ] as const) {
        const l = computeLayout(input(w, h, { thumbs, insets }));
        const c = l.controls!;
        for (const r of c.rects) {
          expect(r.left).toBeGreaterThanOrEqual(0);
          expect(r.right).toBeLessThanOrEqual(w);
          expect(r.bottom).toBeLessThanOrEqual(h - insets.bottom);
        }
        const circles = [c.joystick, ...Object.values(c.skills)];
        for (let i = 0; i < circles.length; i++) {
          for (let j = i + 1; j < circles.length; j++) {
            const a = circles[i]!;
            const b = circles[j]!;
            expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
          }
        }
        // With the camera scrolled as far as it may go, gameplay never sits under the controls.
        const offset = l.followRange;
        const gameplay = gameplayRects(l.tilePx, { left: l.map.left, top: l.map.top - offset });
        const visible = gameplay.filter((r) => r.bottom > l.topBarBottom);
        for (const r of c.rects) for (const g of visible) expect(overlaps(r, g)).toBe(false);
        expect(l.gameplayBottom - offset).toBeLessThanOrEqual(c.top + 1e-9);
      }
    });
  }

  it('uses touch targets of at least 44 px', () => {
    const c = computeLayout(input(412, 839)).controls!;
    expect(SKILL_PX).toBeGreaterThanOrEqual(44);
    expect(c.joystick.r * 2).toBeGreaterThanOrEqual(44);
    for (const slot of ['Q', 'W', 'R'] as const) expect(c.skills[slot].r * 2).toBeGreaterThanOrEqual(44);
  });

  it('follows the hero vertically on shorter phones only', () => {
    const short = computeLayout(input(375, 667));
    expect(short.followRange).toBeGreaterThan(0);
    expect(followOffset(short, 0)).toBe(0);
    expect(followOffset(short, map.heart.y)).toBe(short.followRange);
    const mid = followOffset(short, 20);
    expect(mid).toBeGreaterThanOrEqual(0);
    expect(mid).toBeLessThanOrEqual(short.followRange);
    expect(followOffset(computeLayout(input(412, 839)), map.heart.y)).toBe(0);
  });

  it('pushes the map under the safe-area top inset', () => {
    const l = computeLayout(input(390, 844, { insets: { top: 47, right: 0, bottom: 34, left: 0 } }));
    expect(l.topBarBottom).toBe(47 + TOP_BAR_H);
    expect(l.map.top).toBe(l.topBarBottom);
  });

  it('shows the rotate screen on a phone held sideways', () => {
    expect(computeLayout(input(839, 412, { landscape: true })).kind).toBe('rotate');
  });

  it('mirrors the two-thumb layout for left-handed players', () => {
    const right = computeLayout(input(412, 839, { thumbs: 'two' })).controls!;
    const left = computeLayout(input(412, 839, { thumbs: 'twoLeft' })).controls!;
    expect(right.joystick.x).toBeLessThan(206);
    expect(left.joystick.x).toBeGreaterThan(206);
    expect(left.joystick.x).toBeCloseTo(412 - right.joystick.x);
    expect(left.skills.R.x).toBeCloseTo(412 - right.skills.R.x);
  });
});

describe('computeLayout: tablets and desktop', () => {
  it('centres the map fitted to the height, with the HUD in wide side margins (desktop, no touch overlay)', () => {
    const l = computeLayout(input(1366, 768, { touch: false, landscape: true }));
    expect(l.kind).toBe('wide');
    expect(l.map.bottom - l.map.top).toBeCloseTo(768 - 16);
    expect(l.map.left).toBeCloseTo(1366 - l.map.right);
    expect(l.margin).toBeGreaterThanOrEqual(280);
    expect(l.controls).toBeNull();
  });

  it('puts the touch controls in the side margins on a landscape tablet', () => {
    const l = computeLayout(input(1024, 768, { thumbs: 'two', landscape: true }));
    expect(l.kind).toBe('wide');
    const c = l.controls!;
    for (const r of c.rects) expect(r.right <= l.map.left || r.left >= l.map.right).toBe(true);
  });

  it('shows the whole map on a portrait tablet (tall layout, fitted to the height)', () => {
    const l = computeLayout(input(768, 1024));
    expect(l.kind).toBe('tall');
    expect(l.map.bottom).toBeLessThanOrEqual(1024 + 1e-9);
    expect(l.followRange).toBe(0);
  });

  it('never shows the rotate screen on a desktop window', () => {
    expect(computeLayout(input(800, 500, { touch: false, landscape: true })).kind).not.toBe('rotate');
  });
});
