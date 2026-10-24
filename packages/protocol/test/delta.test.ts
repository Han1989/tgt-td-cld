import { applyCommand, createBalanceBot, createGame, heroLevelXp, setPlayerLeft, snapshot, step } from '@tdt/sim';
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
        for (const h of state.heroes) {
          h.ranks.R = 1;
          h.mana = 1_000;
        }
        // Instant global rains. Same tick, so they fuse into one Meteor Rain zone.
        applyCommand(state, 'a', { type: 'cast', slot: 'R' });
        applyCommand(state, 'c', { type: 'cast', slot: 'R' });
      }
      if (t === 1540) expect(server.zones.length).toBeGreaterThan(0);
      // A leaver's pads open up (pad owners change).
      if (t === 1800) setPlayerLeft(state, 'b');
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
    expect(server.pads.some((p) => p.owner === null)).toBe(true);
    // Deltas should be much smaller than full snapshots.
    expect(deltaBytes).toBeLessThan(fullBytes / 2);
  });

  it('reconstructs an Endless match exactly, with Reinforce ranks and veteran levels in the stream', () => {
    const state = createGame({ players: [{ id: 'a', name: 'a', hero: 'warden' }], mode: 'endless' }, 9);
    const bot = createBalanceBot('a');
    let server: Snapshot = snapshot(state);
    let client: Snapshot = JSON.parse(JSON.stringify(server)) as Snapshot;
    for (let t = 0; t < 1600; t++) {
      if (t % 5 === 0) for (const cmd of bot.decide(server)) applyCommand(state, 'a', cmd);
      // Gold for a branched tower and its ranks, and a hero at level 11 a kill short of 12, so both cross the wire.
      if (t === 600) {
        state.players[0]!.gold += 200_000;
        const hero = state.heroes[0]!;
        hero.level = 11;
        hero.xp = heroLevelXp(state.tuning, 12) - 1;
      }
      const tower = state.towers[0];
      if (t >= 610 && t % 20 === 0 && tower) {
        if (tower.branch) applyCommand(state, 'a', { type: 'reinforce', towerId: tower.id });
        else applyCommand(state, 'a', tower.tier < 3 ? { type: 'upgrade', towerId: tower.id } : { type: 'upgrade', towerId: tower.id, branch: 'volley' });
      }
      step(state);
      const next = snapshot(state);
      const applied = applySnapshotDelta(client, JSON.parse(JSON.stringify(diffSnapshot(server, next))));
      expect(applied).not.toBeNull();
      client = applied!;
      server = next;
      if (t % 200 === 0) expect(client).toEqual(server);
    }
    expect(client).toEqual(server);
    expect(server.towers.some((t) => t.reinforced >= 3)).toBe(true);
    expect(server.heroes[0]!.level).toBeGreaterThan(server.heroes[0]!.maxLevel);
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
