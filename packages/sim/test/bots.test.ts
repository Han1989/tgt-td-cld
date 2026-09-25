// The balance bot's decisions, from a snapshot (bots never touch GameState).

import { describe, expect, it } from 'vitest';
import { createBalanceBot } from '../src/bots';
import { applyCommand } from '../src/commands';
import { snapshot } from '../src/game';
import { getMap } from '../src/map';
import { TUNING } from '../src/tuning';
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

  /** A lab game on `wave` where p1 already owns `kinds` (on the first pads) and has `gold`. */
  function withTowers(wave: number, kinds: ('arrow' | 'frost' | 'cannon' | 'arcane' | 'flak')[], gold: number) {
    const state = labGame();
    state.wave = wave;
    state.players[0]!.gold = 1_000_000;
    kinds.forEach((tower, i) => applyCommand(state, 'p1', { type: 'build', padId: getMap().pads[i]!.id, tower }));
    state.players[0]!.gold = gold;
    return state;
  }
  const builds = (state: ReturnType<typeof labGame>) =>
    createBalanceBot('p1').decide(snapshot(state)).flatMap((c) => (c.type === 'build' ? [c.tower] : []));

  it('adds a Flak before a Wisp wave, then an Arcane before Brutes', () => {
    const firstWisps = TUNING.waves.list.findIndex((w) => w.some((g) => TUNING.creeps[g.kind].flying)) + 1;
    // Early waves: no counters before a few general towers.
    expect(builds(withTowers(firstWisps - 1, ['arrow'], 100))).toEqual(['frost']);
    expect(builds(withTowers(firstWisps - 1, ['arrow', 'frost', 'cannon'], 100))).toEqual(['flak']);
    expect(builds(withTowers(firstWisps - 1, ['arrow', 'frost', 'cannon', 'flak'], 100))).toEqual(['arcane']);
    // No flyers coming yet: no Flak.
    expect(builds(withTowers(1, ['arrow', 'frost', 'cannon'], 100))).not.toContain('flak');
  });

  it('upgrades Arcane towers first while a Stone-hide boss is coming', () => {
    const state = labGame();
    state.players[0]!.gold = 1_000_000;
    const pads = getMap().pads;
    pads.forEach((pad, i) =>
      applyCommand(state, 'p1', { type: 'build', padId: pad.id, tower: i === pads.length - 1 ? 'arcane' : 'arrow' }),
    );
    const arcane = state.towers.find((t) => t.kind === 'arcane')!;
    state.players[0]!.gold = TUNING.towers.arcane.tiers[1]!.cost;
    state.wave = TUNING.waves.list.length; // the Shardback's wave
    const upgrades = createBalanceBot('p1').decide(snapshot(state)).filter((c) => c.type === 'upgrade');
    expect(upgrades).toEqual([{ type: 'upgrade', towerId: arcane.id }]);
  });

  it('plays forward on its lane in later waves once it has its ultimate', () => {
    const goalY = (wave: number, ultimate: boolean) => {
      const state = labGame();
      state.wave = wave;
      const hero = state.heroes[0]!;
      if (ultimate) hero.ranks.R = 1;
      hero.skillCd.R = 1_000; // not ready: it holds its post
      const move = createBalanceBot('p1').decide(snapshot(state)).find((c) => c.type === 'attackMove');
      return move?.type === 'attackMove' ? move.y : undefined;
    };
    const heart = getMap().heart;
    expect(heart.y - goalY(20, false)!).toBeLessThan(10);
    expect(heart.y - goalY(5, true)!).toBeLessThan(10);
    expect(heart.y - goalY(20, true)!).toBeGreaterThan(15);
  });
});
