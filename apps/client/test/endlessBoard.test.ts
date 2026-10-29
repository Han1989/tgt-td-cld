// Endless's daily board on the client (src/endless/board.ts): when a finished run posts by itself, by every age band and
// answer; the consent card's and the switch's words; the end screen's rank line; the board card's rows.

import { PROTOCOL_VERSION } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import type { AgeBand } from '../src/analytics/age';
import {
  afterYes,
  bestStandsLine,
  boardDayLine,
  cardCopy,
  mayPost,
  parseEndlessPost,
  pinnedRow,
  postErrorLine,
  postPlan,
  rankLine,
  rankParts,
  rowText,
  runTime,
  switchStatus,
  type EndlessPost,
  type EndlessRow,
  type PostContext,
} from '../src/endless/board';
import { withRun } from '../src/endless/best';
import { DEFAULT_SETTINGS, parseSettings } from '../src/settings';
import { cardLines, endlessFace, shareText } from '../src/share/text';

const replay = (patch: Partial<NonNullable<PostContext['replay']>> = {}): NonNullable<PostContext['replay']> => ({
  players: [{ id: 'local', name: 'Wren', hero: 'warden' }],
  mode: 'endless',
  protocol: PROTOCOL_VERSION,
  end: { tick: 40_000, result: 'defeat', wave: 46, heartHp: 0 },
  ...patch,
});

const ctx = (patch: Partial<PostContext> = {}): PostContext => ({
  server: true,
  solo: true,
  replay: replay(),
  endless: true,
  age: 'adult',
  setting: 'on',
  named: true,
  ...patch,
});

describe('when a finished Endless run posts', () => {
  it('by itself only for a solo Endless run, 16 and over, a nickname and a yes', () => {
    expect(postPlan(ctx())).toBe('post');
    // Missing any one of them: no post by itself.
    expect(postPlan(ctx({ named: false }))).toBe('name');
    expect(postPlan(ctx({ setting: 'unasked' }))).toBe('consent');
    expect(postPlan(ctx({ setting: 'off' }))).toBe('none');
    expect(postPlan(ctx({ age: 'teen' }))).toBe('ask');
    expect(postPlan(ctx({ age: 'child' }))).toBe('none');
    expect(postPlan(ctx({ age: null }))).toBe('ask');
    expect(postPlan(ctx({ server: false }))).toBe('none');
    expect(postPlan(ctx({ endless: false }))).toBe('none');
    expect(postPlan(ctx({ solo: false }))).toBe('room');
  });

  it('by every age band and answer', () => {
    const table: Record<string, Record<EndlessPost, string>> = {};
    for (const age of [null, 'child', 'teen', 'adult'] as (AgeBand | null)[]) {
      const row = {} as Record<EndlessPost, string>;
      for (const setting of ['unasked', 'on', 'off'] as EndlessPost[]) row[setting] = postPlan(ctx({ age, setting }));
      table[String(age)] = row;
    }
    expect(table).toEqual({
      // Unanswered: the card (its yes asks the age); a yes kept from before still asks the age first.
      null: { unasked: 'consent', on: 'ask', off: 'none' },
      // Under 13: never, and nothing is shown.
      child: { unasked: 'none', on: 'none', off: 'none' },
      // 13 to 15: one tap each time, whatever was answered before.
      teen: { unasked: 'ask', on: 'ask', off: 'ask' },
      adult: { unasked: 'consent', on: 'post', off: 'none' },
    });
    // Under 13 nothing shows online either; everyone else is told solo runs post.
    expect(postPlan(ctx({ age: 'child', solo: false }))).toBe('none');
    expect(postPlan(ctx({ age: null, solo: false, setting: 'unasked' }))).toBe('room');
  });

  it('a yes posts this run and every one after it from 16, this run only from 13 to 15, nothing under 13', () => {
    expect(afterYes('adult')).toBe('always');
    expect(afterYes('teen')).toBe('once');
    expect(afterYes('child')).toBe('never');
  });

  it('only a solo Endless match on this build’s protocol that reached wave 1', () => {
    expect(mayPost(replay())).toBe(true);
    expect(mayPost(null)).toBe(false);
    expect(mayPost(replay({ mode: 'quick' }))).toBe(false);
    expect(mayPost(replay({ protocol: PROTOCOL_VERSION - 1 }))).toBe(false);
    expect(mayPost(replay({ players: [...replay().players, { id: 'p2', name: 'Kael', hero: 'ranger' }] }))).toBe(false);
    expect(mayPost(replay({ end: { tick: 400, result: 'defeat', wave: 0, heartHp: 0 } }))).toBe(false);
    expect(postPlan(ctx({ replay: replay({ mode: 'full' }) }))).toBe('none');
  });

  it('asks in plain words', () => {
    expect(cardCopy('consent')).toEqual({ question: 'Post my Endless runs to the daily board?', yes: 'Yes, every time', no: 'Not now' });
    expect(cardCopy('ask')).toEqual({ question: "Post this run to today's board?", yes: 'Post this run', no: null });
    expect(cardCopy('name').no).toBeNull();
  });

  it('keeps the answer in tdt.settings, unasked until the card', () => {
    expect(DEFAULT_SETTINGS.endlessPost).toBe('unasked');
    expect(parseSettings(JSON.stringify({ endlessPost: 'on' })).endlessPost).toBe('on');
    expect(parseSettings(JSON.stringify({ endlessPost: 'off' })).endlessPost).toBe('off');
    expect(parseSettings(JSON.stringify({ endlessPost: true })).endlessPost).toBe('unasked');
    expect(parseEndlessPost(undefined)).toBe('unasked');
    expect(DEFAULT_SETTINGS.endlessRoomLine).toBe('new');
    expect(parseSettings(JSON.stringify({ endlessRoomLine: 'seen' })).endlessRoomLine).toBe('seen');
  });
});

