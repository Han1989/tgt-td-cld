// A day's scoreboard (docs/GAME_DESIGN.md "Daily run"): one entry per browser, its best run of the day, ranked by the
// sim's `rankOrder`. Pure: the store keeps the entries, the routes ask for views of them.

import type { HeroKind } from '@tdt/protocol';
import { rankOrder, type DailyRun } from '@tdt/sim';

/** One browser's best run of a day, as the server re-ran it. The data key is never kept, only the id derived from it. */
export interface DailyEntry extends DailyRun {
  /** The visitor id derived from the data key (analytics/dataKey.ts). */
  visitor: string;
  name: string;
  hero: HeroKind;
  /** When the best run was posted (server time, ms). */
  at: number;
}

/** A row as the board shows it. `mine`: the caller's own row. */
export interface BoardRow {
  rank: number;
  name: string;
  heart: number;
  wave: number;
  ticks: number;
  mine: boolean;
}

/** The caller's best run: the result, without the name or id. */
export interface BestRun extends DailyRun {
  hero: HeroKind;
}

export interface BoardView {
  day: string;
  total: number;
  /** The caller's rank and best run of the day, or null (no key, or no run posted). */
  rank: number | null;
  best: BestRun | null;
  /** Five rows around the caller, or the top five. */
  rows: BoardRow[];
}

/** How many rows a board view holds. */
export const BOARD_ROWS = 5;

/** Best first; a tie keeps the earlier post first. */
export function sortBoard(entries: Iterable<DailyEntry>): DailyEntry[] {
  return [...entries].sort((a, b) => rankOrder(a, b) || a.at - b.at);
}

/** Ranks of a sorted board: a tie shares the rank of the first of its group (1, 2, 2, 4). */
export function ranksOf(sorted: readonly DailyEntry[]): number[] {
  const ranks: number[] = [];
  sorted.forEach((entry, i) => {
    const prev = sorted[i - 1];
    ranks.push(prev && rankOrder(prev, entry) === 0 ? ranks[i - 1]! : i + 1);
  });
  return ranks;
}

export function bestRun(entry: DailyEntry): BestRun {
  return { won: entry.won, heart: entry.heart, wave: entry.wave, ticks: entry.ticks, hero: entry.hero };
}

/** The board as `visitor` sees it: their rank and best, and the five rows around them (or the top five). */
export function boardView(day: string, entries: Iterable<DailyEntry>, visitor: string | null): BoardView {
  const sorted = sortBoard(entries);
  const ranks = ranksOf(sorted);
  const mine = visitor === null ? -1 : sorted.findIndex((e) => e.visitor === visitor);
  const start = mine < 0 ? 0 : Math.max(0, Math.min(mine - Math.floor(BOARD_ROWS / 2), sorted.length - BOARD_ROWS));
  const rows = sorted.slice(start, start + BOARD_ROWS).map((e, i) => ({
    rank: ranks[start + i]!,
    name: e.name,
    heart: e.heart,
    wave: e.wave,
    ticks: e.ticks,
    mine: start + i === mine,
  }));
  return {
    day,
    total: sorted.length,
    rank: mine < 0 ? null : ranks[mine]!,
    best: mine < 0 ? null : bestRun(sorted[mine]!),
    rows,
  };
}

/** The day's winner, or null on an empty board. */
export function champion(entries: Iterable<DailyEntry>): { name: string; heart: number; ticks: number } | null {
  const top = sortBoard(entries)[0];
  return top ? { name: top.name, heart: top.heart, ticks: top.ticks } : null;
}
