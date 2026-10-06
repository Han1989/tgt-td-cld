// A player's own copy and deletion (p6a-privacy, docs/ANALYTICS.md "Your data"): by the browser's data key, never by
// id, rate limited, and the same answer whether or not anything is held.

import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DATA_KEY, visitorFromKey } from '../src/analytics/dataKey';
import { AnalyticsStore, FORGOTTEN_MS } from '../src/analytics/store';
import type { StoredEvent } from '../src/analytics/summary';
import type { GameServer } from '../src/server';
import { ORIGIN, startServer } from './helpers';

const base = { session: 'session-0001', channel: 'direct' as const, platform: 'web' as const };

function newKey(): string {
  return randomBytes(32).toString('hex');
}

describe('data key', () => {
  it('derives a 32-hex visitor id that the key cannot be read back from', () => {
    const key = 'a'.repeat(64);
    expect(DATA_KEY.test(key)).toBe(true);
    expect(DATA_KEY.test('A'.repeat(64))).toBe(false);
    expect(DATA_KEY.test('a'.repeat(63))).toBe(false);
    const id = visitorFromKey(key);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).toBe(createHash('sha256').update(`tdt-visitor-v1:${key}`).digest('hex').slice(0, 32));
    expect(visitorFromKey('b'.repeat(64))).not.toBe(id);
  });
});

describe('forgotten ids', () => {
  it('drops events for a deleted id for a while, then takes them again', () => {
    const store = new AnalyticsStore('memory');
    const t0 = 1_000_000;
    expect(store.record({ ...base, t: 'session_start', visitor: 'visitor-gone' }, t0)).toBe(true);
    expect(store.forget('visitor-gone', t0)).toBe(1);
    expect(store.record({ ...base, t: 'session_heartbeat', visitor: 'visitor-gone' }, t0 + 1000)).toBe(false);
    expect(store.record({ ...base, t: 'session_start', visitor: 'visitor-else' }, t0 + 1000)).toBe(true);
    expect(store.all().map((e) => e.visitor)).toEqual(['visitor-else']);
    expect(store.record({ ...base, t: 'session_start', visitor: 'visitor-gone' }, t0 + FORGOTTEN_MS + 1)).toBe(true);
  });
});

