// Quick mode balance gate, solo (docs/MOBILE.md §6): on 5 seeds the balance bot wins all 15 waves with 40–80 Heart
// HP left with every hero, heroes reach level 8–10, and the do-nothing bot loses. Teams of 2 and 3 are in
// balanceQuickTeams.test.ts. Separate files so Vitest runs them in parallel with the Full-mode runs.

import { HERO_KINDS } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createBalanceBot, createIdleBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { BALANCE_SEEDS as SEEDS, HEART_TARGET, QUICK_MIN_LEVEL, heartGate, CASUAL_SHARE } from './helpers';

/** A Quick match takes about half the CPU of a Full one. */
const TIMEOUT = 60_000;

describe('headless balance run (Quick mode, solo)', () => {
  const casualGate = heartGate(HEART_TARGET, CASUAL_SHARE);
  const solo = HERO_KINDS.flatMap((hero) => SEEDS.map((seed) => [hero, seed] as const));

  it.each(solo)(
    'the sensible-build bot wins all 15 waves as the %s with 50–90 Heart HP on average (seed %i)',
    (hero, seed) => {
      const result = runHeadlessMatch({ bots: [createBalanceBot('p1')], heroes: [hero], seed, mode: 'quick' });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(15);
      expect(result.heroLevels[0]).toBeGreaterThanOrEqual(QUICK_MIN_LEVEL);
      casualGate(result.heartHp);
    },
    TIMEOUT,
  );

  it.each(solo)(
    'the do-nothing bot loses as the %s (seed %i)',
    (hero, seed) => {
      const result = runHeadlessMatch({ bots: [createIdleBot('p1')], heroes: [hero], seed, mode: 'quick' });
      expect(result.result).toBe('defeat');
      expect(result.heartHp).toBe(0);
    },
    TIMEOUT,
  );
});
