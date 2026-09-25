import { applyCommand, createBalanceBot, createGame, snapshot, step } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import { applySnapshotDelta, diffSnapshot, type Snapshot } from '../src';

describe('snapshot deltas', () => {
  it('reconstructs every tick of a real match exactly, through JSON', () => {
    const players = ['a', 'b', 'c'];
    const heroes = ['ranger', 'warden', 'arcanist'] as const;
    const state = createGame({ players: players.map((id, i) => ({ id, name: id, hero: heroes[i]! })) }, 4);
    const bots = players.map((id, i) => createBalanceBot(id, undefined, i));
    let server: Snapshot = snapshot(state);
    let client: Snapshot = JSON.parse(JSON.stringify(server)) as Snapshot;
    let deltaBytes = 0;
    let fullBytes = 0;
    for (let t = 0; t < 2400; t++) {
      if (t % 5 === 0) for (const bot of bots) for (const cmd of bot.decide(server)) applyCommand(state, bot.playerId, cmd);
      if (t === 700) applyCommand(state, 'a', { type: 'callEarly' });
      // Put ground zones (Arrow Storm, Meteor) into the stream too.
      if (t === 1500) {
        for (const h of state.heroes) h.ranks.R = 1;
        applyCommand(state, 'a', { type: 'cast', slot: 'R', x: 40, y: 45 });
        applyCommand(state, 'c', { type: 'cast', slot: 'R', x: 42, y: 45 });
      }
      if (t === 1540) expect(server.zones.length).toBeGreaterThan(0);
      step(state);
      const next = snapshot(state);
      const wire = JSON.stringify(diffSnapshot(server, next));
      deltaBytes += wire.length;
      fullBytes += JSON.stringify(next).length;
      const applied = applySnapshotDelta(client, JSON.parse(wire));
      expect(applied).not.toBeNull();
      client = applied!;
      server = next;
      if (t % 200 === 0) expect(client).toEqual(server);
    }
    expect(client).toEqual(server);
    expect(state.creeps.length + state.towers.length).toBeGreaterThan(0);
    // Deltas should be much smaller than full snapshots.
    expect(deltaBytes).toBeLessThan(fullBytes / 2);
  });

  it('refuses a delta made against another tick', () => {
    const state = createGame({ players: [{ id: 'a', name: 'a', hero: 'ranger' }] }, 1);
    const s0 = snapshot(state);
    step(state);
    const s1 = snapshot(state);
    step(state);
    const s2 = snapshot(state);
    expect(applySnapshotDelta(s0, diffSnapshot(s1, s2))).toBeNull();
    expect(applySnapshotDelta(s0, diffSnapshot(s0, s1))).toEqual(s1);
  });

  it('only sends changed fields', () => {
    const state = createGame({ players: [{ id: 'a', name: 'a', hero: 'ranger' }] }, 1);
    const s0 = snapshot(state);
    step(state);
    const d = diffSnapshot(s0, snapshot(state));
    expect(d.scalars).toMatchObject({ tick: 1, nextWaveIn: s0.nextWaveIn - 1 });
    // Only timer-related fields change during the build phase.
    expect(Object.keys(d.scalars).every((k) => ['tick', 'nextWaveIn', 'callEarlyBonus'].includes(k))).toBe(true);
    expect(d.creeps).toBeUndefined();
    expect(d.heroes).toBeUndefined();
  });
});
