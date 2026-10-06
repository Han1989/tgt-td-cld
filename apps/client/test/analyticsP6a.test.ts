// p6a-analytics on the client: match start / milestones / end from snapshots, funnel steps once a
// session, crash reports de-duplicated and rate-limited, and nothing at all with play data off.

import { describe, expect, it } from 'vitest';
import { browserFamily, buildId, cleanErrorMessage, errorSignature, shortenUrls, trimStack } from '../src/analytics/errors';
import { MatchTracker, type MatchSample } from '../src/analytics/matchTracker';
import {
  createAnalyticsClient,
  ERROR_GAP_MS,
  FUNNEL_STEPS,
  MAX_ERRORS_PER_SESSION,
  type AnalyticsBody,
} from '../src/analytics/session';

function client(allowed?: () => boolean) {
  const posts: AnalyticsBody[] = [];
  let n = 0;
  const api = createAnalyticsClient({
    visitor: () => 'visitor-0001',
    channel: 'crazygames',
    platform: 'android',
    newSessionId: () => `session-${String(++n).padStart(4, '0')}`,
    post: (body) => posts.push(body),
    allowed,
    build: 'abc1234',
    browser: 'chrome',
  });
  return { api, posts };
}

const boom = { kind: 'error' as const, message: 'TypeError: x is undefined', stack: 'at draw (assets/index.js:1:20)' };

