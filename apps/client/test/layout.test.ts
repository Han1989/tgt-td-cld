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
  SKILL_GAP,
  SKILL_PLACES,
  STICK_MODES,
  type Controls,
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
    stick: 'float',
    skills: 'around',
    stickAnchor: 'center',
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

/** The stick (or the floating stick's hint) and every skill button. */
function circlesOf(c: Controls) {
  return [c.joystick, ...Object.values(c.skills)];
}

/** The room (px) between the closest two of the stick and the skill buttons. */
function minGap(c: Controls): number {
  const circles = circlesOf(c);
  let min = Infinity;
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i]!;
      const b = circles[j]!;
      min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r);
    }
  }
  return min;
}

const LAYOUTS = STICK_MODES.flatMap((stick) => SKILL_PLACES.map((skills) => ({ stick, skills })));

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

  for (const { stick, skills } of LAYOUTS) {
    it(`keeps the ${stick} stick, skills ${skills} controls inside the screen, off the gameplay, and never overlapping`, () => {
      for (const [w, h, insets] of [
        [412, 839, NO_INSETS],
        [390, 844, { top: 47, right: 0, bottom: 34, left: 0 }],
        [360, 780, NO_INSETS],
        [430, 932, { top: 59, right: 0, bottom: 34, left: 0 }],
        [390, 664, NO_INSETS],
        [360, 640, NO_INSETS],
      ] as const) {
        const l = computeLayout(input(w, h, { stick, skills, insets }));
        const c = l.controls!;
        expect(c.floating).toBe(stick === 'float');
        for (const r of c.rects) {
          expect(r.left).toBeGreaterThanOrEqual(0);
          expect(r.right).toBeLessThanOrEqual(w);
          expect(r.bottom).toBeLessThanOrEqual(h - insets.bottom);
        }
        expect(minGap(c)).toBeGreaterThan(0);
        // With the camera scrolled as far as it may go, gameplay never sits under the controls.
        const offset = l.followRange;
        const gameplay = gameplayRects(l.tilePx, { left: l.map.left, top: l.map.top - offset });
        const visible = gameplay.filter((r) => r.bottom > l.topBarBottom);
        for (const r of c.rects) for (const g of visible) expect(overlaps(r, g)).toBe(false);
        expect(l.gameplayBottom - offset).toBeLessThanOrEqual(c.top + 1e-9);
      }
    });
  }

  it('has no Skills button in any layout: only the stick and the four skill buttons', () => {
    for (const { stick, skills } of LAYOUTS) {
      for (const [w, h, landscape] of [
        [412, 839, false],
        [1024, 768, true],
      ] as const) {
        const c = computeLayout(input(w, h, { stick, skills, landscape })).controls!;
        expect(Object.keys(c).sort()).toEqual(['floating', 'joystick', 'rects', 'skills', 'top']);
        expect(Object.keys(c.skills).sort()).toEqual(['E', 'Q', 'R', 'W']);
        expect(c.rects).toHaveLength(5);
      }
    }
  });

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

  it('moves the skills-around-the-stick cluster left or right without leaving the screen or covering gameplay', () => {
    const mid = computeLayout(input(390, 844, { insets: { top: 47, right: 0, bottom: 34, left: 0 } })).controls!;
    for (const stickAnchor of ['left', 'right'] as const) {
      const l = computeLayout(input(390, 844, { insets: { top: 47, right: 0, bottom: 34, left: 0 }, stickAnchor }));
      const c = l.controls!;
      for (const r of c.rects) {
        expect(r.left).toBeGreaterThanOrEqual(0);
        expect(r.right).toBeLessThanOrEqual(390);
      }
      expect(minGap(c)).toBeGreaterThanOrEqual(SKILL_GAP - 1e-6);
      expect(l.gameplayBottom - l.followRange).toBeLessThanOrEqual(c.top + 1e-9);
    }
    const left = computeLayout(input(390, 844, { stickAnchor: 'left' })).controls!;
    const right = computeLayout(input(390, 844, { stickAnchor: 'right' })).controls!;
    expect(left.joystick.x).toBeLessThan(mid.joystick.x - 40);
    expect(right.joystick.x).toBeGreaterThan(mid.joystick.x + 40);
  });

  it('mirrors the corner layouts for left-handed players', () => {
    for (const stick of STICK_MODES) {
      const right = computeLayout(input(412, 839, { stick, skills: 'right' })).controls!;
      const left = computeLayout(input(412, 839, { stick, skills: 'left' })).controls!;
      expect(right.joystick.x).toBeLessThan(206);
      expect(left.joystick.x).toBeGreaterThan(206);
      expect(left.joystick.x).toBeCloseTo(412 - right.joystick.x);
      // W and E mirror; Q and R trade places so the row still reads Q, W, R (next test).
      const mirrored = { Q: 'R', W: 'W', E: 'E', R: 'Q' } as const;
      for (const slot of ['Q', 'W', 'E', 'R'] as const) {
        expect(left.skills[slot].x).toBeCloseTo(412 - right.skills[mirrored[slot]].x);
        expect(left.skills[slot].y).toBeCloseTo(right.skills[mirrored[slot]].y);
      }
    }
  });

  it('reads Q, W, R from left to right in both corner layouts', () => {
    for (const stick of STICK_MODES) {
      for (const skills of ['right', 'left'] as const) {
        for (const [w, h] of [[412, 839], [390, 664], [360, 640]] as const) {
          const c = computeLayout(input(w, h, { stick, skills })).controls!;
          const order = (['Q', 'W', 'R'] as const).slice().sort((a, b) => c.skills[a].x - c.skills[b].x);
          expect(order).toEqual(['Q', 'W', 'R']);
        }
      }
    }
  });
});

