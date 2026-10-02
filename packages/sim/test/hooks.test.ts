// Soft-launch co-op signals: leak lane, live ultimate overlap, finale strain.
// No extra damage. Gift totals live in match.test.ts.

import { FINALE_LEAK_CREEP_ID, FINALE_LEAK_LANE, R_OVERLAP_SECONDS, type CreepKind, type LaneId } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createGame, step } from '../src/game';
import { getMap } from '../src/map';
import { createMatch, matchCommand, matchReport, matchStep, type Match } from '../src/match';
import { TICK_RATE, TUNING } from '../src/tuning';
import { labGame, parkHero, placeCreep, runCollect } from './helpers';

function leakOf(lane: LaneId, kind: CreepKind) {
  const state = labGame();
  parkHero(state);
  const heart = getMap().heart;
  const creep = placeCreep(state, kind, heart.x, heart.y - 2.4, lane);
  creep.wp = 99;
  const events = runCollect(state, 40);
  return events.find((e) => e.type === 'leak' && e.creepId === creep.id);
}

describe('leak lane', () => {
  it.each([
    [0, 'grunt'],
    [1, 'runner'],
    [2, 'wisp'],
  ] as const)('lane %i %s leak names that lane', (lane, kind) => {
    expect(leakOf(lane, kind)).toMatchObject({
      type: 'leak',
      lane,
      damage: TUNING.creeps[kind].leakDamage,
    });
  });

  it('the Hard finale strain is a leak with no creep, not a lane call', () => {
    const state = createGame({ players: [{ id: 'p1', name: 'P', hero: 'ranger' }], difficulty: 'hard' }, 1);
    // Below the brace ceiling the flat strain (2) still applies.
    state.heartHp = 60;
    state.wave = state.tuning.waves.list.length - 1;
    state.nextWaveTick = state.tick;
    step(state);
    expect(state.events).toContainEqual({
      type: 'leak',
      creepId: FINALE_LEAK_CREEP_ID,
      damage: 2,
      lane: FINALE_LEAK_LANE,
    });
    expect(state.heartHp).toBe(58);
  });

  it('a Hard Heart above the brace ceiling loses the excess as that same finale leak', () => {
    const state = createGame({ players: [{ id: 'p1', name: 'P', hero: 'ranger' }], difficulty: 'hard' }, 1);
    const ceiling = state.tuning.difficulty.hard.finaleBrace!.ceiling;
    state.heartHp = 97;
    state.wave = state.tuning.waves.list.length - 1;
    state.nextWaveTick = state.tick;
    step(state);
    expect(state.events).toContainEqual({
      type: 'leak',
      creepId: FINALE_LEAK_CREEP_ID,
      damage: 97 - ceiling,
      lane: FINALE_LEAK_LANE,
    });
    expect(state.heartHp).toBe(ceiling);
  });

  it('Hard final-wave creep leaks stop at the brace floor, and earlier waves do not', () => {
    const floor = TUNING.difficulty.hard.finaleBrace!.floor;
    const opened = (wave: number, heart: number) => {
      const state = createGame({ players: [{ id: 'p1', name: 'P', hero: 'ranger' }], difficulty: 'hard' }, 1);
      parkHero(state);
      state.wave = wave;
      state.nextWaveTick = -1;
      state.heartHp = heart;
      const spot = getMap().heart;
      const creep = placeCreep(state, 'ironhorn', spot.x, spot.y - 2.4, 1);
      creep.wp = 99;
      const events = runCollect(state, 40);
      return { state, leak: events.find((e) => e.type === 'leak' && e.creepId === creep.id) };
    };
    const braced = opened(TUNING.waves.list.length, 55);
    expect(braced.leak).toMatchObject({ type: 'leak', damage: 55 - floor });
    expect(braced.state.heartHp).toBe(floor);
    const held = opened(TUNING.waves.list.length, floor);
    expect(held.leak).toMatchObject({ type: 'leak', damage: 0 });
    expect(held.state.heartHp).toBe(floor);
    const earlier = opened(TUNING.waves.list.length - 1, 55);
    expect(earlier.leak).toMatchObject({ type: 'leak', damage: 20 });
    expect(earlier.state.heartHp).toBe(35);
  });
});

function learnR(match: Match): void {
  for (const h of match.state.heroes) {
    h.level = 6;
    h.ranks.R = 1;
    h.skillCd.R = 0;
    h.mana = 500;
    h.alive = true;
  }
}

function syncs(match: Match) {
  return match.state.events.filter((e) => e.type === 'syncCast');
}

