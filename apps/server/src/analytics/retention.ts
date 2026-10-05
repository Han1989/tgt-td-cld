// D1 / D7 / D30 return rates that survive the 30-day event prune. Pure: the clock is passed in.
//
// Raw events last 30 days, so on day 31 a visitor's first visit is gone and D30 could never be read
// from them. Two small tables live beside the event log instead (docs/ANALYTICS.md → Retention):
// - one line per browser id: the UTC day of its first visit, that visit's channel and session, the
//   last UTC day it was seen, and which of days 1, 7 and 30 it came back on. Deleted 31 days after the
//   last day it was seen, so it never outlives the browser's own events by more than a day.
// - daily cohort counts with no id in them: per first-visit day and channel, how many browsers were new
//   and how many came back on day 1, 7 and 30. Kept 90 days.
// Both are rebuilt from the event log when they are missing, and replaying an event twice changes nothing.

import { CHANNELS, type Channel } from './channels';
import type { Ratio } from './summary';

export const DAY_MS = 24 * 60 * 60 * 1000;
/** The return days the dashboard reads. */
export const RETURN_DAYS = [1, 7, 30] as const;
export type ReturnDay = (typeof RETURN_DAYS)[number];
/** A browser's line is deleted this many UTC days after the last day it was seen. */
export const VISITOR_KEEP_DAYS = 31;
/** Cohort counts (no ids) are kept for first-visit days this recent. */
export const COHORT_KEEP_DAYS = 90;

export interface VisitorRecord {
  /** UTC day of the first visit. */
  first: number;
  /** UTC day of the last event. */
  last: number;
  channel: Channel;
  /** The first visit's session id (the "new player" funnel follows it). */
  session: string;
  /** Bit per `RETURN_DAYS` entry: came back on that day. */
  back: number;
}

export interface CohortRow {
  day: number;
  channel: Channel;
  visitors: number;
  d1: number;
  d7: number;
  d30: number;
}

export interface RetentionState {
  visitors: Map<string, VisitorRecord>;
  cohorts: Map<string, CohortRow>;
}

export interface RetentionEvent {
  t: string;
  visitor: string;
  session: string;
  channel: Channel;
  at: number;
}

export interface RetentionRates {
  d1: Ratio;
  d7: Ratio;
  d30: Ratio;
}

export function utcDay(at: number): number {
  return Math.floor(at / DAY_MS);
}

export function emptyRetention(): RetentionState {
  return { visitors: new Map(), cohorts: new Map() };
}

function cohortKey(day: number, channel: Channel): string {
  return `${day}|${channel}`;
}

function cohort(state: RetentionState, day: number, channel: Channel): CohortRow {
  const key = cohortKey(day, channel);
  let row = state.cohorts.get(key);
  if (!row) {
    row = { day, channel, visitors: 0, d1: 0, d7: 0, d30: 0 };
    state.cohorts.set(key, row);
  }
  return row;
}

function bit(day: ReturnDay): number {
  return 1 << RETURN_DAYS.indexOf(day);
}

function field(day: ReturnDay): 'd1' | 'd7' | 'd30' {
  return day === 1 ? 'd1' : day === 7 ? 'd7' : 'd30';
}

/**
 * Folds one event in. A browser's first event makes its line and counts it in its first day's cohort;
 * a `session_start` exactly 1, 7 or 30 UTC days later marks that return once. Returns true when
 * something that is saved changed (not on every heartbeat).
 */
export function observe(state: RetentionState, event: RetentionEvent): boolean {
  const day = utcDay(event.at);
  const record = state.visitors.get(event.visitor);
  if (!record) {
    state.visitors.set(event.visitor, { first: day, last: day, channel: event.channel, session: event.session, back: 0 });
    cohort(state, day, event.channel).visitors++;
    return true;
  }
  let changed = false;
  if (day > record.last) {
    record.last = day;
    changed = true;
  }
  if (event.t !== 'session_start') return changed;
  const lag = day - record.first;
  for (const returnDay of RETURN_DAYS) {
    if (lag !== returnDay || record.back & bit(returnDay)) continue;
    record.back |= bit(returnDay);
    cohort(state, record.first, record.channel)[field(returnDay)]++;
    changed = true;
  }
  return changed;
}

/** Drops browser lines past `VISITOR_KEEP_DAYS` and cohort rows past `COHORT_KEEP_DAYS`. True if any went. */
export function expireRetention(state: RetentionState, now: number): boolean {
  const today = utcDay(now);
  let changed = false;
  for (const [id, record] of state.visitors) {
    if (today - record.last > VISITOR_KEEP_DAYS) {
      state.visitors.delete(id);
      changed = true;
    }
  }
  for (const [key, row] of state.cohorts) {
    if (today - row.day >= COHORT_KEEP_DAYS) {
      state.cohorts.delete(key);
      changed = true;
    }
  }
  return changed;
}

