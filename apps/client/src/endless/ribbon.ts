// Today's champions on the first screen (q13, q17; docs/GAME_DESIGN.md "Endless" → The board, "Daily run"; docs/ART.md
// §12 "The champions' ribbon"): the home card's one-line ribbon under the Mode row, Endless's top 10 then the Daily
// run's first three. Pure, so it is unit tested: what the ribbon shows for the two boards (hidden, the empty line,
// each board's part with its small label, yesterday's rows), each row's words, the label for the window's width, and
// how the rows move for a window's width (a loop with no seam, or standing centred; under reduced motion the first
// rows that fit and "+N more"). lobby/ribbon.ts draws it.

import { HERO_KINDS, type HeroKind } from '@tdt/protocol';
import type { DailyToday, DailyTopRow } from '../daily/text';
import type { EndlessRow, EndlessToday } from './board';

/** The label at the ribbon's left (q17: both boards' champions). */
export const RIBBON_LABEL = 'Today’s champions';
/** Under this viewport width the label is the crown alone (q17), so the names keep two thirds of the line at 360 px. */
export const RIBBON_LABEL_MIN_WIDTH = 380;
/** What a screen reader hears: the ribbon is one button. */
export const RIBBON_ARIA = 'Today’s champions of Endless and the Daily run: open the boards';
/** With no row on either board today, nor yesterday's. */
export const RIBBON_EMPTY = 'No runs on the board yet. Play Endless to be the first.';
/** The small label before Endless's rows. */
export const RIBBON_ENDLESS = 'Endless';
/** The small label before the Daily run's rows. */
export const RIBBON_DAILY = 'Daily run';
/** The small label before yesterday's rows. */
export const RIBBON_YESTERDAY = 'Yesterday';
/** Today's board shows yesterday's best after it when it has fewer rows than this. */
export const RIBBON_FEW = 3;
/** How many of the Daily run's leaders the ribbon shows. */
export const RIBBON_DAILY_ROWS = 3;
/** How fast the names run, CSS px a second. */
export const RIBBON_SPEED = 36;
/** How often the home card asks for both boards again while it is open and the page is visible. */
export const RIBBON_REFRESH_MS = 5 * 60_000;

export type Medal = 'gold' | 'silver' | 'bronze' | null;
/** Which board a part of the ribbon belongs to: a tap on it opens the board card on that board's tab. */
export type RibbonBoard = 'endless' | 'daily';

/** One name on the ribbon. */
export interface RibbonRow {
  rank: number;
  medal: Medal;
  hero: HeroKind | null;
  name: string;
  /** "wave 54" (Endless, or a Daily run that fell), "94 Heart" (a Daily run won). */
  score: string;
  /** This browser's own row (teal, "you"). */
  mine: boolean;
}

/** A board's part of the ribbon: its small label ("Endless", "Yesterday", "Daily run · yesterday") and its rows. */
export interface RibbonSection {
  board: RibbonBoard;
  label: string;
  rows: RibbonRow[];
}

export type RibbonModel =
  /** No ribbon: no game server, no answer, or under 13. */
  | { kind: 'hidden' }
  /** No row on either board, today nor yesterday: the one line, standing still. */
  | { kind: 'empty'; text: string }
  /** Endless's part (today's, then yesterday's when today has fewer than 3), then the Daily run's. */
  | { kind: 'rows'; sections: RibbonSection[] };

const MEDALS: Medal[] = ['gold', 'silver', 'bronze'];

const heroOf = (h: unknown): HeroKind | null => (typeof h === 'string' && (HERO_KINDS as readonly string[]).includes(h) ? (h as HeroKind) : null);

function row(rank: number, name: string, hero: unknown, score: string, mine: boolean): RibbonRow {
  return { rank, medal: MEDALS[rank - 1] ?? null, hero: heroOf(hero), name, score, mine };
}

const endlessRow = (r: Pick<EndlessRow, 'rank' | 'name' | 'wave' | 'hero'> & { mine?: boolean }): RibbonRow =>
  row(r.rank, r.name, r.hero, `wave ${r.wave}`, !!r.mine);

/** A Daily run's words on the ribbon: "94 Heart" for a win, "wave 12" for a run that fell. */
export function dailyScore(r: Pick<DailyTopRow, 'won' | 'heart' | 'wave'>): string {
  return r.won && r.heart > 0 ? `${r.heart} Heart` : `wave ${r.wave}`;
}

/** The rows of an answer's list that look like rows (an older or a broken answer: none). */
function dailyRows(list: unknown, mine: boolean): RibbonRow[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (r): r is DailyTopRow =>
        !!r && typeof r === 'object' && Number.isSafeInteger((r as DailyTopRow).rank) && typeof (r as DailyTopRow).name === 'string' &&
        typeof (r as DailyTopRow).heart === 'number' && typeof (r as DailyTopRow).wave === 'number',
    )
    .slice(0, RIBBON_DAILY_ROWS)
    .map((r) => row(r.rank, r.name, r.hero, dailyScore(r), mine && r.mine === true));
}