/** The first one-thumb arc (main before the floating stick) at 412 × 839: W's and R's tops. */
const MAIN_ARC_TOP = 839 - 8 - 50 + 10 - 88 * Math.sin((54 * Math.PI) / 180) - 28;

describe('computeLayout: skills around the stick', () => {
  const PHONES = [
    [412, 839],
    [390, 664],
    [360, 640],
  ] as const;

  for (const stick of STICK_MODES) {
    it(`leaves at least ${SKILL_GAP} px between any two buttons and between the stick and any button (${stick} stick)`, () => {
      for (const [w, h] of PHONES) {
        const c = computeLayout(input(w, h, { stick })).controls!;
        expect(minGap(c)).toBeGreaterThanOrEqual(SKILL_GAP - 1e-6);
        // The one-thumb arc: W and R over the stick, Q and E at its ends, centred on the stick.
        expect(c.joystick.x).toBeCloseTo(w / 2);
        expect(c.skills.Q.x).toBeLessThan(c.skills.W.x);
        expect(c.skills.W.x).toBeLessThan(c.joystick.x);
        expect(c.skills.R.x).toBeGreaterThan(c.joystick.x);
        expect(c.skills.E.x).toBeGreaterThan(c.skills.R.x);
        expect(c.skills.W.y).toBeLessThan(c.joystick.y);
        expect(c.skills.R.y).toBeCloseTo(c.skills.W.y);
        for (const slot of ['Q', 'W', 'R'] as const) expect(c.skills[slot].r * 2).toBeGreaterThanOrEqual(56);
      }
    });
  }

  it('draws the floating stick at rest as an 80 px hint in the middle and the fixed stick at 100 px', () => {
    const float = computeLayout(input(412, 839)).controls!;
    expect(float.floating).toBe(true);
    expect(float.joystick.r * 2).toBe(80);
    expect(computeLayout(input(412, 839, { stick: 'fixed' })).controls!.joystick.r * 2).toBe(100);
  });

  it('spreads sideways, not up: no button higher than on the first one-thumb arc, and the whole map fits 412 × 839', () => {
    for (const stick of STICK_MODES) {
      const l = computeLayout(input(412, 839, { stick }));
      expect(l.followRange).toBe(0);
      for (const b of Object.values(l.controls!.skills)) expect(b.y - b.r).toBeGreaterThanOrEqual(MAIN_ARC_TOP - 1e-6);
    }
  });
});

describe('computeLayout: skills in a corner', () => {
  it('puts the skills together in one bottom corner and only the stick in the other, nothing in the bottom centre', () => {
    for (const [w, h, insets] of [
      [412, 839, NO_INSETS],
      [390, 844, { top: 47, right: 0, bottom: 34, left: 0 }],
      [360, 780, NO_INSETS],
    ] as const) {
      const c = computeLayout(input(w, h, { skills: 'right', insets })).controls!;
      expect(c.floating).toBe(true);
      expect(c.joystick.r * 2).toBe(80);
      // The resting stick is a hint in the bottom-left corner.
      expect(c.joystick.x + c.joystick.r).toBeLessThan(w / 3);
      for (const b of Object.values(c.skills)) expect(b.x - b.r).toBeGreaterThan(w / 2 - 4);
    }
  });

  it('uses the two-thumb arc a little lower with the floating stick, so the whole map still fits a 412 × 839 phone', () => {
    const l = computeLayout(input(412, 839, { skills: 'right' }));
    expect(l.followRange).toBe(0);
    const float = l.controls!;
    const fixed = computeLayout(input(412, 839, { stick: 'fixed', skills: 'right' })).controls!;
    expect(fixed.floating).toBe(false);
    for (const slot of ['Q', 'W', 'E', 'R'] as const) {
      expect(float.skills[slot].x).toBeCloseTo(fixed.skills[slot].x);
      expect(float.skills[slot].y).toBeGreaterThan(fixed.skills[slot].y);
      expect(float.skills[slot].y - fixed.skills[slot].y).toBeLessThanOrEqual(8);
    }
  });

  it('keeps every layout in the side margins on a landscape tablet', () => {
    for (const { stick, skills } of LAYOUTS) {
      const l = computeLayout(input(1024, 768, { stick, skills, landscape: true }));
      expect(l.controls!.floating).toBe(stick === 'float');
      for (const r of l.controls!.rects) expect(r.right <= l.map.left || r.left >= l.map.right).toBe(true);
    }
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
    const l = computeLayout(input(1024, 768, { stick: 'fixed', skills: 'right', landscape: true }));
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
