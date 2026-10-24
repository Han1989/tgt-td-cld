// Reinforce (Endless only; Han's match of 24 Oct 2026): a branched tower buys rank after rank. Rank n costs its kind's
// tier-3 upgrade price × 1.12^(n − 1), whole gold; each rank multiplies damage and max HP by 1.12 and joins `spent`.

import type { GameEvent, GameMode, Replay } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createBalanceBot, createExpertBot, createNoviceBot, type Bot } from '../src/bots';
import { applyCommand } from '../src/commands';
import { createGame, snapshot, step } from '../src/game';
import { getMap } from '../src/map';
import { createMatch, matchCommand, matchReplay, matchReport, matchStep, replayMatch, replayRefusal, reportSummary } from '../src/match';
import type { GameState } from '../src/state';
import { reinforceCost, reinforceMultiplier, repairCost, towerStats, tuningForMode, TUNING } from '../src/tuning';
import { LAB_PAD, parkHero, placeCreep, tuningCopy } from './helpers';

/** A one-player game of `mode` with the wave timer off and every pad open, and a branched Volley on the lab pad. */
function branched(mode: GameMode = 'endless', gold = 100_000) {
  const state = createGame({ players: [{ id: 'p1', name: 'P1', hero: 'ranger' }, { id: 'p2', name: 'P2', hero: 'warden' }], mode }, 7);
  state.nextWaveTick = -1;
  state.pads = getMap().pads.map((p) => ({ id: p.id, owner: null }));
  parkHero(state, 0);
  parkHero(state, 1);
  state.players[0]!.gold = gold;
  expect(applyCommand(state, 'p1', { type: 'build', padId: LAB_PAD, tower: 'arrow' })).toBe(true);
  const tower = state.towers[0]!;
  expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id })).toBe(true);
  expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id })).toBe(true);
  expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id, branch: 'volley' })).toBe(true);
  state.pendingEvents = [];
  return { state, tower, player: state.players[0]! };
}

/** An arrow tower's first four Reinforce ranks: 275 × 1.12^(n − 1), each rounded up to whole gold. */
const PRICES = [0, 1, 2, 3].map((n) => Math.ceil(275 * TUNING.reinforce.priceGrowth ** n - 1e-9));

function lastRejection(state: GameState): string | undefined {
  const e = state.pendingEvents.filter((x) => x.type === 'rejected').at(-1);
  return e?.type === 'rejected' ? e.reason : undefined;
}

describe('reinforce cost and stats', () => {
  const endless = tuningForMode(TUNING, 'endless');

  it('rank n costs the tier-3 upgrade price × 1.12^(n − 1), whole gold; 0 outside Endless or before a branch', () => {
    expect(TUNING.reinforce).toEqual({ on: false, priceGrowth: 1.12, perRank: 0.12 });
    expect(endless.reinforce.on).toBe(true);
    const arrow = (reinforced: number) => reinforceCost(endless, { kind: 'arrow', branch: 'volley', reinforced });
    expect(TUNING.towers.arrow.tiers[2]!.cost).toBe(275);
    expect([0, 1, 2, 3].map(arrow)).toEqual(PRICES);
    expect(PRICES).toEqual([275, 308, 345, 387]);
    expect(reinforceCost(endless, { kind: 'cannon', branch: 'mortar', reinforced: 0 })).toBe(375);
    expect(reinforceCost(endless, { kind: 'arrow', branch: null, reinforced: 0 })).toBe(0);
    expect(reinforceCost(TUNING, { kind: 'arrow', branch: 'volley', reinforced: 0 })).toBe(0);
    expect(reinforceCost(tuningForMode(TUNING, 'quick'), { kind: 'arrow', branch: 'volley', reinforced: 0 })).toBe(0);
  });

  it('multiplies damage and max HP (whole) by 1.12 a rank, and nothing else', () => {
    expect(reinforceMultiplier(endless, 3)).toBeCloseTo(1.404928);
    for (const branch of ['volley', 'blizzard', 'glacier', 'void'] as const) {
      const kind = branch === 'volley' ? 'arrow' : branch === 'void' ? 'arcane' : 'frost';
      const plain = towerStats(endless, kind, 4, branch);
      const three = towerStats(endless, kind, 4, branch, 3);
      expect(three.damage).toBeCloseTo(plain.damage * 1.404928);
      expect(three.hp).toBe(Math.round(plain.hp * 1.404928));
      const same = (s: typeof plain) => ({ ...s, damage: 0, hp: 0 });
      expect(same(three)).toEqual(same(plain));
    }
    // Rank 0 is the tower as it was.
    expect(towerStats(endless, 'arrow', 4, 'volley', 0)).toEqual(towerStats(endless, 'arrow', 4, 'volley'));
  });
});

