import { describe, expect, it } from 'vitest';
import { CHANNELS, channelFromSearch, resolveChannel } from '../src/analytics/channel';
import { detectPlatform } from '../src/analytics/platform';
import { analyticsEndpoint, cleanComment, CLIENT_IDLE_MS, createAnalyticsClient, HEARTBEAT_MS, type AnalyticsBody } from '../src/analytics/session';

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

describe('acquisition channel', () => {
  it('uses the six channel ids the server accepts', () => {
    expect(CHANNELS).toEqual(['reddit-playmygame', 'reddit-incremental', 'reddit-cozy', 'crazygames', 'other', 'direct']);
  });

  it('reads ?src= first, then utm, then a crazygames referrer, then a saved channel', () => {
    expect(channelFromSearch('?src=reddit-playmygame', '', null)).toEqual({
      channel: 'reddit-playmygame',
      save: true,
      clear: false,
    });
    expect(channelFromSearch('?src=REDDIT-COZY', 'https://www.reddit.com/r/cozygames', 'crazygames')).toMatchObject({
      channel: 'reddit-cozy',
      save: true,
    });
    expect(resolveChannel({ src: 'nope', utmSource: null, utmCampaign: null, referrer: null, stored: 'crazygames' })).toEqual({
      channel: 'other',
      save: false,
      clear: true,
    });
    expect(channelFromSearch('?utm_campaign=playmygame-sept', '', null)).toMatchObject({ channel: 'reddit-playmygame', save: true });
    expect(channelFromSearch('?utm_source=crazygames', '', 'reddit-cozy')).toMatchObject({ channel: 'crazygames', save: true });
    expect(channelFromSearch('', 'https://games.crazygames.com/game/td', null)).toEqual({
      channel: 'crazygames',
      save: true,
      clear: false,
    });
    // Reddit's referrer does not name the subreddit.
    expect(channelFromSearch('', 'https://old.reddit.com/r/PlayMyGame/comments/1', null)).toMatchObject({ channel: 'other', clear: false });
    expect(channelFromSearch('', 'https://www.reddit.com/', 'reddit-incremental')).toMatchObject({
      channel: 'reddit-incremental',
      save: false,
      clear: false,
    });
    expect(channelFromSearch('', '', 'crazygames')).toEqual({ channel: 'crazygames', save: false, clear: false });
    expect(channelFromSearch('', '', null)).toEqual({ channel: 'direct', save: false, clear: false });
    expect(channelFromSearch('?src=direct', '', 'reddit-playmygame')).toEqual({ channel: 'direct', save: false, clear: true });
  });
});

describe('platform', () => {
  it('tells iOS, iPadOS and Android from desktop web', () => {
    expect(detectPlatform({ userAgent: iphone, platform: 'iPhone', maxTouchPoints: 5 })).toBe('ios');
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe('ios');
    expect(detectPlatform({ userAgent: android, platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe('android');
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64)', platform: 'Win32', maxTouchPoints: 0 })).toBe('web');
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe('web');
  });
});

describe('analytics session', () => {
  function client() {
    const posts: { body: AnalyticsBody; beacon: boolean }[] = [];
    let n = 0;
    const api = createAnalyticsClient({
      visitor: 'visitor-0001',
      channel: 'direct',
      platform: 'web',
      newSessionId: () => `session-${String(++n).padStart(4, '0')}`,
      post: (body, beacon) => posts.push({ body, beacon }),
    });
    return { api, posts };
  }

  it('builds the event URL from the websocket server', () => {
    expect(analyticsEndpoint('wss://tgt-td-server.onrender.com/ignored?x=1')).toBe('https://tgt-td-server.onrender.com/analytics/event');
    expect(analyticsEndpoint('ws://localhost:8080')).toBe('http://localhost:8080/analytics/event');
    expect(analyticsEndpoint('')).toBeNull();
    expect(analyticsEndpoint('not a url')).toBeNull();
  });

  it('starts, heartbeats, ends once, and opens a new session after the idle window', () => {
    const { api, posts } = client();
    api.start(0);
    expect(posts[0]!.body).toMatchObject({ t: 'session_start', session: 'session-0001', channel: 'direct' });
    api.tick(true, HEARTBEAT_MS);
    expect(posts[1]!.body.t).toBe('session_heartbeat');
    api.tick(false, HEARTBEAT_MS + 1);
    api.end(HEARTBEAT_MS + 2);
    api.end(HEARTBEAT_MS + 3);
    expect(posts.filter((post) => post.body.t === 'session_end')).toHaveLength(1);
    expect(posts.at(-1)!.beacon).toBe(true);
    api.tick(true, HEARTBEAT_MS + 1 + CLIENT_IDLE_MS);
    expect(posts.at(-1)!.body).toMatchObject({ t: 'session_start', session: 'session-0002' });
  });

  it('resumes the same session when the tab returns inside the idle window', () => {
    const { api, posts } = client();
    api.start(0);
    api.end(500);
    api.tick(true, 1000);
    expect(posts.map((post) => post.body.t)).toEqual(['session_start', 'session_end', 'session_heartbeat']);
    expect(posts.every((post) => post.body.session === 'session-0001')).toBe(true);
  });

  it('starts a new session when the page returns long after pagehide', () => {
    const { api, posts } = client();
    api.start(0);
    api.end(1_000);
    api.tick(true, 1_000 + CLIENT_IDLE_MS);
    expect(posts.at(-1)!.body).toMatchObject({ t: 'session_start', session: 'session-0002' });
  });

  it('sends a rating with an optional note, and a match result, and drops garbage', () => {
    const { api, posts } = client();
    api.feedback(5, 'too soon');
    api.matchEnd({ result: 'victory', heartHp: 40, heartMax: 100, mode: 'full', wave: 30, players: 1 });
    api.start(0);
    api.feedback(5, '  great\nmatch  ');
    api.feedback(3, '   ');
    api.feedback(0, 'no');
    api.matchEnd({ result: 'defeat', heartHp: 0, heartMax: 100, mode: 'quick', wave: 4, players: 9 });
    api.matchEnd({ result: 'victory', heartHp: 12.4, heartMax: 100, mode: 'full', wave: 30, players: 1 });
    expect(posts.map((post) => post.body.t)).toEqual(['session_start', 'feedback', 'feedback', 'match_end']);
    expect(posts[1]!.body.comment).toBe('great match');
    expect(posts[2]!.body.comment).toBeUndefined();
    expect(posts[3]!.body).toMatchObject({ result: 'victory', heartHp: 12, players: 1 });
    expect(cleanComment('  a \u0000 b  ')).toBe('a b');
  });
});
