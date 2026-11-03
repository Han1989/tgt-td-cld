// Rampart Slam's lane quake as drawn (fx/quake.ts): the fronts' crack marks, frame by frame, and the calm version.

import { getMap, laneLength, TICK_RATE, TUNING } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import { QUAKE_MARK_SPACING, quakeDone, quakeMarks, quakeRun } from '../src/render/fx/quake';

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
