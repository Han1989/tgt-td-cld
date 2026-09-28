// A match as a host runs it: the game state plus a replay log of every input (commands, joins and leaves,
// each with its tick) and the running numbers of the match report. The server's rooms and the local worker
// both drive their simulation through this, so every finished match has a report and a replay, and
// `replayMatch` can re-run a replay to the same end.

import {
  decodeReplayCommand,
  encodeReplayCommand,
  GAME_MODES,
  HERO_KINDS,
  PROTOCOL_VERSION,
  type Command,
  type HeroReport,
  type MatchReport,
  type PlayerId,
  type Replay,
  type ReplayEntry,
} from '@tdt/protocol';
import { applyCommand, setPlayerConnected, setPlayerLeft } from './commands';
import { createGame, step } from './game';
import { skillInfo } from './skills';
import type { GameConfig, GameState } from './state';
import { TICK_RATE, type Tuning } from './tuning';

/** What happens to a player's connection: back (rejoined), dropped, or gone for good. */
export type Presence = 'join' | 'drop' | 'leave';

/** Two ultimates cast this close together (either order) overlap in the report. */
export const R_OVERLAP_SECONDS = 2;

interface HeroTrack {
  deaths: number;
  levelUps: number[];
  levelByWave: number[];
  casts: { Q: number; W: number; R: number };
  noManaTicks: { Q: number; W: number };
  rTicks: number[];
}

export interface Match {
  seed: number;
  /** The host's build (git commit or 'dev'), stamped into the report and the replay. */
  build: string;
  state: GameState;
  log: ReplayEntry[];
  heartAfterWave: number[];
  heroes: HeroTrack[];
}

/** `build` is the host's build (its git commit, or 'dev'): the sim only carries it into the report and replay. */
export function createMatch(config: GameConfig, seed: number, build = 'dev'): Match {
  const state = createGame(config, seed);
  return {
    seed,
    build,
    state,
    log: [],
    heartAfterWave: [],
    heroes: state.heroes.map(() => ({
      deaths: 0,
      levelUps: [],
      levelByWave: [],
      casts: { Q: 0, W: 0, R: 0 },
      noManaTicks: { Q: 0, W: 0 },
      rTicks: [],
    })),
  };
}

export function matchOver(match: Match): boolean {
  return match.state.phase === 'victory' || match.state.phase === 'defeat';
}

/** Rounds a coordinate to 1/100 tile, which keeps replay logs short (a tile is 32 px, so 0.3 px). */
const q = (v: number) => Math.round(v * 100) / 100;

/**
 * Applies a player's command (coordinates rounded to 1/100 tile) and logs it. Returns whether the sim
 * accepted it. Commands after the match ended are ignored.
 */
export function matchCommand(match: Match, playerId: PlayerId, command: Command): boolean {
  const index = match.state.players.findIndex((p) => p.id === playerId);
  if (index < 0 || matchOver(match)) return false;
  const cmd: Command =
    'x' in command && command.x !== undefined && command.y !== undefined
      ? ({ ...command, x: q(command.x), y: q(command.y) } as Command)
      : command;
  match.log.push([match.state.tick, index, ...(encodeReplayCommand(cmd) as [string, ...(string | number)[]])]);
  return applyCommand(match.state, playerId, cmd);
}

/** A player reconnected (`join`), dropped (`drop`) or left for good (`leave`); logged for the replay. */
export function matchPresence(match: Match, playerId: PlayerId, presence: Presence): void {
  const index = match.state.players.findIndex((p) => p.id === playerId);
  if (index < 0 || matchOver(match)) return;
  match.log.push([match.state.tick, index, presence]);
  applyPresence(match.state, playerId, presence);
}

function applyPresence(state: GameState, playerId: PlayerId, presence: Presence): void {
  if (presence === 'leave') setPlayerLeft(state, playerId);
  else setPlayerConnected(state, playerId, presence === 'join');
}

/** Advances one tick and updates the report's numbers. */
export function matchStep(match: Match): void {
  const state = match.state;
  if (matchOver(match)) return;
  const heartBefore = state.heartHp;
  const levelsBefore = state.heroes.map((h) => h.level);
  step(state);
  const indexOf = new Map(state.heroes.map((h, i) => [h.id, i]));
  for (const e of state.events) {
    if (e.type === 'waveStart' && e.wave > 1) {
      // The wave before it ended just before this tick's leaks and level-ups.
      match.heartAfterWave.push(Math.max(0, heartBefore));
      match.heroes.forEach((t, i) => t.levelByWave.push(levelsBefore[i]!));
    } else if (e.type === 'gameOver' && state.wave > 0) {
      match.heartAfterWave.push(Math.max(0, state.heartHp));
      match.heroes.forEach((t, i) => t.levelByWave.push(state.heroes[i]!.level));
    } else if (e.type === 'heroDied' || e.type === 'levelUp' || e.type === 'cast') {
      const t = match.heroes[indexOf.get(e.heroId) ?? -1];
      if (!t) continue;
      if (e.type === 'heroDied') t.deaths++;
      else if (e.type === 'levelUp') t.levelUps.push(state.tick / TICK_RATE);
      else if (e.slot !== 'E') {
        t.casts[e.slot]++;
        if (e.slot === 'R') t.rTicks.push(state.tick);
      }
    }
  }
  state.heroes.forEach((h, i) => {
    if (!h.alive) return;
    for (const slot of ['Q', 'W'] as const) {
      if (h.ranks[slot] > 0 && h.skillCd[slot] === 0 && h.mana < skillInfo(state, h, slot).manaCost) {
        match.heroes[i]!.noManaTicks[slot]++;
      }
    }
  });
}

