// p6a-analytics: D1 / D7 / D30 past the 30-day prune, the new-player funnel, match results, crash
// reports, and deletion by browser id (docs/ANALYTICS.md).

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { summarizeErrors } from '../src/analytics/errors';
import { summarizeFunnel } from '../src/analytics/funnel';
import { summarizeMatches } from '../src/analytics/matches';
import { renderDashboard } from '../src/analytics/page';
import { parseAnalyticsEvent } from '../src/analytics/parse';
import {
  COHORT_KEEP_DAYS,
  DAY_MS,
  cohortDays,
  emptyRetention,
  expireRetention,
  forgetVisitor,
  observe,
  parseRetention,
  retentionFromEvents,
  retentionRates,
  serializeRetention,
  utcDay,
  VISITOR_KEEP_DAYS,
  type RetentionEvent,
} from '../src/analytics/retention';
import { AnalyticsStore } from '../src/analytics/store';
import { RETAIN_MS, summarize, type StoredEvent } from '../src/analytics/summary';
import type { GameServer } from '../src/server';
import { ORIGIN, startServer } from './helpers';

const base = { visitor: 'visitor-0001', session: 'session-0001', channel: 'direct' as const, platform: 'web' as const };
/** Midnight UTC, 1 Jan 2026: day numbers below count from here. */
const D0 = Date.UTC(2026, 0, 1);
const at = (day: number, hour = 12) => D0 + day * DAY_MS + hour * 60 * 60 * 1000;
const live = { connectedPlayers: 0, persistent: false, durable: false, dir: null };

function start(visitor: string, session: string, when: number, channel: RetentionEvent['channel'] = 'direct'): StoredEvent {
  return { ...base, t: 'session_start', visitor, session, channel, at: when };
}

function ev(over: Partial<StoredEvent> & Pick<StoredEvent, 't' | 'at'>): StoredEvent {
  return { ...base, ...over };
}