/** A deletion request: the browser's line goes, and its counts come out of its cohort. */
export function forgetVisitor(state: RetentionState, visitor: string): boolean {
  const record = state.visitors.get(visitor);
  if (!record) return false;
  state.visitors.delete(visitor);
  const row = state.cohorts.get(cohortKey(record.first, record.channel));
  if (row) {
    row.visitors = Math.max(0, row.visitors - 1);
    for (const returnDay of RETURN_DAYS) {
      if (record.back & bit(returnDay)) row[field(returnDay)] = Math.max(0, row[field(returnDay)] - 1);
    }
    if (row.visitors === 0) state.cohorts.delete(cohortKey(record.first, record.channel));
  }
  return true;
}

/** Builds the tables from an event log (oldest first is not required). */
export function retentionFromEvents(events: readonly RetentionEvent[]): RetentionState {
  const state = emptyRetention();
  for (const event of [...events].sort((a, b) => a.at - b.at)) observe(state, event);
  return state;
}

/**
 * D1, D7 and D30 over the kept cohorts: of the browsers whose first visit was at least N UTC days
 * before today, the share that started a session exactly N days after it. Today's returns count as
 * they come, so the newest eligible cohort climbs during the day. `channel` limits it to the browsers
 * whose first visit came from that channel.
 */
export function retentionRates(state: RetentionState, now: number, channel?: Channel): RetentionRates {
  const today = utcDay(now);
  const rates: RetentionRates = {
    d1: { eligible: 0, returned: 0 },
    d7: { eligible: 0, returned: 0 },
    d30: { eligible: 0, returned: 0 },
  };
  for (const row of state.cohorts.values()) {
    if (channel && row.channel !== channel) continue;
    for (const returnDay of RETURN_DAYS) {
      if (row.day > today - returnDay) continue;
      const ratio = rates[field(returnDay)];
      ratio.eligible += row.visitors;
      ratio.returned += row[field(returnDay)];
    }
  }
  return rates;
}

export interface CohortDay {
  /** UTC day number (`at / DAY_MS`). */
  day: number;
  visitors: number;
  /** Null until the cohort is old enough for that return day. */
  d1: number | null;
  d7: number | null;
  d30: number | null;
}

/** The newest `limit` first-visit days that had anyone, all channels together, newest first. */
export function cohortDays(state: RetentionState, now: number, limit = 14): CohortDay[] {
  const today = utcDay(now);
  const byDay = new Map<number, CohortRow>();
  for (const row of state.cohorts.values()) {
    const sum = byDay.get(row.day) ?? { day: row.day, channel: row.channel, visitors: 0, d1: 0, d7: 0, d30: 0 };
    sum.visitors += row.visitors;
    sum.d1 += row.d1;
    sum.d7 += row.d7;
    sum.d30 += row.d30;
    byDay.set(row.day, sum);
  }
  return [...byDay.values()]
    .filter((row) => row.visitors > 0)
    .sort((a, b) => b.day - a.day)
    .slice(0, limit)
    .map((row) => ({
      day: row.day,
      visitors: row.visitors,
      d1: row.day <= today - 1 ? row.d1 : null,
      d7: row.day <= today - 7 ? row.d7 : null,
      d30: row.day <= today - 30 ? row.d30 : null,
    }));
}

/** The saved form (`retention.json`). */
export interface RetentionFile {
  v: 1;
  visitors: [string, VisitorRecord][];
  cohorts: CohortRow[];
}

export function serializeRetention(state: RetentionState): RetentionFile {
  return { v: 1, visitors: [...state.visitors], cohorts: [...state.cohorts.values()] };
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is VisitorRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as VisitorRecord;
  return (
    isCount(r.first) &&
    isCount(r.last) &&
    isCount(r.back) &&
    typeof r.session === 'string' &&
    (CHANNELS as readonly string[]).includes(r.channel)
  );
}

function isRow(value: unknown): value is CohortRow {
  if (!value || typeof value !== 'object') return false;
  const r = value as CohortRow;
  return (
    isCount(r.day) &&
    isCount(r.visitors) &&
    isCount(r.d1) &&
    isCount(r.d7) &&
    isCount(r.d30) &&
    (CHANNELS as readonly string[]).includes(r.channel)
  );
}

/** Reads `retention.json`; anything malformed is skipped (the event log fills the gaps). */
export function parseRetention(raw: unknown): RetentionState {
  const state = emptyRetention();
  if (!raw || typeof raw !== 'object') return state;
  const file = raw as Partial<RetentionFile>;
  if (Array.isArray(file.visitors)) {
    for (const entry of file.visitors) {
      if (Array.isArray(entry) && typeof entry[0] === 'string' && isRecord(entry[1])) {
        state.visitors.set(entry[0], { ...entry[1] });
      }
    }
  }
  if (Array.isArray(file.cohorts)) {
    for (const row of file.cohorts) {
      if (isRow(row)) state.cohorts.set(cohortKey(row.day, row.channel), { ...row });
    }
  }
  return state;
}
