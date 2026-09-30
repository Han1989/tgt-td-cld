// Strict parsing of one analytics POST. Unknown shapes are rejected whole;
// nothing partial is stored.

import { isChannel, isPlatform, type Channel, type Platform } from './channels';

export const EVENT_TYPES = ['session_start', 'session_heartbeat', 'session_end', 'feedback', 'match_end'] as const;

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
}

const ID = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_COMMENT = 140;

const ALLOWED: Record<AnalyticsEventType, readonly string[]> = {
  session_start: ['t', 'visitor', 'session', 'channel', 'platform'],
  session_heartbeat: ['t', 'visitor', 'session', 'channel', 'platform'],
  session_end: ['t', 'visitor', 'session', 'channel', 'platform'],
  feedback: ['t', 'visitor', 'session', 'channel', 'platform', 'rating', 'comment'],
  match_end: ['t', 'visitor', 'session', 'channel', 'platform', 'result', 'heartHp', 'heartMax', 'mode', 'wave', 'players'],
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
      const comment = obj.comment.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
      if (comment) event.comment = comment;
    }
  }

  if (obj.t === 'match_end') {
    if (obj.result !== 'victory' && obj.result !== 'defeat') return null;
    const heartHp = intIn(obj.heartHp, 0, 100_000);
    const heartMax = intIn(obj.heartMax, 1, 100_000);
    const wave = intIn(obj.wave, 0, 999);
    const players = intIn(obj.players, 1, 3);
    if (heartHp === null || heartMax === null || heartHp > heartMax || wave === null || players === null) return null;
    if (obj.mode !== 'full' && obj.mode !== 'quick') return null;
    event.result = obj.result;
    event.heartHp = heartHp;
    event.heartMax = heartMax;
    event.mode = obj.mode;
    event.wave = wave;
    event.players = players;
  }

  return event;
}
