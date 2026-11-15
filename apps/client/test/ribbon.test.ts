// Today's champions' ribbon on the home card (q13, q17, endless/ribbon.ts): what it shows for the two boards (Endless's
// and the Daily run's), each row's words, the label for the window's width, and how the rows move for a window's width.

import { describe, expect, it } from 'vitest';
import type { DailyToday, DailyTopRow } from '../src/daily/text';
import type { EndlessToday } from '../src/endless/board';
import {
  dailyScore,
  moreText,
  RIBBON_EMPTY,
  RIBBON_LABEL,
  ribbonLabel,
  ribbonModel,
  ribbonMotion,
  ribbonStill,
  RIBBON_SPEED,
  type RibbonModel,
  type RibbonSection,
} from '../src/endless/ribbon';

const row = (rank: number, name: string, wave: number, hero = 'ranger', mine = false) => ({ rank, name, wave, ticks: 40_000, hero, mine });

function board(top: EndlessToday['top'], yesterday?: EndlessToday['yesterday']): EndlessToday {
  return { day: '2026-11-15', closesAt: 0, runs: top.length, top, you: null, ...(yesterday ? { yesterday } : {}) };
}

const yesterday = [
  { rank: 1, name: 'Oro', wave: 61, ticks: 1, hero: 'warden' },
  { rank: 2, name: 'Ilse', wave: 50, ticks: 1, hero: 'arcanist' },
  { rank: 3, name: 'Bram', wave: 44, ticks: 1, hero: 'ranger' },
];

const drow = (rank: number, name: string, heart: number, wave = 15, hero = 'ranger', mine = false): DailyTopRow => ({
  rank,
  name,
  hero,
  won: heart > 0,
  heart,
  wave,
  ticks: 13_000,
  ...(mine ? { mine: true as const } : {}),
});

function daily(top?: DailyTopRow[], yesterdayTop?: DailyTopRow[]): DailyToday {
  return { day: '2026-11-15', seed: 1, closesAt: 0, runs: top?.length ?? 0, champion: null, ...(top ? { top } : {}), ...(yesterdayTop ? { yesterdayTop } : {}) };
}

/** The sections' labels, boards and row names, for a compact comparison. */
const shape = (m: RibbonModel) =>
  m.kind === 'rows' ? m.sections.map((s: RibbonSection) => [s.board, s.label, s.rows.map((r) => r.name)]) : m.kind;

