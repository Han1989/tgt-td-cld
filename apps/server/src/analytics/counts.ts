// Anonymous counts (POST /analytics/count; docs/ANALYTICS.md → Before the age question). Pure: the clock is passed in.
//
// A browser may send these before the age question is answered, because they carry no id: the game page opened, or
// it failed to start (the watchdog's reason), with the link's tag, the platform and the browser family. No visitor id,
// no session, no text and no time from the client. The server adds each one to a total per UTC day, what, channel,
// platform and browser, and keeps nothing else: no address, no line per request, nothing in events.jsonl. Totals are
// kept 90 days, like the cohort counts. A copy or deletion request has nothing to find here: nothing is per person.

import {
  BOOT_REASONS,
  BOOT_REASON_LABELS,
  BROWSERS,
  BROWSER_LABELS,
  CHANNELS,
  CHANNEL_LABELS,
  PLATFORMS,
  PLATFORM_LABELS,
  isBrowser,
  isChannel,
  isCountKind,
  isPlatform,
  type BootReason,
  type Browser,
  type Channel,
  type CountKind,
  type Platform,
} from './channels';
import { COHORT_KEEP_DAYS, utcDay } from './retention';

/** Count rows are kept for days this recent, like the cohort counts. */
export const COUNT_KEEP_DAYS = COHORT_KEEP_DAYS;
/** The dashboard panel reads this many UTC days, today included. */
export const COUNT_PANEL_DAYS = 30;

/** Exactly the fields a count may have. */
const FIELDS = ['what', 'channel', 'platform', 'browser'] as const;

export interface CountBody {
  what: CountKind;
  channel: Channel;
  platform: Platform;
  browser: Browser;
}

/** One total: how many counts of this kind arrived on this UTC day. */
export interface CountRow extends CountBody {
  day: number;
  n: number;
}

export type CountState = Map<string, CountRow>;

export function emptyCounts(): CountState {
  return new Map();
}

function key(day: number, body: CountBody): string {
  return `${day}|${body.what}|${body.channel}|${body.platform}|${body.browser}`;
}

/** The count, or null when the body is anything but exactly `{ what, channel, platform, browser }` with known values. */
export function parseCount(body: unknown): CountBody | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== FIELDS.length || !keys.every((k) => (FIELDS as readonly string[]).includes(k))) return null;
  if (!isCountKind(obj.what) || !isChannel(obj.channel) || !isPlatform(obj.platform) || !isBrowser(obj.browser)) return null;
  return { what: obj.what, channel: obj.channel, platform: obj.platform, browser: obj.browser };
}

/** Adds one to the day's total. */
export function addCount(state: CountState, body: CountBody, at: number): void {
  const day = utcDay(at);
  const k = key(day, body);
  const row = state.get(k);
  if (row) row.n++;
  else state.set(k, { day, what: body.what, channel: body.channel, platform: body.platform, browser: body.browser, n: 1 });
}

/** Drops totals for days past `COUNT_KEEP_DAYS`. True if any went. */
export function expireCounts(state: CountState, now: number): boolean {
  const today = utcDay(now);
  let changed = false;
  for (const [k, row] of state) {
    if (today - row.day >= COUNT_KEEP_DAYS) {
      state.delete(k);
      changed = true;
    }
  }
  return changed;
}

/** The saved form (`counts.json`). */
export interface CountsFile {
  v: 1;
  rows: CountRow[];
}

