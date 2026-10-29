// The record per hero kept in this browser (record/; docs/GAME_DESIGN.md Decision Log, 28 Oct 2026): what a finished
// match and a posted Daily run change, how it reads back, what it says, and that it is never sent anywhere.

import { readdirSync, readFileSync } from 'node:fs';
import type { HeroReport, MatchReport } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_RECORD,
  heartSlot,
  matchKey,
  parseRecord,
  RECORD_KEY,
  withDailyRank,
  withMatch,
  wonFull,
  type HeroRecord,
  type PlayRecord,
} from '../src/record/record';
import { dailyBestLine, fittedLine, headlineHeart, heartBestLine, heroMark, LINE_SIZES, recordLines, slotName } from '../src/record/text';

function hero(player: string, kind: HeroReport['hero'], kills = 100): HeroReport {
  return { player, name: player, hero: kind, kills } as unknown as HeroReport;
}

/** A finished match as the host reports it; the player `p1` plays the Ranger. */
function report(over: Partial<MatchReport> = {}): MatchReport {
  return {
    format: 1,
    mode: 'quick',
    difficulty: 'normal',
    seed: 7,
    result: 'victory',
    wave: 15,
    totalWaves: 15,
    seconds: 600,
    heartHp: 94,
    heartMaxHp: 100,
    heroes: [hero('p1', 'ranger')],
    ...over,
  } as unknown as MatchReport;
}

const ranger = (record: PlayRecord): HeroRecord => record.heroes.ranger!;

describe('a finished match', () => {
  it('counts every finished match and every win for the player’s own hero', () => {
    const lost = withMatch(EMPTY_RECORD, report({ result: 'defeat', heartHp: 0, wave: 9 }), 'p1');
    expect(lost.gain).toEqual({ hero: 'ranger', won: false, heart: null });
    expect(ranger(lost.record)).toEqual({ played: 1, wins: 0, heart: {}, daily: null });
    const won = withMatch(lost.record, report(), 'p1');
    expect(ranger(won.record)).toMatchObject({ played: 2, wins: 1, heart: { 'quick-solo': 94 } });
    // Endless and the Daily run count as matches too.
    const endless = withMatch(won.record, report({ mode: 'endless', difficulty: 'hard', result: 'defeat', heartHp: 0, wave: 41, seed: 8 }), 'p1');
    expect(ranger(endless.record)).toMatchObject({ played: 3, wins: 1 });
    expect(endless.gain!.heart).toBeNull();
    // Only the player's own hero: a teammate's Warden is not this browser's.
    const coop = withMatch(EMPTY_RECORD, report({ heroes: [hero('p0', 'warden'), hero('p1', 'arcanist')] }), 'p1');
    expect(Object.keys(coop.record.heroes)).toEqual(['arcanist']);
    // A player with no hero in the report (a spectator, a bad id) changes nothing.
    expect(withMatch(EMPTY_RECORD, report(), 'p9')).toEqual({ record: EMPTY_RECORD, gain: null });
  });

  it('keeps the best Heart of won Full and Quick matches on Normal, solo and co-op apart', () => {
    expect(heartSlot(report())).toBe('quick-solo');
    expect(heartSlot(report({ mode: 'full' }))).toBe('full-solo');
    expect(heartSlot(report({ heroes: [hero('p1', 'ranger'), hero('p2', 'warden')] }))).toBe('quick-coop');
    expect(heartSlot(report({ mode: 'full', heroes: [hero('p1', 'ranger'), hero('p2', 'warden'), hero('p3', 'arcanist')] }))).toBe(
      'full-coop',
    );
    // Not a defeat, not the Daily run (Quick on Hard), not Endless.
    expect(heartSlot(report({ result: 'defeat' }))).toBeNull();
    expect(heartSlot(report({ difficulty: 'hard' }))).toBeNull();
    expect(heartSlot(report({ mode: 'endless' }))).toBeNull();

    const first = withMatch(EMPTY_RECORD, report({ heartHp: 88 }), 'p1');
    expect(first.gain!.heart).toEqual({ slot: 'quick-solo', heart: 88, previous: null, isNew: true });
    const worse = withMatch(first.record, report({ heartHp: 70, seed: 2 }), 'p1');
    expect(worse.gain!.heart).toEqual({ slot: 'quick-solo', heart: 70, previous: 88, isNew: false });
    expect(ranger(worse.record).heart).toEqual({ 'quick-solo': 88 });
    const tie = withMatch(worse.record, report({ heartHp: 88, seed: 3 }), 'p1');
    expect(tie.gain!.heart!.isNew).toBe(false);
    const better = withMatch(tie.record, report({ heartHp: 94, seed: 4 }), 'p1');
    expect(better.gain!.heart).toEqual({ slot: 'quick-solo', heart: 94, previous: 88, isNew: true });
    // A co-op win is its own slot: 100 with friends does not beat or replace the solo best.
    const coop = withMatch(better.record, report({ heartHp: 100, seed: 5, heroes: [hero('p1', 'ranger'), hero('p2', 'warden')] }), 'p1');
    expect(coop.gain!.heart).toEqual({ slot: 'quick-coop', heart: 100, previous: null, isNew: true });
    expect(ranger(coop.record).heart).toEqual({ 'quick-solo': 94, 'quick-coop': 100 });
    expect(ranger(coop.record)).toMatchObject({ played: 5, wins: 5 });
    expect(wonFull(ranger(coop.record))).toBe(false);
    const full = withMatch(coop.record, report({ mode: 'full', wave: 30, totalWaves: 30, heartHp: 61, seed: 6 }), 'p1');
    expect(wonFull(ranger(full.record))).toBe(true);
  });

  it('counts the same report once, even read again (a rejoin after the end)', () => {
    const once = withMatch(EMPTY_RECORD, report(), 'p1');
    expect(once.record.last).toBe(matchKey(report()));
    const again = withMatch(once.record, report(), 'p1');
    expect(again).toEqual({ record: once.record, gain: null });
    // Play again on the same seed is another match.
    expect(withMatch(once.record, report({ seconds: 640 }), 'p1').gain).not.toBeNull();
  });
});

