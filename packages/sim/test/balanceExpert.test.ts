// Expert bot on Normal and Hard, Full mode, solo. Normal: wins with at least 80 Heart. Hard: 40–80 Heart.
// The casual bot's Normal gate is unchanged (balance.test.ts, balanceHeroes.test.ts).

import { HERO_KINDS } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createExpertBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { BALANCE_SEEDS as SEEDS, HARD_TARGET, heartGate, HARD_SHARE, EXPERT_NORMAL_SHARE, EXPERT_NORMAL } from './helpers';

const TIMEOUT = 60_000;

describe('expert bot (Full mode, solo)', () => {
  const hardGate = heartGate(HARD_TARGET, HARD_SHARE);
  const normalGate = heartGate(EXPERT_NORMAL, EXPERT_NORMAL_SHARE);
  const cases = HERO_KINDS.flatMap((hero) => SEEDS.map((seed) => [hero, seed] as const));

  it.each(cases)(
    'on Normal the %s wins all 30 waves with at least 85 Heart HP (seed %i)',
    (hero, seed) => {
      const result = runHeadlessMatch({ bots: [createExpertBot('p1')], heroes: [hero], seed });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(30);
      normalGate(result.heartHp);
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
      // A lost Hard match counts as 0 Heart in the gate below.
      hardGate(result.result === 'victory' ? result.heartHp : 0);
    },
    TIMEOUT,
  );
});
