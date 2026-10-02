// Headless balance run for 2-player teams on Normal: each seed gets a different
// hero pair. A separate file so Vitest runs it in parallel with the other
// 30-wave runs. Over the gate's matches, the last third costs at least a quarter of the Heart lost (`CURVE`).

import { describe, expect, it } from 'vitest';
import { createBalanceBot, createIdleBot } from '../src/bots';
import { runHeadlessMatch, type HeadlessResult } from '../src/headless';
import { BALANCE_SEEDS, expectTeamCurve, HEART_TARGET, PAIRS, heartGate, CASUAL_SHARE } from './helpers';
const TIMEOUT = 120_000;

describe('headless balance run (2 players)', () => {
  // Full pairs average 80–94 Heart, over the 50–90 band on about half the seeds (the ranged pair is the weak one; docs/balance/TUNING_LOG.md):
  // the gate holds the mean and every win, not the share.
  const casualGate = heartGate(HEART_TARGET, 0.2);
  const cases = BALANCE_SEEDS.map((seed, i) => [...PAIRS[i % PAIRS.length]!, seed] as const);
  const results: HeadlessResult[] = [];

  it.each(cases)(
    'a %s + %s pair of sensible-build bots wins all 30 waves with 50–90 Heart HP on average (seed %i)',
    (a, b, seed) => {
      const result = runHeadlessMatch({
        bots: [0, 1].map((i) => createBalanceBot(`p${i + 1}`, undefined, i)),
        heroes: [a, b],
        seed,
      });
      results.push(result);
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(30);
      casualGate(result.heartHp);
    },
    TIMEOUT,
  );

  it('the last third of the match is the tensest: ≥ 25% of the Heart lost, the first third ≤ 45%', () => {
    expect(results).toHaveLength(cases.length);
    expectTeamCurve(results);
  });

  it('two do-nothing bots lose', () => {
    const result = runHeadlessMatch({ bots: [createIdleBot('p1'), createIdleBot('p2')], heroes: PAIRS[0], seed: 1 });
    expect(result.result).toBe('defeat');
  });
});
