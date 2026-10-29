// Endless's daily board (src/endlessBoard.ts): the order, which replays may post, the longest re-run.

import { PROTOCOL_VERSION, type Replay } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { endlessRankOrder, endlessRefusal, endlessRunTicks, type EndlessRun } from '../src/endlessBoard';
import { TICK_RATE, TUNING } from '../src/tuning';

describe('endlessRankOrder', () => {
  it('ranks a later wave first, then the shorter time; equal runs tie', () => {
    const runs: (EndlessRun & { id: string })[] = [
      { id: 'a', wave: 46, ticks: 40_000 },
      { id: 'b', wave: 54, ticks: 50_000 },
      { id: 'c', wave: 46, ticks: 38_000 },
      { id: 'd', wave: 12, ticks: 9_000 },
      { id: 'e', wave: 54, ticks: 52_000 },
    ];
    expect([...runs].sort(endlessRankOrder).map((r) => r.id)).toEqual(['b', 'e', 'c', 'a', 'd']);
    expect(endlessRankOrder({ wave: 30, ticks: 100 }, { wave: 30, ticks: 100 })).toBe(0);
  });
});

describe('endlessRefusal', () => {
  const replay = (patch: Partial<Replay> = {}): Pick<Replay, 'players' | 'mode' | 'protocol' | 'practice' | 'modifiers'> => ({
    players: [{ id: 'local', name: 'Wren', hero: 'ranger' }],
    mode: 'endless',
    protocol: PROTOCOL_VERSION,
    ...patch,
  });

  it('takes a solo Endless run on this protocol', () => {
    expect(endlessRefusal(replay())).toBeNull();
    expect(endlessRefusal(replay({ modifiers: [] }))).toBeNull();
  });

  it('refuses Full, Quick, two players, another protocol, practice and modifiers', () => {
    expect(endlessRefusal(replay({ mode: 'full' }))).toMatch(/Endless/);
    expect(endlessRefusal(replay({ mode: 'quick' }))).toMatch(/Endless/);
    const two = replay();
    two.players = [...two.players, { id: 'p2', name: 'Kael', hero: 'warden' }];
    expect(endlessRefusal(two)).toMatch(/solo/);
    expect(endlessRefusal(replay({ protocol: PROTOCOL_VERSION - 1 }))).toMatch(/protocol/);
    expect(endlessRefusal(replay({ protocol: PROTOCOL_VERSION + 1 }))).toMatch(/protocol/);
    expect(endlessRefusal(replay(), PROTOCOL_VERSION + 1)).toMatch(/protocol/);
    expect(endlessRefusal(replay({ practice: { allyId: 'a', startLevel: 6 } as never }))).toMatch(/practice/);
    expect(endlessRefusal(replay({ modifiers: ['swift'] as never }))).toMatch(/modifiers/);
  });
});

describe('endlessRunTicks', () => {
  it('covers every wave timer up to the hard stop, plus ten minutes', () => {
    const { buildPhase, interval } = TUNING.waves;
    const max = TUNING.endless.maxWave;
    expect(endlessRunTicks(TUNING)).toBe((buildPhase + interval * max + 600) * TICK_RATE);
    // About two and a half hours: far past any run the bots or a person play.
    expect(endlessRunTicks(TUNING) / TICK_RATE / 3600).toBeGreaterThan(2);
  });
});
