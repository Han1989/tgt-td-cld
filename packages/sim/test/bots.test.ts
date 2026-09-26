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

  /** A lab game where p1 has an Arrow at tier 3 on every pad, on `wave`. */
  function allTier3(wave: number, players = 1) {
    const state = labGame(TUNING, players);
    state.wave = wave;
    state.players[0]!.gold = 1_000_000;
    for (const pad of getMap().pads) applyCommand(state, 'p1', { type: 'build', padId: pad.id, tower: 'arrow' });
    for (const t of state.towers) t.tier = 3;
    return state;
  }
  const branchBuys = (state: ReturnType<typeof labGame>) =>
    createBalanceBot('p1').decide(snapshot(state)).flatMap((c) => (c.type === 'upgrade' && c.branch ? [c.branch] : []));

  it('past tier 3 buys branches: a few specialists while the coming waves need them, else the all-round one', () => {
    const boss = TUNING.waves.list.findIndex((w) => w.some((g) => TUNING.creeps[g.kind].boss)) + 1;
    // A boss within the next waves: Snipers, up to two per team.
    const coming = allTier3(boss - 1);
    coming.players[0]!.gold = 3 * TUNING.branches.sniper.cost;
    expect(branchBuys(coming)).toEqual(['sniper', 'sniper', 'volley']);
    // No boss in sight: Volleys.
    const quiet = allTier3(1);
    quiet.players[0]!.gold = TUNING.branches.volley.cost;
    expect(branchBuys(quiet)).toEqual(['volley']);
    // The team's branches count: two Snipers already standing means Volley.
    const covered = allTier3(boss - 1);
    for (const t of covered.towers.slice(0, 2)) Object.assign(t, { tier: 4, branch: 'sniper' });
    covered.players[0]!.gold = TUNING.branches.volley.cost;
    expect(branchBuys(covered)).toEqual(['volley']);
  });

  it('never holds cheaper upgrades back for an Arcane branch, even while a Stone-hide boss is coming', () => {
    const state = allTier3(TUNING.waves.list.length);
    Object.assign(state.towers[0]!, { kind: 'arcane' });
    const arrow = state.towers[1]!;
    arrow.tier = 2;
    state.players[0]!.gold = TUNING.towers.arrow.tiers[2]!.cost;
    const upgrades = createBalanceBot('p1').decide(snapshot(state)).filter((c) => c.type === 'upgrade');
    expect(upgrades).toEqual([{ type: 'upgrade', towerId: arrow.id }]);
  });

  it('with nothing left to buy, gifts its gold to the teammate with the most left to buy', () => {
    const state = labGame(TUNING, 3);
    const pads = getMap().pads;
    for (const p of state.players) p.gold = 1_000_000;
    pads.forEach((pad, i) => applyCommand(state, i < 4 ? 'p1' : i < 6 ? 'p2' : 'p3', { type: 'build', padId: pad.id, tower: 'arrow' }));
    for (const t of state.towers) if (t.owner === 'p1') Object.assign(t, { tier: 4, branch: 'volley' });
    // p2 has 2 towers left to upgrade, p3 many more.
    state.players[0]!.gold = 500;
    state.players[1]!.gold = 0;
    state.players[2]!.gold = 0;
    const gifts = () => createBalanceBot('p1').decide(snapshot(state)).filter((c) => c.type === 'gift');
    expect(gifts()).toEqual([{ type: 'gift', to: 'p3', amount: 500 }]);
    // Not to a teammate who is away, and not small change.
    state.players[2]!.connected = false;
    expect(gifts()).toEqual([{ type: 'gift', to: 'p2', amount: 500 }]);
    state.players[0]!.gold = 50;
    expect(gifts()).toEqual([]);
    // Something left to buy of its own: no gift.
    state.players[0]!.gold = 500;
    Object.assign(state.towers[0]!, { tier: 3, branch: null });
    expect(gifts()).toEqual([]);
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
