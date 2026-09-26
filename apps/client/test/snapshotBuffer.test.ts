import type { Snapshot } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { lerpEntities, SnapshotBuffer } from '../src/snapshotBuffer';

function snap(tick: number, x: number, events: Snapshot['events'] = []): Snapshot {
  return {
    tick,
    tickRate: 20,
    mode: 'full',
    phase: 'waves',
    heartHp: 100,
    heartMaxHp: 100,
    wave: 1,
    totalWaves: 10,
    nextWaveIn: 100,
    callEarlyBonus: 5,
    players: [],
    heroes: [],
    creeps: [
      { id: 1, kind: 'grunt', x, y: 0, hp: 10, maxHp: 10, slowed: false, rooted: false, stunned: false, armor: 1, magicResist: 0 },
    ],
    towers: [],
    pads: [],
    projectiles: [],
    traps: [],
    zones: [],
    events,
  };
}

describe('SnapshotBuffer', () => {
  it('renders 100 ms behind and interpolates between bracketing snapshots', () => {
    const buf = new SnapshotBuffer(100);
    // Snapshots every 50 ms arriving exactly on time: local time = server time + 1000.
    for (let tick = 0; tick <= 10; tick++) buf.push(snap(tick, tick), 1000 + tick * 50);
    // At local 1500 we render server time 400 ms = tick 8.
    const view = buf.view(1500)!;
    expect(view.from.tick).toBe(8);
    expect(view.to.tick).toBe(9);
    expect(view.alpha).toBeCloseTo(0);
    const mid = buf.view(1525)!;
    expect(mid.alpha).toBeCloseTo(0.5);
    const creeps = lerpEntities(mid.from.creeps, mid.to.creeps, mid.alpha);
    expect(creeps[0]!.x).toBeCloseTo(8.5);
  });

  it('holds the newest snapshot when the render time runs ahead', () => {
    const buf = new SnapshotBuffer(100);
    buf.push(snap(0, 0), 0);
    buf.push(snap(1, 1), 50);
    const view = buf.view(10_000)!;
    expect(view.from.tick).toBe(1);
    expect(view.alpha).toBe(0);
  });

  it('releases events when their snapshot is rendered', () => {
    const buf = new SnapshotBuffer(100);
    buf.push(snap(0, 0), 0);
    buf.push(snap(1, 0, [{ type: 'leak', creepId: 1, damage: 1 }]), 50);
    expect(buf.drainEvents(100)).toEqual([]);
    expect(buf.drainEvents(150)).toEqual([{ type: 'leak', creepId: 1, damage: 1 }]);
    expect(buf.drainEvents(1000)).toEqual([]);
  });

  it('resets when a new match restarts the tick counter', () => {
    const buf = new SnapshotBuffer(100);
    buf.push(snap(500, 0), 0);
    buf.push(snap(0, 3), 10);
    expect(buf.latest!.tick).toBe(0);
    expect(buf.view(10)!.from.tick).toBe(0);
  });
});

describe('lerpEntities', () => {
  it('shows new entities at their first position and drops removed ones', () => {
    const from = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 5, y: 5 }];
    const to = [{ id: 1, x: 2, y: 2 }, { id: 3, x: 9, y: 9 }];
    expect(lerpEntities(from, to, 0.5)).toEqual([{ id: 1, x: 1, y: 1 }, { id: 3, x: 9, y: 9 }]);
  });
});
