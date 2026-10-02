// Expert bot on Normal and Hard, Quick mode, teams of 2 and 3. Hard keeps the difficulty curve.

import type { HeroKind } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createExpertBot } from '../src/bots';
import { runHeadlessMatch, type HeadlessResult } from '../src/headless';
import { BALANCE_SEEDS, expectTeamCurve, HARD_TARGET, PAIRS, QUICK_MIN_LEVEL, TEAM_OF_3, heartGate, HARD_SHARE, EXPERT_NORMAL_SHARE, EXPERT_NORMAL } from './helpers';

const TIMEOUT = 90_000;

function bots(heroes: HeroKind[]) {
  return heroes.map((_, i) => createExpertBot(`p${i + 1}`, undefined, i));
}

describe('expert bot (Quick mode, teams)', () => {
  const hardGate = heartGate(HARD_TARGET, HARD_SHARE);
  const normalGate = heartGate(EXPERT_NORMAL, EXPERT_NORMAL_SHARE);
  const pairs = BALANCE_SEEDS.map((seed, i) => [...PAIRS[i % PAIRS.length]!, seed] as const);
  const hard: Record<number, HeadlessResult[]> = { 2: [], 3: [] };

  it.each(pairs)(
    'on Normal a %s + %s pair wins all 15 waves with at least 85 Heart HP (seed %i)',
    (a, b, seed) => {
      const result = runHeadlessMatch({ bots: bots([a, b]), heroes: [a, b], seed, mode: 'quick' });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(15);
      for (const level of result.heroLevels) expect(level).toBeGreaterThanOrEqual(QUICK_MIN_LEVEL);
      normalGate(result.heartHp);
    },
    TIMEOUT,
  );

  it.each(BALANCE_SEEDS)(
    'on Normal three experts win all 15 waves with at least 85 Heart HP (seed %i)',
    (seed) => {
      const result = runHeadlessMatch({ bots: bots(TEAM_OF_3), heroes: TEAM_OF_3, seed, mode: 'quick' });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(15);
      for (const level of result.heroLevels) expect(level).toBeGreaterThanOrEqual(QUICK_MIN_LEVEL);
      normalGate(result.heartHp);
    },
    TIMEOUT,
  );

  it.each(pairs)(
    'on Hard a %s + %s pair wins all 15 waves with 40–80 Heart HP (seed %i)',
    (a, b, seed) => {
      const result = runHeadlessMatch({
        bots: bots([a, b]),
        heroes: [a, b],
        seed,
        mode: 'quick',
        difficulty: 'hard',
      });
      hard[2]!.push(result);
      // A lost Hard match counts as 0 Heart in the gate below.
      hardGate(result.result === 'victory' ? result.heartHp : 0);
    },
    TIMEOUT,
  );

  it.each(BALANCE_SEEDS)(
    'on Hard three experts win all 15 waves with 40–80 Heart HP (seed %i)',
    (seed) => {
      const result = runHeadlessMatch({
        bots: bots(TEAM_OF_3),
        heroes: TEAM_OF_3,
        seed,
        mode: 'quick',
        difficulty: 'hard',
      });
      hard[3]!.push(result);
      // A lost Hard match counts as 0 Heart in the gate below.
      hardGate(result.result === 'victory' ? result.heartHp : 0);
    },
    TIMEOUT,
  );

  it('on Hard the last third is the tensest for pairs and for three players', () => {
    expect(hard[2]).toHaveLength(pairs.length);
    expect(hard[3]).toHaveLength(BALANCE_SEEDS.length);
    expectTeamCurve(hard[2]!);
    expectTeamCurve(hard[3]!);
  });
});
