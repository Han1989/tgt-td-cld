import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands';
import { getMap } from '../src/map';
import { labGame, run } from './helpers';

describe('pings and emotes', () => {
  it('emits a ping and an emote for teammates, including from a fallen hero', () => {
    const state = labGame(undefined, 2);
    const hero = state.heroes[0]!;
    hero.alive = false;
    hero.hp = 0;
    expect(applyCommand(state, 'p1', { type: 'ping', x: 10.25, y: 20 })).toBe(true);
    expect(applyCommand(state, 'p2', { type: 'emote', emote: 'help' })).toBe(true);
    run(state, 1);
    const social = state.events.filter((e) => e.type === 'ping' || e.type === 'emote');
    expect(social).toEqual([
      { type: 'ping', by: 'p1', x: 10.25, y: 20 },
      { type: 'emote', by: 'p2', emote: 'help' },
    ]);
  });

  it('rejects a ping off the map and changes nothing else', () => {
    const state = labGame();
    const map = getMap();
    const gold = state.players[0]!.gold;
    expect(applyCommand(state, 'p1', { type: 'ping', x: -1, y: 2 })).toBe(false);
    expect(applyCommand(state, 'p1', { type: 'ping', x: map.width + 0.1, y: 2 })).toBe(false);
    run(state, 1);
    expect(state.events.map((e) => (e.type === 'rejected' ? e.reason : e.type))).toEqual(['Off the map', 'Off the map']);
    expect(state.players[0]!.gold).toBe(gold);
  });
});
