// Runs a complete match without any client: bots decide from snapshots and
// act through applyCommand, exactly as they would through a transport.

import type { GameMode, GamePhase, HeroKind } from '@tdt/protocol';
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
  /**
   * Heart HP lost in each third of the match (Full: waves 1–10, 11–20, 21–30; Quick: 1–5, 6–10, 11–15), by the
   * time the next third starts.
   */
  heartLost: number[];
  /** Bosses that reached the Heart. */
  bossLeaks: number;
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
    for (const e of state.events) if (e.type === 'leak' && bossIds.has(e.creepId)) bossLeaks++;
  }

  return {
    result: state.phase,
    wave: state.wave,
    heartHp: state.heartHp,
    ticks: state.tick,
    towers: state.towers.length,
    heroLevels: state.heroes.map((h) => h.level),
    gold: state.players.map((p) => p.gold),
    bossLeaks,
    heartLost: [0, 1, 2].map((i) => (heartAt[i] ?? state.heartHp) - (heartAt[i + 1] ?? state.heartHp)),
  };
}
