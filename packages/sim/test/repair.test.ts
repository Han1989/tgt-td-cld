// Tower repair: owner only, paid at the start, ceil(repairRate × spent × share missing) gold; the tower does not shoot
// for repairSeconds and then is back at full HP.

import { decodeReplayCommand, type GameEvent, type Replay } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createBalanceBot, createExpertBot, createNoviceBot } from '../src/bots';
import { applyCommand } from '../src/commands';
import { snapshot } from '../src/game';
import { createMatch, matchCommand, matchReplay, matchReport, replayMatch } from '../src/match';
import { repairCost, secondsToTicks, towerTier, TUNING } from '../src/tuning';

const REPAIR_TICKS = secondsToTicks(TUNING.economy.repairSeconds);
import { LAB_PAD, labGame, parkHero, placeCreep, run, runCollect } from './helpers';

function withTower(gold = 10_000) {
  const state = labGame(TUNING, 2);
  parkHero(state, 0);
  parkHero(state, 1);
  state.players[0]!.gold = gold;
  expect(applyCommand(state, 'p1', { type: 'build', padId: LAB_PAD, tower: 'arrow' })).toBe(true);
  return { state, tower: state.towers[0]!, player: state.players[0]! };
}

function lastRejection(state: ReturnType<typeof labGame>): string | undefined {
  const e = state.pendingEvents.filter((x) => x.type === 'rejected').at(-1);
  return e?.type === 'rejected' ? e.reason : undefined;
}

describe('repair cost', () => {
  it('is ceil(repairRate × spent × share of HP missing), at least 1, and 0 at full HP', () => {
    expect(TUNING.economy.repairRate).toBe(0.3);
    // Han's playtest: a tier-1 Arrow (60 gold, 500 HP) at 18 HP.
    expect(repairCost(TUNING, { spent: 60, hp: 18, maxHp: 500 })).toBe(Math.ceil(0.3 * 60 * (482 / 500)));
    expect(repairCost(TUNING, { spent: 60, hp: 18, maxHp: 500 })).toBe(18);
    expect(repairCost(TUNING, { spent: 60, hp: 250, maxHp: 500 })).toBe(9);
    expect(repairCost(TUNING, { spent: 400, hp: 0, maxHp: 600 })).toBe(120);
    // A scratch still costs a coin.
    expect(repairCost(TUNING, { spent: 60, hp: 499.9, maxHp: 500 })).toBe(1);
    expect(repairCost(TUNING, { spent: 60, hp: 500, maxHp: 500 })).toBe(0);
  });

  it('a full repair never costs more than selling and rebuilding the first tier', () => {
    for (const kind of Object.keys(TUNING.towers) as (keyof typeof TUNING.towers)[]) {
      const first = towerTier(TUNING, kind, 1);
      const workaround = first.cost - Math.floor(first.cost * TUNING.economy.sellRefund);
      expect(repairCost(TUNING, { spent: first.cost, hp: 0, maxHp: first.hp })).toBeLessThanOrEqual(workaround);
    }
  });
});

