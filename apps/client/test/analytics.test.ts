import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHANNELS, channelFromSearch, resolveChannel } from '../src/analytics/channel';
import { detectPlatform } from '../src/analytics/platform';
import { analyticsAllowed, parseAnalyticsChoice, playDataStatus, readPrivacySignals } from '../src/analytics/preference';
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
  function client(allowed?: () => boolean) {
    const posts: { body: AnalyticsBody; beacon: boolean }[] = [];
    let n = 0;
    let visitors = 0;
    const api = createAnalyticsClient({
      visitor: () => {
        visitors++;
        return 'visitor-0001';
      },
      channel: 'direct',
      platform: 'web',
      newSessionId: () => `session-${String(++n).padStart(4, '0')}`,
      post: (body, beacon) => posts.push({ body, beacon }),
      allowed,
    });
    return { api, posts, visitors: () => visitors };
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

  it('sends nothing at all while play data is off, and makes no visitor id', () => {
    const { api, posts, visitors } = client(() => false);
    api.start(0);
    api.tick(true, HEARTBEAT_MS);
    api.matchEnd({ result: 'victory', heartHp: 40, heartMax: 100, mode: 'full', wave: 30, players: 1 });
    api.feedback(4, 'nice');
    api.end(HEARTBEAT_MS * 2);
    api.tick(true, HEARTBEAT_MS * 2 + CLIENT_IDLE_MS);
    expect(posts).toEqual([]);
    expect(visitors()).toBe(0);
  });

  it('stops mid-session when play data is turned off, and starts a new session when it is turned back on', () => {
    let on = true;
    const { api, posts } = client(() => on);
    api.start(0);
    api.tick(true, HEARTBEAT_MS);
    on = false;
    // Every event is dropped from here, even ones already under way (no session_end either).
    api.feedback(5, 'after off');
    api.matchEnd({ result: 'defeat', heartHp: 0, heartMax: 100, mode: 'quick', wave: 6, players: 2 });
    api.tick(true, HEARTBEAT_MS * 2);
    api.end(HEARTBEAT_MS * 3);
    expect(posts.map((post) => post.body.t)).toEqual(['session_start', 'session_heartbeat']);
    on = true;
    // A hidden page waits until it is on screen.
    api.tick(false, HEARTBEAT_MS * 4);
    expect(posts).toHaveLength(2);
    api.tick(true, HEARTBEAT_MS * 4 + 10);
    expect(posts.at(-1)!.body).toMatchObject({ t: 'session_start', session: 'session-0002', visitor: 'visitor-0001' });
    api.feedback(3, '');
    expect(posts.at(-1)!.body).toMatchObject({ t: 'feedback', session: 'session-0002', rating: 3 });
  });

  it('turned on later in a page that loaded with play data off, starts its first session then', () => {
    let on = false;
    const { api, posts, visitors } = client(() => on);
    api.start(0);
    api.tick(true, 10);
    expect(posts).toEqual([]);
    on = true;
    api.tick(true, 20);
    expect(posts.map((post) => post.body.t)).toEqual(['session_start']);
    expect(visitors()).toBe(1);
  });

  it('treats a switch that throws as off', () => {
    const { api, posts } = client(() => {
      throw new Error('storage blocked');
    });
    api.start(0);
    api.tick(true, HEARTBEAT_MS);
    expect(posts).toEqual([]);
  });
});

