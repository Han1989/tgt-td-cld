import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyticsEvent } from '../src/analytics/parse';
import { renderDashboard } from '../src/analytics/page';
import { IDLE_MS, MAX_SESSION_MS, summarize, type StoredEvent } from '../src/analytics/summary';
import { AnalyticsStore, resolveAnalyticsDir } from '../src/analytics/store';
import type { GameServer } from '../src/server';
import { ORIGIN, startServer } from './helpers';

const base = {
  visitor: 'visitor-0001',
  session: 'session-0001',
  channel: 'direct' as const,
  platform: 'web' as const,
};

function event(over: Partial<StoredEvent> & Pick<StoredEvent, 't' | 'at'>): StoredEvent {
  return { ...base, ...over };
}

describe('parseAnalyticsEvent', () => {
  it('accepts a session start and rejects extra or unknown fields', () => {
    expect(parseAnalyticsEvent({ ...base, t: 'session_start' })).toMatchObject({ t: 'session_start' });
    expect(parseAnalyticsEvent({ ...base, t: 'session_start', extra: 1 })).toBeNull();
    expect(parseAnalyticsEvent({ ...base, t: 'nope' })).toBeNull();
    expect(parseAnalyticsEvent({ ...base, t: 'session_start', visitor: 'short' })).toBeNull();
    expect(parseAnalyticsEvent([])).toBeNull();
    expect(parseAnalyticsEvent(null)).toBeNull();
  });

  it('accepts a 1–5 rating and a short note, and a match result', () => {
    expect(parseAnalyticsEvent({ ...base, t: 'feedback', rating: 5, comment: '  nice\nwave ' })).toMatchObject({
      rating: 5,
      comment: 'nice wave',
    });
    expect(parseAnalyticsEvent({ ...base, t: 'feedback', rating: 0 })).toBeNull();
    expect(parseAnalyticsEvent({ ...base, t: 'feedback', rating: 4, comment: 'x'.repeat(141) })).toBeNull();
    expect(
      parseAnalyticsEvent({
        ...base,
        t: 'match_end',
        result: 'victory',
        heartHp: 40,
        heartMax: 100,
        mode: 'quick',
        wave: 15,
        players: 2,
      }),
    ).toMatchObject({ result: 'victory', heartHp: 40 });
    expect(parseAnalyticsEvent({ ...base, t: 'match_end', result: 'victory', heartHp: 10, heartMax: 5, mode: 'full', wave: 1, players: 1 })).toBeNull();
  });
});