describe('the ribbon', () => {
  it('is hidden with no board (no server, failed requests) and under 13', () => {
    expect(ribbonModel(null, null, false)).toEqual({ kind: 'hidden' });
    expect(ribbonModel(board([row(1, 'Kael', 54)]), daily([drow(1, 'Ana', 90)]), true)).toEqual({ kind: 'hidden' });
    // Endless failed and the Daily run has no row: nothing to say.
    expect(ribbonModel(null, daily([], []), false)).toEqual({ kind: 'hidden' });
  });

  it('a full Endless board: ten rows after "Endless", medals for the first three, the faces, "wave 54", your row marked; no yesterday', () => {
    const top = Array.from({ length: 10 }, (_, i) => row(i + 1, `P${i}`, 54 - i, ['ranger', 'warden', 'arcanist'][i % 3], i === 6));
    const m = ribbonModel(board(top, yesterday), null, false);
    expect(m.kind).toBe('rows');
    if (m.kind !== 'rows') return;
    expect(m.sections).toHaveLength(1);
    const [endless] = m.sections;
    expect([endless!.board, endless!.label]).toEqual(['endless', 'Endless']);
    expect(endless!.rows).toHaveLength(10);
    expect(endless!.rows.map((r) => r.medal)).toEqual(['gold', 'silver', 'bronze', null, null, null, null, null, null, null]);
    expect(endless!.rows[0]).toEqual({ rank: 1, medal: 'gold', hero: 'ranger', name: 'P0', score: 'wave 54', mine: false });
    expect(endless!.rows.filter((r) => r.mine).map((r) => r.rank)).toEqual([7]);
    // Ties share a rank, and a shared third is bronze.
    const tie = ribbonModel(board([row(1, 'A', 9), row(2, 'B', 8), row(3, 'C', 7), row(3, 'D', 7)]), null, false);
    expect(tie.kind === 'rows' && tie.sections[0]!.rows.map((r) => r.medal)).toEqual(['gold', 'silver', 'bronze', 'bronze']);
  });

  it('both boards: Endless\'s rows, then "Daily run" and its first three ("94 Heart", a lost run "wave 12"), yours on either', () => {
    const top = [drow(1, 'Ana', 94, 15, 'warden'), drow(2, 'Bo', 71, 15, 'arcanist', true), drow(3, 'Cy', 0, 12), drow(4, 'Di', 0, 9), drow(5, 'Ed', 0, 8)];
    const m = ribbonModel(board([row(1, 'Kael', 54), row(2, 'Wren', 40), row(3, 'Juno', 31, 'arcanist', true)], yesterday), daily(top, [drow(1, 'Old', 99)]), false);
    expect(shape(m)).toEqual([
      ['endless', 'Endless', ['Kael', 'Wren', 'Juno']],
      ['daily', 'Daily run', ['Ana', 'Bo', 'Cy']],
    ]);
    if (m.kind !== 'rows') return;
    expect(m.sections[1]!.rows.map((r) => [r.rank, r.medal, r.hero, r.score, r.mine])).toEqual([
      [1, 'gold', 'warden', '94 Heart', false],
      [2, 'silver', 'arcanist', '71 Heart', true],
      [3, 'bronze', 'ranger', 'wave 12', false],
    ]);
    expect(m.sections[0]!.rows[2]!.mine).toBe(true);
  });

  it('the Daily run with no posted run today: yesterday\'s three after "Daily run · yesterday", never yours', () => {
    const y = [drow(1, 'Oro', 88), drow(2, 'Ilse', 60), drow(3, 'Bram', 0, 11)];
    const m = ribbonModel(board([row(1, 'Kael', 54), row(2, 'A', 50), row(3, 'B', 40)]), daily([], y.map((r) => ({ ...r, mine: true as const }))), false);
    expect(shape(m)).toEqual([
      ['endless', 'Endless', ['Kael', 'A', 'B']],
      ['daily', 'Daily run · yesterday', ['Oro', 'Ilse', 'Bram']],
    ]);
    expect(m.kind === 'rows' && m.sections[1]!.rows.map((r) => [r.score, r.mine])).toEqual([
      ['88 Heart', false],
      ['60 Heart', false],
      ['wave 11', false],
    ]);
  });

  it('one board with rows: that board alone', () => {
    // Endless empty today and yesterday, the Daily run with rows.
    expect(shape(ribbonModel(board([], []), daily([drow(1, 'Ana', 94)]), false))).toEqual([['daily', 'Daily run', ['Ana']]]);
    // Endless failed: the Daily run alone.
    expect(shape(ribbonModel(null, daily([drow(1, 'Ana', 94)]), false))).toEqual([['daily', 'Daily run', ['Ana']]]);
    // The Daily run empty today and yesterday, or failed: Endless alone.
    expect(shape(ribbonModel(board([row(1, 'Kael', 54)]), daily([], []), false))).toEqual([['endless', 'Endless', ['Kael']]]);
    expect(shape(ribbonModel(board([row(1, 'Kael', 54)]), null, false))).toEqual([['endless', 'Endless', ['Kael']]]);
  });

  it('an older server\'s Daily answer (no `top`): Endless alone, as before', () => {
    const old = ribbonModel(board([row(1, 'Kael', 54), row(2, 'A', 50), row(3, 'B', 40)]), daily(), false);
    expect(shape(old)).toEqual([['endless', 'Endless', ['Kael', 'A', 'B']]]);
    // A broken list is no rows.
    const broken = { ...daily(), top: [{ rank: 'x' }, null] } as unknown as DailyToday;
    expect(shape(ribbonModel(board([row(1, 'Kael', 54)]), broken, false))).toEqual([['endless', 'Endless', ['Kael']]]);
  });

  it('a few Endless rows: yesterday\'s best follow them after "Yesterday", never marked as yours', () => {
    const m = ribbonModel(board([row(1, 'Kael', 54, 'warden', true), row(2, 'Wren', 40)], yesterday), null, false);
    expect(shape(m)).toEqual([
      ['endless', 'Endless', ['Kael', 'Wren']],
      ['endless', 'Yesterday', ['Oro', 'Ilse', 'Bram']],
    ]);
    if (m.kind !== 'rows') return;
    expect(m.sections[0]!.rows[0]!.mine).toBe(true);
    expect(m.sections[1]!.rows.map((r) => [r.rank, r.name, r.score, r.medal, r.mine])).toEqual([
      [1, 'Oro', 'wave 61', 'gold', false],
      [2, 'Ilse', 'wave 50', 'silver', false],
      [3, 'Bram', 'wave 44', 'bronze', false],
    ]);
    // Three rows today: no yesterday. An older server's answer (no field): none.
    expect(shape(ribbonModel(board([row(1, 'A', 9), row(2, 'B', 8), row(3, 'C', 7)], yesterday), null, false))).toEqual([['endless', 'Endless', ['A', 'B', 'C']]]);
    expect(shape(ribbonModel(board([row(1, 'A', 9)]), null, false))).toEqual([['endless', 'Endless', ['A']]]);
  });

  it('Endless empty today: yesterday after "Endless · yesterday"; neither board with a row: the one line', () => {
    expect(shape(ribbonModel(board([], yesterday), null, false))).toEqual([['endless', 'Endless · yesterday', ['Oro', 'Ilse', 'Bram']]]);
    expect(ribbonModel(board([], []), null, false)).toEqual({ kind: 'empty', text: RIBBON_EMPTY });
    expect(ribbonModel(board([]), daily([], []), false)).toEqual({ kind: 'empty', text: RIBBON_EMPTY });
    expect(ribbonModel(board([]), daily(), false)).toEqual({ kind: 'empty', text: RIBBON_EMPTY });
    expect(RIBBON_EMPTY).toBe('No runs on the board yet. Play Endless to be the first.');
  });

  it('an unknown hero shows no face', () => {
    const m = ribbonModel(board([row(1, 'Kael', 54, 'bard')]), daily([drow(1, 'Ana', 9, 15, 'bard')]), false);
    expect(m.kind === 'rows' && m.sections.map((s) => s.rows[0]!.hero)).toEqual([null, null]);
  });

  it('a Daily run\'s words: the Heart of a win, the wave of a run that fell', () => {
    expect(dailyScore({ won: true, heart: 94, wave: 15 })).toBe('94 Heart');
    expect(dailyScore({ won: false, heart: 0, wave: 12 })).toBe('wave 12');
  });

  it('the label: "Today’s champions", the crown alone under 380 px', () => {
    expect(RIBBON_LABEL).toBe('Today’s champions');
    expect(ribbonLabel(412)).toBe('Today’s champions');
    expect(ribbonLabel(380)).toBe('Today’s champions');
    expect(ribbonLabel(379)).toBe('');
    expect(ribbonLabel(360)).toBe('');
  });

  it('moves only when a set is wider than its window: one set a loop, at 36 px a second', () => {
    expect(ribbonMotion(180, 200)).toEqual({ moving: false, loop: 0, seconds: 0 });
    expect(ribbonMotion(200, 200).moving).toBe(false);
    expect(ribbonMotion(720, 200)).toEqual({ moving: true, loop: 720, seconds: 720 / RIBBON_SPEED });
    expect(RIBBON_SPEED).toBe(36);
  });

  it('under reduced motion: the first rows that fit with "+N more", or all of them', () => {
    expect(ribbonStill([60, 60, 60], 200, 50)).toEqual({ shown: 3, more: 0 });
    expect(ribbonStill([60, 60, 60, 60], 200, 50)).toEqual({ shown: 2, more: 2 });
    expect(ribbonStill([300], 200, 50)).toEqual({ shown: 0, more: 1 });
    // The first alone when it fits but not with the tag.
    expect(ribbonStill([170, 60], 200, 50)).toEqual({ shown: 1, more: 1 });
    expect(moreText(8)).toBe('+8 more');
  });
});
