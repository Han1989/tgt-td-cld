// The Daily run's words (src/daily/text.ts: the home tile's live line, the end screen's rank reveal) and its requests
// (src/daily/api.ts: the key goes with a read only after a post, a post always carries it).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DATA_KEY_KEY, visitorFromKey } from '../src/analytics/dataKey';
import { fetchToday, POSTED_KEY, postRun } from '../src/daily/api';
import {
  bestLine,
  clock,
  dailyTileLine,
  dayLabel,
  gapLine,
  postErrorLine,
  rankLine,
  rankParts,
  retryable,
  rowText,
  runText,
  timeLeft,
  topShare,
  type BoardRow,
  type DailyToday,
  type PostResult,
} from '../src/daily/text';

const NOW = Date.parse('2026-10-22T21:10:00Z');
const today = (extra: Partial<DailyToday> = {}): DailyToday => ({
  day: '2026-10-22',
  seed: 2003471498,
  closesAt: Date.parse('2026-10-23T00:00:00Z'),
  runs: 212,
  champion: null,
  ...extra,
});

describe('the home tile', () => {
  it('says how many have run, and how long is left, on a plain day', () => {
    expect(dailyTileLine(today(), NOW)).toEqual({ text: '212 have run today · 2 h left', you: false });
    expect(dailyTileLine(today({ runs: 1 }), NOW).text).toBe('1 has run today · 2 h left');
    expect(dailyTileLine(today({ runs: 0 }), NOW).text).toBe('Be the first today · 2 h left');
  });

  it('names yesterday’s champion for the day after', () => {
    expect(dailyTileLine(today({ champion: { name: 'Kael', heart: 82, ticks: 13_000 } }), NOW)).toEqual({
      text: "Yesterday's champion: Kael · 82 Heart",
      you: false,
    });
  });

  it('puts the player first: today’s rank with the time left to climb, else yesterday’s finish', () => {
    const champion = { name: 'Kael', heart: 82, ticks: 13_000 };
    expect(dailyTileLine(today({ champion, you: { today: { rank: 14, total: 212 }, yesterday: { rank: 9, total: 340 } } }), NOW)).toEqual({
      text: '#14 of 212 · 2 h left to climb',
      you: true,
    });
    expect(dailyTileLine(today({ champion, you: { today: null, yesterday: { rank: 9, total: 340 } } }), NOW)).toEqual({
      text: 'Yesterday you finished #9 of 340',
      you: true,
    });
    expect(dailyTileLine(today({ champion, you: { today: null, yesterday: null } }), NOW).you).toBe(false);
  });

  it('counts the time left in hours, then minutes', () => {
    const closes = Date.parse('2026-10-23T00:00:00Z');
    expect(timeLeft(closes, Date.parse('2026-10-22T00:00:01Z'))).toBe('23 h left');
    expect(timeLeft(closes, Date.parse('2026-10-22T23:00:00Z'))).toBe('1 h left');
    expect(timeLeft(closes, Date.parse('2026-10-22T23:15:00Z'))).toBe('45 min left');
    expect(timeLeft(closes, Date.parse('2026-10-22T23:59:59Z'))).toBe('1 min left');
    // Past the close (a slow clock): never "0 min".
    expect(timeLeft(closes, closes + 5000)).toBe('1 min left');
  });

  it('fits one line of the tile: no line runs longer than the tile at 360 px holds', () => {
    const longest = [
      dailyTileLine(today({ champion: { name: 'W'.repeat(16), heart: 100, ticks: 1 } }), NOW).text,
      dailyTileLine(today({ you: { today: { rank: 1234, total: 9999 }, yesterday: null } }), NOW).text,
      dailyTileLine(today({ you: { today: null, yesterday: { rank: 1234, total: 9999 } } }), NOW).text,
      dailyTileLine(today({ runs: 9999 }), NOW).text,
    ];
    // About 44 characters of 13 px text fit the tile's 296 px at 360 px; a longer name is cut with an ellipsis.
    expect(longest.map((t) => t.length).filter((n) => n > 44)).toEqual([longest[0]!.length]);
  });
});

const row = (rank: number, name: string, heart: number, wave: number, ticks: number, mine = false): BoardRow => ({
  rank,
  name,
  heart,
  wave,
  ticks,
  mine,
});

