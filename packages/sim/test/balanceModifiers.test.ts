// Balance gate with a fixed sample of modifiers, solo. No-modifier gates (surges on) stay in balance*.test.ts.
// Full: Ironclad, Sky Tide and Gold Rush, the three that stay inside 40–80 Heart on these seeds.
// Quick: Ironclad. Swift and Fog use the documented rates and are not in this sample: on these seeds the
// balance bot finishes them under 40 Heart. Teams are in balanceModifiersTeams.test.ts.

import type { Modifier } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createBalanceBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { BALANCE_SEEDS as SEEDS, HEART_TARGET, QUICK_MIN_LEVEL } from './helpers';

const TIMEOUT = 60_000;

const FULL_SAMPLE: Modifier[] = ['ironclad', 'skyTide', 'goldRush'];

describe('headless balance run (solo, modifier sample)', () => {
  const full = FULL_SAMPLE.flatMap((modifier) => SEEDS.map((seed) => [modifier, seed] as const));

  it.each(full)(
    'Full: the balance bot wins all 30 waves with 40–80 Heart under %s (seed %i)',
    (modifier, seed) => {
      const result = runHeadlessMatch({ bots: [createBalanceBot('p1')], seed, modifiers: [modifier] });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(30);
      expect(result.heartHp).toBeGreaterThanOrEqual(HEART_TARGET.min);
      expect(result.heartHp).toBeLessThanOrEqual(HEART_TARGET.max);
    },
    TIMEOUT,
  );

  it.each(SEEDS)(
    'Quick: the balance bot wins all 15 waves with 40–80 Heart under Ironclad (seed %i)',
    (seed) => {
      const result = runHeadlessMatch({
        bots: [createBalanceBot('p1')],
        seed,
        mode: 'quick',
        modifiers: ['ironclad'],
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
