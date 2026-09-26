import { createGame, setPlayerLeft, snapshot } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import { padStatus } from '../src/padInfo';

describe('padStatus', () => {
  const state = createGame(
    { players: [{ id: 'p1', name: 'Ada', hero: 'ranger' }, { id: 'p2', name: 'Bo', hero: 'warden' }] },
    1,
  );

  it('tells your pads, a teammate’s pads (and whose) and pads that are not in this match apart', () => {
    const snap = snapshot(state);
    const mine = snap.pads.find((p) => p.owner === 'p1')!;
    const theirs = snap.pads.find((p) => p.owner === 'p2')!;
    expect(padStatus(snap, 'p1', mine.id)).toEqual({ kind: 'mine' });
    expect(padStatus(snap, 'p1', theirs.id)).toEqual({ kind: 'teammate', owner: 'Bo' });
    expect(padStatus(snap, 'p1', 999)).toEqual({ kind: 'absent' });
    expect(padStatus(undefined, 'p1', mine.id)).toEqual({ kind: 'absent' });
  });

  it('treats a leaver’s opened pads as yours to build on', () => {
    setPlayerLeft(state, 'p2');
    const snap = snapshot(state);
    const opened = snap.pads.find((p) => p.owner === null)!;
    expect(padStatus(snap, 'p1', opened.id)).toEqual({ kind: 'mine' });
  });
});
