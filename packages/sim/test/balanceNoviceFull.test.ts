// The novice gate (balanceNovice.test.ts) in Full mode: every team wins at least 80% of the seeds.

import { HERO_KINDS } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { noviceWinRate, NOVICE_WIN_RATE, PAIRS, TEAM_OF_3 } from './helpers';

const TIMEOUT = 480_000;

describe('novice bots on Normal (Full)', () => {
  // Every team on its own, not the average of a team size: a weak solo hero must not hide behind the others.
  const teams = [...HERO_KINDS.map((h) => [h]), ...PAIRS.map((p) => [...p]), [...TEAM_OF_3]];
  it.each(teams.map((t) => [t.join('+'), t] as const))('win at least 80%% of the seeds: %s', (_name, team) => {
    expect(noviceWinRate([team], 'full')).toBeGreaterThanOrEqual(NOVICE_WIN_RATE);
  }, TIMEOUT);
});
