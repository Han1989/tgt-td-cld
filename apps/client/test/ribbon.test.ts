// Today's champions' ribbon on the home card (q13, endless/ribbon.ts): what it shows for each board, each row's words,
// and how the rows move for a window's width.

import { describe, expect, it } from 'vitest';
import type { EndlessToday } from '../src/endless/board';
import { moreText, RIBBON_EMPTY, ribbonModel, ribbonMotion, ribbonStill, RIBBON_SPEED } from '../src/endless/ribbon';

const row = (rank: number, name: string, wave: number, hero = 'ranger', mine = false) => ({ rank, name, wave, ticks: 40_000, hero, mine });

function board(top: EndlessToday['top'], yesterday?: EndlessToday['yesterday']): EndlessToday {
  return { day: '2026-11-15', closesAt: 0, runs: top.length, top, you: null, ...(yesterday ? { yesterday } : {}) };
}

const yesterday = [
  { rank: 1, name: 'Oro', wave: 61, ticks: 1, hero: 'warden' },
  { rank: 2, name: 'Ilse', wave: 50, ticks: 1, hero: 'arcanist' },
  { rank: 3, name: 'Bram', wave: 44, ticks: 1, hero: 'ranger' },
];

describe('the ribbon', () => {
  it('is hidden with no board (no server, a failed request) and under 13', () => {
    expect(ribbonModel(null, false)).toEqual({ kind: 'hidden' });
    expect(ribbonModel(board([row(1, 'Kael', 54)]), true)).toEqual({ kind: 'hidden' });
  });

  it('a full board: ten rows, medals for the first three, the faces, "wave 54", your row marked; no yesterday', () => {
    const top = Array.from({ length: 10 }, (_, i) => row(i + 1, `P${i}`, 54 - i, ['ranger', 'warden', 'arcanist'][i % 3], i === 6));
    const m = ribbonModel(board(top, yesterday), false);
    expect(m.kind).toBe('rows');
    if (m.kind !== 'rows') return;
    expect(m.today).toHaveLength(10);
    expect(m.yesterday).toEqual([]);
    expect(m.today.map((r) => r.medal)).toEqual(['gold', 'silver', 'bronze', null, null, null, null, null, null, null]);
    expect(m.today[0]).toEqual({ rank: 1, medal: 'gold', hero: 'ranger', name: 'P0', wave: 'wave 54', mine: false });
    expect(m.today.filter((r) => r.mine).map((r) => r.rank)).toEqual([7]);
    // Ties share a rank, and a shared third is bronze.
    const tie = ribbonModel(board([row(1, 'A', 9), row(2, 'B', 8), row(3, 'C', 7), row(3, 'D', 7)]), false);
    expect(tie.kind === 'rows' && tie.today.map((r) => r.medal)).toEqual(['gold', 'silver', 'bronze', 'bronze']);
  });

  it('a few rows: yesterday\'s best follow them, never marked as yours', () => {
    const m = ribbonModel(board([row(1, 'Kael', 54, 'warden', true), row(2, 'Wren', 40)], yesterday), false);
    expect(m.kind).toBe('rows');
    if (m.kind !== 'rows') return;
    expect(m.today.map((r) => r.name)).toEqual(['Kael', 'Wren']);
    expect(m.today[0]!.mine).toBe(true);
    expect(m.yesterday.map((r) => [r.rank, r.name, r.wave, r.medal, r.mine])).toEqual([
      [1, 'Oro', 'wave 61', 'gold', false],
      [2, 'Ilse', 'wave 50', 'silver', false],
      [3, 'Bram', 'wave 44', 'bronze', false],
    ]);
    // Three rows today: no yesterday. An older server's answer (no field): none.
    const three = ribbonModel(board([row(1, 'A', 9), row(2, 'B', 8), row(3, 'C', 7)], yesterday), false);
    expect(three.kind === 'rows' && three.yesterday).toEqual([]);
    const old = ribbonModel(board([row(1, 'A', 9)]), false);
    expect(old.kind === 'rows' && old.yesterday).toEqual([]);
  });

  it('empty today: yesterday alone, or the one line when yesterday is empty too', () => {
    const y = ribbonModel(board([], yesterday), false);
    expect(y.kind === 'rows' && [y.today.length, y.yesterday.length]).toEqual([0, 3]);
    expect(ribbonModel(board([], []), false)).toEqual({ kind: 'empty', text: RIBBON_EMPTY });
    expect(ribbonModel(board([]), false)).toEqual({ kind: 'empty', text: RIBBON_EMPTY });
    expect(RIBBON_EMPTY).toBe('No runs on the board yet. Play Endless to be the first.');
  });

  it('an unknown hero shows no face', () => {
    const m = ribbonModel(board([row(1, 'Kael', 54, 'bard')]), false);
    expect(m.kind === 'rows' && m.today[0]!.hero).toBeNull();
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
    expect(moreText(8)).toBe('+8 more');
  });
});
