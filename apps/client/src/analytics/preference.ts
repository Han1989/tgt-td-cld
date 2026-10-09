// "Anonymous play data" on or off, for this browser (docs/ANALYTICS.md, privacy.html). Its own
// localStorage key, not `tdt.settings`: the privacy page writes it while a game tab may be open, and
// a game tab saving its settings must not put back an old choice. Every analytics post reads it
// first (session.ts `allowed`), so a change in any tab holds from the next event.

// The age answer (age.ts) comes first: no play data (anything with an id) is sent before it, never under 13, and from
// 13 to 15 only once the player turns it on. The one thing that may go before it is an anonymous count with no id (a
// page open, a failed start: `countAllowed`), and it follows the same switch.

import { currentAgeBand, type AgeBand } from './age';
import { VISITOR_KEY } from './dataKey';

export { VISITOR_KEY };

/** `on` / `off`; missing until the player picks one. */
export const ANALYTICS_KEY = 'tdt.analytics';

export type AnalyticsChoice = 'on' | 'off';

/** The browser's own "don't track me" signals. */
export interface PrivacySignals {
  /** Global Privacy Control (`navigator.globalPrivacyControl`). */
  gpc: boolean;
  /** Do Not Track set to 1. */
  dnt: boolean;
}

export function parseAnalyticsChoice(raw: string | null | undefined): AnalyticsChoice | null {
  return raw === 'on' || raw === 'off' ? raw : null;
}

/**
 * Whether this browser sends play data. Nothing before the age question is answered and never under 13. From 13
 * to 15 only when the player turned it on. From 16 the player's own choice wins; with none, it is on unless the
 * browser sends Global Privacy Control or Do Not Track.
 */
export function analyticsAllowed(choice: AnalyticsChoice | null, signals: PrivacySignals, age: AgeBand | null): boolean {
  if (age === null || age === 'child') return false;
  if (age === 'teen') return choice === 'on';
  return wouldSend(choice, signals);
}

/**
 * Whether this browser may send an anonymous count (`/analytics/count`: the page opened, or failed to start; no id,
 * added to a daily total). Before the age question is answered: yes, unless the player turned play data off or the
 * browser sends Global Privacy Control or Do Not Track (the switch's own rule, `wouldSend`). Under 13 never; from 13 to
 * 15 only when the player turned play data on; from 16 the same rule as play data.
 */
export function countAllowed(choice: AnalyticsChoice | null, signals: PrivacySignals, age: AgeBand | null): boolean {
  if (age === null) return wouldSend(choice, signals);
  return analyticsAllowed(choice, signals, age);
}

/** The switch's own rule, before the age: the player's choice, else on unless GPC / DNT. */
export function wouldSend(choice: AnalyticsChoice | null, signals: PrivacySignals): boolean {
  if (choice) return choice === 'on';
  return !signals.gpc && !signals.dnt;
}

interface NavigatorSignals {
  globalPrivacyControl?: unknown;
  doNotTrack?: unknown;
}

/** Reads the signals from `navigator` (and the old `window.doNotTrack`). */
export function readPrivacySignals(nav: NavigatorSignals, win?: { doNotTrack?: unknown }): PrivacySignals {
  const dnt = nav.doNotTrack ?? win?.doNotTrack;
  return { gpc: nav.globalPrivacyControl === true, dnt: dnt === '1' || dnt === 'yes' };
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Kept for this page when storage is blocked (private mode), so the switch still works until reload. */
let memoryChoice: AnalyticsChoice | null = null;

export function readAnalyticsChoice(): AnalyticsChoice | null {
  try {
    const store = storage();
    if (store) return parseAnalyticsChoice(store.getItem(ANALYTICS_KEY)) ?? memoryChoice;
  } catch {
    // Blocked storage: the in-page choice.
  }
  return memoryChoice;
}

export function writeAnalyticsChoice(choice: AnalyticsChoice): void {
  memoryChoice = choice;
  try {
    storage()?.setItem(ANALYTICS_KEY, choice);
  } catch {
    // Not remembered after this page.
  }
}

export function browserSignals(): PrivacySignals {
  try {
    return readPrivacySignals(navigator as NavigatorSignals, window as { doNotTrack?: unknown });
  } catch {
    return { gpc: false, dnt: false };
  }
}

/** True when this browser may send play data right now. Never throws (false on error). */
export function analyticsOn(): boolean {
  try {
    return analyticsAllowed(readAnalyticsChoice(), browserSignals(), currentAgeBand());
  } catch {
    return false;
  }
}

/** True when this browser may send an anonymous count right now (`countAllowed`). Never throws (false on error). */
export function countOn(): boolean {
  try {
    return countAllowed(readAnalyticsChoice(), browserSignals(), currentAgeBand());
  } catch {
    return false;
  }
}

/** This browser's visitor id, if analytics ever made one (null otherwise). */
export function storedVisitorId(): string | null {
  try {
    const id = storage()?.getItem(VISITOR_KEY) ?? null;
    return id && /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export interface PlayDataStatus {
  on: boolean;
  line: string;
  /** Under 13: On cannot be picked. */
  locked: boolean;
}

/** The switch's state and the line under it (Settings → Play data and the privacy page). */
export function playDataStatus(choice: AnalyticsChoice | null, signals: PrivacySignals, age: AgeBand | null): PlayDataStatus {
  const on = analyticsAllowed(choice, signals, age);
  if (age === 'child') return { on, locked: true, line: 'Off: nothing is sent for players under 13.' };
  if (on) return { on, locked: false, line: 'On: this browser sends anonymous play data.' };
  if (age === null && wouldSend(choice, signals)) {
    return {
      on,
      locked: false,
      line: 'Off until the game knows your age. Until then it only sends an anonymous count with no id: that the page opened, or failed to start. It asks once, when you first press Play or turn this on.',
    };
  }
  if (age === 'teen' && !choice) return { on, locked: false, line: 'Off: under 16 it starts off. You can turn it on.' };
  if (!choice) return { on, locked: false, line: 'Off: your browser asks sites not to track it, so nothing is sent.' };
  return { on, locked: false, line: 'Off: this browser sends nothing.' };
}