describe('reinforce command', () => {
  it('adds a rank: charges its price, grows damage and max HP (keeping the damage taken), and adds to spent', () => {
    const { state, tower, player } = branched();
    const plain = towerStats(state.tuning, 'arrow', 4, 'volley');
    tower.hp = tower.maxHp - 100;
    const spent = tower.spent;
    const gold = player.gold;
    expect(applyCommand(state, 'p1', { type: 'reinforce', towerId: tower.id })).toBe(true);
    expect(tower.reinforced).toBe(1);
    expect(player.gold).toBe(gold - 275);
    expect(tower.spent).toBe(spent + 275);
    expect(tower.maxHp).toBe(Math.round(plain.hp * 1.12));
    expect(tower.hp).toBe(tower.maxHp - 100);
    expect(state.pendingEvents).toContainEqual<GameEvent>({ type: 'towerReinforced', towerId: tower.id, owner: 'p1', rank: 1, cost: 275 });
    expect(applyCommand(state, 'p1', { type: 'reinforce', towerId: tower.id })).toBe(true);
    expect(applyCommand(state, 'p1', { type: 'reinforce', towerId: tower.id })).toBe(true);
    expect(tower.reinforced).toBe(3);
    expect(player.gold).toBe(gold - PRICES[0]! - PRICES[1]! - PRICES[2]!);
    expect(tower.maxHp).toBe(Math.round(plain.hp * 1.404928));
    expect(snapshot(state).towers[0]).toMatchObject({ reinforced: 3, maxHp: tower.maxHp, tier: 4, branch: 'volley' });
  });

  it('is refused in Full and Quick, before a branch, on a teammate’s tower and short of gold; nothing is spent', () => {
    for (const mode of ['full', 'quick'] as const) {
      const { state, tower, player } = branched(mode);
      const gold = player.gold;
      expect(applyCommand(state, 'p1', { type: 'reinforce', towerId: tower.id })).toBe(false);
      expect(lastRejection(state)).toBe('Reinforce is only in Endless');
      expect(tower.reinforced).toBe(0);
      expect(player.gold).toBe(gold);
      expect(snapshot(state).towers[0]!.reinforced).toBe(0);
    }
    const { state, tower, player } = branched();
    expect(applyCommand(state, 'p1', { type: 'build', padId: LAB_PAD + 1, tower: 'cannon' })).toBe(true);
    const cannon = state.towers[1]!;
    expect(applyCommand(state, 'p1', { type: 'reinforce', towerId: cannon.id })).toBe(false);
    expect(lastRejection(state)).toBe('Reinforce comes after a specialisation');
    expect(applyCommand(state, 'p2', { type: 'reinforce', towerId: tower.id })).toBe(false);
    expect(lastRejection(state)).toBe('Not your tower');
    expect(applyCommand(state, 'p1', { type: 'reinforce', towerId: 999_999 })).toBe(false);
    expect(lastRejection(state)).toBe('No such tower');
    player.gold = 274;
    expect(applyCommand(state, 'p1', { type: 'reinforce', towerId: tower.id })).toBe(false);
    expect(lastRejection(state)).toBe('Not enough gold');
    expect(player.gold).toBe(274);
    expect(tower.reinforced).toBe(0);
  });

  it('the sell refund and the repair price follow the ranks (they are in spent)', () => {
    const { state, tower, player } = branched();
    for (let i = 0; i < 2; i++) applyCommand(state, 'p1', { type: 'reinforce', towerId: tower.id });
    tower.hp = tower.maxHp / 2;
    expect(repairCost(state.tuning, tower)).toBe(Math.ceil(0.3 * tower.spent * 0.5 - 1e-9));
    const gold = player.gold;
    const refund = Math.floor(tower.spent * TUNING.economy.sellRefund);
    expect(tower.spent).toBe(60 + 140 + 275 + 600 + PRICES[0]! + PRICES[1]!);
    expect(applyCommand(state, 'p1', { type: 'sell', towerId: tower.id })).toBe(true);
    expect(player.gold).toBe(gold + refund);
  });

  it('a reinforced tower shoots harder', () => {
    const shot = (ranks: number) => {
      const { state, tower } = branched();
      for (let i = 0; i < ranks; i++) applyCommand(state, 'p1', { type: 'reinforce', towerId: tower.id });
      const brute = placeCreep(state, 'brute', tower.x, tower.y - 3);
      brute.rootUntil = 1_000_000;
      brute.hp = brute.maxHp = 1_000_000;
      for (let i = 0; i < 60 && state.projectiles.length === 0; i++) step(state);
      return Math.max(...state.projectiles.map((p) => p.damage));
    };
    expect(shot(2) / shot(0)).toBeCloseTo(1.12 * 1.12);
  });
});

