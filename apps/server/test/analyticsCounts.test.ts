// Anonymous counts before the age question (docs/ANALYTICS.md → Before the age question): POST /analytics/count,
// totals per UTC day in memory and counts.json, nothing per person, kept 90 days.

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { COUNT_KINDS } from '../src/analytics/channels';
import {
  addCount,
  COUNT_KEEP_DAYS,
  COUNT_PANEL_DAYS,
  emptyCounts,
  expireCounts,
  parseCount,
  parseCounts,
  serializeCounts,
  summarizeBeforeAge,
  type CountBody,
} from '../src/analytics/counts';
import { renderDashboard } from '../src/analytics/page';
import { DAY_MS } from '../src/analytics/retention';
import { AnalyticsStore } from '../src/analytics/store';
import { summarize, type StoredEvent } from '../src/analytics/summary';
import type { GameServer } from '../src/server';
import { ORIGIN, startServer } from './helpers';

const open: CountBody = { what: 'open', channel: 'cold', platform: 'android', browser: 'chrome' };
/** Midnight UTC, 1 Jan 2026. */
const D0 = Date.UTC(2026, 0, 1);
const at = (day: number, hour = 12) => D0 + day * DAY_MS + hour * 60 * 60 * 1000;
const live = { connectedPlayers: 0, persistent: false, durable: false, dir: null };
const ROW_KEYS = ['browser', 'channel', 'day', 'n', 'platform', 'what'];

describe('parseCount', () => {
  it('takes exactly { what, channel, platform, browser } with known values', () => {
    for (const what of ['open', 'boot_timeout', 'webgl_unavailable', 'webgl_context_lost']) {
      expect(parseCount({ ...open, what })).toEqual({ ...open, what });
    }
    expect([...COUNT_KINDS]).toEqual(['open', 'boot_timeout', 'webgl_unavailable', 'webgl_context_lost']);
  });

  it('rejects an unknown what, an extra or missing field, and anything that is not one object', () => {
    expect(parseCount({ ...open, what: 'boot_slow' })).toBeNull();
    expect(parseCount({ ...open, what: 'session_start' })).toBeNull();
    expect(parseCount({ ...open, what: 'OPEN' })).toBeNull();
    // No id, no time, no text: an extra field is rejected whole.
    expect(parseCount({ ...open, visitor: 'visitor-0001' })).toBeNull();
    expect(parseCount({ ...open, session: 'session-0001' })).toBeNull();
    expect(parseCount({ ...open, at: 1 })).toBeNull();
    expect(parseCount({ ...open, message: 'hi' })).toBeNull();
    const { browser: _browser, ...missing } = open;
    expect(parseCount(missing)).toBeNull();
    expect(parseCount({ ...open, channel: 'reddit-cozy' })).toBeNull();
    expect(parseCount({ ...open, platform: 'windows' })).toBeNull();
    expect(parseCount({ ...open, browser: 'opera' })).toBeNull();
    expect(parseCount([open])).toBeNull();
    expect(parseCount(null)).toBeNull();
    expect(parseCount('open')).toBeNull();
  });
});

