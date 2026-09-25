// Phase 3 economy: gold gifting between teammates and bounty growth by wave.

import { describe, expect, it } from 'vitest';
import { applyCommand, setPlayerConnected } from '../src/commands';
import { creepBounty, damageCreep } from '../src/combat';
import { step } from '../src/game';
import { TUNING } from '../src/tuning';
import { labGame, parkHero, placeCreep } from './helpers';

describe('gold gifting', () => {
  it('moves gold from the sender to a teammate and announces it', () => {
    const state = labGame(TUNING, 2);
    const [a, b] = state.players as [(typeof state.players)[0], (typeof state.players)[0]];
    expect(applyCommand(state, 'p1', { type: 'gift', to: 'p2', amount: 40 })).toBe(true);
    expect(a.gold).toBe(TUNING.economy.startingGold - 40);
    expect(b.gold).toBe(TUNING.economy.startingGold + 40);
    step(state);
    expect(state.events).toContainEqual({ type: 'gift', from: 'p1', to: 'p2', amount: 40 });
  });

  it('can give away every last coin', () => {
    const state = labGame(TUNING, 2);
    expect(applyCommand(state, 'p2', { type: 'gift', to: 'p1', amount: TUNING.economy.startingGold })).toBe(true);
    expect(state.players.map((p) => p.gold)).toEqual([TUNING.economy.startingGold * 2, 0]);
  });

  it.each([
    ['yourself', { to: 'p1', amount: 10 }, 'You cannot gift gold to yourself'],
    ['an unknown player', { to: 'p9', amount: 10 }, 'No such teammate'],
    ['more than you have', { to: 'p2', amount: 151 }, 'Not enough gold'],
    ['zero gold', { to: 'p2', amount: 0 }, 'Invalid amount'],
    ['a fraction', { to: 'p2', amount: 1.5 }, 'Invalid amount'],
    ['a negative amount', { to: 'p2', amount: -20 }, 'Invalid amount'],
  ])('rejects a gift to %s', (_label, gift, reason) => {
    const state = labGame(TUNING, 2);
    expect(applyCommand(state, 'p1', { type: 'gift', ...gift })).toBe(false);
    expect(state.players.map((p) => p.gold)).toEqual([150, 150]);
    step(state);
    expect(state.events).toContainEqual({ type: 'rejected', player: 'p1', command: 'gift', reason });
  });

  it('rejects gifts to a teammate who is away, and accepts them again once they are back', () => {
    const state = labGame(TUNING, 2);
    setPlayerConnected(state, 'p2', false);
    expect(applyCommand(state, 'p1', { type: 'gift', to: 'p2', amount: 10 })).toBe(false);
    setPlayerConnected(state, 'p2', true);
    expect(applyCommand(state, 'p1', { type: 'gift', to: 'p2', amount: 10 })).toBe(true);
  });

  it('is rejected once the match is over', () => {
    const state = labGame(TUNING, 2);
    state.phase = 'defeat';
    expect(applyCommand(state, 'p1', { type: 'gift', to: 'p2', amount: 10 })).toBe(false);
    expect(state.players.map((p) => p.gold)).toEqual([150, 150]);
  });
});

describe('bounty growth', () => {
  it('pays more for creeps from later waves', () => {
    const state = labGame();
    parkHero(state);
    const early = placeCreep(state, 'grunt', 40, 10);
    const late = placeCreep(state, 'grunt', 40, 10);
    late.wave = 21;
    expect(creepBounty(state, early)).toBe(TUNING.creeps.grunt.bounty);
    const expected = Math.round(TUNING.creeps.grunt.bounty * (1 + 20 * TUNING.economy.bountyGrowthPerWave));
    expect(creepBounty(state, late)).toBe(expected);
    expect(expected).toBeGreaterThan(TUNING.creeps.grunt.bounty);

    const gold = state.players[0]!.gold;
    damageCreep(state, late, 1e6, 'magic', 'p1');
    expect(state.players[0]!.gold).toBe(gold + expected);
    expect(state.pendingEvents).toContainEqual(expect.objectContaining({ type: 'kill', bounty: expected }));
  });
});
