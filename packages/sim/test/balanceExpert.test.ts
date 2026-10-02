// Expert bot on Normal and Hard, Full mode, solo. Normal: wins with at least 80 Heart. Hard: 40–80 Heart.
// The casual bot's Normal gate is unchanged (balance.test.ts, balanceHeroes.test.ts).

import { HERO_KINDS } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createExpertBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { BALANCE_SEEDS as SEEDS, EXPERT_NORMAL_MIN, HARD_TARGET } from './helpers';

const TIMEOUT = 60_000;

describe('expert bot (Full mode, solo)', () => {
  const cases = HERO_KINDS.flatMap((hero) => SEEDS.map((seed) => [hero, seed] as const));

  it.each(cases)(
    'on Normal the %s wins all 30 waves with at least 85 Heart HP (seed %i)',
    (hero, seed) => {
      const result = runHeadlessMatch({ bots: [createExpertBot('p1')], heroes: [hero], seed });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(30);
      expect(result.heartHp).toBeGreaterThanOrEqual(EXPERT_NORMAL_MIN);
    },
    TIMEOUT,
  );

  it.each(cases)(
    'on Hard the %s wins all 30 waves with 40–80 Heart HP (seed %i)',
    (hero, seed) => {
      const result = runHeadlessMatch({
        bots: [createExpertBot('p1')],
        heroes: [hero],
        seed,
        difficulty: 'hard',
      });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(30);
      expect(result.heartHp).toBeGreaterThanOrEqual(HARD_TARGET.min);
      expect(result.heartHp).toBeLessThanOrEqual(HARD_TARGET.max);
    },
    TIMEOUT,
  );
});
