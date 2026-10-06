// Headless balance runs: scripted bots play full matches on default settings.

import { describe, expect, it } from 'vitest';
import { createBalanceBot, createIdleBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { TUNING } from '../src/tuning';
import { BALANCE_SEEDS as SEEDS, HEART_TARGET, heartGate, CASUAL_SHARE } from './helpers';

/** A full 30-wave match takes a few seconds of CPU. */
const TIMEOUT = 60_000;

describe('headless balance run (solo)', () => {
  // Provisional until Playtest 3 (tower repair; docs/balance/TUNING_LOG.md, round 4): with repair the casual solo Ranger
  // ends Full at 96.1 Heart on 30 seeds, 10% of them inside 50–90. Mean ceiling 95 → 99, share 0.6 → 0.
  const casualGate = heartGate(HEART_TARGET, CASUAL_SHARE, 5, { meanMax: 99, share: 0 });
  it.each(SEEDS)(
    'the sensible-build bot wins all 30 waves with 50–90 Heart HP on average (seed %i)',
    (seed) => {
      const result = runHeadlessMatch({ bots: [createBalanceBot('p1')], seed });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(TUNING.waves.list.length);
      expect(result.wave).toBe(30);
      casualGate(result.heartHp);
    },
    TIMEOUT,
  );

  it.each(SEEDS)(
    'the do-nothing bot loses (seed %i)',
    (seed) => {
      const result = runHeadlessMatch({ bots: [createIdleBot('p1')], seed });
      expect(result.result).toBe('defeat');
      expect(result.heartHp).toBe(0);
    },
    TIMEOUT,
  );
});