describe('retention: D1, D7 and D30', () => {
  it('counts a return only on exactly day 1, 7 or 30 after the first visit, once each', () => {
    const state = retentionFromEvents([
      start('visitor-aaaa', 'session-a0', at(0, 23)),
      // 00:30 the next UTC day is day 1, however few hours later.
      start('visitor-aaaa', 'session-a1', at(1, 0)),
      start('visitor-aaaa', 'session-a1b', at(1, 9)),
      start('visitor-aaaa', 'session-a7', at(7)),
      start('visitor-aaaa', 'session-a30', at(30)),
      start('visitor-bbbb', 'session-b0', at(0), 'reddit-cozy'),
      start('visitor-bbbb', 'session-b2', at(2), 'direct'),
      start('visitor-bbbb', 'session-b8', at(8), 'direct'),
      start('visitor-cccc', 'session-c0', at(29)),
    ]);
    const rates = retentionRates(state, at(30, 18));
    expect(rates.d1).toEqual({ eligible: 3, returned: 1 });
    expect(rates.d7).toEqual({ eligible: 2, returned: 1 });
    expect(rates.d30).toEqual({ eligible: 2, returned: 1 });
    // A later Direct visit still counts for the channel of the first visit.
    expect(retentionRates(state, at(30, 18), 'reddit-cozy')).toEqual({
      d1: { eligible: 1, returned: 0 },
      d7: { eligible: 1, returned: 0 },
      d30: { eligible: 1, returned: 0 },
    });
  });

  it('a cohort joins D30 on day 30 and its returns that day count as they come', () => {
    const state = emptyRetention();
    observe(state, start('visitor-aaaa', 'session-a0', at(0)));
    observe(state, start('visitor-bbbb', 'session-b0', at(0)));
    expect(retentionRates(state, at(29, 23)).d30).toEqual({ eligible: 0, returned: 0 });
    expect(retentionRates(state, at(30, 1)).d30).toEqual({ eligible: 2, returned: 0 });
    observe(state, start('visitor-aaaa', 'session-a30', at(30, 2)));
    expect(retentionRates(state, at(30, 3)).d30).toEqual({ eligible: 2, returned: 1 });
    // Day 31 is not day 30.
    observe(state, start('visitor-bbbb', 'session-b31', at(31)));
    expect(retentionRates(state, at(31, 13)).d30).toEqual({ eligible: 2, returned: 1 });
  });

  it('keeps D30 after the first visit has left the 30-day event log', () => {
    // First visit at 23:59 on day 0, return at 00:01 on day 30: the first event is pruned the next day.
    const first = start('visitor-aaaa', 'session-a0', at(0, 0) + DAY_MS - 60_000);
    const back = start('visitor-aaaa', 'session-a30', at(30, 0) + 60_000);
    const state = emptyRetention();
    observe(state, first);
    observe(state, back);
    const now = at(31, 12);
    expect(now - first.at).toBeGreaterThan(RETAIN_MS);
    expect(expireRetention(state, now)).toBe(false);
    // Only the return is still in the log; on its own it would look like a new visitor.
    const log = [back].filter((e) => now - e.at <= RETAIN_MS);
    expect(summarize(log, now, live).d30).toEqual({ eligible: 0, returned: 0 });
    expect(summarize(log, now, live, state).d30).toEqual({ eligible: 1, returned: 1 });
    // And still once the browser line itself is gone, from the counts that carry no id.
    const later = at(30 + VISITOR_KEEP_DAYS + 1);
    expireRetention(state, later);
    expect(state.visitors.size).toBe(0);
    expect(retentionRates(state, later).d30).toEqual({ eligible: 1, returned: 1 });
    // Cohort counts go after COHORT_KEEP_DAYS.
    expireRetention(state, at(COHORT_KEEP_DAYS));
    expect(retentionRates(state, at(COHORT_KEEP_DAYS)).d30).toEqual({ eligible: 0, returned: 0 });
  });

  it('keeps a browser line 31 days after it was last seen, so a regular is never new again', () => {
    const state = emptyRetention();
    observe(state, start('visitor-aaaa', 'session-a0', at(0)));
    observe(state, { ...start('visitor-aaaa', 'session-a20', at(20)), t: 'session_heartbeat' });
    expireRetention(state, at(20 + VISITOR_KEEP_DAYS));
    expect(state.visitors.get('visitor-aaaa')?.last).toBe(utcDay(at(20)));
    observe(state, start('visitor-aaaa', 'session-a50', at(50)));
    expect([...state.cohorts.values()].reduce((n, row) => n + row.visitors, 0)).toBe(1);
    expireRetention(state, at(50 + VISITOR_KEEP_DAYS + 1));
    expect(state.visitors.size).toBe(0);
  });

  it('replays to the same table, survives a save, and forgets one browser', () => {
    const events = [
      start('visitor-aaaa', 'session-a0', at(0), 'crazygames'),
      start('visitor-aaaa', 'session-a1', at(1)),
      start('visitor-bbbb', 'session-b0', at(0), 'crazygames'),
    ];
    const state = retentionFromEvents(events);
    const twice = retentionFromEvents([...events, ...events]);
    expect(serializeRetention(twice)).toEqual(serializeRetention(state));
    const copy = parseRetention(JSON.parse(JSON.stringify(serializeRetention(state))));
    expect(serializeRetention(copy)).toEqual(serializeRetention(state));
    expect(parseRetention({ visitors: [['x', { first: -1 }]], cohorts: [{ day: 'no' }] }).visitors.size).toBe(0);

    expect(forgetVisitor(state, 'visitor-aaaa')).toBe(true);
    expect(forgetVisitor(state, 'visitor-aaaa')).toBe(false);
    expect(retentionRates(state, at(5)).d1).toEqual({ eligible: 1, returned: 0 });
    expect(cohortDays(state, at(5))).toEqual([{ day: Math.floor(D0 / DAY_MS), visitors: 1, d1: 0, d7: null, d30: null }]);
  });
});