describe('POST /analytics/mine and /analytics/mine/forget', () => {
  const dirs: string[] = [];
  let current: GameServer | null = null;

  afterEach(async () => {
    await current?.close();
    current = null;
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function serve(dashboardKey = '') {
    const dir = await mkdtemp(path.join(tmpdir(), 'tdt-analytics-mine-'));
    dirs.push(dir);
    const started = await startServer({ analyticsDir: dir, analyticsDashboardKey: dashboardKey });
    current = started.server;
    const { http } = started;
    let ip = 0;
    /** Each call from its own address unless `from` is given, so the per-address limit stays out of the way. */
    const mine = (body: unknown, forget = false, from = `10.0.0.${++ip}`, origin = ORIGIN) =>
      fetch(`${http}/analytics/mine${forget ? '/forget' : ''}`, {
        method: 'POST',
        headers: { origin, 'x-forwarded-for': from },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
    const event = (body: Record<string, unknown>) =>
      fetch(`${http}/analytics/event`, {
        method: 'POST',
        headers: { origin: ORIGIN, 'x-forwarded-for': `10.1.0.${++ip}` },
        body: JSON.stringify({ ...base, ...body }),
      });
    return { dir, http, mine, event };
  }

  it('gives the key holder a copy, then deletes it from memory and both files, without a dashboard key', async () => {
    const { dir, http, mine, event } = await serve();
    const key = newKey();
    const visitor = visitorFromKey(key);
    expect((await event({ t: 'session_start', visitor })).status).toBe(204);
    expect((await event({ t: 'feedback', visitor, rating: 5, comment: 'fun' })).status).toBe(204);
    expect((await event({ t: 'session_start', visitor: 'visitor-stay' })).status).toBe(204);

    const copyRes = await mine({ key });
    expect(copyRes.status).toBe(200);
    expect(copyRes.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(copyRes.headers.get('cache-control')).toBe('no-store');
    const copy = (await copyRes.json()) as { visitor: string; events: StoredEvent[]; retention: unknown };
    expect(copy.visitor).toBe(visitor);
    expect(copy.events.map((e) => e.t)).toEqual(['session_start', 'feedback']);
    expect(copy.events.every((e) => e.visitor === visitor)).toBe(true);
    expect(copy.retention).toMatchObject({ session: 'session-0001' });

    const gone = await mine({ key }, true);
    expect(await gone.json()).toEqual({ visitor, removedEvents: 2 });
    expect(await readFile(path.join(dir, 'events.jsonl'), 'utf8')).not.toContain(visitor);
    expect(await readFile(path.join(dir, 'retention.json'), 'utf8')).not.toContain(visitor);
    expect(await readFile(path.join(dir, 'events.jsonl'), 'utf8')).toContain('visitor-stay');
    // A heartbeat already on its way does not put the browser back.
    expect((await event({ t: 'session_heartbeat', visitor })).status).toBe(204);
    expect(((await (await mine({ key })).json()) as { events: unknown[] }).events).toEqual([]);
    // The dashboard routes still answer 404 with no dashboard key set.
    expect((await fetch(`${http}/analytics/visitor?id=${visitor}`)).status).toBe(404);
  });

  it('cannot be asked by id: an id, a guessed key or any other shape gets nothing', async () => {
    const { mine, event } = await serve();
    const key = newKey();
    const visitor = visitorFromKey(key);
    await event({ t: 'session_start', visitor });
    // The id itself, in every place a caller might try it.
    expect((await mine({ key: visitor })).status).toBe(400);
    expect((await mine({ id: visitor })).status).toBe(400);
    expect((await mine({ visitor })).status).toBe(400);
    expect((await mine({ key, id: visitor })).status).toBe(400);
    expect((await mine({ key: key.toUpperCase() })).status).toBe(400);
    expect((await mine('not json')).status).toBe(400);
    expect((await mine([key])).status).toBe(400);
    expect((await mine({ key: 'x'.repeat(300) })).status).toBe(413);
    // A wrong key answers exactly like a right key with nothing held: no hint that anything exists.
    const guess = await mine({ key: newKey() });
    expect(guess.status).toBe(200);
    const body = (await guess.json()) as { visitor: string; events: unknown[]; retention: unknown };
    expect(body.visitor).not.toBe(visitor);
    expect(body).toEqual({ visitor: body.visitor, events: [], retention: null });
    const miss = (await (await mine({ key: newKey() }, true)).json()) as { removedEvents: number };
    expect(miss.removedEvents).toBe(0);
    // Nothing was deleted by those attempts.
    expect(((await (await mine({ key })).json()) as { events: unknown[] }).events).toHaveLength(1);
  });

  it('takes POST only, from an allowed origin, and answers the CORS preflight', async () => {
    const { http, mine } = await serve();
    expect((await mine({ key: newKey() }, false, '10.9.0.1', 'https://evil.example')).status).toBe(403);
    expect((await fetch(`${http}/analytics/mine`, { headers: { origin: ORIGIN } })).status).toBe(405);
    const pre = await fetch(`${http}/analytics/mine/forget`, { method: 'OPTIONS', headers: { origin: ORIGIN } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('limits each address to a few requests, then one every 20 seconds', async () => {
    const { mine } = await serve();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await mine({ key: newKey() }, i % 2 === 1, '10.7.7.7')).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429]);
    const limited = await mine({ key: newKey() }, false, '10.7.7.7');
    expect(limited.headers.get('retry-after')).toBe('20');
    // Another address is not held up.
    expect((await mine({ key: newKey() }, false, '10.7.7.8')).status).toBe(200);
  });

  it('caps everyone together too, so spreading over many addresses does not help', async () => {
    const { mine } = await serve();
    let limited = 0;
    for (let i = 0; i < 80; i++) {
      if ((await mine({ key: newKey() })).status === 429) limited++;
    }
    expect(limited).toBeGreaterThanOrEqual(10);
  });

  it('leaves the dashboard-key copy and deletion working', async () => {
    const { http, event } = await serve('top-secret');
    await event({ t: 'session_start', visitor: 'visitor-mail' });
    const copy = await fetch(`${http}/analytics/visitor?id=visitor-mail&key=top-secret`);
    expect(((await copy.json()) as { events: unknown[] }).events).toHaveLength(1);
    const res = await fetch(`${http}/analytics/forget?id=visitor-mail`, { method: 'POST', headers: { 'x-analytics-key': 'top-secret' } });
    expect(await res.json()).toEqual({ visitor: 'visitor-mail', removedEvents: 1 });
  });
});
