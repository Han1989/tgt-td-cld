// "Anonymous play data" on or off, for this browser (docs/ANALYTICS.md, privacy.html). Its own
// localStorage key, not `tdt.settings`: the privacy page writes it while a game tab may be open, and
// a game tab saving its settings must not put back an old choice. Every analytics post reads it
// first (session.ts `allowed`), so a change in any tab holds from the next event.

/** `on` / `off`; missing until the player picks one. */
export const ANALYTICS_KEY = 'tdt.analytics';
/** The random visitor id (install.ts). The privacy page shows it so a deletion request can name it. */
export const VISITOR_KEY = 'tdt.visitor';

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
 * Whether this browser sends play data. The player's own choice wins; with none, it is on unless the
 * browser sends Global Privacy Control or Do Not Track.
 */
export function analyticsAllowed(choice: AnalyticsChoice | null, signals: PrivacySignals): boolean {
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
    return analyticsAllowed(readAnalyticsChoice(), browserSignals());
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

/** The switch's state and the line under it (Settings → Play data and the privacy page). */
export function playDataStatus(choice: AnalyticsChoice | null, signals: PrivacySignals): { on: boolean; line: string } {
  const on = analyticsAllowed(choice, signals);
  if (on) return { on, line: 'On: this browser sends anonymous play data.' };
  if (!choice) return { on, line: 'Off: your browser asks sites not to track it, so nothing is sent.' };
  return { on, line: 'Off: this browser sends nothing.' };
}
