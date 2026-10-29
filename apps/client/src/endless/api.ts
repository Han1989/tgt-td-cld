// Endless's board's requests to the game server (apps/server/src/endless/http.ts): today's top 10 for the board card,
// and posting a finished solo run. A run posts by itself only by the rule in endless/board.ts (a yes once, 16 and over,
// a nickname; 13–15 one tap each time; never under 13), so it does not read the Play data switch; it sends the
// nickname, the run's report and replay, and this browser's data key, from which the server derives the browser's id
// (docs/ANALYTICS.md "Endless board"). The key goes with a read only from a browser that posted a run today, to mark
// its own row. Never throws.

import type { MatchReport, Replay } from '@tdt/protocol';
import { dailyKey } from '@tdt/sim';
import { ensureVisitor, storedDataKey } from '../analytics/dataKey';
import { localIdStore } from '../analytics/myData';
import { analyticsEndpoint } from '../analytics/session';
import { dailyServer } from '../daily/api';
import type { EndlessPostResult, EndlessToday } from './board';

/** The days this browser posted an Endless run (the last few), so a read knows whether to send its key. */
export const ENDLESS_POSTED_KEY = 'tdt.endlessPosted';

function postedDays(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ENDLESS_POSTED_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((d): d is string => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

function notePosted(day: string): void {
  try {
    localStorage.setItem(ENDLESS_POSTED_KEY, JSON.stringify([...new Set([day, ...postedDays()])].slice(0, 3)));
  } catch {
    // The board just shows the top 10 next time, with no row marked.
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

function isToday(value: unknown): value is EndlessToday {
  const v = value as EndlessToday | null;
  return (
    !!v &&
    typeof v === 'object' &&
    typeof v.day === 'string' &&
    typeof v.closesAt === 'number' &&
    typeof v.runs === 'number' &&
    Array.isArray(v.top) &&
    (v.you === null || (typeof v.you === 'object' && typeof v.you.rank === 'number'))
  );
}

/** Today's board, or null (no server, offline, or an answer that is not one). */
export async function fetchEndlessToday(server = dailyServer(), fetchFn: Fetch = fetch, now = Date.now()): Promise<EndlessToday | null> {
  try {
    const url = analyticsEndpoint(server, '/endless/today');
    if (!url) return null;
    const key = postedDays().includes(dailyKey(now)) ? storedDataKey(localIdStore()) : null;
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

export type EndlessPostOutcome = { ok: true; result: EndlessPostResult } | { ok: false; code: string };

/**
 * Posts a finished solo Endless run. This browser's data key is made here if it has none (play data off from the
 * start): posting is its own act. The server re-runs the replay and answers with the board as this browser sees it.
 */
export async function postEndlessRun(
  name: string,
  file: { report: MatchReport; replay: Replay },
  server = dailyServer(),
  fetchFn: Fetch = fetch,
): Promise<EndlessPostOutcome> {
  try {
    const url = analyticsEndpoint(server, '/endless/post');
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
    const body = (await res.json().catch(() => null)) as (EndlessPostResult & { error?: string }) | null;
    if (!res.ok || !body || !isToday(body) || typeof body.run !== 'object') {
      return { ok: false, code: typeof body?.error === 'string' ? body.error : res.status === 429 ? 'slow' : 'error' };
    }
    notePosted(body.day);
    return { ok: true, result: body };
  } catch {
    return { ok: false, code: 'network' };
  }
}