describe('⚙ Settings → Play data: Post Endless runs to the board', () => {
  it('is off until the yes; locked under 16; asks the age at On when unanswered', () => {
    expect(switchStatus('unasked', 'adult')).toMatchObject({ on: false, locked: false, line: 'Off: the game asks after your first Endless match.' });
    expect(switchStatus('on', 'adult')).toMatchObject({ on: true, locked: false });
    expect(switchStatus('on', 'adult').line).toContain("today's public board under your nickname");
    expect(switchStatus('off', 'adult')).toMatchObject({ on: false, locked: false, line: 'Off: your Endless runs stay on this device.' });
    expect(switchStatus('on', null).line).toContain('asks your age');
    expect(switchStatus('on', 'teen')).toMatchObject({ on: false, locked: true });
    expect(switchStatus('on', 'teen').line).toContain('asks before each run');
    expect(switchStatus('on', 'child')).toEqual({ on: false, locked: true, line: 'Off: scores can be posted from 13.' });
  });
});

const row = (rank: number, name: string, wave: number, mine = false): EndlessRow => ({ rank, name, wave, ticks: 40_000 + rank * 100, hero: 'warden', mine });
const ten = (mineAt = -1) => Array.from({ length: 10 }, (_, i) => row(i + 1, `P${i + 1}`, 54 - i, i === mineAt));

describe('the end screen’s rank line', () => {
  it('in the ten: the rank and the day’s top wave; first: the top of the board', () => {
    const third = { runs: 112, top: ten(2), you: { rank: 3, wave: 52, ticks: 40_300 } };
    expect(rankLine(third)).toBe('#3 today · top wave 54');
    expect(rankParts(third)).toEqual({ lead: '', num: '#3', rest: 'today · top wave 54' });
    // The count-up's number.
    expect(rankLine(third, 40)).toBe('#40 today · top wave 54');
    expect(rankLine({ runs: 5, top: ten(0).slice(0, 5), you: { rank: 1, wave: 54, ticks: 40_100 } })).toBe('#1 today · top of the board');
  });

  it('past the ten: not in today’s top 10, the rank of the total', () => {
    const late = { runs: 112, top: ten(), you: { rank: 27, wave: 31, ticks: 30_000 } };
    expect(rankLine(late)).toBe("Not in today's top 10 · #27 of 112");
    expect(rankParts(late)).toEqual({ lead: "Not in today's top 10 ·", num: '#27', rest: 'of 112' });
  });

  it('names the best that stands when this run did not beat it', () => {
    expect(bestStandsLine({ improved: true, you: { rank: 3, wave: 52, ticks: 40_300 } })).toBeNull();
    expect(bestStandsLine({ improved: false, you: { rank: 3, wave: 52, ticks: 49_600 } })).toBe('Your best today stands: wave 52 · 41:20');
  });

  it('says why a post did not go through, in one line', () => {
    expect(postErrorLine('version')).toContain('another version');
    expect(postErrorLine('network')).toBe('Could not reach the game server: this run was not posted.');
    expect(postErrorLine('rerun')).toBe('The server could not verify this run, so it was not posted.');
  });
});

describe('the board card', () => {
  it('rows: rank, nickname, wave and time; the day and the time left', () => {
    expect(rowText(row(1, 'Wren', 54))).toEqual({ rank: '#1', name: 'Wren', wave: 'Wave 54', time: '33:25' });
    expect(runTime(20 * 3727)).toBe('1:02:07');
    expect(boardDayLine({ day: '2026-10-29', closesAt: Date.parse('2026-10-30T00:00:00Z') }, Date.parse('2026-10-29T21:00:00Z'))).toBe(
      '29 Oct · 3 h left today',
    );
  });

  it('pins your row under the ten only when you are not in them', () => {
    expect(pinnedRow({ top: ten(4), you: { rank: 5, wave: 50, ticks: 1 } })).toBeNull();
    expect(pinnedRow({ top: ten(), you: { rank: 27, wave: 31, ticks: 30_000 } })).toEqual({ rank: 27, wave: 31, ticks: 30_000 });
    expect(pinnedRow({ top: ten(), you: null })).toBeNull();
  });
});

describe('the share card of a posted Endless run', () => {
  it('adds "#3 today" once posted, nothing before', () => {
    const run = withRun({}, 'warden', 46).run;
    const posted = endlessFace(run, 2292, 'warden', 3);
    expect(posted.today).toBe(3);
    expect(cardLines(posted)[0]!.runs.map((r) => r.text).join('')).toBe('Endless · #3 today');
    expect(shareText(posted)).toBe("I held out to wave 46 in Endless, #3 on today's board. How far can you get?");
    const unposted = endlessFace(run, 2292, 'warden');
    expect('today' in unposted).toBe(false);
    expect(cardLines(unposted)[0]!.runs.map((r) => r.text).join('')).toBe('Endless');
  });
});
