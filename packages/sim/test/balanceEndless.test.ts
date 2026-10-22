// Endless's loop gate (docs/GAME_DESIGN.md "Endless"; Han, 22 Oct 2026), solo, every hero on the five gate seeds. Waves
// 1–30 are Hard Full, whose gates already hold; past them the loop must bite, and end: the expert bot falls between
// waves 33 and 55, the casual bot before wave 40, the novice before wave 30. Each band is on the mean of the gate's 15
// matches (a single seed swings a few waves, and a novice that limps into wave 31 with 2 Heart still counts); every
// match must end in defeat, and every expert match must fall inside its band. Tuned by `tuning.endless` alone.

import { HERO_KINDS } from '@tdt/protocol';
import { afterAll, describe, expect, it } from 'vitest';
import { createBalanceBot, createExpertBot, createNoviceBot, type Bot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { BALANCE_SEEDS as SEEDS } from './helpers';

const TIMEOUT = 60_000;

/** The wave each bot's Heart falls on, as a band of the mean (`min` ≤ mean < `before`). */
const BANDS = {
  expert: { make: (id: string) => createExpertBot(id), min: 33, before: 56, eachInBand: true },
  casual: { make: (id: string) => createBalanceBot(id), min: 1, before: 40, eachInBand: false },
  novice: { make: (id: string) => createNoviceBot(id), min: 1, before: 30, eachInBand: false },
} satisfies Record<string, { make: (id: string) => Bot; min: number; before: number; eachInBand: boolean }>;

const cases = HERO_KINDS.flatMap((hero) => SEEDS.map((seed) => [hero, seed] as const));

for (const [name, band] of Object.entries(BANDS)) {
  describe(`Endless, ${name} bot, solo`, () => {
    const waves: number[] = [];
    afterAll(() => {
      if (waves.length === 0) return;
      const mean = waves.reduce((a, b) => a + b, 0) / waves.length;
      const said = `mean wave ${mean.toFixed(1)} of ${waves.join(', ')}`;
      expect(mean, said).toBeGreaterThanOrEqual(band.min);
      expect(mean, said).toBeLessThan(band.before);
    });

    it.each(cases)(
      `the %s falls (seed %i)`,
      (hero, seed) => {
        const result = runHeadlessMatch({ bots: [band.make('p1')], heroes: [hero], seed, mode: 'endless' });
        expect(result.result).toBe('defeat');
        if (band.eachInBand) {
          expect(result.wave).toBeGreaterThanOrEqual(band.min);
          expect(result.wave).toBeLessThan(band.before);
        }
        waves.push(result.wave);
      },
      TIMEOUT,
    );
  });
}