describe('reinforce in the match report and the replay', () => {
  it('counts ranks and their gold per hero, says so in the Endless summary, and re-runs', () => {
    // Gold from the start (the tuning), so the re-run can pay for the same ranks.
    const rich = tuningCopy();
    rich.economy.startingGold = 100_000;
    const match = createMatch({ players: [{ id: 'p1', name: 'A', hero: 'ranger' }], mode: 'endless', tuning: rich }, 3);
    const state = match.state;
    const pad = state.pads[0]!.id;
    matchCommand(match, 'p1', { type: 'build', padId: pad, tower: 'arrow' });
    const id = state.towers[0]!.id;
    matchCommand(match, 'p1', { type: 'upgrade', towerId: id });
    matchCommand(match, 'p1', { type: 'upgrade', towerId: id });
    matchCommand(match, 'p1', { type: 'upgrade', towerId: id, branch: 'sniper' });
    for (let i = 0; i < 3; i++) expect(matchCommand(match, 'p1', { type: 'reinforce', towerId: id })).toBe(true);
    for (let i = 0; i < 40; i++) matchStep(match);
    const report = matchReport(match);
    const three = PRICES[0]! + PRICES[1]! + PRICES[2]!;
    expect(report.heroes[0]).toMatchObject({ reinforces: 3, reinforceGold: three });
    expect(report.heroes[0]!.goldSpent).toBe(60 + 140 + 275 + 600 + three);
    expect(reportSummary(report)).toContain(`reinforces 3/${three}g`);
    const replay = matchReplay(match);
    expect(replay.log.filter((e) => e[2] === 'reinforce')).toHaveLength(3);
    expect(replayMatch(replay, rich).state.towers[0]!.reinforced).toBe(3);
    // Full: the summary has no reinforce word.
    const full = createMatch({ players: [{ id: 'p1', name: 'A', hero: 'ranger' }] }, 3);
    for (let i = 0; i < 10; i++) matchStep(full);
    expect(matchReport(full).heroes[0]).toMatchObject({ reinforces: 0, reinforceGold: 0 });
    expect(reportSummary(matchReport(full))).not.toMatch(/reinforce/);
  });

  it('refuses an Endless replay recorded under protocol 21 (its rules changed); Full and Quick ones re-run', () => {
    const endless = createMatch({ players: [{ id: 'p1', name: 'A', hero: 'arcanist' }], mode: 'endless' }, 5, '0123abcd');
    for (let i = 0; i < 40; i++) matchStep(endless);
    const old: Replay = { ...matchReplay(endless), protocol: 21 };
    expect(replayRefusal(old)).toMatch(/Endless match was recorded under protocol 21.*protocol 22.*git checkout 0123abcd/);
    expect(() => replayMatch(old)).toThrow(/veteran levels and Reinforce/);
    expect(replayRefusal(matchReplay(endless))).toBeNull();
    const quick = createMatch({ players: [{ id: 'p1', name: 'A', hero: 'arcanist' }], mode: 'quick' }, 5);
    for (let i = 0; i < 40; i++) matchStep(quick);
    const quick21: Replay = { ...matchReplay(quick), protocol: 21 };
    expect(replayRefusal(quick21)).toBeNull();
    expect(replayMatch(quick21).state.tick).toBe(quick21.end.tick);
  });
});

describe('the bots reinforce (Endless)', () => {
  /**
   * An Endless match with gold to spare from the start, `bot` playing solo until wave `until`: the first Reinforce rank's
   * tick, how the bot's towers stood then, and the ranks bought.
   */
  function play(make: (id: string, tuning: ReturnType<typeof tuningCopy>) => Bot, until: number) {
    const rich = tuningCopy();
    rich.economy.startingGold = 60_000;
    const state = createGame({ players: [{ id: 'p1', name: 'P1', hero: 'ranger' }], mode: 'endless', tuning: rich }, 3);
    const bot = make('p1', rich);
    let first: { pads: number; towers: number; branched: number } | null = null;
    let ranks = 0;
    while (state.wave < until && state.phase !== 'defeat') {
      if (state.tick % 5 === 0) for (const cmd of bot.decide(snapshot(state))) applyCommand(state, 'p1', cmd);
      const before = state.towers.map((t) => ({ branch: t.branch }));
      step(state);
      for (const e of state.events) {
        if (e.type !== 'towerReinforced') continue;
        ranks++;
        first ??= { pads: state.pads.length, towers: before.length, branched: before.filter((t) => t.branch).length };
      }
    }
    return { first, ranks, state };
  }

  it('the expert and the casual bot buy ranks only once every pad of their zone is built and branched', () => {
    for (const make of [createExpertBot, createBalanceBot]) {
      const { first, ranks } = play((id, t) => make(id, t), 16);
      expect(ranks).toBeGreaterThan(5);
      // Solo: the zone is every pad (the expert fills the ones it leaves out in Full once its planned towers are branched).
      expect(first).toEqual({ pads: first!.pads, towers: first!.pads, branched: first!.pads });
    }
  }, 60_000);

  it('the novice never reinforces', () => {
    expect(play((id, t) => createNoviceBot(id, t), 16).ranks).toBe(0);
  }, 60_000);
});
