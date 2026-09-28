// Quick mode balance gate for teams: on 5 seeds, 2 balance bots (one pair per seed) and 3 balance bots (one hero
// of each kind) win all 15 waves with 40–80 Heart HP left, every hero reaches level 8+, and do-nothing teams lose.
// A separate file so Vitest runs it in parallel with the solo Quick runs.

import type { HeroKind } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createBalanceBot, createIdleBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { BALANCE_SEEDS as SEEDS, HEART_TARGET, PAIRS, QUICK_MIN_LEVEL, TEAM_OF_3 } from './helpers';

const TIMEOUT = 60_000;

function expectWin(heroes: HeroKind[], seed: number): void {
  const result = runHeadlessMatch({
    bots: heroes.map((_, i) => createBalanceBot(`p${i + 1}`, undefined, i)),
    heroes,
    seed,
    mode: 'quick',
  });
  expect(result.result).toBe('victory');
  expect(result.wave).toBe(15);
  for (const level of result.heroLevels) expect(level).toBeGreaterThanOrEqual(QUICK_MIN_LEVEL);
  expect(result.heartHp).toBeGreaterThanOrEqual(HEART_TARGET.min);
  expect(result.heartHp).toBeLessThanOrEqual(HEART_TARGET.max);
}

describe('headless balance run (Quick mode, teams)', () => {
  const pairs = SEEDS.map((seed, i) => [...PAIRS[i % PAIRS.length]!, seed] as const);

  it.each(pairs)(
    'a %s + %s pair of sensible-build bots wins all 15 waves with 40–80 Heart HP left (seed %i)',
    (a, b, seed) => expectWin([a, b], seed),
    TIMEOUT,
  );

  it.each(SEEDS)(
    'three sensible-build bots win all 15 waves with 40–80 Heart HP left (seed %i)',
    (seed) => expectWin(TEAM_OF_3, seed),
    TIMEOUT,
  );

  it.each([{ heroes: PAIRS[0]! }, { heroes: TEAM_OF_3 }])('do-nothing bots lose ($heroes)', ({ heroes }) => {
    const result = runHeadlessMatch({
      bots: heroes.map((_, i) => createIdleBot(`p${i + 1}`)),
      heroes,
      seed: 1,
      mode: 'quick',
    });
    expect(result.result).toBe('defeat');
  });
});
