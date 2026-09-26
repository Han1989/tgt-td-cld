import type { SkillSnap } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import {
  aimPoint,
  arrowTo,
  holdProgress,
  inOverlay,
  isCancelRelease,
  isDrag,
  placeRadial,
  radialSpots,
  resolveTap,
  SELL_HOLD_MS,
  shouldResendMove,
  smartCast,
  STICK_DEAD,
  STICK_RESEND_MS,
  stickMoveTarget,
  stickVector,
  type Candidate,
  type CastTarget,
} from '../src/touch/gestures';

function skill(over: Partial<SkillSnap>): SkillSnap {
  return {
    slot: 'Q',
    rank: 1,
    maxRank: 4,
    cooldown: 0,
    cooldownTotal: 100,
    manaCost: 20,
    range: 0,
    radius: 0,
    targeted: false,
    passive: false,
    learnable: false,
    nextRankLevel: 2,
    ...over,
  };
}

const ground = (x: number, y: number): CastTarget => ({ x, y, flying: false });
const air = (x: number, y: number): CastTarget => ({ x, y, flying: true });
const HERO = { x: 10, y: 20 };
const HEART = { x: 13, y: 36 };

describe('joystick', () => {
  it('clamps the knob to the base and reports how far it is pushed', () => {
    const v = stickVector({ x: 100, y: 100 }, { x: 200, y: 100 }, 50);
    expect(v).toEqual({ dx: 50, dy: 0, mag: 1 });
    expect(stickVector({ x: 100, y: 100 }, { x: 100, y: 125 }, 50).mag).toBeCloseTo(0.5);
  });

  it('moves the hero in the stick direction, and not at all inside the dead zone', () => {
    expect(stickMoveTarget(HERO, { dx: STICK_DEAD / 2, dy: 0, mag: 0.05 }, 50)).toBeNull();
    const t = stickMoveTarget(HERO, { dx: 0, dy: -50, mag: 1 }, 50)!;
    expect(t.x).toBeCloseTo(HERO.x);
    expect(t.y).toBeLessThan(HERO.y);
    const diag = stickMoveTarget(HERO, { dx: 30, dy: 30, mag: 0.85 }, 50)!;
    expect(diag.x - HERO.x).toBeCloseTo(diag.y - HERO.y);
  });

  it('resends the move when the stick turns or the last move is stale, not on every frame', () => {
    expect(shouldResendMove(null, 0, 0, 0)).toBe(true);
    expect(shouldResendMove(0, 0.05, 1000, 1016)).toBe(false);
    expect(shouldResendMove(0, 0.5, 1000, 1016)).toBe(true);
    expect(shouldResendMove(0, 0, 1000, 1000 + STICK_RESEND_MS)).toBe(true);
    // Turning across ±π is a small turn, not a full circle.
    expect(shouldResendMove(Math.PI - 0.05, -Math.PI + 0.05, 1000, 1016)).toBe(false);
  });
});

describe('tap vs drag', () => {
  it('is a tap until the finger travels past the slop, then a drag for good', () => {
    const start = { x: 0, y: 0 };
    expect(isDrag(start, { x: 6, y: 6 })).toBe(false);
    expect(isDrag(start, { x: 12, y: 0 })).toBe(true);
    expect(isDrag(start, { x: 0, y: 0 }, true)).toBe(true);
  });
});

describe('smart cast', () => {
  it('fires an instant skill only when something it can hit is in reach', () => {
    const multishot = skill({ range: 7 });
    expect(smartCast(HERO, multishot, { air: true }, [ground(30, 30)], HEART)).toEqual({ type: 'none' });
    expect(smartCast(HERO, multishot, { air: true }, [air(12, 20)], HEART)).toEqual({ type: 'instant' });
    // Cleave (radius, no range) can't hit a flyer next to the hero.
    const cleave = skill({ radius: 2.2 });
    expect(smartCast(HERO, cleave, { air: false }, [air(11, 20)], HEART)).toEqual({ type: 'none' });
    expect(smartCast(HERO, cleave, { air: false }, [ground(11, 20)], HEART)).toEqual({ type: 'instant' });
  });

  it('always casts a self-buff', () => {
    expect(smartCast(HERO, skill({ radius: 3 }), { air: false, self: true }, [], HEART)).toEqual({ type: 'instant' });
  });

  it('aims a point skill at the densest group in range', () => {
    const fireball = skill({ targeted: true, range: 8, radius: 2 });
    const lone = ground(10, 14);
    const pack = [ground(15, 20), ground(15.5, 20.5), ground(14.6, 19.6)];
    const r = smartCast(HERO, fireball, { air: true }, [lone, ...pack], HEART);
    expect(r.type).toBe('point');
    if (r.type !== 'point') return;
    expect(r.x).toBeCloseTo((15 + 15.5 + 14.6) / 3);
    expect(r.y).toBeCloseTo((20 + 20.5 + 19.6) / 3);
  });

  it('ignores flyers for ground-only skills and creeps out of range', () => {
    const meteor = skill({ targeted: true, range: 9, radius: 3 });
    const flock = [air(12, 20), air(12.5, 20), air(12, 20.5)];
    expect(smartCast(HERO, meteor, { air: false }, flock, HEART)).toEqual({ type: 'none' });
    expect(smartCast(HERO, meteor, { air: false }, [ground(30, 20)], HEART)).toEqual({ type: 'none' });
  });

  it('breaks a tie between equal groups in favour of the one nearer the Heart', () => {
    const trap = skill({ targeted: true, range: 8, radius: 1 });
    const far = ground(10, 14);
    const near = ground(10, 26);
    const r = smartCast(HERO, trap, { air: false }, [far, near], HEART);
    expect(r).toEqual({ type: 'point', x: 10, y: 26 });
  });

  it('falls back to the seed creep when the group centre is out of range', () => {
    const s = skill({ targeted: true, range: 5, radius: 3 });
    const edge = ground(15, 20);
    const beyond = [ground(17.5, 20), ground(17.8, 20)];
    const r = smartCast(HERO, s, { air: true }, [edge, ...beyond], HEART);
    expect(r).toEqual({ type: 'point', x: 15, y: 20 });
  });
});

