// Rampart Slam's lane quake as drawn (fx/quake.ts): the fronts' crack marks, frame by frame, and the calm version.

import { getMap, laneLength, TICK_RATE, TUNING } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import { lanePointAt } from '@tdt/sim';
import { markOnGround, markOnScreen, QUAKE_MARK_SPACING, quakeDone, quakeMarks, quakeRun } from '../src/render/fx/quake';
import { viewCos, worldToScreen } from '../src/render/view';

const SPEED = TUNING.hero.warden.rampartSlam.quakeSpeed;
const MID = laneLength(getMap().lanes[1]!);

describe('the lane quake as drawn', () => {
  it('stamps marks both ways from the cast point as the fronts pass, each once, up to the lane ends', () => {
    const run = quakeRun(1, 20, MID, SPEED, 1000, false);
    const seen: number[] = [];
    for (let t = 1000; !quakeDone(run, t); t += 16) seen.push(...quakeMarks(run, t).map((m) => m.progress));
    seen.push(...quakeMarks(run, 1000 + 5000).map((m) => m.progress));
    const rounded = seen.map((p) => Math.round(p * 100) / 100);
    expect(new Set(rounded).size).toBe(rounded.length);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...seen)).toBeLessThanOrEqual(MID);
    // Every stretch of the lane gets marks: no gap wider than the spacing.
    const sorted = [...seen].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeLessThanOrEqual(QUAKE_MARK_SPACING + 1e-6);
    expect(sorted[0]!).toBeLessThan(QUAKE_MARK_SPACING);
    expect(MID - sorted[sorted.length - 1]!).toBeLessThan(QUAKE_MARK_SPACING);
  });

  it('moves at the sim’s speed: half a second in, the fronts are 8 tiles out each way', () => {
    const run = quakeRun(1, 18, MID, SPEED, 0, false);
    quakeMarks(run, 0);
    const marks = quakeMarks(run, 500);
    const leads = marks.filter((m) => m.lead);
    expect(leads).toHaveLength(2);
    for (const m of leads) expect(Math.abs(m.progress - 18)).toBeCloseTo(SPEED * 0.5, 0);
    // Done once the farther end (the portal, 18 tiles back) is reached, about when the sim's front gets there.
    const far = Math.max(18, MID - 18);
    expect(quakeDone(run, (far / SPEED) * 1000 - 20)).toBe(false);
    expect(quakeDone(run, (far / SPEED) * 1000 + 1)).toBe(true);
    expect(Math.ceil((far / SPEED) * TICK_RATE)).toBeLessThanOrEqual(TICK_RATE * 2);
  });

  it('under reduced motion, marks the whole lane at once and is done: nothing travels', () => {
    const run = quakeRun(1, 10, MID, SPEED, 0, true);
    const marks = quakeMarks(run, 0);
    expect(marks.length).toBeGreaterThan(MID / QUAKE_MARK_SPACING - 2);
    expect(quakeDone(run, 0)).toBe(true);
    expect(quakeMarks(run, 100)).toEqual([]);
  });

  it('a cast at the portal runs one way only', () => {
    const run = quakeRun(1, 0, MID, SPEED, 0, false);
    const marks = quakeMarks(run, 3000);
    expect(marks.every((m) => m.dir === 1)).toBe(true);
  });
});

describe('the quake on the pitched ground (V-08b build 3)', () => {
  it("a crack mark lies on its lane's ground point and is drawn along the lane's screen path", () => {
    const cos = viewCos();
    expect(cos).toBeLessThan(1);
    for (const lane of getMap().lanes) {
      const len = laneLength(lane);
      for (let at = 0.5; at < len - 0.5; at += 1.3) {
        const g = markOnGround(lane, at);
        const p = lanePointAt(lane, at);
        expect(g.x).toBeCloseTo(p.x, 9);
        expect(g.y).toBeCloseTo(p.y, 9);
        // On screen: the lane's own drawn direction there (two points either side through the camera).
        const s = markOnScreen(lane, at);
        const a = worldToScreen(lanePointAt(lane, at - 0.05).x, lanePointAt(lane, at - 0.05).y);
        const b = worldToScreen(lanePointAt(lane, at + 0.05).x, lanePointAt(lane, at + 0.05).y);
        const at2 = worldToScreen(p.x, p.y);
        expect(s.x).toBeCloseTo(at2.x, 9);
        expect(s.y).toBeCloseTo(at2.y, 9);
        expect(s.y).toBeCloseTo(p.y * cos, 9);
        const want = Math.atan2(b.y - a.y, b.x - a.x);
        const diff = Math.atan2(Math.sin(s.angle - want), Math.cos(s.angle - want));
        expect(Math.abs(diff)).toBeLessThan(1e-6);
        // A mark turned by its ground angle under the ground plane (y squashed by cos) points the same way on screen.
        const under = Math.atan2(Math.sin(g.angle) * cos, Math.cos(g.angle));
        expect(Math.abs(Math.atan2(Math.sin(under - want), Math.cos(under - want)))).toBeLessThan(1e-6);
      }
    }
  });

  it('the fronts travel along the pitched lane: every mark of a run is on its lane as drawn', () => {
    const lane = getMap().lanes[1]!;
    const run = quakeRun(1, 20, MID, SPEED, 0, false);
    const marks = quakeMarks(run, 10_000);
    expect(marks.length).toBeGreaterThan(10);
    for (const m of marks) {
      const s = markOnScreen(lane, m.progress);
      const p = lanePointAt(lane, m.progress);
      expect(s.y).toBeCloseTo(p.y * viewCos(), 9);
    }
  });
});