describe('crash reports', () => {
  it('sends each error once a session, at most five, five seconds apart, and again in a new session', () => {
    const { api, posts } = client();
    api.error(boom, 0);
    api.start(0);
    api.error(boom, 0);
    // Too soon after the last one: dropped, and not remembered, so it can still go later.
    api.error({ ...boom, message: 'second' }, ERROR_GAP_MS - 1);
    api.error(boom, ERROR_GAP_MS * 2);
    expect(posts.filter((p) => p.t === 'client_error')).toEqual([
      expect.objectContaining({ kind: 'error', message: boom.message, stack: boom.stack, build: 'abc1234', browser: 'chrome', session: 'session-0001' }),
    ]);
    api.error({ ...boom, message: 'second' }, ERROR_GAP_MS * 2 + 10);
    expect(posts.filter((p) => p.t === 'client_error').map((p) => p.message)).toEqual([boom.message, 'second']);
    for (let i = 0; i < 10; i++) api.error({ ...boom, message: `error ${i}` }, ERROR_GAP_MS * (4 + i));
    expect(posts.filter((p) => p.t === 'client_error')).toHaveLength(MAX_ERRORS_PER_SESSION);
    // A new session (the idle window passed) starts the count again.
    api.end(ERROR_GAP_MS * 20);
    api.tick(true, ERROR_GAP_MS * 20 + 100_000);
    api.error(boom, ERROR_GAP_MS * 20 + 100_000);
    expect(posts.at(-1)).toMatchObject({ t: 'client_error', session: 'session-0002', message: boom.message });
  });

  it('leaves the stack off when there is none', () => {
    const { api, posts } = client();
    api.start(0);
    api.error({ kind: 'rejection', message: 'Unhandled rejection: nope', stack: '' }, 0);
    expect(posts.at(-1)).not.toHaveProperty('stack');
    expect(posts.at(-1)).toMatchObject({ kind: 'rejection' });
  });

  it('trims stacks, drops hosts and query strings, and names the browser family', () => {
    expect(shortenUrls('at f (https://tgt-td-cld.vercel.app/assets/index-ab12.js?src=reddit-cozy#x:1:20)')).toBe('at f (assets/index-ab12.js)');
    expect(shortenUrls('f@https://host.example/assets/a.js:3:9')).toBe('f@assets/a.js:3:9');
    expect(shortenUrls('Failed to fetch https://host/?room=AB12')).toBe('Failed to fetch /');
    const stack = ['Error: boom', ...Array.from({ length: 20 }, (_, i) => `    at fn${i} (https://h/assets/a.js:${i}:1)`)].join('\n');
    const trimmed = trimStack(stack, 'Error: boom');
    expect(trimmed.split('\n')).toHaveLength(6);
    expect(trimmed.split('\n')[0]).toBe('at fn0 (assets/a.js:0:1)');
    expect(trimStack(undefined, 'x')).toBe('');
    expect(cleanErrorMessage(new TypeError('bad\nthing'))).toBe('TypeError: bad thing');
    expect(cleanErrorMessage('x'.repeat(500))).toHaveLength(160);
    expect(errorSignature('m', 'a\nb')).toBe(errorSignature('m', 'a\nc'));
    expect(buildId('5460e97f')).toBe('5460e97f');
    expect(buildId('')).toBe('dev');
    expect(buildId('a b/c')).toBe('abc');
    const ua = (s: string) => browserFamily(s);
    expect(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('safari');
    expect(ua('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36')).toBe('chrome');
    expect(ua('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 SamsungBrowser/24.0 Chrome/117.0 Mobile Safari/537.36')).toBe('samsung');
    expect(ua('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0')).toBe('edge');
    expect(ua('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0')).toBe('firefox');
    expect(ua('curl/8')).toBe('other');
  });
});

describe('funnel steps and match events', () => {
  it('sends each funnel step once a session', () => {
    const { api, posts } = client();
    api.start(0);
    api.funnel('lobby');
    api.funnel('lobby');
    api.funnel('tutorial_move');
    api.funnel('nope' as never);
    expect(posts.map((p) => [p.t, p.step])).toEqual([
      ['session_start', undefined],
      ['funnel', 'lobby'],
      ['funnel', 'tutorial_move'],
    ]);
  });

  it('sends match starts and richer ends, and drops bad values', () => {
    const { api, posts } = client();
    api.start(0);
    const info = { mode: 'quick', difficulty: 'hard', players: 2, hero: 'warden', heroes: ['warden', 'ranger'], online: true };
    api.matchStart(info);
    api.matchStart({ ...info, difficulty: 'nightmare' });
    api.matchStart({ ...info, heroes: [] });
    api.matchEnd({ ...info, result: 'defeat', heartHp: 0, heartMax: 100, wave: 7, durationSec: 312.6 });
    api.matchEnd({ ...info, result: 'defeat', heartHp: 0, heartMax: 100, wave: 7, hero: 'paladin' });
    expect(posts.slice(1)).toEqual([
      { t: 'match_start', visitor: 'visitor-0001', session: 'session-0001', channel: 'crazygames', platform: 'android', ...info },
      expect.objectContaining({ t: 'match_end', result: 'defeat', wave: 7, durationSec: 313, difficulty: 'hard', heroes: ['warden', 'ranger'], online: true }),
    ]);
  });

  it('sends nothing at all with play data off: funnel steps, matches, crash reports', () => {
    let on = false;
    const { api, posts } = client(() => on);
    api.start(0);
    api.funnel('lobby');
    api.matchStart({ mode: 'full', difficulty: 'normal', players: 1, heroes: ['ranger'], online: false });
    api.matchEnd({ result: 'victory', heartHp: 1, heartMax: 2, mode: 'full', wave: 30, players: 1 });
    api.error(boom, 0);
    expect(posts).toEqual([]);
    // Turned off mid-session: the next step, error and match are dropped too.
    on = true;
    api.tick(true, 10);
    on = false;
    api.funnel('tutorial_move');
    api.error(boom, 20_000);
    api.matchStart({ mode: 'full', difficulty: 'normal', players: 1, heroes: ['ranger'], online: false });
    expect(posts.map((p) => p.t)).toEqual(['session_start']);
    // Back on, a step dropped while off can still be sent: nothing was remembered as sent.
    on = true;
    api.tick(true, 30_000);
    api.funnel('tutorial_move');
    expect(posts.at(-1)).toMatchObject({ t: 'funnel', step: 'tutorial_move' });
  });

  it('lists the same funnel steps as the server', async () => {
    const { readFileSync } = await import('node:fs');
    const server = readFileSync(new URL('../../server/src/analytics/channels.ts', import.meta.url), 'utf8');
    const list = /export const FUNNEL_STEPS = \[([^\]]*)\]/.exec(server)![1]!;
    expect([...list.matchAll(/'(\w+)'/g)].map((m) => m[1])).toEqual([...FUNNEL_STEPS]);
    const browsers = /export const BROWSERS = \[([^\]]*)\]/.exec(server)![1]!;
    const { BROWSERS } = await import('../src/analytics/errors');
    expect([...browsers.matchAll(/'(\w+)'/g)].map((m) => m[1])).toEqual([...BROWSERS]);
  });
});

