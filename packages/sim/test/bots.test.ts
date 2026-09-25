// The balance bot's decisions, from a snapshot (bots never touch GameState).

import { describe, expect, it } from 'vitest';
import { createBalanceBot } from '../src/bots';
import { applyCommand } from '../src/commands';
import { snapshot } from '../src/game';
import { getMap } from '../src/map';
import { labGame, placeCreep } from './helpers';

describe('balance bot', () => {
  it('builds the next kind of its build order on a free pad', () => {
    const state = labGame();
    state.players[0]!.gold = 60;
    const cmds = createBalanceBot('p1').decide(snapshot(state));
    expect(cmds.filter((c) => c.type === 'build')).toEqual([expect.objectContaining({ tower: 'arrow' })]);
  });

  it('upgrades its lowest-tier towers once every pad is taken', () => {
    const state = labGame();
    state.players[0]!.gold = 1_000_000;
    for (const pad of getMap().pads) applyCommand(state, 'p1', { type: 'build', padId: pad.id, tower: 'arrow' });
    const first = state.towers[0]!;
    applyCommand(state, 'p1', { type: 'upgrade', towerId: first.id });
    state.players[0]!.gold = 70; // one tier-2 Arrow upgrade
    const cmds = createBalanceBot('p1').decide(snapshot(state));
    expect(cmds.some((c) => c.type === 'build')).toBe(false);
    const upgrades = cmds.filter((c) => c.type === 'upgrade');
    expect(upgrades).toHaveLength(1);
    expect(upgrades[0]).not.toEqual({ type: 'upgrade', towerId: first.id });
  });

  it('points towers with a boss in range at the Strongest creep and sends the hero after the boss', () => {
    const state = labGame();
    state.players[0]!.gold = 60;
    const pad = getMap().pads[0]!;
    applyCommand(state, 'p1', { type: 'build', padId: pad.id, tower: 'arrow' });
    const tower = state.towers[0]!;
    const bot = createBalanceBot('p1');
    expect(bot.decide(snapshot(state)).some((c) => c.type === 'setPriority')).toBe(false);

    const boss = placeCreep(state, 'ironhorn', tower.x + 2, tower.y);
    const cmds = bot.decide(snapshot(state));
    expect(cmds).toContainEqual({ type: 'setPriority', towerId: tower.id, priority: 'strongest' });
    expect(cmds).toContainEqual({ type: 'attackMove', x: boss.x, y: boss.y });
  });
});