describe('sync cast', () => {
  it('emits one syncCast when a second living R lands inside the window, and none outside it', () => {
    const match = createMatch(
      {
        players: [
          { id: 'p1', name: 'A', hero: 'warden' },
          { id: 'p2', name: 'B', hero: 'warden' },
        ],
      },
      1,
    );
    learnR(match);
    const ids = match.state.heroes.map((h) => h.id).sort((a, b) => a - b);
    matchCommand(match, 'p1', { type: 'cast', slot: 'R' });
    matchStep(match);
    expect(syncs(match)).toEqual([]);

    for (let i = 0; i < R_OVERLAP_SECONDS * TICK_RATE - 1; i++) matchStep(match);
    matchCommand(match, 'p2', { type: 'cast', slot: 'R' });
    matchStep(match);
    expect(syncs(match)).toEqual([{ type: 'syncCast', heroIds: ids, slot: 'R' }]);
    expect(matchReport(match).heroes.map((h) => h.rOverlaps)).toEqual([1, 1]);
    // The pair does not emit again on later ticks.
    matchStep(match);
    expect(syncs(match)).toEqual([]);

    const late = createMatch(
      {
        players: [
          { id: 'p1', name: 'A', hero: 'warden' },
          { id: 'p2', name: 'B', hero: 'warden' },
        ],
      },
      1,
    );
    learnR(late);
    matchCommand(late, 'p1', { type: 'cast', slot: 'R' });
    matchStep(late);
    for (let i = 0; i < R_OVERLAP_SECONDS * TICK_RATE; i++) matchStep(late);
    matchCommand(late, 'p2', { type: 'cast', slot: 'R' });
    matchStep(late);
    expect(syncs(late)).toEqual([]);
    expect(matchReport(late).heroes.map((h) => h.rOverlaps)).toEqual([0, 0]);
  });

  it('emits once when both R casts land on the same tick', () => {
    const match = createMatch(
      {
        players: [
          { id: 'p1', name: 'A', hero: 'warden' },
          { id: 'p2', name: 'B', hero: 'warden' },
        ],
      },
      1,
    );
    learnR(match);
    const ids = match.state.heroes.map((h) => h.id).sort((a, b) => a - b);
    matchCommand(match, 'p1', { type: 'cast', slot: 'R' });
    matchCommand(match, 'p2', { type: 'cast', slot: 'R' });
    matchStep(match);
    expect(syncs(match)).toEqual([{ type: 'syncCast', heroIds: ids, slot: 'R' }]);
  });

  it('skips a hero who is dead when the second R lands, and ignores Q', () => {
    const match = createMatch(
      {
        players: [
          { id: 'p1', name: 'A', hero: 'warden' },
          { id: 'p2', name: 'B', hero: 'arcanist' },
        ],
      },
      1,
    );
    learnR(match);
    match.state.heroes[1]!.ranks.Q = 1;
    matchCommand(match, 'p1', { type: 'cast', slot: 'R' });
    matchStep(match);
    match.state.heroes[0]!.alive = false;
    match.state.heroes[0]!.respawnTick = match.state.tick + 10_000;
    const arc = match.state.heroes[1]!;
    matchCommand(match, 'p2', { type: 'cast', slot: 'Q', x: arc.x, y: arc.y });
    matchStep(match);
    expect(syncs(match)).toEqual([]);
    matchCommand(match, 'p2', { type: 'cast', slot: 'R' });
    matchStep(match);
    expect(syncs(match)).toEqual([]);
  });

  it('adds a third living R to one event when it lands inside the same window', () => {
    const match = createMatch(
      {
        players: [
          { id: 'p1', name: 'A', hero: 'warden' },
          { id: 'p2', name: 'B', hero: 'warden' },
          { id: 'p3', name: 'C', hero: 'warden' },
        ],
      },
      1,
    );
    learnR(match);
    const ids = match.state.heroes.map((h) => h.id);
    matchCommand(match, 'p1', { type: 'cast', slot: 'R' });
    matchStep(match);
    matchCommand(match, 'p2', { type: 'cast', slot: 'R' });
    matchStep(match);
    expect(syncs(match)).toEqual([{ type: 'syncCast', heroIds: [ids[0]!, ids[1]!].sort((a, b) => a - b), slot: 'R' }]);
    matchCommand(match, 'p3', { type: 'cast', slot: 'R' });
    matchStep(match);
    expect(syncs(match)).toEqual([{ type: 'syncCast', heroIds: [...ids].sort((a, b) => a - b), slot: 'R' }]);
  });
});
