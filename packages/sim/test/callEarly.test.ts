// Call early waits for the wave, and End run for solo Endless (protocol 26; docs/GAME_DESIGN.md "Call early",
// "Endless"; Han's Endless run of 11 Nov 2026: seven presses in a second took the counter from 42 to 49).

import type { GameEvent, GameMode, HeroKind, Replay } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createBalanceBot } from '../src/bots';
import { applyCommand } from '../src/commands';
import { createGame, snapshot, step } from '../src/game';
import {
  createMatch,
  matchCommand,
  matchOver,
  matchReplay,
  matchReport,
  matchStep,
  replayMatch,
  replayRefusal,
} from '../src/match';
import type { GameState } from '../src/state';
import { TICK_RATE } from '../src/tuning';
import { run } from './helpers';

const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, hero: 'ranger' as HeroKind }));

function game(mode: GameMode = 'full', n = 1, difficulty: 'normal' | 'hard' = 'normal'): GameState {
  return createGame({ players: players(n), mode, difficulty }, 7);
}

const rejections = (state: GameState): GameEvent[] => state.pendingEvents.filter((e) => e.type === 'rejected');

/** Steps until wave `wave` has started and finished spawning. */
function untilArrived(state: GameState, wave: number): void {
  while (state.wave < wave || state.spawnQueue.length > 0) step(state);
}

describe('call early waits for the wave', () => {
  it('works in the build phase, before wave 1', () => {
    const state = game();
    run(state, 10);
    expect(snapshot(state).canCallEarly).toBe(true);
    expect(applyCommand(state, 'p1', { type: 'callEarly' })).toBe(true);
    step(state);
    expect(state.wave).toBe(1);
  });

  it('refuses a press while the wave is still arriving, and pays nothing', () => {
    const state = game();
    applyCommand(state, 'p1', { type: 'callEarly' });
    step(state);
    expect(state.wave).toBe(1);
    expect(state.spawnQueue.length).toBeGreaterThan(0);
    expect(snapshot(state).canCallEarly).toBe(false);
    const gold = state.players[0]!.gold;
    expect(applyCommand(state, 'p1', { type: 'callEarly' })).toBe(false);
    expect(rejections(state)).toEqual([
      { type: 'rejected', player: 'p1', command: 'callEarly', reason: 'This wave is still arriving' },
    ]);
    expect(state.pendingEvents.some((e) => e.type === 'callEarly')).toBe(false);
    expect(state.players[0]!.gold).toBe(gold);
    step(state);
    expect(state.wave).toBe(1);
  });

  it('starts exactly one wave after the last spawn', () => {
    const state = game();
    untilArrived(state, 1);
    expect(snapshot(state).canCallEarly).toBe(true);
    const bonus = snapshot(state).callEarlyBonus;
    const gold = state.players[0]!.gold;
    expect(applyCommand(state, 'p1', { type: 'callEarly' })).toBe(true);
    expect(state.players[0]!.gold).toBe(gold + bonus);
    step(state);
    expect(state.wave).toBe(2);
    expect(snapshot(state).canCallEarly).toBe(false);
    expect(applyCommand(state, 'p1', { type: 'callEarly' })).toBe(false);
    step(state);
    expect(state.wave).toBe(2);
  });

  it('50 presses over 50 ticks from the build phase start one wave, not 50', () => {
    const state = game('endless');
    let accepted = 0;
    for (let i = 0; i < 50; i++) {
      if (applyCommand(state, 'p1', { type: 'callEarly' })) accepted++;
      step(state);
    }
    expect(accepted).toBe(1);
    expect(state.wave).toBe(1);
  });

  it('two players pressing on the same tick: the first starts the wave, the second waits', () => {
    const state = game('full', 2);
    run(state, 20);
    const bonus = snapshot(state).callEarlyBonus;
    const start = state.players.map((p) => p.gold);
    expect(applyCommand(state, 'p1', { type: 'callEarly' })).toBe(true);
    step(state);
    // Wave 1 is spawning: both presses of the next tick are refused, nobody paid twice.
    expect(applyCommand(state, 'p1', { type: 'callEarly' })).toBe(false);
    expect(applyCommand(state, 'p2', { type: 'callEarly' })).toBe(false);
    step(state);
    expect(state.wave).toBe(1);
    const income = state.tuning.economy.waveIncomeBase;
    expect(state.players.map((p) => p.gold)).toEqual(start.map((g) => g + bonus + income));
  });
});