/** Endless's part: today's rows after "Endless", yesterday's best after "Yesterday" when today has fewer than 3. */
function endlessSections(today: EndlessToday): RibbonSection[] {
  const rows = today.top.map(endlessRow);
  const yesterday = rows.length < RIBBON_FEW ? (today.yesterday ?? []).map((r) => endlessRow({ ...r, mine: false })) : [];
  const out: RibbonSection[] = [];
  if (rows.length) out.push({ board: 'endless', label: RIBBON_ENDLESS, rows });
  if (yesterday.length) out.push({ board: 'endless', label: rows.length ? RIBBON_YESTERDAY : `${RIBBON_ENDLESS} · ${RIBBON_YESTERDAY.toLowerCase()}`, rows: yesterday });
  return out;
}

/** The Daily run's part: today's first three after "Daily run", or with none today yesterday's after "Daily run · yesterday". */
function dailySections(today: DailyToday): RibbonSection[] {
  const rows = dailyRows(today.top, true);
  if (rows.length) return [{ board: 'daily', label: RIBBON_DAILY, rows }];
  const yesterday = dailyRows(today.yesterdayTop, false);
  return yesterday.length ? [{ board: 'daily', label: `${RIBBON_DAILY} · ${RIBBON_YESTERDAY.toLowerCase()}`, rows: yesterday }] : [];
}

/**
 * What the ribbon shows for Endless's board and the Daily run's answer (each null: no server or no answer); `child`:
 * the player is under 13. A Daily answer without `top` (an older server) adds nothing: Endless alone, as before q17.
 */
export function ribbonModel(endless: EndlessToday | null, daily: DailyToday | null, child: boolean): RibbonModel {
  if (child || (!endless && !daily)) return { kind: 'hidden' };
  const sections = [...(endless ? endlessSections(endless) : []), ...(daily ? dailySections(daily) : [])];
  if (sections.length) return { kind: 'rows', sections };
  // Neither board has a row: the empty line, but only when Endless answered (it is about Endless).
  return endless ? { kind: 'empty', text: RIBBON_EMPTY } : { kind: 'hidden' };
}

/** The ribbon's label for a viewport `width` px wide: the words, or none (the crown alone) under 380 px. */
export function ribbonLabel(width: number): string {
  return width >= RIBBON_LABEL_MIN_WIDTH ? RIBBON_LABEL : '';
}

/**
 * How the rows move in a window `window` px wide when one set of them is `set` px wide (a row's trailing gap
 * included). A set that fits stands still, centred; else it runs right to left as a loop with no seam: the set drawn
 * twice, moved by one set's width (`loop`) over `seconds`, then from the start again.
 */
export function ribbonMotion(set: number, window: number, speed = RIBBON_SPEED): { moving: boolean; loop: number; seconds: number } {
  if (set <= window) return { moving: false, loop: 0, seconds: 0 };
  return { moving: true, loop: set, seconds: set / speed };
}

/** One item of a set as drawn: its width (its gap included), and whether it is a name (else a board's small label). */
export interface StillItem {
  width: number;
  row: boolean;
}

/**
 * Under reduced motion: how many of the items (in order) fit in `window` px with room for the "+N more" tag (`more`
 * px wide), and N, the names left out. All of them when they fit without it. A board's label is shown only with its
 * first name after it (never alone before the tag), and the first label and name are shown when they fit together
 * (the tag is then cut at the window's edge rather than show no name).
 */
export function ribbonStill(items: readonly StillItem[], window: number, more: number): { shown: number; more: number } {
  const rows = items.filter((i) => i.row).length;
  const total = items.reduce((s, i) => s + i.width, 0);
  if (total <= window) return { shown: items.length, more: 0 };
  let used = 0;
  let shown = 0;
  for (let k = 0; k < items.length; k++) {
    const item = items[k]!;
    // A label goes in with the name after it.
    const next = !item.row && items[k + 1]?.row ? items[k + 1]!.width : 0;
    if (used + item.width + next + more > window) break;
    used += item.width;
    shown++;
  }
  // Never a label last: it would stand with none of its names.
  while (shown > 0 && !items[shown - 1]!.row) shown--;
  if (shown === 0) {
    // The first name alone (with its label before it) when it fits without the tag.
    const first = items.findIndex((i) => i.row);
    if (first >= 0 && items.slice(0, first + 1).reduce((s, i) => s + i.width, 0) <= window) shown = first + 1;
  }
  const shownRows = items.slice(0, shown).filter((i) => i.row).length;
  return { shown, more: rows - shownRows };
}

/** The "+N more" tag. */
export const moreText = (n: number): string => `+${n} more`;
