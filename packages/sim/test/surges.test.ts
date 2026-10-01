// Lane surges (docs/REPLAYABILITY.md §2): from wave 6, some waves pile regular creeps onto one lane.
// Solo uses a milder share. The schedule comes from the match seed, not the match RNG.

import type { LaneId } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createGame, step } from '../src/game';
import { planSurgeLanes, surgeCounts, surgeShare } from '../src/modifiers';
import type { GameState } from '../src/state';
import { TUNING } from '../src/tuning';

function game(players: number, seed = 1): GameState {
  return createGame(
    {
      players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, hero: 'ranger' as const })),
    },
    seed,
  );
}

/** Starts `wave` with an empty map, so the queue is only that wave. */
function openWave(state: GameState, wave: number): void {
  state.wave = wave - 1;
  state.creeps = [];
  state.spawnQueue = [];
  state.nextWaveTick = state.tick;
  step(state);
  expect(state.wave).toBe(wave);
}

function tally(state: GameState): { byLane: number[]; total: number } {
  const byLane = [0, 0, 0];
  const add = (lane: number) => {
    byLane[lane] = (byLane[lane] ?? 0) + 1;
  };
  for (const c of state.creeps) if (c.wave === state.wave && !state.tuning.creeps[c.kind].boss) add(c.lane);
  for (const s of state.spawnQueue) if (s.wave === state.wave && !state.tuning.creeps[s.kind].boss) add(s.lane);
  return { byLane, total: byLane.reduce((a, b) => a + b, 0) };
}

describe('lane surges', () => {
  it('plans surges from wave 6, and the same seed plans the same lanes', () => {
    const lanes = planSurgeLanes(1, TUNING.waves.list.length, TUNING);
    expect(lanes[0]).toBeNull();
    for (let wave = 1; wave < TUNING.surges.fromWave; wave++) expect(lanes[wave]).toBeNull();
    const surged = lanes.slice(TUNING.surges.fromWave).filter((lane) => lane != null);
    expect(surged.length).toBeGreaterThan(3);
    expect(surged.length).toBeLessThan(lanes.length - TUNING.surges.fromWave);
    expect(planSurgeLanes(1, TUNING.waves.list.length, TUNING)).toEqual(lanes);
    expect(planSurgeLanes(2, TUNING.waves.list.length, TUNING)).not.toEqual(lanes);
  });

  it('puts about 60% of a co-op surge on one lane and a milder share in solo, without changing the total', () => {
    const lane: LaneId = 1;
    const team = game(3);
    const solo = game(1);
    const spread = game(3);
    team.surgeLanes[6] = lane;
    solo.surgeLanes[6] = lane;
    openWave(team, 6);
    openWave(solo, 6);
    openWave(spread, 6);

    const co = tally(team);
    const one = tally(solo);
    const even = tally(spread);
    expect(co.total).toBe(even.total);
    expect(one.total).toBeGreaterThan(0);
    // Each kind is split on its own, so the wave lands near the share, not on one combined rounding.
    expect(surgeCounts(co.total, lane, surgeShare(team))[lane]).toBeGreaterThan(co.total / 3);
    expect(co.byLane[lane]! / co.total).toBeCloseTo(TUNING.surges.share, 1);
    expect(one.byLane[lane]! / one.total).toBeCloseTo(TUNING.surges.soloShare, 1);
    expect(one.byLane[lane]! / one.total).toBeLessThan(co.byLane[lane]! / co.total);
    expect(Math.max(...co.byLane)).toBe(co.byLane[lane]);

    const last = Math.max(team.tick, ...team.spawnQueue.filter((s) => s.lane === lane).map((s) => s.tick));
    expect(last).toBeLessThan(team.nextWaveTick);
  });

  it('leaves the boss on its lane, one of them', () => {
    const state = game(3);
    state.surgeLanes[10] = 0;
    openWave(state, 10);
    const bosses = [
      ...state.creeps.filter((c) => c.wave === 10 && state.tuning.creeps[c.kind].boss),
      ...state.spawnQueue.filter((s) => s.wave === 10 && state.tuning.creeps[s.kind].boss),
    ];
    expect(bosses).toHaveLength(1);
    expect(bosses[0]!.lane).toBe(1);
  });

  it('announces the next surge when the previous wave starts', () => {
    const state = game(2);
    state.surgeLanes[6] = 0;
    expect(state.nextSurge).toBeNull();
    openWave(state, 5);
    expect(state.nextSurge).toEqual({ wave: 6, lane: 0 });
    expect(state.events).toContainEqual({ type: 'surge', wave: 6, lane: 0 });
    expect(state.surgeLane).toBe(state.surgeLanes[5] ?? null);
  });
});
