// Lane surges (docs/REPLAYABILITY.md §2): from wave 6, some waves pile regular creeps onto one lane.
// Solo uses a milder share. The schedule comes from the match seed, not the match RNG.

import type { CreepKind, LaneId } from '@tdt/protocol';
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
    // Seed 1 surges once (wave 25, east). Across the first handful of seeds the schedule is busy.
    expect(surged.length).toBeGreaterThan(0);
    expect(surged.length).toBeLessThan(lanes.length - TUNING.surges.fromWave);
    let across = 0;
    for (let seed = 1; seed <= 8; seed++) {
      across += planSurgeLanes(seed, TUNING.waves.list.length, TUNING).filter((lane) => lane != null).length;
    }
    expect(across).toBeGreaterThan(8);
    expect(planSurgeLanes(1, TUNING.waves.list.length, TUNING)).toEqual(lanes);
    expect(planSurgeLanes(2, TUNING.waves.list.length, TUNING)).not.toEqual(lanes);
  });

  it('puts about 60% of a pair surge on one lane, 40% for three players, and a milder share in solo', () => {
    const lane: LaneId = 1;
    const pair = game(2);
    const team = game(3);
    const solo = game(1);
    const spread = game(2);
    pair.surgeLanes[6] = lane;
    team.surgeLanes[6] = lane;
    solo.surgeLanes[6] = lane;
    openWave(pair, 6);
    openWave(team, 6);
    openWave(solo, 6);
    openWave(spread, 6);

    const walking = (state: GameState) => {
      const byLane = [0, 0, 0];
      const add = (kind: CreepKind, laneIndex: number) => {
        if (state.tuning.creeps[kind].flying) return;
        byLane[laneIndex] = (byLane[laneIndex] ?? 0) + 1;
      };
      for (const c of state.creeps) if (c.wave === state.wave && !state.tuning.creeps[c.kind].boss) add(c.kind, c.lane);
      for (const s of state.spawnQueue) if (s.wave === state.wave && !state.tuning.creeps[s.kind].boss) add(s.kind, s.lane);
      return { byLane, total: byLane.reduce((a, b) => a + b, 0) };
    };
    const two = walking(pair);
    const three = walking(team);
    const one = walking(solo);
    const even = tally(spread);
    expect(tally(pair).total).toBe(even.total);
    expect(one.total).toBeGreaterThan(0);
    // Each kind is split on its own, so the wave lands near the share, not on one combined rounding.
    // Wisps stay on the portal they were listed on, so the share is measured on the walking creeps.
    expect(two.byLane[lane]! / two.total).toBeCloseTo(TUNING.surges.share, 1);
    expect(three.byLane[lane]! / three.total).toBeCloseTo(TUNING.surges.trioShare, 1);
    expect(one.byLane[lane]! / one.total).toBeCloseTo(TUNING.surges.soloShare, 1);
    expect(one.byLane[lane]! / one.total).toBeLessThan(two.byLane[lane]! / two.total);
    expect(Math.max(...two.byLane)).toBe(two.byLane[lane]);
    expect(surgeCounts(two.total, lane, surgeShare(pair))[lane]).toBeGreaterThan(two.total / 3);

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
