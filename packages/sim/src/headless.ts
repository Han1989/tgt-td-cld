// Runs a complete match without any client: bots decide from snapshots and
// act through applyCommand, exactly as they would through a transport.

import type { GamePhase } from '@tdt/protocol';
import type { Bot } from './bots';
import { applyCommand } from './commands';
import { createGame, snapshot, step } from './game';
import { TICK_RATE, type Tuning } from './tuning';

export interface HeadlessResult {
  result: GamePhase;
  wave: number;
  heartHp: number;
  ticks: number;
  towers: number;
  heroLevels: number[];
  gold: number[];
}

export function runHeadlessMatch(opts: {
  bots: Bot[];
  seed: number;
  tuning?: Tuning;
  /** Bots think this many times per second. */
  decisionsPerSecond?: number;
  maxSeconds?: number;
}): HeadlessResult {
  const state = createGame(
    {
      players: opts.bots.map((b, i) => ({ id: b.playerId, name: `Bot ${i + 1}`, hero: 'ranger' })),
      ...(opts.tuning ? { tuning: opts.tuning } : {}),
    },
    opts.seed,
  );
  const every = Math.max(1, Math.round(TICK_RATE / (opts.decisionsPerSecond ?? 4)));
  const maxTicks = (opts.maxSeconds ?? 60 * 60) * TICK_RATE;

  while (state.phase !== 'victory' && state.phase !== 'defeat' && state.tick < maxTicks) {
    if (state.tick % every === 0) {
      const snap = snapshot(state);
      for (const bot of opts.bots) {
        for (const cmd of bot.decide(snap)) applyCommand(state, bot.playerId, cmd);
      }
    }
    step(state);
  }

  return {
    result: state.phase,
    wave: state.wave,
    heartHp: state.heartHp,
    ticks: state.tick,
    towers: state.towers.length,
    heroLevels: state.heroes.map((h) => h.level),
    gold: state.players.map((p) => p.gold),
  };
}
