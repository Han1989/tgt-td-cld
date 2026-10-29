// Endless's daily board (src/endless/): a posted solo Endless run is checked, re-run by the server on the Daily run's
// queue and ranked by the re-run's wave and time; the top 10, the day files, the rollover, deletion with the play data,
// the limits, and the room ticks while a long run is re-run.

import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PROTOCOL_VERSION, type HeroKind, type MatchReport, type Replay } from '@tdt/protocol';
import { createBalanceBot, createNoviceBot, dailyKey, ENDLESS_BOARD_SIZE, runHeadlessMatch, type Bot } from '@tdt/sim';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { visitorFromKey } from '../src/analytics/dataKey';
import { ReplayQueue } from '../src/daily/verify';
import { endlessView, type EndlessEntry } from '../src/endless/board';
import { createEndlessHttp, ENDLESS_BODY_LIMIT } from '../src/endless/http';
import { EndlessStore } from '../src/endless/store';
import type { GameServer } from '../src/server';
import { fullRoom, ORIGIN, startServer } from './helpers';

type RunFile = { report: MatchReport; replay: Replay };

function record(seed: number, bot: (id: string) => Bot, hero: HeroKind, mode: 'endless' | 'quick' | 'full' = 'endless'): RunFile {
  return runHeadlessMatch({ bots: [bot('local')], heroes: [hero], seed, mode, record: true }).file!;
}

const copy = <T>(value: T): T => structuredClone(value);
const newKey = () => randomBytes(32).toString('hex');

interface Row {
  rank: number;
  name: string;
  wave: number;
  ticks: number;
  hero: HeroKind;
  mine: boolean;
}

interface Posted {
  status: number;
  body: {
    error?: string;
    day: string;
    closesAt: number;
    runs: number;
    top: Row[];
    you: { rank: number; wave: number; ticks: number } | null;
    run: { wave: number; ticks: number; hero: HeroKind };
    improved: boolean;
  };
}

function poster(http: string) {
  let ip = 0;
  /** Each post from its own address unless `from` is given, so the per-address limit stays out of the way. */
  return async (body: unknown, from = `10.3.${Math.floor(++ip / 200)}.${ip % 200}`): Promise<Posted> => {
    const res = await fetch(`${http}/endless/post`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'x-forwarded-for': from, 'content-type': 'text/plain;charset=UTF-8' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { error: text };
    }
    return { status: res.status, body: parsed as Posted['body'] };
  };
}

const today = dailyKey(Date.now());
/** A casual run that falls past wave 40, and a novice's that falls in the 30s. */
let long: RunFile;
let short: RunFile;

beforeAll(() => {
  long = record(1, (id) => createBalanceBot(id), 'ranger');
  short = record(1, createNoviceBot, 'arcanist');
  expect(long.replay.end.wave).toBeGreaterThanOrEqual(40);
  expect(short.replay.end.wave).toBeLessThan(long.replay.end.wave);
});

describe('the board', () => {
  const entry = (visitor: string, wave: number, ticks: number, at = 0): EndlessEntry => ({
    visitor,
    name: visitor.toUpperCase(),
    hero: 'warden',
    wave,
    ticks,
    at,
  });

  it('ranks the wave, then the shorter time, ties sharing a rank; the top ten, the caller marked and named', () => {
    const entries = [
      entry('a', 46, 40_000),
      entry('b', 54, 50_000),
      entry('c', 46, 38_000),
      entry('d', 46, 38_000, 5),
      ...Array.from({ length: 10 }, (_, i) => entry(`z${i}`, 20 - i, 9_000)),
    ];
    const view = endlessView(today, entries, 'z9');
    expect(view.runs).toBe(14);
    expect(view.top).toHaveLength(ENDLESS_BOARD_SIZE);
    expect(view.top.slice(0, 5).map((r) => [r.name, r.rank])).toEqual([
      ['B', 1],
      ['C', 2],
      ['D', 2],
      ['A', 4],
      ['Z0', 5],
    ]);
    // The caller is 14th: not in the ten, named in `you`, no row marked.
    expect(view.top.some((r) => r.mine)).toBe(false);
    expect(view.you).toEqual({ rank: 14, wave: 11, ticks: 9_000 });
    const top = endlessView(today, entries, 'c');
    expect(top.top.filter((r) => r.mine).map((r) => r.name)).toEqual(['C']);
    expect(top.you).toMatchObject({ rank: 2, wave: 46 });
    expect(endlessView(today, entries, null).you).toBeNull();
    expect(view.closesAt).toBe(Date.parse(`${today}T00:00:00Z`) + 24 * 3600 * 1000);
  });
});

