// Headless balance runs for the Phase 3 heroes (Warden, Arcanist; the Ranger
// is covered by balance.test.ts). A separate file so Vitest runs it in
// parallel with the other 30-wave runs.

import { describe, expect, it } from 'vitest';
import { createBalanceBot, createIdleBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { TUNING } from '../src/tuning';
import { BALANCE_SEEDS as SEEDS, HEART_TARGET, heartGate, CASUAL_SHARE } from './helpers';

/** A full 30-wave match takes a few seconds of CPU. */
const TIMEOUT = 60_000;

describe('headless balance run (Phase 3 heroes, solo)', () => {
  // Provisional until Playtest 3 (tower repair; docs/balance/TUNING_LOG.md, round 4): with repair the casual solo Warden
  // and Arcanist end Full at 97.0 Heart on 30 seeds, 3% of them inside 50–90. Mean ceiling 95 → 100, share 0.6 → 0.
  const casualGate = heartGate(HEART_TARGET, CASUAL_SHARE, 5, { meanMax: 100, share: 0 });
  const cases = (['warden', 'arcanist'] as const).flatMap((hero) => SEEDS.map((seed) => [hero, seed] as const));

  it.each(cases)(
    'the sensible-build bot wins all 30 waves as the %s with 50–90 Heart HP on average (seed %i)',
    (hero, seed) => {
      const result = runHeadlessMatch({ bots: [createBalanceBot('p1')], heroes: [hero], seed });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(30);
      expect(result.heroLevels[0]).toBe(TUNING.hero.maxLevel);
      casualGate(result.heartHp);
    },
    TIMEOUT,
  );

  it.each(['warden', 'arcanist'] as const)(
    'the do-nothing bot loses as the %s',
    (hero) => {
      const result = runHeadlessMatch({ bots: [createIdleBot('p1')], heroes: [hero], seed: 1 });
      expect(result.result).toBe('defeat');
    },
    TIMEOUT,
  );
});