describe('repair command', () => {
  it('charges at the start, takes repairSeconds, then the tower is at full HP; tier, target and spent kept', () => {
    const { state, tower, player } = withTower();
    applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id });
    applyCommand(state, 'p1', { type: 'setPriority', towerId: tower.id, priority: 'strongest' });
    tower.hp = tower.maxHp * 0.25;
    const cost = repairCost(TUNING, tower);
    const spent = tower.spent;
    expect(cost).toBe(Math.ceil(0.3 * spent * 0.75));
    const gold = player.gold;
    state.pendingEvents = [];
    expect(applyCommand(state, 'p1', { type: 'repair', towerId: tower.id })).toBe(true);
    expect(player.gold).toBe(gold - cost);
    expect(state.pendingEvents).toContainEqual<GameEvent>({ type: 'towerRepairStarted', towerId: tower.id, owner: 'p1', cost });
    // Not yet: the snapshot shows the time left.
    expect(tower.hp).toBe(tower.maxHp * 0.25);
    expect(snapshot(state).towers[0]!.repairLeft).toBe(REPAIR_TICKS);
    expect(TUNING.economy.repairSeconds).toBe(3);
    run(state, REPAIR_TICKS - 1);
    expect(tower.hp).toBeLessThan(tower.maxHp);
    expect(snapshot(state).towers[0]!.repairLeft).toBe(1);
    const events = runCollect(state, 1);
    expect(tower.hp).toBe(tower.maxHp);
    expect(events).toContainEqual<GameEvent>({ type: 'towerRepaired', towerId: tower.id, owner: 'p1', hp: Math.round(tower.maxHp * 0.75) });
    expect(snapshot(state).towers[0]!.repairLeft).toBe(0);
    expect(snapshot(state).towers[0]!.hp).toBe(tower.maxHp);
    expect(tower.tier).toBe(2);
    expect(tower.priority).toBe('strongest');
    expect(tower.spent).toBe(spent);
  });

  it('the tower does not shoot while it is being repaired, and shoots again after', () => {
    const { state, tower } = withTower();
    tower.hp = 100;
    applyCommand(state, 'p1', { type: 'repair', towerId: tower.id });
    const creep = placeCreep(state, 'brute', tower.x + 1.5, tower.y);
    creep.stunUntil = 1_000_000;
    const full = creep.hp;
    run(state, REPAIR_TICKS - 1);
    expect(creep.hp).toBe(full);
    run(state, 40);
    expect(creep.hp).toBeLessThan(full);
  });

  it('keeps a branch', () => {
    const { state, tower } = withTower();
    applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id });
    applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id });
    expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id, branch: 'volley' })).toBe(true);
    tower.hp = 10;
    expect(applyCommand(state, 'p1', { type: 'repair', towerId: tower.id })).toBe(true);
    run(state, REPAIR_TICKS);
    expect(tower.branch).toBe('volley');
    expect(tower.tier).toBe(4);
    expect(tower.hp).toBe(tower.maxHp);
  });

  it('is refused for a teammate, a missing or dead tower, full HP and too little gold, and spends nothing', () => {
    const { state, tower, player } = withTower();
    tower.hp = 100;
    state.players[1]!.gold = 10_000;
    expect(applyCommand(state, 'p2', { type: 'repair', towerId: tower.id })).toBe(false);
    expect(lastRejection(state)).toBe('Not your tower');
    expect(state.players[1]!.gold).toBe(10_000);
    expect(applyCommand(state, 'p1', { type: 'repair', towerId: 9999 })).toBe(false);
    expect(lastRejection(state)).toBe('No such tower');

    player.gold = repairCost(TUNING, tower) - 1;
    expect(applyCommand(state, 'p1', { type: 'repair', towerId: tower.id })).toBe(false);
    expect(lastRejection(state)).toBe('Not enough gold');
    expect(tower.hp).toBe(100);
    expect(player.gold).toBe(repairCost(TUNING, tower) - 1);

    player.gold = 1000;
    tower.hp = tower.maxHp;
    expect(applyCommand(state, 'p1', { type: 'repair', towerId: tower.id })).toBe(false);
    expect(lastRejection(state)).toBe('Tower is at full HP');
    expect(player.gold).toBe(1000);

    tower.hp = 100;
    expect(applyCommand(state, 'p1', { type: 'repair', towerId: tower.id })).toBe(true);
    const paid = player.gold;
    expect(applyCommand(state, 'p1', { type: 'repair', towerId: tower.id })).toBe(false);
    expect(lastRejection(state)).toBe('Tower is being repaired');
    expect(player.gold).toBe(paid);

    player.gold = 1000;
    tower.hp = 0;
    tower.dead = true;
    expect(applyCommand(state, 'p1', { type: 'repair', towerId: tower.id })).toBe(false);
    expect(lastRejection(state)).toBe('No such tower');
    expect(player.gold).toBe(1000);
  });

  it('an upgrade keeps the damage taken: it adds the new tier\'s extra max HP to the current HP (unchanged by repair)', () => {
    const { state, tower } = withTower();
    tower.hp = 200;
    const before = tower.maxHp;
    applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id });
    expect(tower.maxHp).toBe(towerTier(TUNING, 'arrow', 2).hp);
    expect(tower.hp).toBe(200 + tower.maxHp - before);
  });

  it('selling after a repair refunds the same as before it (repairs do not count toward the refund)', () => {
    const { state, tower, player } = withTower();
    tower.hp = 50;
    applyCommand(state, 'p1', { type: 'repair', towerId: tower.id });
    const gold = player.gold;
    applyCommand(state, 'p1', { type: 'sell', towerId: tower.id });
    expect(player.gold).toBe(gold + Math.floor(towerTier(TUNING, 'arrow', 1).cost * TUNING.economy.sellRefund));
  });
});

