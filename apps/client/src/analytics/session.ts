// Session clock and the bodies posted to /analytics/event. No DOM, no throwing.
// `allowed` (the player's play-data switch, preference.ts) is read before every post: while it is
// off nothing is sent, and the session in progress stops where it is (no session_end; the server
// closes it after its idle window). Turned back on, the next tick starts a new session.

import type { Channel } from './channel';
import type { Platform } from './platform';

/** How long a hidden page can sit before the next view is a new session. Matches the server. */
export const CLIENT_IDLE_MS = 90_000;
export const HEARTBEAT_MS = 25_000;

export type SessionEventType = 'session_start' | 'session_heartbeat' | 'session_end' | 'feedback' | 'match_end';

export interface AnalyticsBody {
  t: SessionEventType;
  visitor: string;
  session: string;
  channel: Channel;
  platform: Platform;
  rating?: number;
  comment?: string;
  result?: 'victory' | 'defeat';
  heartHp?: number;
  heartMax?: number;
  mode?: 'full' | 'quick';
  wave?: number;
  players?: number;
}

export interface MatchOutcome {
  result: 'victory' | 'defeat';
  heartHp: number;
  heartMax: number;
  mode: string;
  wave: number;
  players: number;
}

export interface AnalyticsClient {
  start(now: number): void;
  /** `visible` is whether the page is on screen. Call on a timer and when visibility changes. */
  tick(visible: boolean, now: number): void;
  /** Tab is going away. A later tick can resume the same session inside the idle window. */
  end(now: number): void;
  feedback(rating: number, comment: string): void;
  matchEnd(outcome: MatchOutcome): void;
}

export function analyticsEndpoint(serverUrl: string): string | null {
  const trimmed = serverUrl.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol === 'wss:') url.protocol = 'https:';
  else if (url.protocol === 'ws:') url.protocol = 'http:';
  else if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  url.username = '';
  url.password = '';
  url.pathname = '/analytics/event';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function cleanComment(raw: string): string {
  return raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
}

export function createAnalyticsClient(opts: {
  /** The visitor id; asked for at the first session start, so a browser that never sends gets none. */
  visitor: () => string;
  channel: Channel;
  platform: Platform;
  newSessionId: () => string;
  post: (body: AnalyticsBody, beacon: boolean) => void;
  /** Read before every post. False: nothing is sent. Default: always allowed. */
  allowed?: () => boolean;
}): AnalyticsClient {
  let visitor = '';
  let session = '';
  /** `start` was called: ticks may open sessions from now on. */
  let opened = false;
  let started = false;
  let endSent = false;
  let hiddenAt: number | null = null;
  let lastPost = 0;

  function allowed(): boolean {
    try {
      return opts.allowed?.() ?? true;
    } catch {
      return false;
    }
  }

  function send(body: AnalyticsBody, beacon: boolean): void {
    if (!allowed()) return;
    try {
      opts.post(body, beacon);
    } catch {
      // A failed post must not break the match.
    }
  }

  function base(t: SessionEventType): AnalyticsBody {
    return { t, visitor, session, channel: opts.channel, platform: opts.platform };
  }

  function begin(now: number): void {
    if (!allowed()) return;
    try {
      if (!visitor) visitor = opts.visitor();
    } catch {
      return;
    }
    session = opts.newSessionId();
    started = true;
    endSent = false;
    hiddenAt = null;
    lastPost = now;
    send(base('session_start'), false);
  }

  return {
    start(now) {
      opened = true;
      begin(now);
    },
    tick(visible, now) {
      if (!opened) return;
      if (!allowed()) {
        // Switched off: this session stops here. Switched back on, the next visible tick starts a new one.
        started = false;
        hiddenAt = null;
        return;
      }
      if (!started) {
        if (visible) begin(now);
        return;
      }
      if (!visible) {
        if (hiddenAt === null) hiddenAt = now;
        return;
      }
      const away = hiddenAt === null ? 0 : now - hiddenAt;
      hiddenAt = null;
      if (away >= CLIENT_IDLE_MS) {
        begin(now);
        return;
      }
      if (endSent || now - lastPost >= HEARTBEAT_MS) {
        send(base('session_heartbeat'), false);
        endSent = false;
        lastPost = now;
      }
    },
    end(now: number) {
      if (!started || endSent) return;
      // pagehide can fire without a visibility event. Remember when, so a long
      // absence starts a new session instead of gluing the gap onto this one.
      if (hiddenAt === null) hiddenAt = now;
      send(base('session_end'), true);
      endSent = true;
    },
    feedback(rating, comment) {
      if (!started || !Number.isInteger(rating) || rating < 1 || rating > 5) return;
      const body = base('feedback');
      body.rating = rating;
      const note = cleanComment(comment);
      if (note) body.comment = note;
      send(body, false);
    },
    matchEnd(outcome) {
      if (!started) return;
      if (outcome.result !== 'victory' && outcome.result !== 'defeat') return;
      if (outcome.mode !== 'full' && outcome.mode !== 'quick') return;
      const heartHp = Math.round(outcome.heartHp);
      const heartMax = Math.round(outcome.heartMax);
      const wave = Math.round(outcome.wave);
      const players = Math.round(outcome.players);
      if (heartMax < 1 || heartHp < 0 || heartHp > heartMax || wave < 0 || wave > 999 || players < 1 || players > 3) return;
      send(
        {
          ...base('match_end'),
          result: outcome.result,
          heartHp,
          heartMax,
          mode: outcome.mode,
          wave,
          players,
        },
        false,
      );
    },
  };
}