describe('MatchTracker', () => {
  const sample = (over: Partial<MatchSample> = {}): MatchSample => ({
    tick: 0,
    tickRate: 20,
    phase: 'build',
    mode: 'quick',
    difficulty: 'normal',
    wave: 0,
    heartHp: 100,
    heartMaxHp: 100,
    players: [
      { id: 'p1', heroId: 7 },
      { id: 'p2', heroId: 8 },
    ],
    heroes: [
      { id: 8, kind: 'warden', owner: 'p2' },
      { id: 7, kind: 'arcanist', owner: 'p1' },
    ],
    ...over,
  });

  it('starts once a second in, past the opening restarts, then sends milestones and one end', () => {
    const tracker = new MatchTracker();
    // Solo's hero / mode / difficulty picks each restart the match near tick 0.
    expect(tracker.feed(sample({ tick: 3 }), 'p1', false)).toEqual([]);
    expect(tracker.feed(sample({ tick: 1 }), 'p1', false)).toEqual([]);
    const started = tracker.feed(sample({ tick: 20 }), 'p1', false);
    expect(started).toEqual([
      { t: 'start', info: { mode: 'quick', difficulty: 'normal', players: 2, hero: 'arcanist', heroes: ['arcanist', 'warden'], online: false } },
    ]);
    expect(tracker.feed(sample({ tick: 40 }), 'p1', false)).toEqual([]);
    // A jump over two milestones sends both.
    expect(tracker.feed(sample({ tick: 3000, wave: 5, phase: 'waves' }), 'p1', false)).toEqual([
      { t: 'step', step: 'wave_3' },
      { t: 'step', step: 'wave_5' },
    ]);
    const end = tracker.feed(sample({ tick: 6000, wave: 8, phase: 'defeat', heartHp: 0 }), 'p1', false);
    expect(end).toEqual([
      {
        t: 'end',
        outcome: {
          mode: 'quick',
          difficulty: 'normal',
          players: 2,
          hero: 'arcanist',
          heroes: ['arcanist', 'warden'],
          online: false,
          result: 'defeat',
          heartHp: 0,
          heartMax: 100,
          wave: 8,
          durationSec: 300,
        },
      },
    ]);
    expect(tracker.feed(sample({ tick: 6001, wave: 8, phase: 'defeat', heartHp: 0 }), 'p1', false)).toEqual([]);
    // Play again: the tick goes back, a new match.
    tracker.feed(sample({ tick: 0 }), 'p1', false);
    expect(tracker.feed(sample({ tick: 25 }), 'p1', false).map((a) => a.t)).toEqual(['start']);
  });

  it('reports a match that ends inside its first second as a start and an end', () => {
    const tracker = new MatchTracker();
    tracker.feed(sample({ tick: 2 }), 'p1', true);
    expect(tracker.feed(sample({ tick: 5, phase: 'defeat' }), 'p1', true).map((a) => a.t)).toEqual(['start', 'end']);
  });

  it('does not report a match that was already over when first seen (a rejoin after the end)', () => {
    const tracker = new MatchTracker();
    expect(tracker.feed(sample({ tick: 9000, phase: 'victory', wave: 15 }), 'p1', true)).toEqual([]);
    tracker.reset();
    expect(tracker.feed(sample({ tick: 9000, phase: 'waves', wave: 12 }), 'p1', true).map((a) => a.t)).toEqual([
      'start',
      'step',
      'step',
      'step',
    ]);
  });
});