describe('summarize', () => {
  const day = 24 * 60 * 60 * 1000;
  const day0 = Date.UTC(2026, 0, 1, 12, 0, 0);

  it('counts playtime, idle ends, D1/D7, repeats, ratings and match results', () => {
    const now = Date.UTC(2026, 0, 10, 12, 0, 0);
    const events: StoredEvent[] = [
      event({ t: 'session_start', at: day0, visitor: 'visitor-aaaa', session: 'session-aaaa', channel: 'reddit-playmygame' }),
      event({ t: 'session_end', at: day0 + 5 * 60_000, visitor: 'visitor-aaaa', session: 'session-aaaa', channel: 'reddit-playmygame' }),
      event({ t: 'session_start', at: day0 + day, visitor: 'visitor-aaaa', session: 'session-aaab', channel: 'reddit-playmygame' }),
      event({ t: 'session_end', at: day0 + day + 1000, visitor: 'visitor-aaaa', session: 'session-aaab', channel: 'reddit-playmygame' }),
      event({ t: 'session_start', at: day0 + 7 * day, visitor: 'visitor-aaaa', session: 'session-aaac', channel: 'direct' }),
      event({ t: 'session_end', at: day0 + 7 * day + 1000, visitor: 'visitor-aaaa', session: 'session-aaac', channel: 'direct' }),
      event({ t: 'session_start', at: day0, visitor: 'visitor-bbbb', session: 'session-bbbb', channel: 'crazygames' }),
      event({ t: 'session_end', at: day0 + 1000, visitor: 'visitor-bbbb', session: 'session-bbbb', channel: 'crazygames' }),
      event({ t: 'session_start', at: now - 1000, visitor: 'visitor-cccc', session: 'session-cccc', channel: 'direct' }),
      event({ t: 'feedback', at: day0 + 10, visitor: 'visitor-aaaa', session: 'session-aaaa', channel: 'reddit-playmygame', rating: 5, comment: 'fun' }),
      event({ t: 'feedback', at: day0 + 20, visitor: 'visitor-bbbb', session: 'session-bbbb', channel: 'crazygames', rating: 2 }),
      event({
        t: 'match_end',
        at: day0 + 30,
        visitor: 'visitor-aaaa',
        session: 'session-aaaa',
        channel: 'reddit-playmygame',
        result: 'victory',
        heartHp: 60,
        heartMax: 100,
        mode: 'full',
        wave: 30,
        players: 1,
      }),
      event({
        t: 'match_end',
        at: day0 + 40,
        visitor: 'visitor-bbbb',
        session: 'session-bbbb',
        channel: 'crazygames',
        result: 'defeat',
        heartHp: 0,
        heartMax: 100,
        mode: 'quick',
        wave: 8,
        players: 2,
      }),
    ];
    const summary = summarize(events, now, { connectedPlayers: 4, persistent: false, durable: false, dir: null });
    expect(summary.connectedPlayers).toBe(4);
    expect(summary.activeSessions).toBe(1);
    expect(summary.visitors).toBe(3);
    expect(summary.repeatVisitors).toBe(1);
    expect(summary.d1).toEqual({ eligible: 2, returned: 1 });
    expect(summary.d7).toEqual({ eligible: 2, returned: 1 });
    expect(summary.feedback).toMatchObject({ count: 2, comments: 1, positive: 1, negative: 1, lowVolume: true });
    expect(summary.feedback.average).toBeCloseTo(3.5);
    expect(summary.outcomes).toMatchObject({ wins: 1, losses: 1, avgHeartOnWin: 60, avgWaveOnLoss: 8 });
    const reddit = summary.channels.find((row) => row.channel === 'reddit-playmygame')!;
    expect(reddit.sessions).toBe(2);
    expect(reddit.visitors).toBe(1);
    expect(reddit.repeatVisitors).toBe(1);
    expect(reddit.d1).toEqual({ eligible: 1, returned: 1 });
    expect(reddit.avgPlaytimeMs).toBe((5 * 60_000 + 1000) / 2);
    expect(summary.platforms.find((row) => row.platform === 'web')!.sessions).toBe(summary.sessionStarts);
  });

  it('ends a session at the last heartbeat once it has been idle, and caps a stuck tab', () => {
    const start = 1_000_000;
    const beat = start + 25_000;
    const idle = summarize(
      [
        event({ t: 'session_start', at: start }),
        event({ t: 'session_heartbeat', at: beat }),
      ],
      beat + IDLE_MS + 1,
      { connectedPlayers: 0, persistent: false, durable: false, dir: null },
    );
    expect(idle.activeSessions).toBe(0);
    expect(idle.avgPlaytimeMs).toBe(25_000);

    const stuck = summarize(
      [event({ t: 'session_start', at: 0 }), event({ t: 'session_end', at: MAX_SESSION_MS + 60_000 })],
      MAX_SESSION_MS + 120_000,
      { connectedPlayers: 0, persistent: false, durable: false, dir: null },
    );
    expect(stuck.avgPlaytimeMs).toBe(MAX_SESSION_MS);
  });

  it('reopens a session when a heartbeat arrives after an end', () => {
    const summary = summarize(
      [
        event({ t: 'session_start', at: 0 }),
        event({ t: 'session_end', at: 1000 }),
        event({ t: 'session_heartbeat', at: 5000 }),
      ],
      6000,
      { connectedPlayers: 0, persistent: true, durable: false, dir: '/tmp/x' },
    );
    expect(summary.activeSessions).toBe(1);
    expect(summary.avgPlaytimeMs).toBeNull();
  });
});

describe('dashboard page', () => {
  it('escapes the storage path and does not print free-text notes', () => {
    const summary = summarize(
      [event({ t: 'feedback', at: 0, rating: 4, comment: '<script>alert(1)</script>' })],
      1000,
      { connectedPlayers: 0, persistent: true, durable: true, dir: '<script>' },
    );
    const html = renderDashboard(summary);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script');
    expect(html).toContain('r/PlayMyGame');
    expect(html).toContain('Few ratings');
    expect(html).not.toContain('alert(1)');
  });
});

