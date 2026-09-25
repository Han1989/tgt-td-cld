// Headless balance run for 2-player teams on Normal: each seed gets a different
// hero pair. A separate file so Vitest runs it in parallel with the other
// 30-wave runs.

import type { HeroKind } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createBalanceBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { BALANCE_SEEDS, HEART_TARGET } from './helpers';

const PAIRS: [HeroKind, HeroKind][] = [
  ['ranger', 'warden'],
  ['warden', 'arcanist'],
  ['arcanist', 'ranger'],
];
const TIMEOUT = 120_000;

describe('headless balance run (2 players)', () => {
  const cases = BALANCE_SEEDS.map((seed, i) => [...PAIRS[i % PAIRS.length]!, seed] as const);

  it.each(cases)(
    'a %s + %s pair of sensible-build bots wins all 30 waves with 40–80 Heart HP left (seed %i)',
    (a, b, seed) => {
      const result = runHeadlessMatch({
        bots: [0, 1].map((i) => createBalanceBot(`p${i + 1}`, undefined, i)),
        heroes: [a, b],
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
