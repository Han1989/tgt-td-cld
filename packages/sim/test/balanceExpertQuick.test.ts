// Expert bot on Normal and Hard, Quick mode, solo.

import { HERO_KINDS } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createExpertBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { BALANCE_SEEDS as SEEDS, HEART_TARGET, QUICK_MIN_LEVEL } from './helpers';

const TIMEOUT = 60_000;

describe('expert bot (Quick mode, solo)', () => {
  const cases = HERO_KINDS.flatMap((hero) => SEEDS.map((seed) => [hero, seed] as const));

  it.each(cases)(
    'on Normal the %s wins all 15 waves with at least 80 Heart HP (seed %i)',
    (hero, seed) => {
      const result = runHeadlessMatch({ bots: [createExpertBot('p1')], heroes: [hero], seed, mode: 'quick' });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(15);
      expect(result.heroLevels[0]).toBeGreaterThanOrEqual(QUICK_MIN_LEVEL);
      expect(result.heartHp).toBeGreaterThanOrEqual(80);
    },
    TIMEOUT,
  );

  it.each(cases)(
    'on Hard the %s wins all 15 waves with 40–80 Heart HP (seed %i)',
    (hero, seed) => {
      const result = runHeadlessMatch({
        bots: [createExpertBot('p1')],
        heroes: [hero],
        seed,
        mode: 'quick',
        difficulty: 'hard',
      });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(15);
      expect(result.heroLevels[0]).toBeGreaterThanOrEqual(QUICK_MIN_LEVEL);
      expect(result.heartHp).toBeGreaterThanOrEqual(HEART_TARGET.min);
      expect(result.heartHp).toBeLessThanOrEqual(HEART_TARGET.max);
    },
    TIMEOUT,
  );
});
