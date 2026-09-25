// Headless balance runs: scripted bots play full matches on default settings.

import { describe, expect, it } from 'vitest';
import { createBalanceBot, createIdleBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';
import { TUNING } from '../src/tuning';

const SEEDS = [1, 2, 3, 42, 1234];
/** A full 30-wave match takes a few seconds of CPU. */
const TIMEOUT = 60_000;

describe('headless balance run (solo)', () => {
  it.each(SEEDS)(
    'the sensible-build bot wins all 30 waves (seed %i)',
    (seed) => {
      const result = runHeadlessMatch({ bots: [createBalanceBot('p1')], seed });
      expect(result.result).toBe('victory');
      expect(result.wave).toBe(TUNING.waves.list.length);
      expect(result.wave).toBe(30);
      expect(result.heartHp).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  it.each(SEEDS)(
    'the do-nothing bot loses (seed %i)',
    (seed) => {
      const result = runHeadlessMatch({ bots: [createIdleBot('p1')], seed });
      expect(result.result).toBe('defeat');
      expect(result.heartHp).toBe(0);
    },
    TIMEOUT,
  );
});
