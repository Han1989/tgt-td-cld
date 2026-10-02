import type { Snapshot } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { lerpEntities, MAX_EXTRAPOLATE_MS, SnapshotBuffer, SOLO_INTERP_DELAY_MS } from '../src/snapshotBuffer';

function snap(tick: number, x: number, events: Snapshot['events'] = []): Snapshot {
  return {
    tick,
    tickRate: 20,
    mode: 'full',
    difficulty: 'normal',
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
    modifiers: [],
    surgeLane: null,
    nextSurge: null,
    projectiles: [],
    traps: [],
    zones: [],
    events,
    practice: null,
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

  it('carries on briefly, then holds, when the render time runs past the newest snapshot', () => {
    const buf = new SnapshotBuffer(100);
    buf.push(snap(0, 0), 0);
    buf.push(snap(1, 1), 50);
    // 10 ms past the newest snapshot: extrapolated along the last step.
    const near = buf.view(160)!;
    expect(near.from.tick).toBe(0);
    expect(near.to.tick).toBe(1);
    expect(lerpEntities(near.from.creeps, near.to.creeps, near.alpha)[0]!.x).toBeCloseTo(1.2);
    // Far past it: no further than MAX_EXTRAPOLATE_MS.
    const far = buf.view(10_000)!;
    expect(lerpEntities(far.from.creeps, far.to.creeps, far.alpha)[0]!.x).toBeCloseTo(1 + MAX_EXTRAPOLATE_MS / 50);
    // With a single snapshot there is nothing to extrapolate from.
    const one = new SnapshotBuffer(100);
    one.push(snap(0, 3), 0);
    expect(one.view(10_000)).toMatchObject({ alpha: 0 });
  });

  it('renders solo 40 ms behind without ever holding a frame', () => {
    const buf = new SnapshotBuffer(SOLO_INTERP_DELAY_MS);
    // A creep walking 1 tile per tick; snapshots every 50 ms with up to 4 ms of timer jitter.
    const arrival = (tick: number) => 1000 + tick * 50 + ((tick * 7) % 5);
    let next = 0;
    let last = -Infinity;
    for (let now = 1000; now < 2900; now += 16) {
      while (arrival(next) <= now) buf.push(snap(next, next), arrival(next++));
      if (now < 1300) continue;
      const v = buf.view(now)!;
      const x = lerpEntities(v.from.creeps, v.to.creeps, v.alpha)[0]!.x;
      expect(x).toBeGreaterThan(last);
      // About 40 ms behind the newest: 0.8 tiles at this speed, give or take the jitter.
      expect((now - 1000) / 50 - x).toBeGreaterThan(0.6);
      expect((now - 1000) / 50 - x).toBeLessThan(1.0);
      last = x;
    }
  });

  it('releases events when their snapshot is rendered', () => {
    const buf = new SnapshotBuffer(100);
    buf.push(snap(0, 0), 0);
    buf.push(snap(1, 0, [{ type: 'leak', creepId: 1, damage: 1, lane: 1 }]), 50);
    expect(buf.drainEvents(100)).toEqual([]);
    expect(buf.drainEvents(150)).toEqual([{ type: 'leak', creepId: 1, damage: 1, lane: 1 }]);
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

  it('extrapolates a step but never a jump (a respawn, a creep sent back to its portal)', () => {
    const from = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 5, y: 40 }];
    const to = [{ id: 1, x: 0.2, y: 0 }, { id: 2, x: 5, y: 2 }];
    expect(lerpEntities(from, to, 1.5)).toEqual([{ id: 1, x: 0.30000000000000004, y: 0 }, { id: 2, x: 5, y: 2 }]);
  });
});
