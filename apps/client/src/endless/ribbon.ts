// Today's champions on the first screen (q13; docs/GAME_DESIGN.md "Endless" → The board; docs/ART.md §12 "The
// champions' ribbon"): the home card's one-line ribbon of Endless's top 10 under the Mode row. Pure, so it is unit
// tested: what the ribbon shows for a board (hidden, the empty line, today's rows and yesterday's after them), each
// row's words, and how the rows move for a window's width (a loop with no seam, or standing centred; under reduced
// motion the first rows that fit and "+N more"). lobby/ribbon.ts draws it.

import { HERO_KINDS, type HeroKind } from '@tdt/protocol';
import type { EndlessRow, EndlessToday } from './board';

/** The label at the ribbon's left. */
export const RIBBON_LABEL = 'Endless · today’s top 10';
/** What a screen reader hears: the ribbon is one button. */
export const RIBBON_ARIA = 'Endless, today’s top 10: open the board';
/** With no row on today's board, nor yesterday's. */
export const RIBBON_EMPTY = 'No runs on the board yet. Play Endless to be the first.';
/** The small label before yesterday's rows. */
export const RIBBON_YESTERDAY = 'Yesterday';
/** Today's board shows yesterday's best after it when it has fewer rows than this. */
export const RIBBON_FEW = 3;
/** How fast the names run, CSS px a second. */
export const RIBBON_SPEED = 36;
/** How often the home card asks for the board again while it is open and the page is visible. */
export const RIBBON_REFRESH_MS = 5 * 60_000;

export type Medal = 'gold' | 'silver' | 'bronze' | null;

/** One name on the ribbon. */
export interface RibbonRow {
  rank: number;
  medal: Medal;
  hero: HeroKind | null;
  name: string;
  /** "wave 54". */
  wave: string;
  /** This browser's own row (teal, "you"). */
  mine: boolean;
}

export type RibbonModel =
  /** No ribbon: no game server, no answer, or under 13. */
  | { kind: 'hidden' }
  /** No row today nor yesterday: the one line, standing still. */
  | { kind: 'empty'; text: string }
  /** Today's rows, then (when today has fewer than 3) yesterday's best after a small "Yesterday". */
  | { kind: 'rows'; today: RibbonRow[]; yesterday: RibbonRow[] };

const MEDALS: Medal[] = ['gold', 'silver', 'bronze'];

const heroOf = (h: string): HeroKind | null => ((HERO_KINDS as readonly string[]).includes(h) ? (h as HeroKind) : null);

function ribbonRow(r: Pick<EndlessRow, 'rank' | 'name' | 'wave' | 'hero'> & { mine?: boolean }): RibbonRow {
  return { rank: r.rank, medal: MEDALS[r.rank - 1] ?? null, hero: heroOf(r.hero), name: r.name, wave: `wave ${r.wave}`, mine: !!r.mine };
}

/** What the ribbon shows for `today` (null: no server or no answer); `child`: the player is under 13. */
export function ribbonModel(today: EndlessToday | null, child: boolean): RibbonModel {
  if (!today || child) return { kind: 'hidden' };
  const rows = today.top.map(ribbonRow);
  const yesterday = rows.length < RIBBON_FEW ? (today.yesterday ?? []).map((r) => ribbonRow({ ...r, mine: false })) : [];
  if (rows.length === 0 && yesterday.length === 0) return { kind: 'empty', text: RIBBON_EMPTY };
  return { kind: 'rows', today: rows, yesterday };
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

/**
 * Under reduced motion: how many of the rows (`widths`, each with its gap) fit in `window` px with room for the
 * "+N more" tag (`more` px wide), and N. All of them when they fit without it; at least the first when it fits alone
 * (the tag is then cut at the window's edge rather than show no name).
 */
export function ribbonStill(widths: readonly number[], window: number, more: number): { shown: number; more: number } {
  const total = widths.reduce((s, w) => s + w, 0);
  if (total <= window) return { shown: widths.length, more: 0 };
  let used = 0;
  let shown = 0;
  for (const w of widths) {
    if (used + w + more > window) break;
    used += w;
    shown++;
  }
  if (shown === 0 && widths.length > 0 && widths[0]! <= window) shown = 1;
  return { shown, more: widths.length - shown };
}

/** The "+N more" tag. */
export const moreText = (n: number): string => `+${n} more`;
