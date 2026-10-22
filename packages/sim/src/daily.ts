// The Daily run (docs/GAME_DESIGN.md "Daily run"; Han, 17 Oct 2026): one seed a day for everyone, solo, Quick on
// Hard. The day is the UTC date; the caller passes the time (the sim never reads a clock), and the seed is hashed from
// the day's key by this file's own code, so the server and every client agree on it. `rankOrder` is the scoreboard's
// order. Pure.

import type { Difficulty, GameMode, Replay } from '@tdt/protocol';
import type { GameConfig, PlayerConfig } from './state';

/** A day's key: the UTC date, `YYYY-MM-DD`. */
export const DAILY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The run every daily seed is played as: one player, Quick, Hard. */
export const DAILY_RUN: { readonly players: 1; readonly mode: GameMode; readonly difficulty: Difficulty } = {
  players: 1,
  mode: 'quick',
  difficulty: 'hard',
};

/** The match config of a daily run for `player` (the seed is `dailySeed` of the day). */
export function dailyConfig(player: PlayerConfig): GameConfig {
  return { players: [player], mode: DAILY_RUN.mode, difficulty: DAILY_RUN.difficulty };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The UTC date of day number `days` (days since 1970-01-01), as a key. Howard Hinnant's civil-from-days. */
function keyOfDay(days: number): string {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

/** Day number (days since 1970-01-01) of a key, or null when it is not a real date. */
export function dayNumber(key: string): number | null {
  if (!DAILY_KEY.test(key)) return null;
  const y0 = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const d = Number(key.slice(8, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  const days = era * 146097 + doe - 719468;
  // 2026-02-31 would land on 2026-03-03: not a date.
  return keyOfDay(days) === key ? days : null;
}

/** Today's key at `now` (ms since the epoch, from the caller's clock): the UTC date. */
export function dailyKey(now: number): string {
  return keyOfDay(Math.floor(now / DAY_MS));
}

/** The key `offset` days from `key` (-1: the day before). Throws on a key that is not a date. */
export function shiftDailyKey(key: string, offset: number): string {
  const days = dayNumber(key);
  if (days === null) throw new Error(`Not a daily key: ${key}`);
  return keyOfDay(days + offset);
}

/** When a day's run closes: the next UTC midnight, ms since the epoch. */
export function dailyClosesAt(key: string): number {
  const days = dayNumber(key);
  if (days === null) throw new Error(`Not a daily key: ${key}`);
  return (days + 1) * DAY_MS;
}

/** The domain tag keeps this seed from being any other hash of the date. */
const SEED_TAG = 'tdt-daily-v1:';

/**
 * The day's seed: FNV-1a over the tagged key, then a 32-bit finaliser (murmur3's fmix32), kept to 31 bits so it is a
 * positive safe integer like every other match seed.
 */
export function dailySeed(key: string): number {
  let h = 0x811c9dc5;
  const text = SEED_TAG + key;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) & 0x7fffffff;
}

/**
 * Why a replay is not a daily run of the day whose seed is `seed`, or null: exactly one player, Quick (never Endless),
 * Hard, that seed, no Meteor Rain practice and no match modifiers. Check `replayProblem` first (the shape).
 */
export function dailyRefusal(replay: Pick<Replay, 'players' | 'mode' | 'difficulty' | 'seed' | 'practice' | 'modifiers'>, seed: number): string | null {
  if (replay.players.length !== DAILY_RUN.players) return 'a daily run has one player';
  if (replay.mode === 'endless') return 'an Endless run is not a daily run';
  if (replay.mode !== DAILY_RUN.mode) return 'a daily run is Quick';
  if ((replay.difficulty ?? 'normal') !== DAILY_RUN.difficulty) return 'a daily run is on Hard';
  if (replay.practice) return 'a daily run is not practice';
  if (replay.modifiers && replay.modifiers.length > 0) return 'a daily run has no modifiers';
  if (replay.seed !== seed) return "not today's seed";
  return null;
}

/** One run as the scoreboard ranks it. */
export interface DailyRun {
  won: boolean;
  /** Heart HP left (0 on a loss). */
  heart: number;
  /** The wave the run ended on. */
  wave: number;
  /** Match ticks the run lasted. */
  ticks: number;
}

/**
 * The scoreboard's order, as a sort comparator (negative: `a` ranks above `b`). A win beats a loss. Wins: more Heart
 * left, then fewer ticks (faster). Losses: a later wave, then more ticks (held out longer). 0 is a tie.
 */
export function rankOrder(a: DailyRun, b: DailyRun): number {
  if (a.won !== b.won) return a.won ? -1 : 1;
  if (a.won) return b.heart - a.heart || a.ticks - b.ticks;
  return b.wave - a.wave || b.ticks - a.ticks;
}
