// Browser wiring for the rollout events. Everything here is allowed to fail;
// the match must keep running if storage, fetch or the beacon throws.

import { channelFromSearch, type Channel } from './channel';
import { detectPlatform, type Platform } from './platform';
import { ANALYTICS_KEY, analyticsOn, VISITOR_KEY, writeAnalyticsChoice, type AnalyticsChoice } from './preference';
import { analyticsEndpoint, createAnalyticsClient, type AnalyticsClient } from './session';

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

/** The page is on screen (for ticks). */
function visible(): boolean {
  return document.visibilityState === 'visible';
}

/**
 * The play-data switch (Settings → Play data): saves the choice for this browser and applies it now
 * (off: nothing more is sent; on: a new session starts).
 */
export function setAnalyticsChoice(choice: AnalyticsChoice): void {
  writeAnalyticsChoice(choice);
  try {
    current?.tick(visible(), Date.now());
  } catch {
    // Applied at the next tick instead.
  }
}

/**
 * Starts one session for this page. No-op when the build has no game server
 * (`VITE_SERVER_URL` empty): local solo then keeps no analytics. Showcase and
 * stress pages should not call this. While the player has play data off
 * (preference.ts) nothing is sent and no visitor id is made.
 */
export function installAnalytics(serverUrl: string): void {
  try {
    const endpoint = analyticsEndpoint(serverUrl);
    if (!endpoint) return;
    const store = safeStorage('localStorage');
    const choice = channelFromSearch(location.search, document.referrer, store.getItem(CHANNEL_KEY));
    if (analyticsOn()) {
      if (choice.save) store.setItem(CHANNEL_KEY, choice.channel);
      else if (choice.clear) store.removeItem(CHANNEL_KEY);
    }
    const visitor = () => {
      let id = store.getItem(VISITOR_KEY);
      if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
        id = randomId();
        store.setItem(VISITOR_KEY, id);
      }
      return id;
    };
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
      allowed: analyticsOn,
    });
    client.start(Date.now());
    window.setInterval(() => {
      client.tick(visible(), Date.now());
    }, 25_000);
    document.addEventListener('visibilitychange', () => {
      client.tick(visible(), Date.now());
    });
    // The switch on the privacy page (another tab) applies here at once.
    window.addEventListener('storage', (e) => {
      if (e.key === ANALYTICS_KEY || e.key === null) client.tick(visible(), Date.now());
    });
    // pagehide also fires when a phone switches apps. A later heartbeat reopens the
    // same session; the idle window is what starts a new one.
    window.addEventListener('pagehide', () => client.end(Date.now()));
    current = client;
  } catch {
    current = null;
  }
}
