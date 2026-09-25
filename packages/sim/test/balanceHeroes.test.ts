// Headless balance runs for the Phase 3 heroes (Warden, Arcanist; the Ranger
// is covered by balance.test.ts). A separate file so Vitest runs it in
// parallel with the other 30-wave runs.

import { describe, expect, it } from 'vitest';
import { createBalanceBot, createIdleBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { TUNING } from '../src/tuning';

const SEEDS = [1, 2, 3, 42, 1234];
/** A full 30-wave match takes a few seconds of CPU. */
const TIMEOUT = 60_000;

describe('headless balance run (Phase 3 heroes, solo)', () => {
  const cases = (['warden', 'arcanist'] as const).flatMap((hero) => SEEDS.map((seed) => [hero, seed] as const));

  it.each(cases)(
    'the sensible-build bot wins all 30 waves as the %s (seed %i)',
    (hero, seed) => {
      const result = runHeadlessMatch({ bots: [createBalanceBot('p1')], heroes: [hero], seed });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(30);
      expect(result.heroLevels[0]).toBe(TUNING.hero.maxLevel);
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
