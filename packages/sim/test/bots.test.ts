// The balance bot's decisions, from a snapshot (bots never touch GameState).

import { describe, expect, it } from 'vitest';
import { createBalanceBot } from '../src/bots';
import { applyCommand, setPlayerLeft } from '../src/commands';
import { createGame, snapshot } from '../src/game';
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
    state.players[0]!.gold = TUNING.towers.arrow.tiers[1]!.cost; // one tier-2 Arrow upgrade
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
    // The hero walks (it shoots on the way) to just inside its attack range of the boss.
    const move = cmds.find((c) => c.type === 'move');
    expect(move?.type).toBe('move');
    if (move?.type !== 'move') return;
    const d = Math.hypot(move.x - boss.x, move.y - boss.y);
    expect(d).toBeLessThan(TUNING.hero.ranger.attackRange);
    expect(d).toBeGreaterThan(TUNING.hero.ranger.attackRange - 2);
    expect(cmds.some((c) => c.type === 'attackMove')).toBe(false);
  });

  it('builds only on its own zone’s pads, and on pads opened by a leaver', () => {
    const state = createGame({ players: ['p1', 'p2'].map((id) => ({ id, name: id, hero: 'ranger' as const })) }, 1);
    state.players[0]!.gold = 100_000;
    const owned = (id: string) => new Set(state.pads.filter((p) => p.owner === id).map((p) => p.id));
    const built = () =>
      createBalanceBot('p1', TUNING, 0)
        .decide(snapshot(state))
        .flatMap((c) => (c.type === 'build' ? [c.padId] : []));
    const first = built();
    expect(first.length).toBe(owned('p1').size);
    for (const id of first) expect(owned('p1').has(id)).toBe(true);

    setPlayerLeft(state, 'p2');
    expect(built().length).toBe(state.pads.length);
  });

  it('keeps a melee hero at its post until creeps come close', () => {
    const goal = (distance: number) => {
      const state = labGame(TUNING, 1, ['warden']);
      state.wave = 3;
      state.nextWaveTick = 1_000; // not the final wave (which hunts stragglers)
      const bot = createBalanceBot('p1');
      const post = bot.decide(snapshot(state)).find((c) => c.type === 'move');
      if (post?.type !== 'move') throw new Error('no move');
      const c = placeCreep(state, 'grunt', post.x, post.y - distance, 1);
      c.rootUntil = 1_000;
      const move = bot.decide(snapshot(state)).find((x) => x.type === 'move');
      return move?.type === 'move' ? Math.hypot(move.x - c.x, move.y - c.y) : undefined;
    };
    expect(goal(5.5)).toBeUndefined();
    expect(goal(4)).toBe(0);
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

  it('plays forward on its lane in later waves once it has its ultimate (3+ players; solo guards)', () => {
    const goalY = (players: number, wave: number, ultimate: boolean) => {
      const state = labGame(TUNING, players);
      state.wave = wave;
      const hero = state.heroes[0]!;
      if (ultimate) hero.ranks.R = 1;
      hero.skillCd.R = 1_000; // not ready: it holds its post
      const move = createBalanceBot('p1').decide(snapshot(state)).find((c) => c.type === 'move');
      return move?.type === 'move' ? move.y : NaN;
    };
    const guard = goalY(3, 20, false);
    expect(getMap().heart.y - guard).toBeLessThan(10);
    expect(goalY(3, 5, true)).toBeCloseTo(guard);
    expect(goalY(3, 20, true)).toBeLessThan(guard - 5);
    expect(goalY(1, 20, true)).toBeCloseTo(goalY(1, 20, false));
  });
});
