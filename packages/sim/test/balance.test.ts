// Headless balance runs: scripted bots play full matches on default settings.

import { describe, expect, it } from 'vitest';
import { createBalanceBot, createIdleBot } from '../src/bots';
import { runHeadlessMatch } from '../src/headless';

const SEEDS = [1, 2, 3, 42, 1234];

describe('headless balance run (Phase 1, solo)', () => {
  it.each(SEEDS)('the sensible-build bot wins all 10 waves (seed %i)', (seed) => {
    const result = runHeadlessMatch({ bots: [createBalanceBot('p1')], seed });
    expect(result.result).toBe('victory');
    expect(result.wave).toBe(10);
    expect(result.heartHp).toBeGreaterThan(0);
  });

  it.each(SEEDS)('the do-nothing bot loses (seed %i)', (seed) => {
    const result = runHeadlessMatch({ bots: [createIdleBot('p1')], seed });
    expect(result.result).toBe('defeat');
    expect(result.heartHp).toBe(0);
  });
});