describe('daily totals', () => {
  it('adds each count to its UTC day, what, channel, platform and browser', () => {
    const state = emptyCounts();
    addCount(state, open, at(0, 1));
    addCount(state, open, at(0, 23));
    // 00:30 the next UTC day is a new row.
    addCount(state, open, at(1, 0));
    addCount(state, { ...open, browser: 'samsung' }, at(1, 0));
    addCount(state, { ...open, what: 'webgl_unavailable' }, at(1, 0));
    const rows = serializeCounts(state).rows;
    expect(rows).toEqual([
      { day: 0 + D0 / DAY_MS, ...open, n: 2 },
      { day: 1 + D0 / DAY_MS, ...open, n: 1 },
      { day: 1 + D0 / DAY_MS, ...open, browser: 'samsung', n: 1 },
      { day: 1 + D0 / DAY_MS, ...open, what: 'webgl_unavailable', n: 1 },
    ]);
    // Nothing but totals: no id, no time of day, no address.
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(ROW_KEYS);
  });

  it('keeps totals 90 days, and reads its file back, skipping a bad row', () => {
    const state = emptyCounts();
    addCount(state, open, at(0));
    addCount(state, open, at(COUNT_KEEP_DAYS - 1));
    expect(expireCounts(state, at(COUNT_KEEP_DAYS - 1))).toBe(false);
    expect(expireCounts(state, at(COUNT_KEEP_DAYS))).toBe(true);
    expect(serializeCounts(state).rows.map((row) => row.day)).toEqual([D0 / DAY_MS + COUNT_KEEP_DAYS - 1]);

    const saved = serializeCounts(state);
    const read = parseCounts(JSON.parse(JSON.stringify({ ...saved, rows: [...saved.rows, { ...saved.rows[0], what: 'nope' }, { n: 3 }] })));
    expect(serializeCounts(read)).toEqual(saved);
    expect(parseCounts('{"v":1,"ro').size).toBe(0);
    expect(parseCounts(null).size).toBe(0);
  });

  it('reads opens and sessions per channel and failed starts over the last 30 days', () => {
    const state = emptyCounts();
    const now = at(40, 12);
    for (let i = 0; i < 10; i++) addCount(state, { ...open, channel: 'reddit-playmygame' }, at(40, 1));
    for (let i = 0; i < 4; i++) addCount(state, { ...open, channel: 'friends', platform: 'ios', browser: 'safari' }, at(20));
    // Day 10 is 30 days back: outside the panel, still kept.
    addCount(state, { ...open, channel: 'friends' }, at(10));
    addCount(state, { ...open, what: 'boot_timeout' }, at(39));
    addCount(state, { ...open, what: 'webgl_unavailable', platform: 'ios', browser: 'safari' }, at(39));
    addCount(state, { ...open, what: 'webgl_unavailable', platform: 'ios', browser: 'safari' }, at(40));
    const before = summarizeBeforeAge(state, now, new Map([['reddit-playmygame', 3], ['friends', 4], ['direct', 2]]));
    expect(before.days).toBe(COUNT_PANEL_DAYS);
    expect(before.opens).toBe(14);
    expect(before.sessions).toBe(9);
    const row = (channel: string) => before.channels.find((c) => c.channel === channel)!;
    expect(row('reddit-playmygame')).toEqual({ channel: 'reddit-playmygame', label: 'r/PlayMyGame', opens: 10, sessions: 3, share: 0.3 });
    expect(row('friends')).toMatchObject({ opens: 4, sessions: 4, share: 1 });
    // Sessions with no counted open (an older build) show, with no share.
    expect(row('direct')).toMatchObject({ opens: 0, sessions: 2, share: null });
    expect(before.failed.starts).toBe(3);
    expect(before.failed.byReason).toEqual([
      { reason: 'boot_timeout', label: 'Slow start', starts: 1, shareOfOpens: 1 / 14 },
      { reason: 'webgl_unavailable', label: 'No WebGL', starts: 2, shareOfOpens: 2 / 14 },
      { reason: 'webgl_context_lost', label: 'WebGL lost', starts: 0, shareOfOpens: 0 },
    ]);
    expect(before.failed.rows).toEqual([
      { reason: 'webgl_unavailable', label: 'No WebGL', platform: 'ios', platformLabel: 'iOS', browser: 'safari', browserLabel: 'Safari', starts: 2 },
      { reason: 'boot_timeout', label: 'Slow start', platform: 'android', platformLabel: 'Android', browser: 'chrome', browserLabel: 'Chrome', starts: 1 },
    ]);
  });

  it('puts the panel on the dashboard and in the summary, with sessions from the event log', () => {
    const now = at(5, 12);
    const state = emptyCounts();
    for (let i = 0; i < 4; i++) addCount(state, open, at(5, 1));
    addCount(state, { ...open, what: 'boot_timeout' }, at(5, 1));
    const events: StoredEvent[] = [
      { t: 'session_start', visitor: 'visitor-0001', session: 'session-0001', channel: 'cold', platform: 'android', at: at(5, 2) },
    ];
    const summary = summarize(events, now, live, undefined, state);
    expect(summary.beforeAge.channels.find((c) => c.channel === 'cold')).toMatchObject({ opens: 4, sessions: 1, share: 0.25 });
    expect(summarize(events, now, live).beforeAge.opens).toBe(0);
    const html = renderDashboard(summary);
    expect(html).toContain('Before the age question');
    expect(html).toContain('An open is a page load, so reloads and returning visitors count again and the share is a floor.');
    expect(html).toContain('<td>Cold test</td><td>4</td><td>1</td><td>25%</td>');
    expect(html).toContain('<td>Slow start</td><td>Android</td><td>Chrome</td><td>1</td>');
    expect(renderDashboard(summarize([], now, live))).toContain('No page opens counted yet.');
  });
});

