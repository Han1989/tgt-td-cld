// Crash and error reports from the client, grouped for the dashboard. Pure.

import { BROWSER_LABELS, type Browser } from './channels';
import type { StoredEvent } from './summary';

export interface ErrorGroup {
  message: string;
  /** The first stack line (where it was thrown), or null when the browser gave none. */
  where: string | null;
  kind: 'error' | 'rejection';
  reports: number;
  sessions: number;
  builds: string[];
  browsers: string[];
  lastAt: number;
  /** The newest report's stack, as sent (trimmed by the client). */
  stack: string | null;
}

export interface ErrorSummary {
  reports: number;
  /** Sessions with at least one report. */
  sessions: number;
  groups: ErrorGroup[];
}

const MAX_GROUPS = 12;

export function summarizeErrors(events: readonly StoredEvent[]): ErrorSummary {
  const groups = new Map<string, ErrorGroup & { sessionIds: Set<string>; buildSet: Set<string>; browserSet: Set<Browser> }>();
  const sessions = new Set<string>();
  let reports = 0;
  for (const event of events) {
    if (event.t !== 'client_error' || !event.message) continue;
    reports++;
    sessions.add(event.session);
    const where = event.stack?.split('\n')[0] ?? null;
    const key = `${event.message}\n${where ?? ''}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        message: event.message,
        where,
        kind: event.kind ?? 'error',
        reports: 0,
        sessions: 0,
        builds: [],
        browsers: [],
        lastAt: event.at,
        stack: event.stack ?? null,
        sessionIds: new Set(),
        buildSet: new Set(),
        browserSet: new Set(),
      };
      groups.set(key, group);
    }
    group.reports++;
    group.sessionIds.add(event.session);
    if (event.build) group.buildSet.add(event.build);
    if (event.browser) group.browserSet.add(event.browser);
    if (event.at >= group.lastAt) {
      group.lastAt = event.at;
      group.stack = event.stack ?? group.stack;
    }
  }
  const list = [...groups.values()]
    .map(({ sessionIds, buildSet, browserSet, ...group }) => ({
      ...group,
      sessions: sessionIds.size,
      builds: [...buildSet].sort(),
      browsers: [...browserSet].map((b) => BROWSER_LABELS[b]).sort(),
    }))
    .sort((a, b) => b.sessions - a.sessions || b.reports - a.reports || b.lastAt - a.lastAt)
    .slice(0, MAX_GROUPS);
  return { reports, sessions: sessions.size, groups: list };
}
