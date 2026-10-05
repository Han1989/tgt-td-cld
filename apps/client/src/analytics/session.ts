// Session clock and the bodies posted to /analytics/event. No DOM, no throwing.
// `allowed` (the player's play-data switch, preference.ts) is read before every post: while it is
// off nothing is sent, and the session in progress stops where it is (no session_end; the server
// closes it after its idle window). Turned back on, the next tick starts a new session.

import { DIFFICULTIES, HERO_KINDS, type Difficulty, type HeroKind } from '@tdt/protocol';
import type { Channel } from './channel';
import { errorSignature, type Browser } from './errors';
import type { Platform } from './platform';

/** How long a hidden page can sit before the next view is a new session. Matches the server. */
export const CLIENT_IDLE_MS = 90_000;
export const HEARTBEAT_MS = 25_000;

/** At most this many crash reports a session, each a different error. */
export const MAX_ERRORS_PER_SESSION = 5;
/** A crash report this soon after the last one is dropped (a burst is usually one fault). */
export const ERROR_GAP_MS = 5_000;

export type SessionEventType =
  | 'session_start'
  | 'session_heartbeat'
  | 'session_end'
  | 'feedback'
  | 'match_start'
  | 'match_end'
  | 'funnel'
  | 'client_error';

/** Steps of the new-player funnel, each sent once a session. The server's list (channels.ts) must stay the same. */
export const FUNNEL_STEPS = [
  'lobby',
  'wave_3',
  'wave_5',
  'wave_10',
  'tutorial_move',
  'tutorial_build',
  'tutorial_cast',
  'tutorial_upgrade',
  'tutorial_ping',
  'tutorial_emote',
  'tutorial_done',
  'tutorial_skip',
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

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
  difficulty?: Difficulty;
  durationSec?: number;
  hero?: HeroKind;
  heroes?: HeroKind[];
  online?: boolean;
  step?: FunnelStep;
  kind?: 'error' | 'rejection';
  message?: string;
  stack?: string;
  build?: string;
  browser?: Browser;
}

/** A match as it begins. */
export interface MatchInfo {
  mode: string;
  difficulty: string;
  players: number;
  /** Your hero, when you have one. */
  hero?: string;
  heroes: readonly string[];
  online: boolean;
}

export interface MatchOutcome {
  result: 'victory' | 'defeat';
  heartHp: number;
  heartMax: number;
  mode: string;
  wave: number;
  players: number;
  difficulty?: string;
  durationSec?: number;
  hero?: string;
  heroes?: readonly string[];
  online?: boolean;
}

/** An uncaught error, already trimmed (errors.ts). */
export interface ErrorReport {
  kind: 'error' | 'rejection';
  message: string;
  stack: string;
}

export interface AnalyticsClient {
  start(now: number): void;
  /** `visible` is whether the page is on screen. Call on a timer and when visibility changes. */
  tick(visible: boolean, now: number): void;
  /** Tab is going away. A later tick can resume the same session inside the idle window. */
  end(now: number): void;
  feedback(rating: number, comment: string): void;
  matchStart(info: MatchInfo): void;
  matchEnd(outcome: MatchOutcome): void;
  /** A step of the new-player funnel. Repeats in the same session are dropped. */
  funnel(step: FunnelStep): void;
  /** A crash report: once per error a session, at most `MAX_ERRORS_PER_SESSION`, `ERROR_GAP_MS` apart. */
  error(report: ErrorReport, now: number): void;
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
  /** For crash reports: the build id (`buildId`) and the browser family. */
  build?: string;
  browser?: Browser;
}): AnalyticsClient {
  let visitor = '';
  let session = '';
  /** `start` was called: ticks may open sessions from now on. */
  let opened = false;
  let started = false;
  let endSent = false;
  let hiddenAt: number | null = null;
  let lastPost = 0;
  /** Per session: funnel steps sent, error signatures sent, and when the last error went. */
  let steps = new Set<FunnelStep>();
  let errors = new Set<string>();
  let lastError = -Infinity;

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
    steps = new Set();
    errors = new Set();
    lastError = -Infinity;
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
    matchStart(info) {
      if (!started) return;
      const body = base('match_start');
      if (!matchFields(body, info) || body.difficulty === undefined || body.heroes === undefined || body.online === undefined) return;
      send(body, false);
    },
    matchEnd(outcome) {
      if (!started) return;
      if (outcome.result !== 'victory' && outcome.result !== 'defeat') return;
      const heartHp = Math.round(outcome.heartHp);
      const heartMax = Math.round(outcome.heartMax);
      const wave = Math.round(outcome.wave);
      if (heartMax < 1 || heartHp < 0 || heartHp > heartMax || wave < 0 || wave > 999) return;
      const body: AnalyticsBody = { ...base('match_end'), result: outcome.result, heartHp, heartMax, wave };
      if (!matchFields(body, outcome)) return;
      if (outcome.durationSec !== undefined) {
        const duration = Math.round(outcome.durationSec);
        if (duration >= 0 && duration <= 36_000) body.durationSec = duration;
      }
      send(body, false);
    },
    funnel(step) {
      if (!started || steps.has(step) || !(FUNNEL_STEPS as readonly string[]).includes(step)) return;
      if (!allowed()) return;
      steps.add(step);
      send({ ...base('funnel'), step }, false);
    },
    error(report, now) {
      if (!started || !report.message) return;
      if (errors.size >= MAX_ERRORS_PER_SESSION || now - lastError < ERROR_GAP_MS) return;
      const signature = errorSignature(report.message, report.stack);
      if (errors.has(signature) || !allowed()) return;
      errors.add(signature);
      lastError = now;
      const body: AnalyticsBody = {
        ...base('client_error'),
        kind: report.kind,
        message: report.message,
        build: opts.build ?? 'dev',
        browser: opts.browser ?? 'other',
      };
      if (report.stack) body.stack = report.stack;
      send(body, false);
    },
  };
}

function isHero(value: unknown): value is HeroKind {
  return typeof value === 'string' && (HERO_KINDS as readonly string[]).includes(value);
}

/**
 * Copies the match fields the server accepts onto `body`. Mode and players are required; the rest is
 * left off when missing. False when a value is out of range (nothing should be sent).
 */
function matchFields(body: AnalyticsBody, info: Partial<MatchInfo> & { mode: string; players: number }): boolean {
  if (info.mode !== 'full' && info.mode !== 'quick') return false;
  const players = Math.round(info.players);
  if (players < 1 || players > 3) return false;
  body.mode = info.mode;
  body.players = players;
  if (info.difficulty !== undefined) {
    if (!(DIFFICULTIES as readonly string[]).includes(info.difficulty)) return false;
    body.difficulty = info.difficulty as Difficulty;
  }
  if (info.hero !== undefined) {
    if (!isHero(info.hero)) return false;
    body.hero = info.hero;
  }
  if (info.heroes !== undefined) {
    const heroes = info.heroes.filter(isHero);
    if (heroes.length < 1 || heroes.length > 3 || heroes.length !== info.heroes.length) return false;
    body.heroes = heroes;
  }
  if (info.online !== undefined) body.online = info.online;
  return true;
}