describe('store: counts.json', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'tdt-analytics-counts-'));
    dirs.push(dir);
    return dir;
  }

  it('keeps only totals, in memory and in counts.json, never in the event log, and reads them back after a restart', async () => {
    const dir = await tempDir();
    const now = Date.now();
    const store = new AnalyticsStore(dir);
    store.open();
    store.count(open, now);
    store.count(open, now);
    store.count({ ...open, what: 'boot_timeout', browser: 'samsung' }, now);
    await store.flush();
    expect(store.all()).toEqual([]);
    expect([...store.countTable().values()].map((row) => Object.keys(row).sort())).toEqual([ROW_KEYS, ROW_KEYS]);
    const saved = JSON.parse(await readFile(path.join(dir, 'counts.json'), 'utf8')) as { v: number; rows: { n: number }[] };
    expect(Object.keys(saved).sort()).toEqual(['rows', 'v']);
    expect(saved.rows.map((row) => Object.keys(row).sort())).toEqual([ROW_KEYS, ROW_KEYS]);
    expect(saved.rows.map((row) => row.n)).toEqual([2, 1]);
    expect(await readFile(path.join(dir, 'events.jsonl'), 'utf8')).toBe('');

    // A deletion request finds nothing per person here, and leaves the totals alone.
    expect(store.forget('visitor-0001', now)).toBe(0);
    expect(store.visitorData('visitor-0001')).toEqual({ events: [], retention: null });
    await store.flush();

    const next = new AnalyticsStore(dir);
    next.open();
    await next.flush();
    expect(serializeCounts(next.countTable())).toEqual(serializeCounts(store.countTable()));
    next.count(open, now);
    await next.flush();
    const again = JSON.parse(await readFile(path.join(dir, 'counts.json'), 'utf8')) as { rows: { what: string; n: number }[] };
    expect(again.rows.find((row) => row.what === 'open')!.n).toBe(3);
  });

  it('drops totals past 90 days at startup and in the daily prune', async () => {
    const dir = await tempDir();
    const now = Date.now();
    const old = Math.floor(now / DAY_MS) - COUNT_KEEP_DAYS;
    const kept = old + 1;
    await writeFile(
      path.join(dir, 'counts.json'),
      JSON.stringify({ v: 1, rows: [{ day: old, ...open, n: 5 }, { day: kept, ...open, n: 7 }] }),
      'utf8',
    );
    const store = new AnalyticsStore(dir);
    store.open();
    await store.flush();
    expect(serializeCounts(store.countTable()).rows).toEqual([{ day: kept, ...open, n: 7 }]);
    const disk = JSON.parse(await readFile(path.join(dir, 'counts.json'), 'utf8')) as { rows: { day: number }[] };
    expect(disk.rows.map((row) => row.day)).toEqual([kept]);

    // A day later, the daily prune drops the next one, with nothing new counted.
    store.prune(now + DAY_MS);
    await store.flush();
    expect(store.countTable().size).toBe(0);
    expect(JSON.parse(await readFile(path.join(dir, 'counts.json'), 'utf8'))).toEqual({ v: 1, rows: [] });
  });

  it('starts again from a torn file, and stays in memory with ANALYTICS_DIR=memory', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'counts.json'), '{"v":1,"rows":[{"da', 'utf8');
    const store = new AnalyticsStore(dir);
    store.open();
    await store.flush();
    expect(store.persistent).toBe(true);
    expect(store.countTable().size).toBe(0);

    const memory = new AnalyticsStore('memory');
    memory.open();
    memory.count(open, Date.now());
    await memory.flush();
    expect([...memory.countTable().values()].map((row) => row.n)).toEqual([1]);
  });
});

