// "Your data" (Settings → Play data and the privacy page; docs/ANALYTICS.md): a copy of what the game server holds
// for this browser, or its deletion, by the browser's data key (dataKey.ts). The server derives the id from the key,
// so nobody can ask for another browser's data by id. After a deletion this browser's id and key are gone; the next
// event, if play data is on, starts a new id. Never throws.

import { clearVisitor, storedDataKey, VISITOR_KEY, type IdStore } from './dataKey';
import { analyticsEndpoint } from './session';

/** The acquisition channel saved from a tagged link (channel.ts). Deleted with the id. */
export const CHANNEL_KEY = 'tdt.channel';

/** The game server this page posts play data to, or '' when this build sends none. */
export function analyticsServer(): string {
  const configured = (import.meta.env.VITE_SERVER_URL ?? '').trim();
  if (configured) return configured;
  // Browser tests (e2e builds only) post to this page's own origin with `?analytics`.
  if (import.meta.env.MODE === 'e2e' && new URLSearchParams(location.search).has('analytics')) return location.origin;
  return '';
}

/** This browser's storage, or an empty one when it is blocked. */
export function localIdStore(): IdStore {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
}

export interface ServerCopy {
  visitor: string;
  events: unknown[];
  retention: unknown;
}

export type MyDataResult =
  | { kind: 'file'; name: string; text: string; events: number }
  /** No id or key in this browser: nothing was ever sent from it. */
  | { kind: 'nothing' }
  /** An id from before data keys: the server cannot tell it is this browser's. */
  | { kind: 'legacy' }
  | { kind: 'deleted'; removed: number }
  /** Only this browser's own id was cleared (it had no key). */
  | { kind: 'cleared' }
  /** This build has no game server: nothing is ever sent. */
  | { kind: 'no-server' }
  | { kind: 'busy' }
  | { kind: 'error' };

const pad = (n: number) => String(n).padStart(2, '0');

/** The downloaded copy: what it is, when, and exactly what the server returned. */
export function myDataFile(copy: ServerCopy, date: Date): { name: string; text: string } {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const body = {
    about:
      "Everything Tower Defense Together's game server holds for this browser's id: its play data events (kept 30 days) " +
      'and its line in the return-rate table (kept 31 days after the last visit). Nothing else is kept about you. ' +
      'See /privacy.html.',
    exportedAt: date.toISOString(),
    visitor: copy.visitor,
    events: copy.events,
    retention: copy.retention,
  };
  return { name: `tdt-play-data-${day}.json`, text: `${JSON.stringify(body, null, 1)}\n` };
}

/** The line shown after a copy or deletion. */
export function myDataLine(result: MyDataResult): string {
  switch (result.kind) {
    case 'file':
      return result.events === 0
        ? 'Downloaded. The server holds nothing for this browser right now.'
        : `Downloaded: ${result.events} event${result.events === 1 ? '' : 's'} and nothing more.`;
    case 'nothing':
      return 'Nothing has been sent from this browser, so there is nothing to copy or delete.';
    case 'legacy':
      return "This browser's id is from before self-serve copies. Delete clears it here; the server's copy goes within 30 days, or ask by email.";
    case 'deleted':
      return 'Deleted from the server. This browser has a new id from now on. Turn play data off to stop sending.';
    case 'cleared':
      return "This browser's id is cleared. The server's copy goes within 30 days, or ask by email.";
    case 'no-server':
      return 'This version of the game has no game server, so it never sends play data.';
    case 'busy':
      return 'Too many tries. Wait a minute and try again.';
    case 'error':
      return 'Could not reach the game server. Check your connection and try again.';
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

async function ask(url: string, key: string, fetchFn: Fetch): Promise<{ status: number; body: unknown }> {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ key }),
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
  });
  return { status: res.status, body: res.ok ? ((await res.json()) as unknown) : null };
}

function isCopy(value: unknown): value is ServerCopy {
  const v = value as ServerCopy | null;
  return !!v && typeof v === 'object' && typeof v.visitor === 'string' && Array.isArray(v.events);
}

/** A copy of this browser's data on the server, as a file to save. */
export async function copyMyData(
  server: string,
  store: IdStore,
  fetchFn: Fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<MyDataResult> {
  try {
    const url = analyticsEndpoint(server, '/analytics/mine');
    if (!url) return { kind: 'no-server' };
    const key = storedDataKey(store);
    if (!key) return store.getItem(VISITOR_KEY) ? { kind: 'legacy' } : { kind: 'nothing' };
    const { status, body } = await ask(url, key, fetchFn);
    if (status === 429) return { kind: 'busy' };
    if (!isCopy(body)) return { kind: 'error' };
    return { kind: 'file', ...myDataFile(body, now()), events: body.events.length };
  } catch {
    return { kind: 'error' };
  }
}

/**
 * Deletes this browser's data on the server, then its id, key and saved channel here. `cleared` runs once they are
 * gone (the analytics client forgets its id). With no key, only the local id is cleared.
 */
export async function deleteMyData(
  server: string,
  store: IdStore,
  cleared: () => void = () => {},
  fetchFn: Fetch = fetch,
): Promise<MyDataResult> {
  const clearHere = () => {
    try {
      clearVisitor(store);
      store.removeItem(CHANNEL_KEY);
    } catch {
      // Storage is gone anyway.
    }
    cleared();
  };
  try {
    const key = storedDataKey(store);
    if (!key) {
      if (!store.getItem(VISITOR_KEY)) return { kind: 'nothing' };
      clearHere();
      return { kind: 'cleared' };
    }
    const url = analyticsEndpoint(server, '/analytics/mine/forget');
    if (!url) {
      clearHere();
      return { kind: 'no-server' };
    }
    const { status, body } = await ask(url, key, fetchFn);
    if (status === 429) return { kind: 'busy' };
    const removed = (body as { removedEvents?: unknown } | null)?.removedEvents;
    if (typeof removed !== 'number') return { kind: 'error' };
    clearHere();
    return { kind: 'deleted', removed };
  } catch {
    return { kind: 'error' };
  }
}
