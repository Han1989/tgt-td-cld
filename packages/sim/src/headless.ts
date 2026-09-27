// Runs a complete match without any client: bots decide from snapshots and
// act through applyCommand, exactly as they would through a transport.

import type { GameMode, GamePhase, HeroKind } from '@tdt/protocol';
import type { Bot } from './bots';
import { applyCommand } from './commands';
import { createGame, snapshot, step } from './game';
import { skillInfo } from './skills';
import { TICK_RATE, type Tuning } from './tuning';

export interface HeadlessResult {
  result: GamePhase;
  wave: number;
  heartHp: number;
  ticks: number;
  towers: number;
  /** Towers standing at the end with a top-tier branch. */
  branches: number;
  heroLevels: number[];
  /** Each player's unspent gold at the end. */
  gold: number[];
  /**
   * Heart HP lost in each third of the match (Full: waves 1–10, 11–20, 21–30; Quick: 1–5, 6–10, 11–15), by the
   * time the next third starts.
   */
  heartLost: number[];
  /** Bosses that reached the Heart. */
  bossLeaks: number;
  /** How each hero used its mana and its ultimate. */
  heroes: HeroMatchStats[];
}

export interface HeroMatchStats {
  kind: HeroKind;
  /** Ultimates cast over the match. */
  ultCasts: number;
  /** Share of the hero's living time with less mana than its Q costs. */
  lowMana: number;
  /** Share of the living time after R is learned with R off cooldown but costing more mana than the hero has. */
  ultUnaffordable: number;
  /** Share of the living time after R is learned with R off cooldown (ready, or unaffordable). */
  ultOffCooldown: number;
  /** Tick R was learned, or -1 if never. */
  ultLearnedTick: number;
}

export function runHeadlessMatch(opts: {
  bots: Bot[];
  seed: number;
  /** Hero of each bot (default: Ranger). */
  heroes?: HeroKind[];
  tuning?: Tuning;
  /** Match mode (default Full). */
  mode?: GameMode;
  /** Bots think this many times per second. */
  decisionsPerSecond?: number;
  maxSeconds?: number;
}): HeadlessResult {
  const state = createGame(
    {
      players: opts.bots.map((b, i) => ({ id: b.playerId, name: `Bot ${i + 1}`, hero: opts.heroes?.[i] ?? 'ranger' })),
      ...(opts.tuning ? { tuning: opts.tuning } : {}),
      ...(opts.mode ? { mode: opts.mode } : {}),
    },
    opts.seed,
  );
  const every = Math.max(1, Math.round(TICK_RATE / (opts.decisionsPerSecond ?? 4)));
  const maxTicks = (opts.maxSeconds ?? 60 * 60) * TICK_RATE;

  const thirds = Math.ceil(state.tuning.waves.list.length / 3);
  const heartAt: number[] = [state.heartHp];
  const bossIds = new Set<number>();
  let bossLeaks = 0;
  const usage = state.heroes.map(() => ({ ultCasts: 0, alive: 0, lowMana: 0, withUlt: 0, ultUnaffordable: 0, offCd: 0, learned: -1 }));
  while (state.phase !== 'victory' && state.phase !== 'defeat' && state.tick < maxTicks) {
    // Heart HP when the second and the last third start (Full: waves 11 and 21).
    if (heartAt.length < 3 && state.wave > heartAt.length * thirds) heartAt.push(state.heartHp);
    if (state.tick % every === 0) {
      const snap = snapshot(state);
      for (const bot of opts.bots) {
        for (const cmd of bot.decide(snap)) applyCommand(state, bot.playerId, cmd);
      }
    }
    step(state);
    for (const c of state.creeps) if (state.tuning.creeps[c.kind].boss) bossIds.add(c.id);
    for (const e of state.events) {
      if (e.type === 'leak' && bossIds.has(e.creepId)) bossLeaks++;
      if (e.type === 'cast' && e.slot === 'R') {
        const i = state.heroes.findIndex((h) => h.id === e.heroId);
        if (i >= 0) usage[i]!.ultCasts++;
      }
    }
    state.heroes.forEach((h, i) => {
      if (!h.alive) return;
      const u = usage[i]!;
      u.alive++;
      if (h.mana < skillInfo(state, h, 'Q').manaCost) u.lowMana++;
      if (h.ranks.R > 0) {
        if (u.learned < 0) u.learned = state.tick;
        u.withUlt++;
        if (h.skillCd.R === 0) u.offCd++;
        if (h.skillCd.R === 0 && h.mana < skillInfo(state, h, 'R').manaCost) u.ultUnaffordable++;
      }
    });
  }

  return {
    result: state.phase,
    wave: state.wave,
    heartHp: state.heartHp,
    ticks: state.tick,
    towers: state.towers.length,
    branches: state.towers.filter((t) => t.branch !== null).length,
    heroLevels: state.heroes.map((h) => h.level),
    gold: state.players.map((p) => p.gold),
    bossLeaks,
    heartLost: [0, 1, 2].map((i) => (heartAt[i] ?? state.heartHp) - (heartAt[i + 1] ?? state.heartHp)),
    heroes: state.heroes.map((h, i) => {
      const u = usage[i]!;
      return {
        kind: h.kind,
        ultCasts: u.ultCasts,
        lowMana: u.lowMana / Math.max(1, u.alive),
        ultUnaffordable: u.ultUnaffordable / Math.max(1, u.withUlt),
        ultOffCooldown: u.offCd / Math.max(1, u.withUlt),
        ultLearnedTick: u.learned,
      };
    }),
  };
}