describe('where new players stop', () => {
  const firstSessions = new Map([
    ['visitor-aaaa', 'session-a0'],
    ['visitor-bbbb', 'session-b0'],
    ['visitor-cccc', 'session-c0'],
    ['visitor-dddd', 'session-d0'],
  ]);
  const match = { mode: 'quick' as const, difficulty: 'normal' as const, players: 1, online: false, heroes: ['ranger' as const] };

  it('follows each browser through its first session only, and names the step most stopped after', () => {
    const events: StoredEvent[] = [
      // A: plays two matches.
      ev({ t: 'session_start', at: 1, visitor: 'visitor-aaaa', session: 'session-a0' }),
      ev({ t: 'funnel', at: 2, visitor: 'visitor-aaaa', session: 'session-a0', step: 'lobby' }),
      ev({ t: 'match_start', at: 3, visitor: 'visitor-aaaa', session: 'session-a0', ...match }),
      ev({ t: 'funnel', at: 4, visitor: 'visitor-aaaa', session: 'session-a0', step: 'tutorial_move' }),
      ev({ t: 'funnel', at: 5, visitor: 'visitor-aaaa', session: 'session-a0', step: 'tutorial_build' }),
      ev({ t: 'funnel', at: 6, visitor: 'visitor-aaaa', session: 'session-a0', step: 'wave_3' }),
      ev({ t: 'match_end', at: 7, visitor: 'visitor-aaaa', session: 'session-a0', result: 'defeat', heartHp: 0, heartMax: 100, wave: 4, ...match }),
      ev({ t: 'match_start', at: 8, visitor: 'visitor-aaaa', session: 'session-a0', ...match }),
      // B: lobby only. C: lobby, then a match it leaves at wave 1.
      ev({ t: 'session_start', at: 1, visitor: 'visitor-bbbb', session: 'session-b0' }),
      ev({ t: 'funnel', at: 2, visitor: 'visitor-bbbb', session: 'session-b0', step: 'lobby' }),
      ev({ t: 'session_start', at: 1, visitor: 'visitor-cccc', session: 'session-c0' }),
      ev({ t: 'funnel', at: 2, visitor: 'visitor-cccc', session: 'session-c0', step: 'lobby' }),
      ev({ t: 'match_start', at: 3, visitor: 'visitor-cccc', session: 'session-c0', ...match }),
      ev({ t: 'funnel', at: 4, visitor: 'visitor-cccc', session: 'session-c0', step: 'tutorial_skip' }),
      // B's second visit does not count: it is no longer new.
      ev({ t: 'session_start', at: 9, visitor: 'visitor-bbbb', session: 'session-b1' }),
      ev({ t: 'match_start', at: 10, visitor: 'visitor-bbbb', session: 'session-b1', ...match }),
      // D's first visit was pruned: only its later session is in the log.
      ev({ t: 'session_start', at: 9, visitor: 'visitor-dddd', session: 'session-d5' }),
      // E has no line in the table at all.
      ev({ t: 'session_start', at: 9, visitor: 'visitor-eeee', session: 'session-e0' }),
    ];
    const funnel = summarizeFunnel(events, firstSessions);
    expect(funnel.newPlayers).toBe(3);
    const reached = Object.fromEntries(funnel.rows.map((row) => [row.stage, row.reached]));
    expect(reached).toEqual({ landing: 3, lobby: 3, match_start: 2, wave_3: 1, wave_5: 0, wave_10: 0, match_end: 1, second_match: 1 });
    const stopped = Object.fromEntries(funnel.rows.map((row) => [row.stage, row.stopped]));
    expect(stopped).toMatchObject({ lobby: 1, match_start: 1, second_match: 1, match_end: 0 });
    // A tie goes to the earlier step.
    expect(funnel.biggestStop).toBe('lobby');
    const lesson = Object.fromEntries(funnel.lesson.map((row) => [row.stage, row.reached]));
    expect(lesson).toMatchObject({ tutorial_move: 1, tutorial_build: 1, tutorial_cast: 0, tutorial_done: 0, tutorial_skip: 1 });
  });

  it('has no biggest stop with nobody new', () => {
    expect(summarizeFunnel([], new Map()).biggestStop).toBeNull();
  });
});