describe('a posted Daily run', () => {
  const at = (rank: number, total = 200, day = '2026-10-28') => ({ rank, total, day });

  it('keeps the best place, a smaller rank number', () => {
    const played = withMatch(EMPTY_RECORD, report({ difficulty: 'hard' }), 'p1').record;
    const first = withDailyRank(played, 'ranger', at(14, 212));
    expect(first.gain).toEqual({ rank: at(14, 212), previous: null, isNew: true });
    expect(ranger(first.record)).toMatchObject({ played: 1, daily: at(14, 212) });
    const worse = withDailyRank(first.record, 'ranger', at(20));
    expect(worse.gain.isNew).toBe(false);
    expect(worse.record).toBe(first.record);
    expect(withDailyRank(first.record, 'ranger', at(14, 400)).gain.isNew).toBe(false);
    const better = withDailyRank(first.record, 'ranger', at(3, 180, '2026-10-29'));
    expect(better.gain).toEqual({ rank: at(3, 180, '2026-10-29'), previous: at(14, 212), isNew: true });
    // Each hero has his own.
    expect(withDailyRank(better.record, 'warden', at(40)).record.heroes.warden).toEqual({
      played: 1,
      wins: 0,
      heart: {},
      daily: at(40),
    });
  });
});

describe('the stored record', () => {
  it('reads back only well-formed numbers of known heroes, field by field', () => {
    expect(parseRecord(null)).toEqual(EMPTY_RECORD);
    expect(parseRecord('nope')).toEqual(EMPTY_RECORD);
    expect(parseRecord('[1]')).toEqual(EMPTY_RECORD);
    const stored = {
      heroes: {
        ranger: { played: 9, wins: 7, heart: { 'quick-solo': 94, 'full-coop': 2.5, 'full-solo': 0, endless: 40 }, daily: { rank: 3, total: 212, day: '2026-10-28' } },
        warden: { played: 2, wins: 3, heart: {} },
        arcanist: { played: 4, wins: 0, heart: null, daily: { rank: 0, total: 5, day: '2026-10-28' } },
        ninja: { played: 1, wins: 1, heart: {} },
      },
      last: 'x',
    };
    expect(parseRecord(JSON.stringify(stored))).toEqual({
      heroes: {
        ranger: { played: 9, wins: 7, heart: { 'quick-solo': 94 }, daily: { rank: 3, total: 212, day: '2026-10-28' } },
        arcanist: { played: 4, wins: 0, heart: {}, daily: null },
      },
      last: 'x',
    });
    // A record written by withMatch reads back the same.
    const written = withDailyRank(withMatch(EMPTY_RECORD, report(), 'p1').record, 'ranger', { rank: 3, total: 9, day: '2026-10-28' }).record;
    expect(parseRecord(JSON.stringify(written))).toEqual(written);
  });

  it('is never sent anywhere: record/ posts nothing, and nothing that posts reads it', () => {
    const dir = new URL('../src/record/', import.meta.url);
    for (const file of readdirSync(dir)) {
      const source = readFileSync(new URL(file, dir), 'utf8');
      expect(source, file).not.toMatch(/\bfetch\(|sendBeacon|XMLHttpRequest|WebSocket|from '\.\.\/analytics\//);
    }
    for (const sender of ['analytics/session.ts', 'analytics/install.ts', 'daily/api.ts', 'endless/api.ts', 'analytics/matchTracker.ts']) {
      const source = readFileSync(new URL(`../src/${sender}`, import.meta.url), 'utf8');
      expect(source, sender).not.toContain('record/');
      expect(source, sender).not.toContain(RECORD_KEY);
    }
  });
});

describe('what the record says', () => {
  const rec = (over: Partial<HeroRecord>): HeroRecord => ({ played: 9, wins: 7, heart: {}, daily: null, ...over });

  it('marks a hero button with his wins, or a star once he has won Full', () => {
    expect(heroMark(undefined)).toBeNull();
    expect(heroMark(rec({ wins: 0 }))).toBeNull();
    expect(heroMark(rec({ wins: 1, heart: { 'quick-solo': 50 } }))).toEqual({ text: '1', star: false, label: '1 win' });
    expect(heroMark(rec({ heart: { 'quick-coop': 80 } }))).toEqual({ text: '7', star: false, label: '7 wins' });
    expect(heroMark(rec({ heart: { 'full-coop': 40 } }))).toEqual({ text: '★', star: true, label: 'Won Full · 7 wins' });
  });

  it('writes the line under the picked hero, richest first, the picked mode’s best before the other', () => {
    expect(recordLines('Ranger', undefined, 'full')).toEqual([]);
    expect(recordLines('Warden', rec({ played: 3, wins: 0 }), 'full')).toEqual(['Warden · 3 matches played', '3 matches played']);
    expect(recordLines('Warden', rec({ played: 1, wins: 0 }), 'full')[0]).toBe('Warden · 1 match played');
    const quick = rec({ heart: { 'quick-solo': 94, 'quick-coop': 100 } });
    expect(recordLines('Ranger', quick, 'quick')).toEqual([
      'Ranger · 7 wins · best 94 Heart in Quick',
      '7 wins · best 94 Heart in Quick',
      'Ranger · 7 wins',
      '7 wins',
    ]);
    // Full picked, never won: the Quick best still shows; with friends only, it says co-op.
    expect(recordLines('Ranger', quick, 'full')[0]).toBe('Ranger · 7 wins · best 94 Heart in Quick');
    expect(recordLines('Ranger', rec({ heart: { 'quick-coop': 100 } }), 'full')[0]).toBe('Ranger · 7 wins · best 100 Heart in Quick co-op');
    const both = rec({ heart: { 'quick-solo': 94, 'full-solo': 61 }, daily: { rank: 3, total: 212, day: '2026-10-28' } });
    // The Daily rank goes first, then the name (the button and the stage show it), before the best ever does.
    expect(recordLines('Ranger', both, 'full')).toEqual([
      'Ranger · 7 wins · best 61 Heart in Full · Daily best #3',
      'Ranger · 7 wins · best 61 Heart in Full',
      '7 wins · best 61 Heart in Full · Daily best #3',
      '7 wins · best 61 Heart in Full',
      'Ranger · 7 wins',
      '7 wins',
    ]);
    expect(recordLines('Ranger', both, 'quick')[0]).toBe('Ranger · 7 wins · best 94 Heart in Quick · Daily best #3');
    // Endless picked: Full first, then Quick (Endless's own best is over its segment).
    expect(headlineHeart(both, 'endless')).toEqual({ slot: 'full-solo', heart: 61 });
    expect(recordLines('Arcanist', rec({ played: 2, wins: 0, daily: { rank: 40, total: 90, day: '2026-10-27' } }), 'full')).toEqual([
      'Arcanist · 2 matches played · Daily best #40',
      '2 matches played · Daily best #40',
      'Arcanist · 2 matches played',
      '2 matches played',
    ]);
  });

  it('shows the richest line that fits, a size step down before a part gives way, the last whatever it measures', () => {
    const lines = ['a long line here', 'a line', 'a'];
    expect(fittedLine(lines, (t) => t.length <= 6)).toEqual({ text: 'a line', size: 12 });
    expect(fittedLine(lines, (t, size) => t.length * size <= 66)).toEqual({ text: 'a line', size: 11 });
    expect(fittedLine(lines, () => false)).toEqual({ text: 'a', size: 11 });
    expect(fittedLine([], () => true)).toEqual({ text: '', size: 11 });
    expect(LINE_SIZES).toEqual([12, 11]);
  });

  it('fits the stage in Inter and in CI’s wider DejaVu Sans alike: the Daily rank, then the name give way, never the best', () => {
    // A font as the page measures it: a glyph's mean advance in em on these lines (Inter 0.47, DejaVu Sans 0.56, as
    // measured in Chromium at 12 px), in the nameplate's content box: 330 px on a 412 px phone, 278 px at 360.
    const font = (em: number, column: number) => (text: string, size: number) => text.length * em * size <= column;
    const inter = 0.47;
    const dejavu = 0.56;
    const ranger = rec({ heart: { 'quick-solo': 94 }, daily: { rank: 3, total: 212, day: '2026-10-28' } });
    const lines = recordLines('Ranger', ranger, 'full');
    const full = 'Ranger · 7 wins · best 94 Heart in Quick · Daily best #3';
    expect(fittedLine(lines, font(inter, 330))).toEqual({ text: full, size: 12 });
    expect(fittedLine(lines, font(inter, 300))).toEqual({ text: full, size: 11 });
    expect(fittedLine(lines, font(inter, 278))).toEqual({ text: 'Ranger · 7 wins · best 94 Heart in Quick', size: 12 });
    expect(fittedLine(lines, font(dejavu, 330))).toEqual({ text: 'Ranger · 7 wins · best 94 Heart in Quick', size: 12 });
    expect(fittedLine(lines, font(dejavu, 278))).toEqual({ text: 'Ranger · 7 wins · best 94 Heart in Quick', size: 12 });
    const coop = recordLines('Arcanist', rec({ wins: 5, heart: { 'quick-coop': 100 } }), 'quick');
    expect(fittedLine(coop, font(dejavu, 330))).toEqual({ text: 'Arcanist · 5 wins · best 100 Heart in Quick co-op', size: 12 });
    expect(fittedLine(coop, font(dejavu, 278))).toEqual({ text: '5 wins · best 100 Heart in Quick co-op', size: 12 });
    // However narrow, a line is chosen and nothing is cut: the count alone.
    expect(fittedLine(lines, font(dejavu, 40))).toEqual({ text: '7 wins', size: 11 });
  });

  it('says "Personal best" on the end screen only when a number improves', () => {
    expect(slotName('quick-solo')).toBe('Quick solo');
    expect(slotName('full-coop')).toBe('Full co-op');
    expect(heartBestLine(null)).toBe('');
    expect(heartBestLine({ slot: 'quick-solo', heart: 70, previous: 88, isNew: false })).toBe('');
    expect(heartBestLine({ slot: 'quick-solo', heart: 94, previous: null, isNew: true })).toBe('Personal best: 94 Heart · Quick solo');
    expect(heartBestLine({ slot: 'full-coop', heart: 94, previous: 88, isNew: true })).toBe('Personal best: 94 Heart · Full co-op (was 88)');
    const day = '2026-10-28';
    expect(dailyBestLine({ rank: { rank: 20, total: 99, day }, previous: { rank: 14, total: 80, day }, isNew: false })).toBe('');
    expect(dailyBestLine({ rank: { rank: 14, total: 212, day }, previous: null, isNew: true })).toBe('Personal best: #14 in the Daily run');
    expect(dailyBestLine({ rank: { rank: 3, total: 212, day }, previous: { rank: 14, total: 80, day }, isNew: true })).toBe(
      'Personal best: #3 in the Daily run (was #14)',
    );
  });
});
