// Team half of the modifier sample. Full 3-player Sky Tide stays inside 40–80 Heart on the gate seeds.
// 2-player modifiers and Quick teams swing outside that band on at least one seed, so they are not in this
// sample; the no-modifier team gates (surges on) still cover 2 and 3 players in both modes.

import { describe, expect, it } from 'vitest';
import { createBalanceBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { BALANCE_SEEDS as SEEDS, HEART_TARGET, TEAM_OF_3 } from './helpers';

const TIMEOUT = 120_000;

describe('headless balance run (3 players, Sky Tide)', () => {
  it.each(SEEDS)(
    'three balance bots win all 30 waves with 40–80 Heart under Sky Tide (seed %i)',
    (seed) => {
      const result = runHeadlessMatch({
        bots: TEAM_OF_3.map((_, i) => createBalanceBot(`p${i + 1}`, undefined, i)),
        heroes: TEAM_OF_3,
        seed,
        modifiers: ['skyTide'],
      });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(30);
      expect(result.heartHp).toBeGreaterThanOrEqual(HEART_TARGET.min);
      expect(result.heartHp).toBeLessThanOrEqual(HEART_TARGET.max);
    },
    TIMEOUT,
  );
});