describe('repair in the match report and the replay', () => {
  it('counts repairs and their gold per hero, logs the command, and a replay re-runs it', () => {
    const match = createMatch({ players: [{ id: 'p1', name: 'A', hero: 'ranger' }, { id: 'p2', name: 'B', hero: 'warden' }] }, 5);
    const state = match.state;
    state.players[0]!.gold = 1000;
    const pad = state.pads.find((p) => p.owner === 'p1')!.id;
    expect(matchCommand(match, 'p1', { type: 'build', padId: pad, tower: 'arrow' })).toBe(true);
    const tower = state.towers[0]!;
    tower.hp = 100;
    const cost = repairCost(state.tuning, tower);
    expect(matchCommand(match, 'p1', { type: 'repair', towerId: tower.id })).toBe(true);
    // Refused: full HP now. Logged, not counted.
    expect(matchCommand(match, 'p1', { type: 'repair', towerId: tower.id })).toBe(false);
    const report = matchReport(match);
    const [a, b] = report.heroes;
    expect(a!.repairs).toBe(1);
    expect(a!.repairGold).toBe(cost);
    expect(a!.goldSpent).toBe(towerTier(state.tuning, 'arrow', 1).cost + cost);
    expect(b!.repairs).toBe(0);
    expect(b!.repairGold).toBe(0);
    const replay: Replay = JSON.parse(JSON.stringify(matchReplay(match)));
    const logged = replay.log.filter((e) => e[2] === 'repair');
    expect(logged).toEqual([
      [0, 0, 'repair', tower.id],
      [0, 0, 'repair', tower.id],
    ]);
    expect(decodeReplayCommand(logged[0]!.slice(2))).toEqual({ type: 'repair', towerId: tower.id });
  });

  it('a replay with a repair re-runs to the same report', () => {
    const match = createMatch({ players: [{ id: 'p1', name: 'A', hero: 'arcanist' }] }, 9);
    const state = match.state;
    state.players[0]!.gold = state.tuning.economy.startingGold;
    expect(matchCommand(match, 'p1', { type: 'build', padId: state.pads[0]!.id, tower: 'arrow' })).toBe(true);
    // The tower is damaged only by the sim, so the re-run must do the same: here nothing hits it, so the repair is
    // refused in both runs. The command still round-trips through the log.
    expect(matchCommand(match, 'p1', { type: 'repair', towerId: state.towers[0]!.id })).toBe(false);
    const again = replayMatch(JSON.parse(JSON.stringify(matchReplay(match))));
    expect(matchReport(again)).toEqual(matchReport(match));
  });
});

describe('bots repair', () => {
  /** One damaged Arrow tower and too little gold for another tower: what is left over is for repairs. */
  function damaged(share: number) {
    const { state, tower, player } = withTower();
    tower.hp = tower.maxHp * share;
    player.gold = 40;
    return { state, tower };
  }
  const repairs = (cmds: { type: string }[]) => cmds.filter((c) => c.type === 'repair');

  it('the casual and expert bots repair their towers under half HP with the gold left after purchases', () => {
    for (const make of [createBalanceBot, createExpertBot]) {
      const { state, tower } = damaged(0.3);
      expect(repairs(make('p1').decide(snapshot(state)))).toEqual([{ type: 'repair', towerId: tower.id }]);
      const healthy = damaged(0.6);
      expect(repairs(make('p1').decide(snapshot(healthy.state)))).toEqual([]);
    }
  });

  it('a bot does not repair a teammate\'s tower or one it cannot afford', () => {
    const { state } = damaged(0.1);
    expect(repairs(createBalanceBot('p2').decide(snapshot(state)))).toEqual([]);
    state.players[0]!.gold = 5;
    expect(repairs(createBalanceBot('p1').decide(snapshot(state)))).toEqual([]);
  });

  it('a bot repairs one tower at a time: the expert every 15 s, the casual bot every 30 s', () => {
    for (const [make, gap] of [[createExpertBot, 15], [createBalanceBot, 30]] as const) {
      const { state, player } = withTower();
      expect(applyCommand(state, 'p1', { type: 'build', padId: LAB_PAD + 1, tower: 'arrow' })).toBe(true);
      for (const t of state.towers) t.hp = t.maxHp * 0.2;
      player.gold = 40;
      const bot = make('p1');
      expect(repairs(bot.decide(snapshot(state)))).toHaveLength(1);
      // Both towers still hurt (nothing was applied), and gold enough: no second repair until the gap has passed.
      state.tick += gap * 20 - 1;
      expect(repairs(bot.decide(snapshot(state)))).toEqual([]);
      state.tick += 1;
      expect(repairs(bot.decide(snapshot(state)))).toHaveLength(1);
    }
  });

  it('the novice bot never repairs', () => {
    const { state } = damaged(0.1);
    state.wave = 8;
    expect(repairs(createNoviceBot('p1').decide(snapshot(state)))).toEqual([]);
  });
});