describe('End run (solo Endless)', () => {
  it('ends the run on the wave it is in once that wave has arrived', () => {
    const state = game('endless');
    untilArrived(state, 3);
    expect(applyCommand(state, 'p1', { type: 'endRun' })).toBe(true);
    step(state);
    expect(state.phase).toBe('defeat');
    expect(state.wave).toBe(3);
    expect(state.events).toContainEqual({ type: 'gameOver', result: 'defeat' });
  });

  it('ends it on the wave before while the current one is still arriving', () => {
    const state = game('endless');
    untilArrived(state, 3);
    applyCommand(state, 'p1', { type: 'callEarly' });
    step(state);
    expect(state.wave).toBe(4);
    expect(state.spawnQueue.length).toBeGreaterThan(0);
    expect(applyCommand(state, 'p1', { type: 'endRun' })).toBe(true);
    step(state);
    expect(state.phase).toBe('defeat');
    expect(state.wave).toBe(3);
  });

  it.each([
    ['a room', 'endless', 2, 'normal'],
    ['Full', 'full', 1, 'normal'],
    ['Quick', 'quick', 1, 'normal'],
    ['the Daily run (Quick on Hard)', 'quick', 1, 'hard'],
  ] as const)('is refused in %s', (_, mode, n, difficulty) => {
    const state = game(mode, n, difficulty);
    run(state, 10);
    expect(applyCommand(state, 'p1', { type: 'endRun' })).toBe(false);
    expect(rejections(state)).toHaveLength(1);
    step(state);
    expect(state.phase).toBe('build');
    expect(state.heartHp).toBe(state.tuning.heart.maxHp);
  });
});

describe('replays (protocol 26)', () => {
  it('an Endless run with early calls and an End run re-runs to the same end', () => {
    const match = createMatch({ players: players(1), mode: 'endless' }, 11, 'test');
    const bot = createBalanceBot('p1', undefined, 0);
    let presses = 0;
    while (!matchOver(match) && match.state.tick < 20 * 60 * TICK_RATE) {
      if (match.state.tick % 5 === 0) {
        for (const cmd of bot.decide(snapshot(match.state))) matchCommand(match, 'p1', cmd);
      }
      // A finger on Call early: one press a second, most of them refused while a wave arrives.
      if (match.state.tick % TICK_RATE === 0 && match.state.wave < 6) {
        matchCommand(match, 'p1', { type: 'callEarly' });
        presses++;
      }
      if (match.state.wave === 6 && match.state.spawnQueue.length === 0) matchCommand(match, 'p1', { type: 'endRun' });
      matchStep(match);
    }
    expect(presses).toBeGreaterThan(5);
    expect(match.state.phase).toBe('defeat');
    expect(match.state.wave).toBe(6);
    const report = matchReport(match);
    expect(report.heroes[0]!.wavesCalledEarly).toBeGreaterThan(0);
    expect(report.heroes[0]!.wavesCalledEarly).toBeLessThan(presses);
    const replay = matchReplay(match);
    const again = replayMatch(replay);
    expect(matchReplay(again).end).toEqual(replay.end);
    expect(matchReport(again)).toEqual(report);
  });

  it('refuses a replay recorded under protocol 25', () => {
    const match = createMatch({ players: players(1), mode: 'endless' }, 5, '0123abcd');
    for (let i = 0; i < 40; i++) matchStep(match);
    const old: Replay = { ...matchReplay(match), protocol: 25 };
    expect(replayRefusal(old)).toMatch(/protocol 25, before Call early began to wait for the wave in protocol 26.*git checkout 0123abcd/);
    expect(() => replayMatch(old)).toThrow(/one press, one wave/);
    expect(replayRefusal(matchReplay(match))).toBeNull();
  });
});