describe('play-data switch', () => {
  const none = { gpc: false, dnt: false };

  it('is on unless the player turned it off or the browser asks not to be tracked (16 and over)', () => {
    expect(analyticsAllowed(null, none, 'adult')).toBe(true);
    expect(analyticsAllowed('off', none, 'adult')).toBe(false);
    expect(analyticsAllowed(null, { gpc: true, dnt: false }, 'adult')).toBe(false);
    expect(analyticsAllowed(null, { gpc: false, dnt: true }, 'adult')).toBe(false);
    // The player's own choice wins over the browser's signal.
    expect(analyticsAllowed('on', { gpc: true, dnt: true }, 'adult')).toBe(true);
  });

  it('sends nothing before the age is known, never under 13, and from 13 to 15 only once turned on', () => {
    for (const choice of [null, 'on', 'off'] as const) {
      expect(analyticsAllowed(choice, none, null)).toBe(false);
      expect(analyticsAllowed(choice, none, 'child')).toBe(false);
    }
    expect(analyticsAllowed(null, none, 'teen')).toBe(false);
    expect(analyticsAllowed('off', none, 'teen')).toBe(false);
    expect(analyticsAllowed('on', { gpc: true, dnt: true }, 'teen')).toBe(true);
  });

  it('reads only on / off from storage, and GPC / DNT from the navigator', () => {
    expect(parseAnalyticsChoice('on')).toBe('on');
    expect(parseAnalyticsChoice('off')).toBe('off');
    expect(parseAnalyticsChoice('OFF')).toBeNull();
    expect(parseAnalyticsChoice(null)).toBeNull();
    expect(readPrivacySignals({})).toEqual(none);
    expect(readPrivacySignals({ globalPrivacyControl: true })).toEqual({ gpc: true, dnt: false });
    expect(readPrivacySignals({ globalPrivacyControl: 'true' })).toEqual(none);
    expect(readPrivacySignals({ doNotTrack: '1' })).toEqual({ gpc: false, dnt: true });
    expect(readPrivacySignals({ doNotTrack: '0' })).toEqual(none);
    expect(readPrivacySignals({ doNotTrack: 'unspecified' })).toEqual(none);
    expect(readPrivacySignals({}, { doNotTrack: '1' })).toEqual({ gpc: false, dnt: true });
  });

  it('says why it is off', () => {
    expect(playDataStatus(null, none, 'adult')).toEqual({ on: true, locked: false, line: 'On: this browser sends anonymous play data.' });
    expect(playDataStatus('off', none, 'adult')).toEqual({ on: false, locked: false, line: 'Off: this browser sends nothing.' });
    expect(playDataStatus(null, { gpc: true, dnt: false }, 'adult').line).toContain('asks sites not to track');
    expect(playDataStatus('on', { gpc: true, dnt: false }, 'adult').on).toBe(true);
    expect(playDataStatus(null, none, null)).toMatchObject({ on: false, locked: false, line: expect.stringContaining('knows your age') });
    // Off by choice or by GPC stays explained as before; the age is asked when the player turns it on.
    expect(playDataStatus('off', none, null).line).toBe('Off: this browser sends nothing.');
    expect(playDataStatus('on', none, 'child')).toEqual({ on: false, locked: true, line: 'Off: nothing is sent for players under 13.' });
    expect(playDataStatus(null, none, 'teen').line).toContain('under 16 it starts off');
    expect(playDataStatus('on', none, 'teen')).toMatchObject({ on: true, locked: false });
  });
});

describe('privacy page and links', () => {
  const page = readFileSync(new URL('../privacy.html', import.meta.url), 'utf8');
  const game = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const text = page.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('says what is collected, that there are no accounts or trackers, 30 days, and how to ask for deletion', () => {
    for (const phrase of [
      'No accounts',
      'no third-party trackers',
      'sets no cookies',
      '30 days',
      'visitor id',
      'tdt.visitor',
      'Visits and playtime',
      'Where the visit came from',
      'Platform',
      'Match results',
      'Normal or Hard',
      'How far a visit got',
      'Error reports',
      'At most five a visit',
      '31 days after the last day',
      '1–5 rating',
      '140 characters',
      "don't put personal details in a note",
      'Global Privacy Control',
      'Get a copy, or delete it',
      'Or ask by email',
      'Download my data',
      'Delete my data',
      'tdt.visitorKey',
      'nobody who learns the id can read or delete your data',
      'Your rights',
      'To get a copy',
      'To have it deleted',
      'To object, or to withdraw',
      'To have it corrected',
      'To complain',
      'Personal Data Protection Commission',
      'How old are you?',
      'tdt.age',
      'is never sent',
      'Under 13:',
      'nothing is ever sent from this browser',
      '13 to 15:',
      '16 and over:',
      'Everyone can play',
      'Singapore',
      'GDPR',
      'PDPA',
    ]) {
      expect(text, phrase).toContain(phrase);
    }
  });

  it('marks the contact email as a placeholder until Han adds it', () => {
    expect(page).toContain('data-placeholder="privacy-email"');
    expect(page).not.toMatch(/mailto:/);
  });

  it('describes every field the client can send', () => {
    // A new field in AnalyticsBody needs a line on the privacy page (and this list).
    const session = readFileSync(new URL('../src/analytics/session.ts', import.meta.url), 'utf8');
    const body = /export interface AnalyticsBody \{([^}]*)\}/.exec(session)![1]!;
    const fields = [...body.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]);
    expect(fields).toEqual([
      't',
      'visitor',
      'session',
      'channel',
      'platform',
      'rating',
      'comment',
      'result',
      'heartHp',
      'heartMax',
      'mode',
      'wave',
      'players',
      'difficulty',
      'durationSec',
      'hero',
      'heroes',
      'online',
      'step',
      'kind',
      'message',
      'stack',
      'build',
      'browser',
    ]);
  });

  it('is linked from the lobby, the rating control and Settings, in a new tab', () => {
    for (const id of ['lobby-privacy', 'end-privacy']) {
      expect(game).toMatch(new RegExp(`<a id="${id}" href="/privacy.html" target="_blank" rel="noopener">Privacy</a>`));
    }
    expect(game).toMatch(/id="settings-analytics"/);
    expect(game).toMatch(/aria-describedby="end-comment-hint"/);
    expect(game).toMatch(/id="end-comment-hint"[^>]*>Don't include personal details\./);
  });
});