describe('match results', () => {
  it('breaks results down by mode and difficulty, team, hero and channel', () => {
    const end = (over: Partial<StoredEvent>): StoredEvent =>
      ev({ t: 'match_end', at: 1, result: 'victory', heartHp: 50, heartMax: 100, wave: 15, mode: 'quick', players: 1, ...over });
    const m = summarizeMatches([
      ev({ t: 'match_start', at: 0, mode: 'quick', difficulty: 'normal', players: 1, online: false, heroes: ['ranger'] }),
      end({ difficulty: 'normal', online: false, hero: 'ranger', heroes: ['ranger'], durationSec: 600, channel: 'crazygames' }),
      end({ result: 'defeat', heartHp: 0, wave: 7, difficulty: 'hard', online: true, players: 2, hero: 'warden', durationSec: 300 }),
      // An older client: no difficulty, length or heroes.
      end({ mode: 'full', wave: 30 }),
    ]);
    expect(m.started).toBe(1);
    expect(m.finished).toBe(3);
    expect(m.byMode.map((r) => [r.label, r.matches, r.wins])).toEqual([
      ['Quick · Normal', 1, 1],
      ['Quick · Hard', 1, 0],
      ['Full · difficulty not sent', 1, 1],
    ]);
    expect(m.byPlayers.map((r) => r.label)).toEqual(['1 player, solo', '2 players, room', '1 player']);
    expect(m.byHero.map((r) => [r.label, r.matches])).toEqual([
      ['Ranger', 1],
      ['Warden', 1],
    ]);
    expect(m.byChannel.find((r) => r.label === 'CrazyGames')).toMatchObject({ matches: 1, avgWave: 15, avgDurationSec: 600 });
    expect(m.byChannel.find((r) => r.label === 'Direct')).toMatchObject({ matches: 2, wins: 1, avgWave: 18.5, avgDurationSec: 300 });
  });
});

describe('crash reports', () => {
  const report = (over: Partial<StoredEvent>): StoredEvent =>
    ev({ t: 'client_error', at: 1, kind: 'error', message: 'boom', stack: 'at draw (assets/index.js:1:20)\nat tick', build: 'abc1234', browser: 'safari', ...over });

  it('groups by message and where it was thrown, counting sessions', () => {
    const errors = summarizeErrors([
      report({ session: 'session-0001' }),
      report({ session: 'session-0002', at: 5, build: 'def5678', browser: 'chrome', stack: 'at draw (assets/index.js:1:20)\nat other' }),
      report({ session: 'session-0002', message: 'other', stack: undefined, kind: 'rejection' }),
      ev({ t: 'session_start', at: 0 }),
    ]);
    expect(errors).toMatchObject({ reports: 3, sessions: 2 });
    expect(errors.groups[0]).toMatchObject({
      message: 'boom',
      where: 'at draw (assets/index.js:1:20)',
      reports: 2,
      sessions: 2,
      builds: ['abc1234', 'def5678'],
      browsers: ['Chrome', 'Safari'],
      stack: 'at draw (assets/index.js:1:20)\nat other',
    });
    expect(errors.groups[1]).toMatchObject({ message: 'other', where: null, kind: 'rejection' });
  });

  it('parses a report strictly and keeps stack lines', () => {
    const body = { ...base, t: 'client_error', kind: 'error', message: ' bad\tthing ', stack: 'a\n\n  b  ', build: 'dev', browser: 'firefox' };
    expect(parseAnalyticsEvent(body)).toMatchObject({ message: 'bad thing', stack: 'a\nb', build: 'dev', browser: 'firefox' });
    expect(parseAnalyticsEvent({ ...body, browser: 'netscape' })).toBeNull();
    expect(parseAnalyticsEvent({ ...body, build: 'has space' })).toBeNull();
    expect(parseAnalyticsEvent({ ...body, message: 'x'.repeat(201) })).toBeNull();
    expect(parseAnalyticsEvent({ ...body, message: '   ' })).toBeNull();
    expect(parseAnalyticsEvent({ ...body, stack: 'x'.repeat(1001) })).toBeNull();
    expect(parseAnalyticsEvent({ ...body, url: 'https://x' })).toBeNull();
  });
});

