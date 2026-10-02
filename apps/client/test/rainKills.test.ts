import type { AoeEffect, GameEvent, Snapshot, ZoneKind, ZoneSnap } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { KILL_SLACK, RAIN_NAMES, emptyTally, readTally, tallyLine, type TallyMemory } from '../src/coop/rainKills';

function zone(kind: ZoneKind, id = 1): ZoneSnap {
  return { id, kind, x: 13, y: 12, radius: 0, startTick: 0, endTick: 100 };
}

function snap(zones: ZoneSnap[] = []): Snapshot {
  return {
    zones,
    players: [
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Bo' },
    ],
    heroes: [
      { id: 1, owner: 'p1', kind: 'ranger', x: 6, y: 20 },
      { id: 2, owner: 'p2', kind: 'arcanist', x: 20, y: 18 },
      { id: 3, owner: 'p2', kind: 'warden', x: 22, y: 18 },
    ],
  } as unknown as Snapshot;
}

const strike = (effect: AoeEffect, x = 10, y = 10, radius = 1.8): GameEvent => ({
  type: 'aoe',
  effect,
  x,
  y,
  radius,
});
const kill = (x: number, y: number, creepId = 1): GameEvent => ({ type: 'kill', creepId, kind: 'grunt', x, y, by: 'p1', bounty: 5 });
const cast = (heroId: number): GameEvent => ({ type: 'cast', heroId, slot: 'R', x: 0, y: 0 });

function run(batches: { events: GameEvent[]; zones: ZoneSnap[] }[]) {
  let memory: TallyMemory = emptyTally();
  const done: { kind: string; kills: number; by: string[] }[] = [];
  batches.forEach((b, i) => {
    const r = readTally(memory, b.events, snap(b.zones), i * 50);
    memory = r.memory;
    for (const t of r.beat.done) done.push({ kind: t.kind, kills: t.kills, by: t.by });
  });
  return { memory, done };
}

describe('rain and combo kill count', () => {
  it('counts the kills beside a strike, and reports once when the rain ends', () => {
    const z = [zone('arrowStorm')];
    const out = run([
      { events: [cast(1), strike('arrowStorm'), kill(10.5, 10), kill(9.5, 10.5, 2)], zones: z },
      { events: [strike('arrowStorm', 20, 20), kill(20, 21, 3)], zones: z },
      { events: [], zones: [] },
      { events: [], zones: [] },
    ]);
    expect(out.done).toEqual([{ kind: 'arrowStorm', kills: 3, by: ['p1'] }]);
    expect(out.memory.open).toEqual([]);
  });

  it('does not count a kill far from every strike, or any kill when there is no strike', () => {
    const z = [zone('meteor')];
    const out = run([
      { events: [cast(2), strike('meteor', 10, 10, 2), kill(10 + 2 + KILL_SLACK + 0.5, 10), kill(30, 30, 2)], zones: z },
      { events: [], zones: [] },
    ]);
    expect(out.done).toEqual([]);
  });

  it('reports nothing for a rain that killed nothing', () => {
    const out = run([
      { events: [cast(1), strike('arrowStorm')], zones: [zone('arrowStorm')] },
      { events: [], zones: [] },
    ]);
    expect(out.done).toEqual([]);
  });

  it('carries the kills of two rains into the combo they fuse into', () => {
    const out = run([
      { events: [cast(1), strike('arrowStorm'), kill(10, 10)], zones: [zone('arrowStorm')] },
      { events: [cast(2), strike('meteor', 14, 10), kill(14, 10, 2), kill(14.5, 10, 3)], zones: [zone('arrowStorm'), zone('meteor', 2)] },
      {
        events: [{ type: 'combo', combo: 'meteorRain', x: 20, y: 18, radius: 0, heroes: [1, 2] }, strike('meteorRain', 10, 10), kill(10, 10, 4)],
        zones: [zone('meteorRain', 3)],
      },
      { events: [strike('meteorRain', 12, 12), kill(12, 12, 5)], zones: [zone('meteorRain', 3)] },
      { events: [], zones: [] },
    ]);
    // 1 + 2 before the fuse, 2 after: the whole cast, reported once, under the combo's name, for both casters.
    expect(out.done).toEqual([{ kind: 'meteorRain', kills: 5, by: ['p1', 'p2'] }]);
  });

  it('counts a Shockwave kill out to its pull radius, and a Stun Storm like any strike', () => {
    const out = run([
      { events: [strike('shockwave', 10, 10, 1.8), kill(13, 10)], zones: [zone('shockwave')] },
      { events: [strike('stunStorm', 10, 10, 1.8), kill(10, 11)], zones: [zone('stunStorm', 2)] },
      { events: [], zones: [] },
    ]);
    expect(out.done.map((d) => [d.kind, d.kills])).toEqual(
      expect.arrayContaining([
        ['shockwave', 1],
        ['stunStorm', 1],
      ]),
    );
  });

  it('gives a kill to the nearest strike when two rains land together', () => {
    const out = run([
      {
        events: [strike('arrowStorm', 10, 10), strike('meteor', 10.8, 10), kill(11, 10)],
        zones: [zone('arrowStorm'), zone('meteor', 2)],
      },
      { events: [], zones: [] },
    ]);
    expect(out.done).toEqual([{ kind: 'meteor', kills: 1, by: [] }]);
  });

  it('names the line a finished tally shows', () => {
    expect(tallyLine({ kind: 'meteorRain', kills: 14 })).toEqual({ name: 'Meteor Rain', count: '14 down' });
    expect(Object.keys(RAIN_NAMES)).toHaveLength(5);
  });
});
