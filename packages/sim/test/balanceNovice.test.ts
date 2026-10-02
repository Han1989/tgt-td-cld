// Normal is for first-time players (playtest 2): the novice bot (half the towers early, a third of its gold held, no Flak
// until flyers leak, half its ultimates, no retreat, no early calls) wins at least 80% of the seeds in every team size,
// in Quick and in Full. Full is in balanceNoviceFull.test.ts so Vitest runs the two in parallel.

import { HERO_KINDS } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { noviceWinRate, NOVICE_WIN_RATE, PAIRS, TEAM_OF_3 } from './helpers';

const TIMEOUT = 240_000;

describe('novice bots on Normal (Quick)', () => {
  it.each([
    ['solo', HERO_KINDS.map((h) => [h])],
    ['pairs', PAIRS],
    ['three players', [TEAM_OF_3]],
  ] as const)('win at least 80%% of the seeds: %s', (_size, teams) => {
    expect(noviceWinRate(teams.map((t) => [...t]), 'quick')).toBeGreaterThanOrEqual(NOVICE_WIN_RATE);
  }, TIMEOUT);
});
