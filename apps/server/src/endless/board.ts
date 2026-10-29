// Endless's day board (docs/GAME_DESIGN.md "Endless", "The board"): one entry per browser, its best solo run of the
// UTC day, ranked by the sim's `endlessRankOrder` (the wave the Heart fell on, then the shorter time). The board shows
// the top 10; the caller's own row is marked, and named under them when it is not in the ten. Pure: the store keeps
// the entries, the routes ask for views of them (the Daily run's `sortBy` / `ranksBy`).

import type { HeroKind } from '@tdt/protocol';
import { dailyClosesAt, ENDLESS_BOARD_SIZE, endlessRankOrder, type EndlessRun } from '@tdt/sim';
import { ranksBy, sortBy } from '../daily/board';
import type { DayEntry } from '../daily/days';

/** One browser's best Endless run of a day, as the server re-ran it. */
export interface EndlessEntry extends EndlessRun, DayEntry {
  hero: HeroKind;
}

/** A row of the top 10. `mine`: the caller's own row. */
export interface EndlessRow {
  rank: number;
  name: string;
  wave: number;
  ticks: number;
  hero: HeroKind;
  mine: boolean;
}

/** GET /endless/today (and the head of a post's answer). */
export interface EndlessView {
  day: string;
  /** The next UTC midnight, ms: when the board turns over. */
  closesAt: number;
  /** Browsers on the day's board. */
  runs: number;
  top: EndlessRow[];
  /** The caller's rank and best run of the day, or null (no key, or no run posted today). */
  you: { rank: number; wave: number; ticks: number } | null;
}

export function endlessSort(entries: Iterable<EndlessEntry>): EndlessEntry[] {
  return sortBy(entries, endlessRankOrder);
}

/** The board as `visitor` sees it: the top 10, their own row marked, and their rank and best. */
export function endlessView(day: string, entries: Iterable<EndlessEntry>, visitor: string | null): EndlessView {
  const sorted = endlessSort(entries);
  const ranks = ranksBy(sorted, endlessRankOrder);
  const mine = visitor === null ? -1 : sorted.findIndex((e) => e.visitor === visitor);
  const top = sorted.slice(0, ENDLESS_BOARD_SIZE).map((e, i) => ({
    rank: ranks[i]!,
    name: e.name,
    wave: e.wave,
    ticks: e.ticks,
    hero: e.hero,
    mine: i === mine,
  }));
  const me = sorted[mine];
  return {
    day,
    closesAt: dailyClosesAt(day),
    runs: sorted.length,
    top,
    you: me ? { rank: ranks[mine]!, wave: me.wave, ticks: me.ticks } : null,
  };
}

/** The day's top wave, or null on an empty board. */
export function topWave(entries: Iterable<EndlessEntry>): number | null {
  let top: number | null = null;
  for (const e of entries) if (top === null || e.wave > top) top = e.wave;
  return top;
}
