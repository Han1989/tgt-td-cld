// Headless balance run for a full team: 4 balance bots with mixed heroes on
// Normal (player-count scaling on). A separate file so Vitest runs it in
// parallel with the solo 30-wave runs.

import { describe, expect, it } from 'vitest';
import { createBalanceBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { BALANCE_SEEDS as SEEDS, HEART_TARGET } from './helpers';

/** A 4-player 30-wave match takes several seconds of CPU. */
const TIMEOUT = 120_000;

describe('headless balance run (4 players)', () => {
  it.each(SEEDS)(
    'four sensible-build bots win all 30 waves with 40–80 Heart HP left (seed %i)',
    (seed) => {
      const result = runHeadlessMatch({
        bots: [0, 1, 2, 3].map((i) => createBalanceBot(`p${i + 1}`, undefined, i)),
        heroes: ['ranger', 'warden', 'arcanist', 'ranger'],
        seed,
      });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(30);
      expect(result.heartHp).toBeGreaterThanOrEqual(HEART_TARGET.min);
      expect(result.heartHp).toBeLessThanOrEqual(HEART_TARGET.max);
    },
    TIMEOUT,
  );
});
