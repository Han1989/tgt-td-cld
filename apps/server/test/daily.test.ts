// The Daily run's routes (src/daily/): a posted run is checked, re-run by the server and ranked by the re-run's
// result; the day files, the rollover, deletion with the play data, and the limits.

import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Difficulty, HeroKind, MatchReport, Replay } from '@tdt/protocol';
import { createExpertBot, createNoviceBot, dailyKey, dailySeed, rankOrder, runHeadlessMatch, type Bot } from '@tdt/sim';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { visitorFromKey } from '../src/analytics/dataKey';
import { boardView, ranksOf, sortBoard, type DailyEntry } from '../src/daily/board';
import { createDailyHttp, POST_BODY_LIMIT } from '../src/daily/http';
import { boardName, nameBlocked } from '../src/daily/names';
import { DailyStore } from '../src/daily/store';
import { ReplayQueue } from '../src/daily/verify';
import type { GameServer } from '../src/server';
import { ORIGIN, startServer } from './helpers';

type DailyFile = { report: MatchReport; replay: Replay };

function record(seed: number, bot: (id: string) => Bot, hero: HeroKind, opts: { mode?: 'quick' | 'full'; difficulty?: Difficulty } = {}): DailyFile {
  const run = runHeadlessMatch({
    bots: [bot('local')],
    heroes: [hero],
    seed,
    mode: opts.mode ?? 'quick',
    difficulty: opts.difficulty ?? 'hard',
    record: true,
  });
  return run.file!;
}

const copy = <T>(value: T): T => structuredClone(value);
const newKey = () => randomBytes(32).toString('hex');

interface Posted {
  status: number;
  body: {
    error?: string;
    rank: number;
    total: number;
    best: { won: boolean; heart: number; wave: number; ticks: number; hero: HeroKind };
    run: { won: boolean; heart: number; wave: number; ticks: number; hero: HeroKind };
    improved: boolean;
    personalBest: { day: string; heart: number; wave: number; ticks: number } | null;
    rows: { rank: number; name: string; heart: number; wave: number; ticks: number; mine: boolean }[];
  };
}

