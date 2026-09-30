// Browser wiring for the rollout events. Everything here is allowed to fail;
// the match must keep running if storage, fetch or the beacon throws.

import { channelFromSearch, type Channel } from './channel';
import { detectPlatform, type Platform } from './platform';
import { analyticsEndpoint, createAnalyticsClient, type AnalyticsClient } from './session';

const VISITOR_KEY = 'tdt.visitor';
const CHANNEL_KEY = 'tdt.channel';

let current: AnalyticsClient | null = null;

export function currentAnalytics(): AnalyticsClient | null {
  return current;
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

function safeStorage(kind: 'localStorage' | 'sessionStorage'): Storage {
  try {
    const store = window[kind];
    const probe = 'tdt.probe';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return memoryStorage();
  }
}

export function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function post(url: string, body: unknown, beacon: boolean): void {
  const json = JSON.stringify(body);
  try {
    if (beacon && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url, json)) return;
  } catch {
    // Fall through to fetch.
  }
  void fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=UTF-8' },
    body: json,
    keepalive: true,
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
  }).catch(() => {});
}

/**
 * Starts one session for this page. No-op when the build has no game server
 * (`VITE_SERVER_URL` empty): local solo then keeps no analytics. Showcase and
 * stress pages should not call this.
 */
export function installAnalytics(serverUrl: string): void {
  try {
    const endpoint = analyticsEndpoint(serverUrl);
    if (!endpoint) return;
    const store = safeStorage('localStorage');
    const choice = channelFromSearch(location.search, document.referrer, store.getItem(CHANNEL_KEY));
    if (choice.save) store.setItem(CHANNEL_KEY, choice.channel);
    else if (choice.clear) store.removeItem(CHANNEL_KEY);
    let visitor = store.getItem(VISITOR_KEY);
    if (!visitor || !/^[A-Za-z0-9_-]{8,64}$/.test(visitor)) {
      visitor = randomId();
      store.setItem(VISITOR_KEY, visitor);
    }
    const channel: Channel = choice.channel;
    const platform: Platform = detectPlatform({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
    });
    const client = createAnalyticsClient({
      visitor,
      channel,
      platform,
      newSessionId: randomId,
      post: (body, beacon) => post(endpoint, body, beacon),
    });
    client.start(Date.now());
    window.setInterval(() => {
      client.tick(document.visibilityState === 'visible', Date.now());
    }, 25_000);
    document.addEventListener('visibilitychange', () => {
      client.tick(document.visibilityState === 'visible', Date.now());
    });
    // pagehide also fires when a phone switches apps. A later heartbeat reopens the
    // same session; the idle window is what starts a new one.
    window.addEventListener('pagehide', () => client.end(Date.now()));
    current = client;
  } catch {
    current = null;
  }
}