describe('parse: match start, funnel steps, richer match ends', () => {
  const match = { mode: 'full', difficulty: 'hard', players: 2, online: true, hero: 'arcanist', heroes: ['arcanist', 'warden'] };

  it('accepts the new events and rejects bad values', () => {
    expect(parseAnalyticsEvent({ ...base, t: 'match_start', ...match })).toMatchObject({ heroes: ['arcanist', 'warden'], online: true });
    expect(parseAnalyticsEvent({ ...base, t: 'match_start', ...match, difficulty: undefined })).toBeNull();
    expect(parseAnalyticsEvent({ ...base, t: 'match_start', ...match, heroes: [] })).toBeNull();
    expect(parseAnalyticsEvent({ ...base, t: 'match_start', ...match, heroes: ['ranger', 'ranger', 'ranger', 'ranger'] })).toBeNull();
    expect(parseAnalyticsEvent({ ...base, t: 'match_start', ...match, hero: 'paladin' })).toBeNull();
    expect(parseAnalyticsEvent({ ...base, t: 'funnel', step: 'wave_5' })).toMatchObject({ step: 'wave_5' });
    expect(parseAnalyticsEvent({ ...base, t: 'funnel', step: 'wave_4' })).toBeNull();
    const end = { ...base, t: 'match_end', result: 'defeat', heartHp: 0, heartMax: 100, wave: 9, ...match };
    expect(parseAnalyticsEvent({ ...end, durationSec: 412 })).toMatchObject({ durationSec: 412, difficulty: 'hard' });
    expect(parseAnalyticsEvent({ ...end, durationSec: -1 })).toBeNull();
    expect(parseAnalyticsEvent({ ...end, durationSec: 1.5 })).toBeNull();
    // An older client's end, with none of the new fields, still parses.
    expect(parseAnalyticsEvent({ ...base, t: 'match_end', result: 'victory', heartHp: 1, heartMax: 2, mode: 'quick', wave: 15, players: 1 })).not.toBeNull();
  });
});

describe('dashboard', () => {
  it('shows D30, the stop step, matches and errors, escaped, and the example banner only when asked', () => {
    const events: StoredEvent[] = [
      start('visitor-aaaa', 'session-a0', at(0)),
      start('visitor-aaaa', 'session-a30', at(30)),
      ev({ t: 'client_error', at: at(30), visitor: 'visitor-aaaa', session: 'session-a30', kind: 'error', message: '<img src=x>', build: 'dev', browser: 'chrome' }),
    ];
    const state = retentionFromEvents(events);
    const html = renderDashboard(summarize(events.slice(1), at(30, 20), live, state));
    expect(html).toContain('D30');
    expect(html).toContain('100% (1/1)');
    expect(html).toContain('Where new players stop');
    expect(html).toContain('Crashes and errors');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('EXAMPLE DATA');
    expect(renderDashboard(summarize([], 0, live), { example: true })).toContain('EXAMPLE DATA');
  });
});