function poster(http: string) {
  let ip = 0;
  /** Each post from its own address unless `from` is given, so the per-address limit stays out of the way. */
  return async (body: unknown, from = `10.2.${Math.floor(++ip / 200)}.${ip % 200}`): Promise<Posted> => {
    const res = await fetch(`${http}/daily/post`, {
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
const seed = dailySeed(today);
let expert: DailyFile;
let novice: DailyFile;

beforeAll(() => {
  expert = record(seed, createExpertBot, 'arcanist');
  novice = record(seed, createNoviceBot, 'ranger');
});

describe('the board', () => {
  const entry = (visitor: string, won: boolean, heart: number, wave: number, ticks: number, at = 0): DailyEntry => ({
    visitor,
    name: visitor.toUpperCase(),
    hero: 'ranger',
    won,
    heart,
    wave,
    ticks,
    at,
  });

  it('ranks by the sim’s order, ties sharing a rank, and shows five rows around the caller', () => {
    const entries = [
      entry('a', true, 80, 15, 13_000),
      entry('b', true, 40, 15, 12_000),
      entry('c', false, 0, 12, 9000),
      entry('d', true, 40, 15, 12_000, 5),
      entry('e', false, 0, 14, 11_000),
      entry('f', true, 95, 15, 13_500),
      entry('g', false, 0, 3, 2000),
    ];
    const sorted = sortBoard(entries);
    expect(sorted.map((e) => e.visitor)).toEqual(['f', 'a', 'b', 'd', 'e', 'c', 'g']);
    expect(ranksOf(sorted)).toEqual([1, 2, 3, 3, 5, 6, 7]);
    const mid = boardView(today, entries, 'e');
    expect(mid).toMatchObject({ total: 7, rank: 5, best: { won: false, wave: 14, ticks: 11_000, hero: 'ranger' } });
    expect(mid.rows.map((r) => r.rank)).toEqual([3, 3, 5, 6, 7]);
    expect(mid.rows.filter((r) => r.mine).map((r) => r.name)).toEqual(['E']);
    // At the bottom and at the top the five rows stay five.
    expect(boardView(today, entries, 'g').rows.map((r) => r.name)).toEqual(['B', 'D', 'E', 'C', 'G']);
    expect(boardView(today, entries, 'f').rows.map((r) => r.rank)).toEqual([1, 2, 3, 3, 5]);
    // No caller: the top five, nobody's row marked.
    const top = boardView(today, entries, null);
    expect(top.rank).toBeNull();
    expect(top.rows.map((r) => r.name)).toEqual(['F', 'A', 'B', 'D', 'E']);
    expect(top.rows.some((r) => r.mine)).toBe(false);
  });

  it('shows the nickname, or Player for one that fails the checks or the word filter', () => {
    expect(boardName('  Kael  ')).toBe('Kael');
    expect(boardName('Mira the Bold')).toBe('Mira the Bold');
    expect(boardName('')).toBe('Player');
    expect(boardName('x'.repeat(17))).toBe('Player');
    expect(boardName(42)).toBe('Player');
    expect(boardName('bad\u0007name')).toBe('Player');
    expect(boardName('​​')).toBe('Player');
    expect(boardName('ShitLord')).toBe('Player');
    expect(boardName('f.u.c.k')).toBe('Player');
    expect(nameBlocked('B1tch')).toBe(true);
    expect(nameBlocked('Cassandra')).toBe(false);
    expect(nameBlocked('Scott')).toBe(false);
  });
});

describe('/daily routes on the game server', () => {
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
    const dir = await mkdtemp(path.join(tmpdir(), 'tdt-daily-'));
    dirs.push(dir);
    const started = await startServer({ analyticsDir: dir, analyticsDashboardKey: dashboardKey }, (line) => logs.push(line));
    current = started.server;
    return { dir, http: started.http, post: poster(started.http) };
  }

  it('accepts a run on today’s seed, re-runs it and ranks it; the board and today show it', async () => {
    const { dir, http, post } = await serve();
    const key = newKey();
    const res = await post({ key, name: 'Kael', file: expert });
    expect(res.status).toBe(200);
    const { report } = expert;
    expect(res.body).toMatchObject({
      day: today,
      rank: 1,
      total: 1,
      improved: true,
      run: { won: report.result === 'victory', heart: report.heartHp, wave: report.wave, hero: 'arcanist' },
      rows: [{ rank: 1, name: 'Kael', heart: report.heartHp, wave: report.wave, mine: true }],
      personalBest: { day: today, heart: report.heartHp, wave: report.wave },
    });
    expect(res.body.run.ticks).toBe(expert.replay.end.tick);
    expect(logs.some((l) => /^daily \S+ accepted: .* rank 1\/1 \(best\) re-run \d+ ms$/.test(l))).toBe(true);

    const other = await post({ key: newKey(), name: 'Mira', file: novice });
    expect(other.status).toBe(200);
    expect(other.body.total).toBe(2);
    expect(other.body.improved).toBe(true);

    // The board: with the caller's key their row is marked; without, the top rows.
    const mine = await fetch(`${http}/daily/board?day=${today}`, { headers: { origin: ORIGIN, 'x-data-key': key } });
    expect(mine.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const board = (await mine.json()) as { total: number; rank: number; rows: { name: string; mine: boolean }[] };
    expect(board.total).toBe(2);
    expect(board.rows.find((r) => r.mine)?.name).toBe('Kael');
    const anon = (await (await fetch(`${http}/daily/board`, { headers: { origin: ORIGIN } })).json()) as { rank: null; rows: { mine: boolean }[] };
    expect(anon.rank).toBeNull();
    expect(anon.rows.some((r) => r.mine)).toBe(false);
    expect((await fetch(`${http}/daily/board?day=2020-01-01`, { headers: { origin: ORIGIN } })).status).toBe(400);

    const todayRes = await fetch(`${http}/daily/today`, { headers: { origin: ORIGIN, 'x-data-key': key } });
    const info = (await todayRes.json()) as Record<string, unknown>;
    expect(info).toMatchObject({ day: today, seed, runs: 2, champion: null });
    expect(info.closesAt).toBe(Date.parse(`${today}T00:00:00Z`) + 24 * 3600 * 1000);
    expect((info.you as { today: { total: number } }).today.total).toBe(2);
    expect((await (await fetch(`${http}/daily/today`, { headers: { origin: ORIGIN } })).json()) as object).not.toHaveProperty('you');

    // The day file holds the id derived from the key, never the key.
    await current!.close();
    current = null;
    const text = await readFile(path.join(dir, 'daily', `${today}.json`), 'utf8');
    expect(text).toContain(visitorFromKey(key));
    expect(text).not.toContain(key);
    expect(JSON.parse(text)).toMatchObject({ day: today, posts: 2, failures: 0, mismatches: 0 });
    // And it is read back after a restart.
    const again = new DailyStore(dir);
    again.open();
    expect(again.entries(today).map((e) => e.name).sort()).toEqual(['Kael', 'Mira']);
  });

  it('refuses the wrong seed, mode, difficulty, two players, a tampered report and an oversized body', async () => {
    const { http, post } = await serve('dash');
    const key = newKey();
    const wrongSeed = copy(expert);
    wrongSeed.replay.seed = seed + 1;
    wrongSeed.report.seed = seed + 1;
    const res = await post({ key, name: 'A', file: wrongSeed });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('day');

    const normal = record(seed, createNoviceBot, 'warden', { difficulty: 'normal' });
    expect((await post({ key, name: 'A', file: normal })).body.error).toBe('file');
    const full = copy(novice);
    full.replay.mode = 'full';
    full.report.mode = 'full';
    expect((await post({ key, name: 'A', file: full })).status).toBe(400);
    const two = copy(novice);
    two.replay.players.push({ id: 'p2', name: 'Two', hero: 'warden' });
    expect((await post({ key, name: 'A', file: two })).status).toBe(400);
    const practice = copy(novice) as DailyFile & { replay: { practice?: unknown } };
    practice.replay.practice = { allyId: 'ally', startLevel: 6 };
    expect((await post({ key, name: 'A', file: practice })).status).toBe(400);
    const modifiers = copy(novice);
    modifiers.replay.modifiers = ['swift'];
    expect((await post({ key, name: 'A', file: modifiers })).status).toBe(400);
    // The report must be this replay's report.
    const tampered = copy(novice);
    tampered.report.seed = 12345;
    expect((await post({ key, name: 'A', file: tampered })).body.error).toBe('file');
    const hero = copy(novice);
    hero.report.heroes[0]!.hero = 'warden';
    expect((await post({ key, name: 'A', file: hero })).status).toBe(400);
    // Shapes.
    expect((await post({ key, name: 'A' })).body.error).toBe('body');
    expect((await post({ key: 'abc', name: 'A', file: novice })).body.error).toBe('body');
    expect((await post({ key, name: 'A', file: novice, extra: 1 })).body.error).toBe('body');
    expect((await post({ key, name: 'A', file: { ...novice, more: 1 } })).body.error).toBe('file');
    expect((await post({ key, name: 'A', file: { report: novice.report, replay: { ...novice.replay, log: 'x' } } })).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
    // A log that cannot be re-run is refused after the checks.
    const broken = copy(novice);
    broken.replay.log.splice(1, 0, [5, 7, 'move', 1, 1]);
    expect((await post({ key, name: 'A', file: broken })).body.error).toBe('rerun');
    // So is a run cut short: the re-run stops at the replay's end and the match is not over.
    const cut = copy(novice);
    cut.replay.end.tick = 10;
    cut.replay.log = cut.replay.log.filter((e) => e[0] <= 10);
    expect((await post({ key, name: 'A', file: cut })).body.error).toBe('rerun');
    // Over the limit: 413, whatever the body.
    const big = { key, name: 'A', file: { report: novice.report, replay: { ...novice.replay, pad: 'x'.repeat(POST_BODY_LIMIT) } } };
    expect((await post(big)).status).toBe(413);

    // Nothing reached the board; the refusals are counted on the dashboard.
    const board = (await (await fetch(`${http}/daily/board`, { headers: { origin: ORIGIN } })).json()) as { total: number };
    expect(board.total).toBe(0);
    const summary = (await (await fetch(`${http}/analytics/summary?key=dash`)).json()) as { daily: { day: string; failures: number }[] };
    expect(summary.daily[0]).toMatchObject({ day: today, posts: 0, players: 0, failures: 12, mismatches: 0 });
    const page = await (await fetch(`${http}/analytics?key=dash`)).text();
    expect(page).toContain('<h2>Daily run</h2>');
    expect(page).toContain(`<td>${today}</td><td>0</td><td>0</td><td>12</td><td>0</td>`);
  });

  it('ranks the server’s re-run, not the client’s report, and counts the mismatch', async () => {
    const { http, post } = await serve('dash');
    const boasting = copy(novice);
    boasting.report.result = 'victory';
    boasting.report.heartHp = 100;
    boasting.report.wave = 15;
    boasting.replay.end = { ...boasting.replay.end, result: 'victory', wave: 15, heartHp: 100 };
    const res = await post({ key: newKey(), name: 'Liar', file: boasting });
    expect(res.status).toBe(200);
    expect(res.body.run).toEqual({
      won: novice.report.result === 'victory',
      heart: novice.report.heartHp,
      wave: novice.report.wave,
      ticks: novice.replay.end.tick,
      hero: 'ranger',
    });
    const summary = (await (await fetch(`${http}/analytics/summary?key=dash`)).json()) as { daily: { mismatches: number; posts: number }[] };
    expect(summary.daily[0]).toMatchObject({ posts: 1, players: 1, mismatches: 1 });
    expect(logs.some((l) => l.includes('report mismatch'))).toBe(true);
  });

  it('keeps one best run per browser, updating its name', async () => {
    const { post } = await serve();
    const key = newKey();
    const runOf = (f: DailyFile) => ({ won: f.report.result === 'victory', heart: f.report.heartHp, wave: f.report.wave, ticks: f.replay.end.tick });
    const [worse, better] = rankOrder(runOf(expert), runOf(novice)) < 0 ? [novice, expert] : [expert, novice];
    const first = await post({ key, name: 'First', file: worse });
    expect(first.body).toMatchObject({ improved: true, total: 1 });
    const second = await post({ key, name: 'Second', file: better });
    expect(second.body).toMatchObject({ improved: true, total: 1, best: { heart: better.report.heartHp } });
    const third = await post({ key, name: 'Third', file: worse });
    expect(third.body).toMatchObject({ improved: false, total: 1, best: { heart: better.report.heartHp, wave: better.report.wave } });
    expect(third.body.run.wave).toBe(worse.report.wave);
    expect(third.body.rows).toEqual([expect.objectContaining({ name: 'Third', mine: true })]);
  });

  it('deletes a browser’s runs with its play data, by its data key or the dashboard key', async () => {
    const { dir, http, post } = await serve('dash');
    const key = newKey();
    await post({ key, name: 'Gone', file: novice });
    const stay = newKey();
    await post({ key: stay, name: 'Stay', file: expert });
    const copyRes = await fetch(`${http}/analytics/mine`, { method: 'POST', headers: { origin: ORIGIN }, body: JSON.stringify({ key }) });
    const held = (await copyRes.json()) as { daily: { day: string; name: string }[] };
    expect(held.daily).toEqual([expect.objectContaining({ day: today, name: 'Gone' })]);
    const gone = await fetch(`${http}/analytics/mine/forget`, { method: 'POST', headers: { origin: ORIGIN }, body: JSON.stringify({ key }) });
    expect(await gone.json()).toMatchObject({ removedEvents: 0, removedDailyRuns: 1 });
    const text = await readFile(path.join(dir, 'daily', `${today}.json`), 'utf8');
    expect(text).not.toContain(visitorFromKey(key));
    expect(text).toContain(visitorFromKey(stay));
    // A run already on its way does not put the browser back.
    expect((await post({ key, name: 'Gone', file: novice })).body.error).toBe('forgotten');
    // The dashboard key deletes by id.
    const res = await fetch(`${http}/analytics/forget?id=${visitorFromKey(stay)}`, { method: 'POST', headers: { 'x-analytics-key': 'dash' } });
    expect(await res.json()).toMatchObject({ removedDailyRuns: 1 });
    const board = (await (await fetch(`${http}/daily/board`, { headers: { origin: ORIGIN } })).json()) as { total: number };
    expect(board.total).toBe(0);
  });

  it('limits posts per address, takes GET and POST only, from an allowed origin', async () => {
    const { http, post } = await serve();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await post({}, '10.9.9.9')).status);
    expect(statuses).toEqual([400, 400, 400, 429, 429]);
    expect((await post({}, '10.9.9.10')).status).toBe(400);
    expect((await fetch(`${http}/daily/today`, { headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await fetch(`${http}/daily/post`, { headers: { origin: ORIGIN } })).status).toBe(405);
    expect((await fetch(`${http}/daily/today`, { method: 'POST', headers: { origin: ORIGIN } })).status).toBe(405);
    const pre = await fetch(`${http}/daily/board`, { method: 'OPTIONS', headers: { origin: ORIGIN } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-headers')).toContain('x-data-key');
    // Reads have their own bucket: ten at once from one address, then 429.
    const reads: number[] = [];
    for (let i = 0; i < 12; i++) {
      reads.push((await fetch(`${http}/daily/today`, { headers: { origin: ORIGIN, 'x-forwarded-for': '10.8.8.8' } })).status);
    }
    expect(reads.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(reads.slice(10)).toEqual([429, 429]);
  });
});

describe('the re-run queue', () => {
  it('re-runs one run at a time in slices, so timers (the rooms’ ticks) keep running meanwhile', async () => {
    const queue = new ReplayQueue();
    let ticks = 0;
    const timer = setInterval(() => ticks++, 1);
    try {
      const started = performance.now();
      const [a, b] = await Promise.all([queue.verify(expert.replay)!, queue.verify(novice.replay)!]);
      const ms = performance.now() - started;
      expect(a).toMatchObject({ ok: true, run: { ticks: expert.replay.end.tick, hero: 'arcanist' } });
      expect(b).toMatchObject({ ok: true, run: { ticks: novice.replay.end.tick, hero: 'ranger' } });
      // An 8 ms slice at most: at least one timer turn per ~10 ms of re-run.
      expect(ticks).toBeGreaterThanOrEqual(Math.floor(ms / 20));
      expect(queue.length).toBe(0);
    } finally {
      clearInterval(timer);
    }
  });

  it('answers busy once the queue is full', async () => {
    const queue = new ReplayQueue(8, 2);
    const first = queue.verify(novice.replay);
    const second = queue.verify(novice.replay);
    expect(queue.verify(novice.replay)).toBeNull();
    await Promise.all([first, second]);
    expect(queue.verify(novice.replay)).not.toBeNull();
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

  async function serveAt(clock: { now: number }, store: DailyStore): Promise<string> {
    const handle = createDailyHttp({ store, isOriginAllowed: () => true, now: () => clock.now, queue: new ReplayQueue() });
    server = createServer((req, res) => {
      void handle(req, res).then((done) => {
        if (!done) res.writeHead(404).end();
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it('takes only the day’s seed; at midnight UTC the board turns over and yesterday’s winner is the champion', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'tdt-daily-roll-'));
    const clock = { now: Date.parse('2026-10-22T23:59:00Z') };
    const store = new DailyStore(dir);
    store.open(clock.now);
    const http = await serveAt(clock, store);
    const post = poster(http);
    const run = record(dailySeed('2026-10-22'), createNoviceBot, 'warden');
    const res = await post({ key: newKey(), name: 'Night Owl', file: run });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ day: '2026-10-22', rank: 1 });

    clock.now = Date.parse('2026-10-23T00:01:00Z');
    const info = (await (await fetch(`${http}/daily/today`)).json()) as Record<string, unknown>;
    expect(info).toMatchObject({
      day: '2026-10-23',
      seed: dailySeed('2026-10-23'),
      runs: 0,
      champion: { name: 'Night Owl', heart: run.report.heartHp, ticks: run.replay.end.tick },
    });
    // Yesterday's board is still open; the one before is not. Yesterday's seed is refused now.
    const yesterday = (await (await fetch(`${http}/daily/board?day=2026-10-22`)).json()) as { total: number };
    expect(yesterday.total).toBe(1);
    expect((await fetch(`${http}/daily/board?day=2026-10-21`)).status).toBe(400);
    expect((await post({ key: newKey(), name: 'Late', file: run })).body.error).toBe('day');
    await store.flush();
    expect(existsSync(path.join(dir, 'daily', '2026-10-22.json'))).toBe(true);
    expect(existsSync(path.join(dir, 'daily', '2026-10-23.json'))).toBe(true);
  });

  it('deletes day files 90 days old at startup and on the daily prune', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tdt-daily-prune-'));
    try {
      const files = path.join(root, 'daily');
      await mkdir(files, { recursive: true });
      const day = (key: string) => JSON.stringify({ day: key, posts: 1, failures: 0, mismatches: 0, entries: [] });
      await writeFile(path.join(files, '2026-07-24.json'), day('2026-07-24'));
      await writeFile(path.join(files, '2026-07-25.json'), day('2026-07-25'));
      await writeFile(path.join(files, 'notes.txt'), 'kept');
      const store = new DailyStore(root);
      // 2026-10-22 is day 89 after 2026-07-25 and day 90 after 2026-07-24.
      store.open(Date.parse('2026-10-22T12:00:00Z'));
      await store.flush();
      expect(existsSync(path.join(files, '2026-07-24.json'))).toBe(false);
      expect(existsSync(path.join(files, '2026-07-25.json'))).toBe(true);
      expect(existsSync(path.join(files, 'notes.txt'))).toBe(true);
      expect(store.stats().map((s) => s.day)).toEqual(['2026-07-25']);
      store.prune(Date.parse('2026-10-23T00:00:00Z'));
      await store.flush();
      expect(existsSync(path.join(files, '2026-07-25.json'))).toBe(false);
      expect(store.stats()).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps RAM only with `memory`', () => {
    const store = new DailyStore('memory');
    store.open();
    const at = Date.now();
    expect(store.record(today, { visitor: 'v', name: 'N', hero: 'ranger', won: false, heart: 0, wave: 3, ticks: 900, at }, at)).toMatchObject({
      improved: true,
    });
    expect(store.persistent).toBe(false);
    expect(store.entries(today)).toHaveLength(1);
  });
});
