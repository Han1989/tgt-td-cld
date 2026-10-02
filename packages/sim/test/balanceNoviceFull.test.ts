// The novice gate (balanceNovice.test.ts) in Full mode.

import { HERO_KINDS } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { noviceWinRate, NOVICE_WIN_RATE, PAIRS, TEAM_OF_3 } from './helpers';

const TIMEOUT = 480_000;

describe('novice bots on Normal (Full)', () => {
  it.each([
    ['solo', HERO_KINDS.map((h) => [h])],
    ['pairs', PAIRS],
    ['three players', [TEAM_OF_3]],
  ] as const)('win at least 80%% of the seeds: %s', (_size, teams) => {
    expect(noviceWinRate(teams.map((t) => [...t]), 'full')).toBeGreaterThanOrEqual(NOVICE_WIN_RATE);
  }, TIMEOUT);
});