describe('drag to aim', () => {
  it('scales the drag to the skill range, capped at full range', () => {
    expect(aimPoint(HERO, 8, { x: 45, y: 0 }, 90)).toEqual({ x: 14, y: 20 });
    const far = aimPoint(HERO, 8, { x: 0, y: -900 }, 90);
    expect(far.x).toBeCloseTo(10);
    expect(far.y).toBeCloseTo(12);
    expect(aimPoint(HERO, 8, { x: 0, y: 0 })).toEqual(HERO);
  });

  it('cancels when the finger is released back on the button', () => {
    const button = { left: 100, top: 100, right: 152, bottom: 152 };
    expect(isCancelRelease({ x: 120, y: 130 }, button)).toBe(true);
    expect(isCancelRelease({ x: 97, y: 130 }, button)).toBe(true);
    expect(isCancelRelease({ x: 60, y: 60 }, button)).toBe(false);
  });
});

describe('snap to the nearest target', () => {
  const pad = (id: number, x: number, y: number): Candidate => ({ kind: 'pad', id, at: { x, y }, half: 24, shape: 'box' });
  const creep = (id: number, x: number, y: number): Candidate => ({ kind: 'creep', id, at: { x, y }, half: 6, shape: 'circle' });

  it('picks the candidate whose edge is nearest, within 44 px', () => {
    const r = resolveTap({ x: 100, y: 160 }, [pad(1, 100, 100), creep(7, 100, 190)]);
    expect(r.type).toBe('pick');
    if (r.type === 'pick') expect(r.pick).toMatchObject({ kind: 'creep', id: 7 });
    expect(resolveTap({ x: 400, y: 400 }, [pad(1, 100, 100)])).toEqual({ type: 'none' });
    const near = resolveTap({ x: 100, y: 160 }, [pad(1, 100, 100)]);
    expect(near.type === 'pick' && near.pick.d).toBe(36);
  });

  it('shows a picker when two candidates are equally close', () => {
    const r = resolveTap({ x: 100, y: 100 }, [pad(1, 70, 100), pad(2, 130, 100)]);
    expect(r.type).toBe('tie');
    if (r.type === 'tie') expect(r.picks.map((p) => p.id).sort()).toEqual([1, 2]);
    expect(arrowTo({ x: 100, y: 100 }, { x: 70, y: 100 })).toBe('←');
    expect(arrowTo({ x: 100, y: 100 }, { x: 100, y: 60 })).toBe('↑');
  });

  it('ignores taps in the control overlay', () => {
    const rects = [{ left: 150, top: 700, right: 250, bottom: 800 }];
    expect(inOverlay({ x: 200, y: 750 }, rects, null)).toBe(true);
    expect(inOverlay({ x: 20, y: 750 }, rects, null)).toBe(false);
    expect(inOverlay({ x: 20, y: 750 }, rects, 690)).toBe(true);
    expect(inOverlay({ x: 20, y: 600 }, rects, 690)).toBe(false);
  });
});

describe('hold to sell', () => {
  it('completes only after the full hold', () => {
    expect(holdProgress(1000, 1000)).toEqual({ progress: 0, done: false });
    expect(holdProgress(1000, 1000 + SELL_HOLD_MS / 2).done).toBe(false);
    expect(holdProgress(1000, 1000 + SELL_HOLD_MS)).toEqual({ progress: 1, done: true });
  });
});

describe('radial menus', () => {
  const bounds = { left: 0, top: 44, right: 412, bottom: 839, avoid: [{ left: 100, top: 690, right: 310, bottom: 831 }] };

  it('stays around its pad when there is room', () => {
    expect(placeRadial({ x: 200, y: 300 }, 100, 30, bounds)).toEqual({ x: 200, y: 300 });
  });

  it('stays on screen', () => {
    const p = placeRadial({ x: 5, y: 50 }, 100, 30, bounds);
    expect(p.x).toBe(100);
    expect(p.y).toBe(44 + 100 + 30);
  });

  it('moves up instead of covering the controls', () => {
    const p = placeRadial({ x: 206, y: 640 }, 100, 30, bounds);
    expect(p.y + 100).toBeLessThanOrEqual(690);
    expect(p.x).toBe(206);
  });

  it('spreads buttons evenly, the first at the top', () => {
    const spots = radialSpots(4, 10);
    expect(spots[0]!.x).toBeCloseTo(0);
    expect(spots[0]!.y).toBeCloseTo(-10);
    expect(spots[1]!.x).toBeCloseTo(10);
  });
});
