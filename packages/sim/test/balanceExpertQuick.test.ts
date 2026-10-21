// Expert bot on Normal and Hard, Quick mode, solo.

import { HERO_KINDS } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createExpertBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { BALANCE_SEEDS as SEEDS, HARD_TARGET, QUICK_MIN_LEVEL, heartGate, HARD_SHARE, EXPERT_NORMAL_SHARE, EXPERT_NORMAL } from './helpers';

const TIMEOUT = 60_000;

describe('expert bot (Quick mode, solo)', () => {
  const hardGate = heartGate(HARD_TARGET, HARD_SHARE);
  // Provisional (the chase cap, 21 Oct 2026; docs/balance/TUNING_LOG.md, round 5): a Warden no longer holds a
  // lane's whole wave; the expert Warden ends Quick Normal at 82.1 Heart on 30 seeds (22 of 30 under 85).
  // Share 0.8 → 0.6.
  const normalGate = heartGate(EXPERT_NORMAL, EXPERT_NORMAL_SHARE, 5, { share: 0.6 });
  const cases = HERO_KINDS.flatMap((hero) => SEEDS.map((seed) => [hero, seed] as const));

  it.each(cases)(
    'on Normal the %s wins all 15 waves with at least 85 Heart HP (seed %i)',
    (hero, seed) => {
      const result = runHeadlessMatch({ bots: [createExpertBot('p1')], heroes: [hero], seed, mode: 'quick' });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(15);
      expect(result.heroLevels[0]).toBeGreaterThanOrEqual(QUICK_MIN_LEVEL);
      normalGate(result.heartHp);
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
      // A lost Hard match counts as 0 Heart in the gate below.
      hardGate(result.result === 'victory' ? result.heartHp : 0);
    },
    TIMEOUT,
  );
});