describe('store and HTTP: retention across restarts, copy and deletion', () => {
  const dirs: string[] = [];
  let current: GameServer | null = null;

  afterEach(async () => {
    await current?.close();
    current = null;
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'tdt-analytics-p6a-'));
    dirs.push(dir);
    return dir;
  }

  it('keeps the first visit in retention.json after its event is pruned, and rebuilds the table from the log', async () => {
    const dir = await tempDir();
    const now = Date.now();
    // Written as if a month went by: the first visit is past the event window.
    const old = start('visitor-aaaa', 'session-a0', now - 30 * DAY_MS - 60_000);
    const store = new AnalyticsStore(dir);
    store.open();
    const { at: oldAt, ...oldEvent } = old;
    store.record(oldEvent, oldAt);
    store.record({ ...base, t: 'session_start', visitor: 'visitor-aaaa', session: 'session-a30' }, now);
    store.prune(now);
    await store.flush();
    expect(store.all()).toHaveLength(1);
    const saved = JSON.parse(await readFile(path.join(dir, 'retention.json'), 'utf8')) as { visitors: [string, unknown][] };
    expect(saved.visitors.map(([id]) => id)).toEqual(['visitor-aaaa']);

    const next = new AnalyticsStore(dir);
    next.open();
    await next.flush();
    expect(next.retentionTable().visitors.get('visitor-aaaa')).toMatchObject({ session: 'session-a0' });

    // A torn table is rebuilt from the log, as far as the log reaches.
    await writeFile(path.join(dir, 'retention.json'), '{"v":1,"visi', 'utf8');
    const rebuilt = new AnalyticsStore(dir);
    rebuilt.open();
    await rebuilt.flush();
    expect(rebuilt.retentionTable().visitors.get('visitor-aaaa')).toMatchObject({ session: 'session-a30' });
  });

  it('copies and deletes one browser behind the dashboard key, from memory and both files', async () => {
    const dir = await tempDir();
    const started = await startServer({ analyticsDir: dir, analyticsDashboardKey: 'top-secret' });
    current = started.server;
    const { http } = started;
    const post = (body: unknown) =>
      fetch(`${http}/analytics/event`, { method: 'POST', headers: { origin: ORIGIN }, body: JSON.stringify(body) });
    expect((await post({ ...base, t: 'session_start', visitor: 'visitor-gone' })).status).toBe(204);
    expect((await post({ ...base, t: 'funnel', visitor: 'visitor-gone', step: 'lobby' })).status).toBe(204);
    expect((await post({ ...base, t: 'session_start', visitor: 'visitor-stay' })).status).toBe(204);

    expect((await fetch(`${http}/analytics/visitor?id=visitor-gone`)).status).toBe(401);
    expect((await fetch(`${http}/analytics/forget?id=visitor-gone&key=top-secret`)).status).toBe(405);
    expect((await fetch(`${http}/analytics/forget?id=bad&key=top-secret`, { method: 'POST' })).status).toBe(400);
    const copy = (await (await fetch(`${http}/analytics/visitor?id=visitor-gone&key=top-secret`)).json()) as {
      events: StoredEvent[];
      retention: { session: string } | null;
    };
    expect(copy.events.map((e) => e.t)).toEqual(['session_start', 'funnel']);
    expect(copy.retention).toMatchObject({ session: 'session-0001' });

    const res = await fetch(`${http}/analytics/forget?id=visitor-gone`, { method: 'POST', headers: { 'x-analytics-key': 'top-secret' } });
    expect(await res.json()).toEqual({ visitor: 'visitor-gone', removedEvents: 2 });
    const log = await readFile(path.join(dir, 'events.jsonl'), 'utf8');
    const table = await readFile(path.join(dir, 'retention.json'), 'utf8');
    expect(log).not.toContain('visitor-gone');
    expect(log).toContain('visitor-stay');
    expect(table).not.toContain('visitor-gone');
    expect(table).toContain('visitor-stay');
    const summary = (await (await fetch(`${http}/analytics/summary?key=top-secret`)).json()) as { visitors: number; funnel: { newPlayers: number } };
    expect(summary).toMatchObject({ visitors: 1, funnel: { newPlayers: 1 } });
  });
});