/** The match report (complete once the match is over). */
export function matchReport(match: Match): MatchReport {
  const state = match.state;
  const window = R_OVERLAP_SECONDS * TICK_RATE;
  const heroes: HeroReport[] = state.heroes.map((h, i) => {
    const t = match.heroes[i]!;
    const player = state.players.find((p) => p.heroId === h.id)!;
    const others = match.heroes.flatMap((o, j) => (j === i ? [] : o.rTicks));
    return {
      player: player.id,
      name: player.name,
      hero: h.kind,
      level: h.level,
      kills: player.kills,
      deaths: t.deaths,
      levelUps: t.levelUps,
      levelByWave: t.levelByWave,
      casts: { ...t.casts },
      noManaSeconds: { Q: t.noManaTicks.Q / TICK_RATE, W: t.noManaTicks.W / TICK_RATE },
      rOverlaps: t.rTicks.filter((tick) => others.some((o) => Math.abs(o - tick) <= window)).length,
    };
  });
  return {
    format: 1,
    protocol: PROTOCOL_VERSION,
    build: match.build,
    mode: state.mode,
    seed: match.seed,
    result: state.phase === 'victory' ? 'victory' : 'defeat',
    wave: state.wave,
    totalWaves: state.tuning.waves.list.length,
    seconds: state.tick / TICK_RATE,
    heartHp: Math.max(0, state.heartHp),
    heartMaxHp: state.tuning.heart.maxHp,
    heartAfterWave: match.heartAfterWave.slice(),
    heroes,
  };
}

/** The replay: seed, setup and the input log, plus how the match stands now (its end, once over). */
export function matchReplay(match: Match): Replay {
  const state = match.state;
  return {
    format: 1,
    protocol: PROTOCOL_VERSION,
    build: match.build,
    seed: match.seed,
    mode: state.mode,
    players: state.players.map((p) => ({ id: p.id, name: p.name, hero: state.heroes.find((h) => h.id === p.heroId)!.kind })),
    log: match.log.slice(),
    end: { tick: state.tick, result: state.phase, wave: state.wave, heartHp: state.heartHp },
  };
}

/**
 * Re-runs a replay with the simulation: every logged input at its tick, then steps until the match ends (or
 * the tick it ended at in the recording, if that was cut short). Throws on a malformed log entry.
 */
export function replayMatch(replay: Replay, tuning?: Tuning): Match {
  const match = createMatch(
    { players: replay.players, mode: replay.mode, ...(tuning ? { tuning } : {}) },
    replay.seed,
    replay.build,
  );
  const state = match.state;
  for (const [tick, index, what, ...args] of replay.log) {
    while (state.tick < tick && !matchOver(match)) matchStep(match);
    const player = replay.players[index];
    if (!player) throw new Error(`Replay log names player ${index}, the match has ${replay.players.length}`);
    if (what === 'join' || what === 'drop' || what === 'leave') {
      matchPresence(match, player.id, what);
    } else {
      const cmd = decodeReplayCommand([what, ...args]);
      if (!cmd) throw new Error(`Malformed command in the replay log at tick ${tick}: ${JSON.stringify([what, ...args])}`);
      matchCommand(match, player.id, cmd);
    }
  }
  const limit = Math.max(replay.end.tick, state.tick);
  while (!matchOver(match) && state.tick < limit) matchStep(match);
  return match;
}

/** Checks a replay's shape (from a file: untrusted). Returns why it is not a replay, or null. */
export function replayProblem(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return 'not an object';
  const r = data as Partial<Replay>;
  if (r.format !== 1) return `unknown replay format ${String(r.format)}`;
  if (typeof r.seed !== 'number' || !Number.isSafeInteger(r.seed)) return 'bad seed';
  // Replays saved before builds were stamped have none.
  if (r.build !== undefined && typeof r.build !== 'string') return 'bad build';
  if (!GAME_MODES.includes(r.mode as never)) return 'bad mode';
  if (!Array.isArray(r.players) || r.players.length === 0) return 'no players';
  for (const p of r.players) {
    if (typeof p?.id !== 'string' || typeof p.name !== 'string' || !HERO_KINDS.includes(p.hero)) return 'bad player';
  }
  if (!Array.isArray(r.log)) return 'no log';
  for (const e of r.log) {
    if (!Array.isArray(e) || typeof e[0] !== 'number' || typeof e[1] !== 'number' || typeof e[2] !== 'string') {
      return `bad log entry ${JSON.stringify(e)}`;
    }
  }
  if (typeof r.end !== 'object' || r.end === null || typeof r.end.tick !== 'number') return 'no end';
  return null;
}

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** A one-line summary of a report, for server logs. */
export function reportSummary(report: MatchReport, room?: string): string {
  const heroes = report.heroes.map(
    (h) =>
      `${h.name}/${h.hero} L${h.level} k${h.kills} d${h.deaths} Q${h.casts.Q} W${h.casts.W} R${h.casts.R} ` +
      `noMana Q${Math.round(h.noManaSeconds.Q)}s W${Math.round(h.noManaSeconds.W)}s Roverlap ${h.rOverlaps}`,
  );
  return (
    `match${room ? ` ${room}` : ''} ${report.mode} seed ${report.seed} v${report.protocol} build ${report.build} ` +
    `${report.result} ` +
    `wave ${report.wave}/${report.totalWaves} heart ${report.heartHp}/${report.heartMaxHp} ${mmss(report.seconds)} | ` +
    `heart by wave ${report.heartAfterWave.join(' ')} | ${heroes.join(' | ')}`
  );
}