export function serializeCounts(state: CountState): CountsFile {
  return { v: 1, rows: [...state.values()].map((row) => ({ ...row })) };
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Reads `counts.json`; a malformed row is skipped (it cannot be rebuilt: nothing else holds these). */
export function parseCounts(raw: unknown): CountState {
  const state = emptyCounts();
  if (!raw || typeof raw !== 'object') return state;
  const rows = (raw as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return state;
  for (const value of rows as unknown[]) {
    if (!value || typeof value !== 'object') continue;
    const row = value as Record<string, unknown>;
    const { n, day } = row;
    if (!isCount(day) || !isCount(n) || n === 0) continue;
    const body = parseCount({ what: row.what, channel: row.channel, platform: row.platform, browser: row.browser });
    if (!body) continue;
    const k = key(day, body);
    const existing = state.get(k);
    if (existing) existing.n += n;
    else state.set(k, { day, ...body, n });
  }
  return state;
}

export interface BeforeAgeChannel {
  channel: Channel;
  label: string;
  /** Game page loads counted (anonymous, sent before the age answer too). */
  opens: number;
  /** Sessions started in the event log (they need the age answer). */
  sessions: number;
  /** Sessions over opens, 0–1 or more; null with no opens. */
  share: number | null;
}

export interface BeforeAgeReason {
  reason: BootReason;
  label: string;
  starts: number;
  /** Of the page opens; null with no opens. */
  shareOfOpens: number | null;
}

export interface FailedStartRow {
  reason: BootReason;
  label: string;
  platform: Platform;
  platformLabel: string;
  browser: Browser;
  browserLabel: string;
  starts: number;
}

export interface BeforeAgeSummary {
  /** UTC days read, today included. */
  days: number;
  /** Days the totals are kept. */
  keepDays: number;
  opens: number;
  sessions: number;
  share: number | null;
  /** Every channel, in the dashboard's order. */
  channels: BeforeAgeChannel[];
  failed: {
    starts: number;
    byReason: BeforeAgeReason[];
    /** One row per reason, platform and browser that had any, most first. */
    rows: FailedStartRow[];
  };
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/**
 * The "Before the age question" panel: per channel, page opens over the last `COUNT_PANEL_DAYS` UTC days next to the
 * sessions started (from the event log, `sessionsByChannel`), and failed starts by reason, platform and browser.
 */
export function summarizeBeforeAge(
  state: CountState,
  now: number,
  sessionsByChannel: ReadonlyMap<Channel, number>,
): BeforeAgeSummary {
  const today = utcDay(now);
  const opens = new Map<Channel, number>();
  const reasons = new Map<BootReason, number>();
  const failed = new Map<string, FailedStartRow>();
  for (const row of state.values()) {
    if (today - row.day >= COUNT_PANEL_DAYS || row.day > today) continue;
    if (row.what === 'open') {
      opens.set(row.channel, (opens.get(row.channel) ?? 0) + row.n);
      continue;
    }
    const reason = row.what;
    reasons.set(reason, (reasons.get(reason) ?? 0) + row.n);
    const k = `${reason}|${row.platform}|${row.browser}`;
    const line = failed.get(k) ?? {
      reason,
      label: BOOT_REASON_LABELS[reason],
      platform: row.platform,
      platformLabel: PLATFORM_LABELS[row.platform],
      browser: row.browser,
      browserLabel: BROWSER_LABELS[row.browser],
      starts: 0,
    };
    line.starts += row.n;
    failed.set(k, line);
  }
  const channels = CHANNELS.map((channel) => {
    const o = opens.get(channel) ?? 0;
    const s = sessionsByChannel.get(channel) ?? 0;
    return { channel, label: CHANNEL_LABELS[channel], opens: o, sessions: s, share: ratio(s, o) };
  });
  const totalOpens = channels.reduce((sum, row) => sum + row.opens, 0);
  const totalSessions = channels.reduce((sum, row) => sum + row.sessions, 0);
  const order = (row: FailedStartRow) =>
    BOOT_REASONS.indexOf(row.reason) * 100 + PLATFORMS.indexOf(row.platform) * 10 + BROWSERS.indexOf(row.browser);
  const rows = [...failed.values()].sort((a, b) => b.starts - a.starts || order(a) - order(b));
  return {
    days: COUNT_PANEL_DAYS,
    keepDays: COUNT_KEEP_DAYS,
    opens: totalOpens,
    sessions: totalSessions,
    share: ratio(totalSessions, totalOpens),
    channels,
    failed: {
      starts: rows.reduce((sum, row) => sum + row.starts, 0),
      byReason: BOOT_REASONS.map((reason) => {
        const starts = reasons.get(reason) ?? 0;
        return { reason, label: BOOT_REASON_LABELS[reason], starts, shareOfOpens: ratio(starts, totalOpens) };
      }),
      rows,
    },
  };
}
