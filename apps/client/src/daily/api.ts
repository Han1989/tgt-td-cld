// The Daily run's requests to the game server (apps/server/src/daily/http.ts): today's seed and line for the home
// tile, and posting a finished run. Posting is an explicit tap, so it does not read the Play data switch; it sends the
// nickname, the run's report and replay, and this browser's data key, from which the server derives the browser's id
// (docs/ANALYTICS.md "Daily run"). The key goes with a read only from a browser that posted a run today or yesterday,
// to show its own rank. Never throws.

import type { MatchReport, Replay } from '@tdt/protocol';
import { dailyKey, shiftDailyKey } from '@tdt/sim';
import { ensureVisitor, storedDataKey } from '../analytics/dataKey';
import { localIdStore } from '../analytics/myData';
import { analyticsEndpoint } from '../analytics/session';
import type { DailyToday, PostResult } from './text';

/** The days this browser posted a run (the last few), so a read knows whether to send its key. */
export const POSTED_KEY = 'tdt.dailyPosted';

/** The game server, or '' in a build with none (the tile stays hidden). Browser tests: this page's origin. */
export function dailyServer(): string {
  const configured = (import.meta.env.VITE_SERVER_URL ?? '').trim();
  if (configured) return configured;
  if (import.meta.env.MODE === 'e2e' && new URLSearchParams(location.search).has('daily')) return location.origin;
  return '';
}

function postedDays(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(POSTED_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((d): d is string => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

function notePosted(day: string): void {
  try {
    localStorage.setItem(POSTED_KEY, JSON.stringify([...new Set([day, ...postedDays()])].slice(0, 3)));
  } catch {
    // The tile just shows the plain line next time.
  }
}

/** This browser posted today's or yesterday's run (by the device clock: a wrong clock only skips the rank). */
function postedLately(now: number): boolean {
  const today = dailyKey(now);
  const days = postedDays();
  return days.includes(today) || days.includes(shiftDailyKey(today, -1));
}

type Fetch = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

function isToday(value: unknown): value is DailyToday {
  const v = value as DailyToday | null;
  return !!v && typeof v === 'object' && typeof v.day === 'string' && Number.isSafeInteger(v.seed) && typeof v.closesAt === 'number' && typeof v.runs === 'number';
}

/** Today's run, or null (no server, offline, or an answer that is not one). */
export async function fetchToday(server = dailyServer(), fetchFn: Fetch = fetch, now = Date.now()): Promise<DailyToday | null> {
  try {
    const url = analyticsEndpoint(server, '/daily/today');
    if (!url) return null;
    const key = postedLately(now) ? storedDataKey(localIdStore()) : null;
    const res = await fetchFn(url, {
      method: 'GET',
      headers: key ? { 'x-data-key': key } : {},
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    return isToday(body) ? body : null;
  } catch {
    return null;
  }
}

export type PostOutcome = { ok: true; result: PostResult } | { ok: false; code: string };

/**
 * Posts a finished daily run. This browser's data key is made here if it has none (play data off from the start):
 * posting is its own act. The server re-runs the replay and answers with the rank of the browser's best today.
 */
export async function postRun(
  name: string,
  file: { report: MatchReport; replay: Replay },
  server = dailyServer(),
  fetchFn: Fetch = fetch,
): Promise<PostOutcome> {
  try {
    const url = analyticsEndpoint(server, '/daily/post');
    if (!url) return { ok: false, code: 'network' };
    const store = localIdStore();
    ensureVisitor(store);
    const key = storedDataKey(store);
    if (!key) return { ok: false, code: 'network' };
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ key, name, file }),
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => null)) as (PostResult & { error?: string }) | null;
    if (!res.ok || !body || typeof body.rank !== 'number' || !Array.isArray(body.rows)) {
      return { ok: false, code: typeof body?.error === 'string' ? body.error : res.status === 429 ? 'slow' : 'error' };
    }
    notePosted(body.day);
    return { ok: true, result: body };
  } catch {
    return { ok: false, code: 'network' };
  }
}
