// Quick mode balance gate (docs/MOBILE.md §6): on 5 seeds the balance bot wins all 15 waves with 40–80 Heart HP
// left solo (every hero) and with 4 players, heroes reach level 8–10, and the do-nothing bot loses. A separate
// file so Vitest runs it in parallel with the Full-mode runs.

import { HERO_KINDS } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createBalanceBot, createIdleBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { BALANCE_SEEDS as SEEDS, HEART_TARGET } from './helpers';

/** A Quick match takes about half the CPU of a Full one. */
const TIMEOUT = 60_000;
/** Heroes should reach about level 8–10 in Quick mode. */
const MIN_LEVEL = 8;

describe('headless balance run (Quick mode)', () => {
  const solo = HERO_KINDS.flatMap((hero) => SEEDS.map((seed) => [hero, seed] as const));

  it.each(solo)(
    'the sensible-build bot wins all 15 waves as the %s with 40–80 Heart HP left (seed %i)',
    (hero, seed) => {
      const result = runHeadlessMatch({ bots: [createBalanceBot('p1')], heroes: [hero], seed, mode: 'quick' });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(15);
      expect(result.heroLevels[0]).toBeGreaterThanOrEqual(MIN_LEVEL);
      expect(result.heartHp).toBeGreaterThanOrEqual(HEART_TARGET.min);
      expect(result.heartHp).toBeLessThanOrEqual(HEART_TARGET.max);
    },
    TIMEOUT,
  );

  it.each(SEEDS)(
    'four sensible-build bots win all 15 waves with 40–80 Heart HP left (seed %i)',
    (seed) => {
      const result = runHeadlessMatch({
        bots: [0, 1, 2, 3].map((i) => createBalanceBot(`p${i + 1}`, undefined, i)),
        heroes: ['ranger', 'warden', 'arcanist', 'ranger'],
        seed,
        mode: 'quick',
      });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(15);
      for (const level of result.heroLevels) expect(level).toBeGreaterThanOrEqual(MIN_LEVEL);
      expect(result.heartHp).toBeGreaterThanOrEqual(HEART_TARGET.min);
      expect(result.heartHp).toBeLessThanOrEqual(HEART_TARGET.max);
    },
    TIMEOUT,
  );

  it.each(HERO_KINDS.flatMap((hero) => SEEDS.map((seed) => [hero, seed] as const)))(
    'the do-nothing bot loses as the %s (seed %i)',
    (hero, seed) => {
      const result = runHeadlessMatch({ bots: [createIdleBot('p1')], heroes: [hero], seed, mode: 'quick' });
      expect(result.result).toBe('defeat');
      expect(result.heartHp).toBe(0);
    },
    TIMEOUT,
  );
});
