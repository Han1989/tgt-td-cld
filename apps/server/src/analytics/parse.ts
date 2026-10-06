// Strict parsing of one analytics POST. Unknown shapes are rejected whole;
// nothing partial is stored.

import { DIFFICULTIES, HERO_KINDS, type Difficulty, type HeroKind } from '@tdt/protocol';
import { isBrowser, isChannel, isFunnelStep, isPlatform, type Browser, type Channel, type FunnelStep, type Platform } from './channels';

export const EVENT_TYPES = [
  'session_start',
  'session_heartbeat',
  'session_end',
  'feedback',
  'match_start',
  'match_end',
  'funnel',
  'client_error',
] as const;

export type AnalyticsEventType = (typeof EVENT_TYPES)[number];

export interface ParsedEvent {
  t: AnalyticsEventType;
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
  /** Match time in seconds (build phase included). */
  durationSec?: number;
  /** The sender's own hero. */
  hero?: HeroKind;
  /** Every hero in the match, in seat order. */
  heroes?: HeroKind[];
  /** A game-server room (true) or solo in the browser (false). */
  online?: boolean;
  step?: FunnelStep;
  kind?: 'error' | 'rejection';
  message?: string;
  stack?: string;
  build?: string;
  browser?: Browser;
}

const ID = /^[A-Za-z0-9_-]{8,64}$/;
const BUILD = /^[A-Za-z0-9._-]{1,40}$/;
const MAX_COMMENT = 140;
export const MAX_ERROR_MESSAGE = 200;
export const MAX_ERROR_STACK = 1000;
/** Ten hours: a match tab left open overnight is not a real length. */
const MAX_DURATION_SEC = 36_000;

const BASE = ['t', 'visitor', 'session', 'channel', 'platform'] as const;
const MATCH = ['mode', 'difficulty', 'players', 'hero', 'heroes', 'online'] as const;

const ALLOWED: Record<AnalyticsEventType, readonly string[]> = {
  session_start: BASE,
  session_heartbeat: BASE,
  session_end: BASE,
  feedback: [...BASE, 'rating', 'comment'],
  match_start: [...BASE, ...MATCH],
  match_end: [...BASE, ...MATCH, 'result', 'heartHp', 'heartMax', 'wave', 'durationSec'],
  funnel: [...BASE, 'step'],
  client_error: [...BASE, 'kind', 'message', 'stack', 'build', 'browser'],
};

function isType(value: unknown): value is AnalyticsEventType {
  return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value);
}

function intIn(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

function keysOk(obj: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(obj).every((key) => allowed.includes(key));
}

function isHero(value: unknown): value is HeroKind {
  return typeof value === 'string' && (HERO_KINDS as readonly string[]).includes(value);
}

function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}

/** Control characters out (newlines too unless `lines`), runs of spaces folded, trimmed. */
function cleanText(raw: string, lines: boolean): string {
  const text = lines ? raw.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ') : raw.replace(/[\u0000-\u001F\u007F]/g, ' ');
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/**
 * The match fields shared by `match_start` and `match_end`. Required on a start; on an end only
 * mode and players are (older clients sent no more). Returns false on a bad value.
 */
function readMatch(obj: Record<string, unknown>, event: ParsedEvent, required: boolean): boolean {
  if (obj.mode !== 'full' && obj.mode !== 'quick') return false;
  const players = intIn(obj.players, 1, 3);
  if (players === null) return false;
  event.mode = obj.mode;
  event.players = players;
  if (obj.difficulty !== undefined || required) {
    if (!isDifficulty(obj.difficulty)) return false;
    event.difficulty = obj.difficulty;
  }
  if (obj.hero !== undefined) {
    if (!isHero(obj.hero)) return false;
    event.hero = obj.hero;
  }
  if (obj.heroes !== undefined || required) {
    const heroes = obj.heroes;
    if (!Array.isArray(heroes) || heroes.length < 1 || heroes.length > 3 || !heroes.every(isHero)) return false;
    event.heroes = [...heroes];
  }
  if (obj.online !== undefined || required) {
    if (typeof obj.online !== 'boolean') return false;
    event.online = obj.online;
  }
  return true;
}

/** Returns the event, or null when the body is not a single valid event. */
export function parseAnalyticsEvent(body: unknown): ParsedEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;
  if (!isType(obj.t)) return null;
  if (!keysOk(obj, ALLOWED[obj.t])) return null;
  if (typeof obj.visitor !== 'string' || !ID.test(obj.visitor)) return null;
  if (typeof obj.session !== 'string' || !ID.test(obj.session)) return null;
  if (!isChannel(obj.channel) || !isPlatform(obj.platform)) return null;

  const event: ParsedEvent = {
    t: obj.t,
    visitor: obj.visitor,
    session: obj.session,
    channel: obj.channel,
    platform: obj.platform,
  };

  if (obj.t === 'feedback') {
    const rating = intIn(obj.rating, 1, 5);
    if (rating === null) return null;
    event.rating = rating;
    if (obj.comment !== undefined) {
      if (typeof obj.comment !== 'string' || obj.comment.length > MAX_COMMENT) return null;
      const comment = cleanText(obj.comment, false);
      if (comment) event.comment = comment;
    }
  }

  if (obj.t === 'match_start') {
    if (!readMatch(obj, event, true)) return null;
  }

  if (obj.t === 'match_end') {
    if (obj.result !== 'victory' && obj.result !== 'defeat') return null;
    const heartHp = intIn(obj.heartHp, 0, 100_000);
    const heartMax = intIn(obj.heartMax, 1, 100_000);
    const wave = intIn(obj.wave, 0, 999);
    if (heartHp === null || heartMax === null || heartHp > heartMax || wave === null) return null;
    if (!readMatch(obj, event, false)) return null;
    event.result = obj.result;
    event.heartHp = heartHp;
    event.heartMax = heartMax;
    event.wave = wave;
    if (obj.durationSec !== undefined) {
      const duration = intIn(obj.durationSec, 0, MAX_DURATION_SEC);
      if (duration === null) return null;
      event.durationSec = duration;
    }
  }

  if (obj.t === 'funnel') {
    if (!isFunnelStep(obj.step)) return null;
    event.step = obj.step;
  }

  if (obj.t === 'client_error') {
    if (obj.kind !== 'error' && obj.kind !== 'rejection') return null;
    if (typeof obj.message !== 'string' || obj.message.length > MAX_ERROR_MESSAGE) return null;
    const message = cleanText(obj.message, false);
    if (!message) return null;
    if (typeof obj.build !== 'string' || !BUILD.test(obj.build)) return null;
    if (!isBrowser(obj.browser)) return null;
    event.kind = obj.kind;
    event.message = message;
    event.build = obj.build;
    event.browser = obj.browser;
    if (obj.stack !== undefined) {
      if (typeof obj.stack !== 'string' || obj.stack.length > MAX_ERROR_STACK) return null;
      const stack = cleanText(obj.stack, true);
      if (stack) event.stack = stack;
    }
  }

  return event;
}