describe('POST /analytics/count', () => {
  let current: GameServer | null = null;
  const dirs: string[] = [];

  afterEach(async () => {
    await current?.close();
    current = null;
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function up(key = ''): Promise<{ http: string; dir: string }> {
    const dir = await mkdtemp(path.join(tmpdir(), 'tdt-analytics-count-http-'));
    dirs.push(dir);
    const started = await startServer({ analyticsDir: dir, analyticsDashboardKey: key });
    current = started.server;
    return { http: started.http, dir };
  }

  function post(http: string, body: unknown, origin: string | null = ORIGIN, route = '/analytics/count') {
    const headers: Record<string, string> = { 'content-type': 'text/plain;charset=UTF-8' };
    if (origin) headers.origin = origin;
    return fetch(`${http}${route}`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
  }

  it('takes a count from an allowed origin and rejects everything else, as events do', async () => {
    const { http } = await up();
    expect((await post(http, open)).status).toBe(204);
    expect((await post(http, open, null)).status).toBe(403);
    expect((await post(http, open, 'https://evil.example')).status).toBe(403);
    expect((await post(http, { ...open, what: 'nope' })).status).toBe(400);
    expect((await post(http, { ...open, visitor: 'visitor-0001' })).status).toBe(400);
    expect((await post(http, 'not-json')).status).toBe(400);
    expect((await post(http, 'x'.repeat(3000))).status).toBe(413);
    expect((await fetch(`${http}/analytics/count`, { headers: { origin: ORIGIN } })).status).toBe(405);
    const preflight = await fetch(`${http}/analytics/count`, { method: 'OPTIONS', headers: { origin: ORIGIN } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const ok = await post(http, open);
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('limits each address like events, from the same budget', async () => {
    const { http } = await up();
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) statuses.push((await post(http, open)).status);
    expect(statuses[0]).toBe(204);
    expect(statuses).toContain(429);
    const event = await post(http, { t: 'session_start', visitor: 'visitor-0001', session: 'session-0001', channel: 'cold', platform: 'web' }, ORIGIN, '/analytics/event');
    expect(event.status).toBe(429);
    expect(event.headers.get('retry-after')).toBe('1');
  });

  it('keeps nothing but totals on disk, and shows them on the dashboard and in the summary', async () => {
    const { http, dir } = await up('top-secret');
    for (let i = 0; i < 3; i++) expect((await post(http, open)).status).toBe(204);
    expect((await post(http, { ...open, what: 'webgl_context_lost', platform: 'ios', browser: 'safari' })).status).toBe(204);
    await current!.close();
    current = null;
    // Only the two side files and the (empty) log: no line per request, no address.
    expect((await readdir(dir)).sort()).toEqual(['counts.json', 'events.jsonl', 'retention.json']);
    expect(await readFile(path.join(dir, 'events.jsonl'), 'utf8')).toBe('');
    const raw = await readFile(path.join(dir, 'counts.json'), 'utf8');
    expect(raw).not.toMatch(/127\.0\.0\.1|::1|ffff|visitor|session/);
    const saved = JSON.parse(raw) as { rows: Record<string, unknown>[] };
    expect(saved.rows.map((row) => [row.what, row.n])).toEqual([
      ['open', 3],
      ['webgl_context_lost', 1],
    ]);

    // Read back after the restart.
    const again = await startServer({ analyticsDir: dir, analyticsDashboardKey: 'top-secret' });
    current = again.server;
    const summary = (await (await fetch(`${again.http}/analytics/summary?key=top-secret`)).json()) as {
      beforeAge: { opens: number; channels: { channel: string; opens: number }[]; failed: { starts: number } };
    };
    expect(summary.beforeAge.opens).toBe(3);
    expect(summary.beforeAge.channels.find((c) => c.channel === 'cold')!.opens).toBe(3);
    expect(summary.beforeAge.failed.starts).toBe(1);
    const page = await (await fetch(`${again.http}/analytics?key=top-secret`)).text();
    expect(page).toContain('Before the age question');
    expect(page).toContain('<td>WebGL lost</td><td>iOS</td><td>Safari</td><td>1</td>');
  });
});