describe('AnalyticsStore', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('resolves memory, temp and an explicit directory', () => {
    expect(resolveAnalyticsDir('memory')).toEqual({ dir: null, durable: false });
    expect(resolveAnalyticsDir('')).toMatchObject({ durable: false });
    expect(resolveAnalyticsDir('/var/data')).toEqual({ dir: '/var/data', durable: true });
  });

  it('reloads events from the JSONL file and skips a torn line', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tdt-analytics-'));
    dirs.push(dir);
    const store = new AnalyticsStore(dir);
    store.open();
    expect(store.persistent).toBe(true);
    const at = Date.now();
    store.record({ ...base, t: 'session_start' }, at);
    store.record({ ...base, t: 'feedback', rating: 5, comment: 'again' }, at + 10);
    await store.flush();
    const file = path.join(dir, 'events.jsonl');
    await writeFile(file, `${await readFile(file, 'utf8')}{"at":\n`, 'utf8');
    const next = new AnalyticsStore(dir);
    next.open();
    expect(next.all()).toHaveLength(2);
    expect(next.all()[1]).toMatchObject({ t: 'feedback', comment: 'again' });
  });

  it('stays in memory when the directory cannot be created', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tdt-analytics-file-'));
    dirs.push(dir);
    const blocked = path.join(dir, 'not-a-directory');
    await writeFile(blocked, 'x');
    const store = new AnalyticsStore(path.join(blocked, 'child'));
    store.open();
    expect(store.persistent).toBe(false);
    expect(store.diskError).toBeTruthy();
    store.record({ ...base, t: 'session_start' }, 1);
    expect(store.all()).toHaveLength(1);
  });
});

describe('analytics HTTP', () => {
  let current: GameServer | null = null;
  const dirs: string[] = [];

  afterEach(async () => {
    await current?.close();
    current = null;
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function up(key = ''): Promise<{ http: string; dir: string }> {
    const dir = await mkdtemp(path.join(tmpdir(), 'tdt-analytics-http-'));
    dirs.push(dir);
    const started = await startServer({ analyticsDir: dir, analyticsDashboardKey: key });
    current = started.server;
    return { http: started.http, dir };
  }

  function post(http: string, body: unknown, origin: string | null = ORIGIN) {
    const headers: Record<string, string> = { 'content-type': 'text/plain;charset=UTF-8' };
    if (origin) headers.origin = origin;
    return fetch(`${http}/analytics/event`, { method: 'POST', headers, body: JSON.stringify(body) });
  }

  it('rejects a bad origin, garbage and an oversized body, and rate-limits a burst', async () => {
    const { http } = await up();
    expect((await post(http, { ...base, t: 'session_start' }, null)).status).toBe(403);
    expect((await post(http, { ...base, t: 'session_start' }, 'https://evil.example')).status).toBe(403);
    expect((await post(http, { ...base, t: 'session_start', gold: 1 })).status).toBe(400);
    expect((await post(http, 'not-json')).status).toBe(400);
    const huge = await fetch(`${http}/analytics/event`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'text/plain' },
      body: 'x'.repeat(3000),
    });
    expect(huge.status).toBe(413);

    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) statuses.push((await post(http, { ...base, t: 'session_heartbeat', session: `session-${i}xxx` })).status);
    expect(statuses[0]).toBe(204);
    expect(statuses).toContain(429);
  });

  it('hides the dashboard until the key is set, then serves the same numbers as HTML and JSON', async () => {
    const off = await up('');
    expect((await fetch(`${off.http}/analytics`)).status).toBe(404);
    await current?.close();
    current = null;

    const { http } = await up('top-secret');
    expect((await fetch(`${http}/analytics`)).status).toBe(401);
    expect((await fetch(`${http}/analytics?key=nope`)).status).toBe(401);
    expect((await post(http, { ...base, t: 'session_start', channel: 'reddit-cozy', platform: 'ios' })).status).toBe(204);
    expect(
      (
        await post(http, {
          ...base,
          t: 'feedback',
          channel: 'reddit-cozy',
          platform: 'ios',
          rating: 4,
          comment: 'cozy run',
        })
      ).status,
    ).toBe(204);

    const html = await fetch(`${http}/analytics?key=top-secret`);
    expect(html.status).toBe(200);
    expect(html.headers.get('content-type')).toContain('text/html');
    const page = await html.text();
    expect(page).toContain('Roll out or pivot');
    expect(page).toContain('r/cozygames');
    expect(page).not.toContain('cozy run');
    expect(page).not.toContain('top-secret');

    const json = await fetch(`${http}/analytics/summary`, { headers: { 'x-analytics-key': 'top-secret' } });
    expect(json.status).toBe(200);
    const summary = (await json.json()) as { feedback: { count: number; comments: number }; platforms: { platform: string; sessions: number }[] };
    expect(summary.feedback).toMatchObject({ count: 1, comments: 1 });
    expect(summary.platforms.find((row) => row.platform === 'ios')!.sessions).toBe(1);
    expect(JSON.stringify(summary)).not.toContain('cozy run');
  });
});
