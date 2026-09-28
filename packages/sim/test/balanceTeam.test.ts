// Headless balance run for a full team: 3 balance bots (the most a match holds, one per lane) with one hero of
// each kind on Normal (player-count scaling on). A separate file so Vitest runs it in parallel with the solo
// 30-wave runs.

import { describe, expect, it } from 'vitest';
import { createBalanceBot, createIdleBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { BALANCE_SEEDS as SEEDS, HEART_TARGET, TEAM_OF_3 } from './helpers';

/** A 3-player 30-wave match takes a few seconds of CPU. */
const TIMEOUT = 120_000;

describe('headless balance run (3 players)', () => {
  it.each(SEEDS)(
    'three sensible-build bots win all 30 waves with 40–80 Heart HP left (seed %i)',
    (seed) => {
      const result = runHeadlessMatch({
        bots: TEAM_OF_3.map((_, i) => createBalanceBot(`p${i + 1}`, undefined, i)),
        heroes: TEAM_OF_3,
        seed,
      });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(30);
      expect(result.heartHp).toBeGreaterThanOrEqual(HEART_TARGET.min);
      expect(result.heartHp).toBeLessThanOrEqual(HEART_TARGET.max);
    },
    TIMEOUT,
  );

  it('three do-nothing bots lose', () => {
    const result = runHeadlessMatch({ bots: TEAM_OF_3.map((_, i) => createIdleBot(`p${i + 1}`)), heroes: TEAM_OF_3, seed: 1 });
    expect(result.result).toBe('defeat');
  });
});
