import { describe, expect, it } from 'vitest';
import {
  BOSS_KINDS,
  BOSS_LANE_HINTS,
  BOSS_WAVES,
  LANE_NAMES,
  TOWER_BRANCH_KINDS,
  bossLaneHint,
  heroGiftTotals,
  heroRepairTotals,
  laneName,
} from '../src';

describe('lane names', () => {
  it('names West, Mid and East in lane order', () => {
    expect(LANE_NAMES).toEqual(['West', 'Mid', 'East']);
    expect(laneName(0)).toBe('West');
    expect(laneName(1)).toBe('Mid');
    expect(laneName(2)).toBe('East');
  });
});

describe('boss lane hints', () => {
  it('gives every boss three advisory lane lines and does not name a branch', () => {
    const branches = TOWER_BRANCH_KINDS.join('|');
    for (const kind of BOSS_KINDS) {
      const lines = BOSS_LANE_HINTS[kind];
      expect(lines).toHaveLength(3);
      expect(BOSS_WAVES[kind].full).toBeGreaterThan(0);
      expect(BOSS_WAVES[kind].quick).toBeGreaterThan(0);
      for (const lane of [0, 1, 2] as const) {
        const line = bossLaneHint(kind, lane);
        expect(line).toBe(lines[lane]);
        expect(line.length).toBeGreaterThan(0);
        expect(line.toLowerCase()).not.toMatch(new RegExp(branches));
        expect(line.toLowerCase()).not.toMatch(/required|must build/);
      }
    }
    expect(BOSS_LANE_HINTS.ironhorn[1].toLowerCase()).toContain('stomp');
    expect(BOSS_LANE_HINTS.matriarch[1].toLowerCase()).toContain('hatch');
    expect(BOSS_LANE_HINTS.shardback[1].toLowerCase()).toMatch(/stone/);
    expect(BOSS_LANE_HINTS.shardback[1].toLowerCase()).toMatch(/ether/);
  });
});

describe('hero gift totals', () => {
  it('reads a missing total as 0', () => {
    expect(heroGiftTotals({})).toEqual({ goldGifted: 0, goldReceived: 0 });
    expect(heroGiftTotals({ goldGifted: 40 })).toEqual({ goldGifted: 40, goldReceived: 0 });
    expect(heroGiftTotals({ goldGifted: 10, goldReceived: 25 })).toEqual({ goldGifted: 10, goldReceived: 25 });
  });
});

describe('hero repair totals', () => {
  it('reads a missing total as 0 (reports from before protocol 19)', () => {
    expect(heroRepairTotals({})).toEqual({ repairs: 0, repairGold: 0, towersDestroyed: 0 });
    expect(heroRepairTotals({ repairs: 3, repairGold: 41, towersDestroyed: 2 })).toEqual({ repairs: 3, repairGold: 41, towersDestroyed: 2 });
  });
});
