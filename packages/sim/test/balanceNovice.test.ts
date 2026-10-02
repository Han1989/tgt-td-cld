// Normal is for first-time players (playtest 2): the novice bot (half its spending through wave 5, no Flak until flyers
// leak twice, a quarter of its ready ultimates forgotten for a minute, no retreat, no early calls, answers nobody's ultimate)
// wins at least 80% of the seeds for every team on its own (each solo hero, each pair, the three), in Quick and in Full.
// Full is in balanceNoviceFull.test.ts so Vitest runs the two in parallel.

import { HERO_KINDS } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { noviceWinRate, NOVICE_WIN_RATE, PAIRS, TEAM_OF_3 } from './helpers';

const TIMEOUT = 240_000;

describe('novice bots on Normal (Quick)', () => {
  // Every team on its own, not the average of a team size: a weak solo hero must not hide behind the others.
  const teams = [...HERO_KINDS.map((h) => [h]), ...PAIRS.map((p) => [...p]), [...TEAM_OF_3]];
  it.each(teams.map((t) => [t.join('+'), t] as const))('win at least 80%% of the seeds: %s', (_name, team) => {
    expect(noviceWinRate([team], 'quick')).toBeGreaterThanOrEqual(NOVICE_WIN_RATE);
  }, TIMEOUT);
});