describe('the rank reveal', () => {
  it('reads "#14 of 212 · top 7 %", counting with the number shown, and leaves the share out under ten players', () => {
    expect(rankLine(14, 212)).toBe('#14 of 212 · top 7 %');
    expect(rankLine(14, 212, 120)).toBe('#120 of 212 · top 7 %');
    expect(rankLine(1, 212)).toBe('#1 of 212 · top 1 %');
    expect(rankLine(212, 212)).toBe('#212 of 212 · top 100 %');
    expect(rankLine(3, 8)).toBe('#3 of 8');
    expect(topShare(1, 10)).toBe('top 10 %');
    expect(topShare(1, 9)).toBeNull();
    // Drawn as a big number and a smaller rest (the browser test checks it fits the card at 360 px).
    expect(rankParts(14, 212)).toEqual({ num: '#14', rest: 'of 212 · top 7 %' });
    expect(rankParts(14, 212, 99)).toEqual({ num: '#99', rest: 'of 212 · top 7 %' });
  });

  it('says the gap to the row above: Heart, then time for wins; waves, then time for runs that fell', () => {
    const at = (rows: BoardRow[]) => gapLine({ rank: rows.find((r) => r.mine)!.rank, rows });
    expect(at([row(1, 'Kael', 82, 15, 13_000, true), row(2, 'Mira', 40, 15, 12_000)])).toBe("Top of today's board");
    expect(at([row(12, 'A', 60, 15, 13_000), row(13, 'Mira', 43, 15, 12_000), row(14, 'Me', 40, 15, 12_500, true)])).toBe(
      '3 Heart behind Mira at #13',
    );
    expect(at([row(13, 'Mira', 40, 15, 12_000), row(14, 'Me', 40, 15, 12_260, true)])).toBe('13 s behind Mira at #13');
    expect(at([row(13, 'Mira', 5, 15, 14_000), row(14, 'Me', 0, 14, 12_000, true)])).toBe('Mira at #13 held all 15 waves');
    expect(at([row(13, 'Mira', 0, 12, 9000), row(14, 'Me', 0, 11, 9500, true)])).toBe('1 wave behind Mira at #13');
    expect(at([row(13, 'Mira', 0, 12, 9000), row(14, 'Me', 0, 10, 9500, true)])).toBe('2 waves behind Mira at #13');
    expect(at([row(13, 'Mira', 0, 12, 9400), row(14, 'Me', 0, 12, 9000, true)])).toBe('20 s short of Mira at #13');
    expect(at([row(13, 'Mira', 40, 15, 12_000), row(13, 'Me', 40, 15, 12_000, true)])).toBe('Tied with Mira at #13');
  });

  const result = (extra: Partial<PostResult>): PostResult => ({
    day: '2026-10-22',
    total: 212,
    rank: 14,
    run: { won: true, heart: 40, wave: 15, ticks: 13_000, hero: 'ranger' },
    best: { won: true, heart: 40, wave: 15, ticks: 13_000, hero: 'ranger' },
    improved: true,
    personalBest: null,
    rows: [],
    ...extra,
  });

  it('says the best in gold: a new personal best, a new best today, or the best that stands', () => {
    const run = { won: true, heart: 40, wave: 15, ticks: 13_000, hero: 'ranger' };
    expect(bestLine(result({ personalBest: { ...run, day: '2026-10-22' } }))).toBe('New personal best · 40 Heart · 10:50');
    expect(bestLine(result({ personalBest: { ...run, heart: 82, day: '2026-10-19' } }))).toBe(
      'New best today · personal best 82 Heart · 10:50 on 19 Oct',
    );
    expect(
      bestLine(
        result({
          improved: false,
          run: { ...run, heart: 0, wave: 11, ticks: 9000 },
          personalBest: { ...run, day: '2026-10-22' },
        }),
      ),
    ).toBe('Your best today stands: 40 Heart · 10:50');
  });

  it('writes a run and a row the way the board shows them', () => {
    expect(clock(13_000)).toBe('10:50');
    expect(runText({ heart: 82, wave: 15, ticks: 13_600 })).toBe('82 Heart · 11:20');
    expect(runText({ heart: 0, wave: 12, ticks: 9440 })).toBe('Wave 12 · 7:52');
    expect(rowText(row(13, 'Mira', 40, 15, 12_000))).toEqual({ rank: '#13', name: 'Mira', run: '40 Heart · 10:00' });
    expect(dayLabel('2026-10-19')).toBe('19 Oct');
    expect(dayLabel('2026-01-05')).toBe('5 Jan');
  });

  it('says why a post failed in one line, and which ones are worth another tap', () => {
    expect(postErrorLine('day')).toMatch(/yesterday's seed/);
    expect(postErrorLine('network')).toMatch(/reach the game server/);
    expect(postErrorLine('rerun')).toMatch(/could not verify/);
    expect(['slow', 'busy', 'network'].every(retryable)).toBe(true);
    expect(['day', 'rerun', 'file', 'size'].some(retryable)).toBe(false);
  });
});

describe('the requests', () => {
  const KEY = 'ab'.repeat(32);
  let storage: Map<string, string>;
  type Call = { url: string; init: RequestInit };

  beforeEach(() => {
    storage = new Map();
    const fake = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    };
    (globalThis as unknown as { window: unknown }).window = { localStorage: fake };
    (globalThis as unknown as { localStorage: unknown }).localStorage = fake;
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  });

  function fakeFetch(status: number, reply: unknown, calls: Call[]) {
    return async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: status >= 200 && status < 300, status, json: async () => reply };
    };
  }

  it('reads today without the key until this browser has posted a run, then with it', async () => {
    storage.set(DATA_KEY_KEY, KEY);
    const calls: Call[] = [];
    const answer = today();
    expect(await fetchToday('wss://game.example', fakeFetch(200, answer, calls), NOW)).toEqual(answer);
    expect(calls[0]!.url).toBe('https://game.example/daily/today');
    expect(calls[0]!.init.headers).toEqual({});
    storage.set(POSTED_KEY, JSON.stringify(['2026-10-21']));
    await fetchToday('wss://game.example', fakeFetch(200, answer, calls), NOW);
    expect(calls[1]!.init.headers).toEqual({ 'x-data-key': KEY });
    // A post from three days ago is not "lately".
    storage.set(POSTED_KEY, JSON.stringify(['2026-10-19']));
    await fetchToday('wss://game.example', fakeFetch(200, answer, calls), NOW);
    expect(calls[2]!.init.headers).toEqual({});
    // No server, a failed request or an answer that is not one: null (the tile stays hidden).
    expect(await fetchToday('', fakeFetch(200, answer, calls), NOW)).toBeNull();
    expect(await fetchToday('wss://game.example', fakeFetch(503, answer, calls), NOW)).toBeNull();
    expect(await fetchToday('wss://game.example', fakeFetch(200, { day: 1 }, calls), NOW)).toBeNull();
    expect(
      await fetchToday('wss://game.example', async () => {
        throw new Error('offline');
      }, NOW),
    ).toBeNull();
  });

  it('posts the key, the name and the file, making a key when there is none, and remembers the day', async () => {
    const calls: Call[] = [];
    const reply = { day: '2026-10-22', total: 3, rank: 1, rows: [], improved: true };
    const file = { report: { seed: 1 }, replay: { seed: 1 } } as never;
    const out = await postRun('Kael', file, 'wss://game.example', fakeFetch(200, reply, calls));
    expect(out).toEqual({ ok: true, result: reply });
    const key = storage.get(DATA_KEY_KEY)!;
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(storage.get('tdt.visitor')).toBe(visitorFromKey(key));
    expect(calls[0]!.url).toBe('https://game.example/daily/post');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ key, name: 'Kael', file: { report: { seed: 1 }, replay: { seed: 1 } } });
    expect(JSON.parse(storage.get(POSTED_KEY)!)).toEqual(['2026-10-22']);
  });

  it('turns a refusal into its code', async () => {
    storage.set(DATA_KEY_KEY, KEY);
    const file = { report: {}, replay: {} } as never;
    expect(await postRun('A', file, 'wss://g.example', fakeFetch(409, { error: 'day', message: '…' }, []))).toEqual({ ok: false, code: 'day' });
    expect(await postRun('A', file, 'wss://g.example', fakeFetch(429, null, []))).toEqual({ ok: false, code: 'slow' });
    expect(await postRun('A', file, 'wss://g.example', fakeFetch(500, null, []))).toEqual({ ok: false, code: 'error' });
    expect(
      await postRun('A', file, 'wss://g.example', async () => {
        throw new Error('offline');
      }),
    ).toEqual({ ok: false, code: 'network' });
    expect(storage.has(POSTED_KEY)).toBe(false);
  });
});