describe('/endless routes on the game server', () => {
  const dirs: string[] = [];
  let current: GameServer | null = null;
  const logs: string[] = [];

  afterEach(async () => {
    await current?.close();
    current = null;
    logs.length = 0;
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function serve(dashboardKey = '') {
    const dir = await mkdtemp(path.join(tmpdir(), 'tdt-endless-'));
    dirs.push(dir);
    const started = await startServer({ analyticsDir: dir, analyticsDashboardKey: dashboardKey }, (line) => logs.push(line));
    current = started.server;
    return { dir, http: started.http, url: started.url, post: poster(started.http) };
  }

  it('accepts a solo Endless run past wave 40, re-runs it and ranks it; today shows the top ten', async () => {
    const { dir, http, post } = await serve();
    const key = newKey();
    const res = await post({ key, name: 'Wren', file: long });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      day: today,
      runs: 1,
      improved: true,
      run: { wave: long.replay.end.wave, ticks: long.replay.end.tick, hero: 'ranger' },
      you: { rank: 1, wave: long.replay.end.wave, ticks: long.replay.end.tick },
      top: [{ rank: 1, name: 'Wren', wave: long.replay.end.wave, hero: 'ranger', mine: true }],
    });
    expect(logs.some((l) => /^endless \S+ accepted: wave \d+ ticks \d+ rank 1\/1 \(best\) re-run \d+ ms$/.test(l))).toBe(true);

    const other = await post({ key: newKey(), name: 'Kael', file: short });
    expect(other.body).toMatchObject({ runs: 2, you: { rank: 2 } });
    expect(other.body.top.map((r) => [r.rank, r.name, r.mine])).toEqual([
      [1, 'Wren', false],
      [2, 'Kael', true],
    ]);

    // GET /endless/today: the caller's row marked with its key; without one, the top rows alone.
    const mine = await fetch(`${http}/endless/today`, { headers: { origin: ORIGIN, 'x-data-key': key } });
    expect(mine.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const view = (await mine.json()) as Posted['body'];
    expect(view).toMatchObject({ day: today, runs: 2, you: { rank: 1 } });
    expect(view.top.find((r) => r.mine)?.name).toBe('Wren');
    const anon = (await (await fetch(`${http}/endless/today`, { headers: { origin: ORIGIN } })).json()) as Posted['body'];
    expect(anon.you).toBeNull();
    expect(anon.top.some((r) => r.mine)).toBe(false);

    // The day file holds the id derived from the key, never the key, and is read back after a restart.
    await current!.close();
    current = null;
    const text = await readFile(path.join(dir, 'endless', `${today}.json`), 'utf8');
    expect(text).toContain(visitorFromKey(key));
    expect(text).not.toContain(key);
    expect(JSON.parse(text)).toMatchObject({ day: today, posts: 2, failures: 0, mismatches: 0 });
    const again = new EndlessStore(dir);
    again.open();
    expect(again.entries(today).map((e) => e.name).sort()).toEqual(['Kael', 'Wren']);
  });

  it('refuses Full, Quick, two players, an older protocol, a tampered report and an oversized body', async () => {
    const { http, post } = await serve('dash');
    const key = newKey();
    const quick = record(3, createNoviceBot, 'warden', 'quick');
    expect((await post({ key, name: 'A', file: quick })).body.error).toBe('file');
    const full = copy(short);
    full.replay.mode = 'full';
    full.report.mode = 'full';
    expect((await post({ key, name: 'A', file: full })).body.error).toBe('file');
    const two = copy(short);
    two.replay.players.push({ id: 'p2', name: 'Two', hero: 'warden' });
    expect((await post({ key, name: 'A', file: two })).body.error).toBe('file');
    // A run from another version: 409, worded for the client.
    const older = copy(short);
    older.replay.protocol = PROTOCOL_VERSION - 1;
    older.report.protocol = PROTOCOL_VERSION - 1;
    const res = await post({ key, name: 'A', file: older });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('version');
    // The report must be this replay's.
    const tampered = copy(short);
    tampered.report.seed += 1;
    expect((await post({ key, name: 'A', file: tampered })).body.error).toBe('file');
    const hero = copy(short);
    hero.report.heroes[0]!.hero = 'warden';
    expect((await post({ key, name: 'A', file: hero })).body.error).toBe('file');
    // Shapes.
    expect((await post({ key, name: 'A' })).body.error).toBe('body');
    expect((await post({ key: 'abc', name: 'A', file: short })).body.error).toBe('body');
    // A log that cannot be re-run, and a run cut short, are refused after the checks.
    const broken = copy(short);
    broken.replay.log.splice(1, 0, [5, 7, 'move', 1, 1]);
    expect((await post({ key, name: 'A', file: broken })).body.error).toBe('rerun');
    const cut = copy(short);
    cut.replay.end.tick = 100;
    cut.replay.log = cut.replay.log.filter((e) => e[0] <= 100);
    expect((await post({ key, name: 'A', file: cut })).body.error).toBe('rerun');
    // Over the limit: 413.
    const big = { key, name: 'A', file: { report: short.report, replay: { ...short.replay, pad: 'x'.repeat(ENDLESS_BODY_LIMIT) } } };
    expect((await post(big)).status).toBe(413);

    // Nothing reached the board; the refusals are counted on the dashboard's Endless board table.
    const view = (await (await fetch(`${http}/endless/today`, { headers: { origin: ORIGIN } })).json()) as Posted['body'];
    expect(view.runs).toBe(0);
    const summary = (await (await fetch(`${http}/analytics/summary?key=dash`)).json()) as { endless: { day: string }[]; daily: unknown[] };
    expect(summary.endless[0]).toMatchObject({ day: today, posts: 0, players: 0, failures: 8, mismatches: 0, topWave: null });
    expect(summary.daily).toEqual([]);
    const page = await (await fetch(`${http}/analytics?key=dash`)).text();
    expect(page).toContain('<h2>Endless board</h2>');
    expect(page).toContain(`<td>${today}</td><td>0</td><td>0</td><td>8</td><td>0</td><td>—</td>`);
  });

  it('ranks the server’s re-run, not the client’s report, and counts the mismatch', async () => {
    const { http, post } = await serve('dash');
    const boasting = copy(short);
    boasting.report.wave = 120;
    boasting.report.seconds *= 3;
    boasting.replay.end = { ...boasting.replay.end, wave: 120 };
    const res = await post({ key: newKey(), name: 'Liar', file: boasting });
    expect(res.status).toBe(200);
    expect(res.body.run).toEqual({ wave: short.replay.end.wave, ticks: short.replay.end.tick, hero: 'arcanist' });
    expect(res.body.top[0]).toMatchObject({ name: 'Liar', wave: short.replay.end.wave });
    const summary = (await (await fetch(`${http}/analytics/summary?key=dash`)).json()) as { endless: unknown[] };
    expect(summary.endless[0]).toMatchObject({ posts: 1, players: 1, mismatches: 1, topWave: short.replay.end.wave });
    expect(logs.some((l) => l.startsWith('endless ') && l.includes('report mismatch'))).toBe(true);
  });

  it('keeps one best run per browser, updating its name', async () => {
    const { post } = await serve();
    const key = newKey();
    expect((await post({ key, name: 'First', file: short })).body).toMatchObject({ improved: true, runs: 1 });
    const better = await post({ key, name: 'Second', file: long });
    expect(better.body).toMatchObject({ improved: true, runs: 1, you: { wave: long.replay.end.wave } });
    const worse = await post({ key, name: 'Third', file: short });
    expect(worse.body).toMatchObject({ improved: false, runs: 1, you: { rank: 1, wave: long.replay.end.wave } });
    expect(worse.body.run.wave).toBe(short.replay.end.wave);
    expect(worse.body.top).toEqual([expect.objectContaining({ name: 'Third', wave: long.replay.end.wave, mine: true })]);
  });

  it('deletes a browser’s runs with its play data, by its data key or the dashboard key', async () => {
    const { dir, http, post } = await serve('dash');
    const key = newKey();
    await post({ key, name: 'Gone', file: short });
    const stay = newKey();
    await post({ key: stay, name: 'Stay', file: long });
    const held = (await (await fetch(`${http}/analytics/mine`, { method: 'POST', headers: { origin: ORIGIN }, body: JSON.stringify({ key }) })).json()) as {
      endless: { day: string; name: string; wave: number }[];
    };
    expect(held.endless).toEqual([expect.objectContaining({ day: today, name: 'Gone', wave: short.replay.end.wave })]);
    const gone = await fetch(`${http}/analytics/mine/forget`, { method: 'POST', headers: { origin: ORIGIN }, body: JSON.stringify({ key }) });
    expect(await gone.json()).toMatchObject({ removedEvents: 0, removedDailyRuns: 0, removedEndlessRuns: 1 });
    const text = await readFile(path.join(dir, 'endless', `${today}.json`), 'utf8');
    expect(text).not.toContain(visitorFromKey(key));
    expect(text).toContain(visitorFromKey(stay));
    // A run already on its way does not put the browser back.
    expect((await post({ key, name: 'Gone', file: short })).body.error).toBe('forgotten');
    // The dashboard key deletes by id.
    const res = await fetch(`${http}/analytics/forget?id=${visitorFromKey(stay)}`, { method: 'POST', headers: { 'x-analytics-key': 'dash' } });
    expect(await res.json()).toMatchObject({ removedEndlessRuns: 1 });
    const view = (await (await fetch(`${http}/endless/today`, { headers: { origin: ORIGIN } })).json()) as Posted['body'];
    expect(view.runs).toBe(0);
  });

  it('limits posts to two at once and then one a minute per address; GET and POST only, from an allowed origin', async () => {
    const { http, post } = await serve();
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await post({}, '10.9.9.9')).status);
    expect(statuses).toEqual([400, 400, 429, 429]);
    const slow = await post({}, '10.9.9.9');
    expect(slow.body.error).toBe('slow');
    expect((await post({}, '10.9.9.10')).status).toBe(400);
    expect((await fetch(`${http}/endless/today`, { headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await fetch(`${http}/endless/post`, { headers: { origin: ORIGIN } })).status).toBe(405);
    expect((await fetch(`${http}/endless/today`, { method: 'POST', headers: { origin: ORIGIN } })).status).toBe(405);
    const pre = await fetch(`${http}/endless/today`, { method: 'OPTIONS', headers: { origin: ORIGIN } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-headers')).toContain('x-data-key');
    const reads: number[] = [];
    for (let i = 0; i < 12; i++) {
      reads.push((await fetch(`${http}/endless/today`, { headers: { origin: ORIGIN, 'x-forwarded-for': '10.8.8.8' } })).status);
    }
    expect(reads.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(reads.slice(10)).toEqual([429, 429]);
  });

  it('keeps a room ticking while a long Endless run is re-run', async () => {
    const { url, post } = await serve();
    const [host] = await fullRoom(url, 1);
    host!.send({ t: 'start' });
    const room = current!.rooms.get(host!.code!)!;
    await host!.waitFor(() => (room.state?.tick ?? 0) > 5, 5_000);
    const tickBefore = room.state!.tick;
    const started = performance.now();
    const res = await post({ key: newKey(), name: 'Long', file: long });
    const ms = performance.now() - started;
    expect(res.status).toBe(200);
    // The re-run takes about a second or more, and the room's 20 Hz loop kept going: at least half its ticks.
    expect(ms).toBeGreaterThan(300);
    expect(room.state!.tick - tickBefore).toBeGreaterThanOrEqual(Math.floor(ms / 50 / 2));
    host!.close();
  });
});

describe('the shared re-run queue', () => {
  it('re-runs an Endless run in slices, so timers keep running, and keeps room for the Daily run’s', async () => {
    const queue = new ReplayQueue();
    let ticks = 0;
    const timer = setInterval(() => ticks++, 1);
    try {
      const started = performance.now();
      const result = await queue.verify(long.replay, Infinity)!;
      const ms = performance.now() - started;
      expect(result).toMatchObject({ ok: true, run: { wave: long.replay.end.wave, ticks: long.replay.end.tick } });
      expect(ticks).toBeGreaterThanOrEqual(Math.floor(ms / 20));
    } finally {
      clearInterval(timer);
    }
    // A post that asks for room: refused once the queue holds that many.
    const small = new ReplayQueue(8, 20);
    const a = small.verify(short.replay, Infinity, 2);
    const b = small.verify(short.replay, Infinity, 2);
    expect(small.verify(short.replay, Infinity, 2)).toBeNull();
    expect(small.verify(short.replay, Infinity)).not.toBeNull();
    await Promise.all([a, b]);
  });

  it('refuses a re-run past its tick limit', async () => {
    const result = await new ReplayQueue().verify(short.replay, 1000)!;
    expect(result).toMatchObject({ ok: false });
  });
});

describe('the day rollover and the 90-day files', () => {
  let server: Server | null = null;
  let dir = '';

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = null;
  });

  it('counts a run on the day it was posted; at midnight UTC the board turns over', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'tdt-endless-roll-'));
    const clock = { now: Date.parse('2026-10-28T23:59:00Z') };
    const store = new EndlessStore(dir);
    store.open(clock.now);
    const handle = createEndlessHttp({ store, isOriginAllowed: () => true, now: () => clock.now, queue: new ReplayQueue() });
    server = createServer((req, res) => {
      void handle(req, res).then((done) => {
        if (!done) res.writeHead(404).end();
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const http = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = poster(http);
    const res = await post({ key: newKey(), name: 'Night Owl', file: short });
    expect(res.body).toMatchObject({ day: '2026-10-28', runs: 1, closesAt: Date.parse('2026-10-29T00:00:00Z') });

    clock.now = Date.parse('2026-10-29T00:01:00Z');
    const view = (await (await fetch(`${http}/endless/today`)).json()) as Posted['body'];
    expect(view).toMatchObject({ day: '2026-10-29', runs: 0, top: [], you: null });
    // Any seed counts (Endless has no seed of the day): the same run posts on the new day.
    expect((await post({ key: newKey(), name: 'Early Bird', file: short })).body).toMatchObject({ day: '2026-10-29', runs: 1 });
    await store.flush();
    expect(existsSync(path.join(dir, 'endless', '2026-10-28.json'))).toBe(true);
    expect(existsSync(path.join(dir, 'endless', '2026-10-29.json'))).toBe(true);
    // 90 days on, the first day's file is pruned.
    store.prune(Date.parse('2027-01-26T00:00:00Z'));
    await store.flush();
    expect(existsSync(path.join(dir, 'endless', '2026-10-28.json'))).toBe(false);
    expect(existsSync(path.join(dir, 'endless', '2026-10-29.json'))).toBe(true);
  });
});
