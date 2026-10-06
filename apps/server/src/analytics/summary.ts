// Turns the event log into the four dashboard panels. Pure: the clock is passed in.

import { CHANNELS, CHANNEL_LABELS, PLATFORMS, PLATFORM_LABELS, type Channel, type Platform } from './channels';
import { summarizeErrors, type ErrorSummary } from './errors';
import { summarizeFunnel, type FunnelSummary } from './funnel';
import { summarizeMatches, type MatchBreakdown } from './matches';
import type { ParsedEvent } from './parse';
import {
  COHORT_KEEP_DAYS,
  cohortDays,
  DAY_MS,
  retentionFromEvents,
  retentionRates,
  utcDay,
  type CohortDay,
  type RetentionState,
} from './retention';

export { DAY_MS };

/** No heartbeat or end for this long and the session is over. Matches the client. */
export const IDLE_MS = 90_000;
/** A stuck tab cannot inflate playtime past this. */
export const MAX_SESSION_MS = 4 * 60 * 60 * 1000;
/** Events older than this are dropped. D30 reads the retention tables (retention.ts), not old events. */
export const RETAIN_MS = 30 * 24 * 60 * 60 * 1000;
/** Below this many ratings the dashboard tells Han to read match results as well. */
export const LOW_FEEDBACK = 5;

export interface StoredEvent extends ParsedEvent {
  at: number;
}

export interface Ratio {
  eligible: number;
  returned: number;
}

export interface ChannelRow {
  channel: Channel;
  label: string;
  sessions: number;
  visitors: number;
  avgPlaytimeMs: number | null;
  repeatVisitors: number;
  d1: Ratio;
  d7: Ratio;
  d30: Ratio;
  feedbackCount: number;
  feedbackAverage: number | null;
}

export interface AnalyticsSummary {
  generatedAt: number;
  /** A real directory was configured and is writable. Temp files are not durable. */
  durable: boolean;
  /** A file is being written (temp or durable). */
  persistent: boolean;
  dir: string | null;
  retentionDays: number;
  idleSec: number;
  connectedPlayers: number;
  activeSessions: number;
  sessionsToday: number;
  sessions7d: number;
  sessionStarts: number;
  visitors: number;
  repeatVisitors: number;
  avgPlaytimeMs: number | null;
  d1: Ratio;
  d7: Ratio;
  d30: Ratio;
  /** First-visit days the return rates cover. */
  cohortKeepDays: number;
  /** The newest first-visit days, newest first. */
  cohorts: CohortDay[];
  funnel: FunnelSummary;
  matches: MatchBreakdown;
  errors: ErrorSummary;
  feedback: {
    count: number;
    comments: number;
    average: number | null;
    histogram: [number, number, number, number, number];
    positive: number;
    mixed: number;
    negative: number;
    lowVolume: boolean;
  };
  outcomes: {
    matches: number;
    wins: number;
    losses: number;
    avgHeartOnWin: number | null;
    avgHeartPctOnWin: number | null;
    avgWaveOnLoss: number | null;
  };
  channels: ChannelRow[];
  platforms: { platform: Platform; label: string; sessions: number; visitors: number }[];
}

interface Session {
  id: string;
  visitor: string;
  channel: Channel;
  platform: Platform;
  startedAt: number;
  lastAt: number;
  endedAt: number | null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function buildSessions(events: readonly StoredEvent[]): Session[] {
  const byId = new Map<string, Session>();
  const ordered = [...events].sort((a, b) => a.at - b.at);
  for (const event of ordered) {
    let session = byId.get(event.session);
    if (!session) {
      session = {
        id: event.session,
        visitor: event.visitor,
        channel: event.channel,
        platform: event.platform,
        startedAt: event.at,
        lastAt: event.at,
        endedAt: null,
      };
      byId.set(event.session, session);
    }
    if (event.t === 'session_start') {
      // The first start wins. A duplicate POST must not move the clock or clear an end.
      session.lastAt = Math.max(session.lastAt, event.at);
    } else if (event.t === 'session_heartbeat') {
      session.lastAt = Math.max(session.lastAt, event.at);
      // A heartbeat after an end means the tab came back (mobile pagehide).
      if (session.endedAt !== null && event.at >= session.endedAt) session.endedAt = null;
    } else if (event.t === 'session_end') {
      session.endedAt = session.endedAt === null ? event.at : Math.max(session.endedAt, event.at);
      session.lastAt = Math.max(session.lastAt, event.at);
    } else {
      session.lastAt = Math.max(session.lastAt, event.at);
    }
    if (event.at < session.startedAt) session.startedAt = event.at;
  }
  return [...byId.values()];
}

function closedDuration(session: Session, now: number): { closed: boolean; ms: number } {
  const idle = now - session.lastAt > IDLE_MS;
  const closed = session.endedAt !== null || idle;
  const end = session.endedAt !== null ? session.endedAt : idle ? session.lastAt : now;
  const ms = Math.max(0, Math.min(MAX_SESSION_MS, end - session.startedAt));
  return { closed, ms };
}

/**
 * `retention` is the store's table (first visits that outlive the 30-day log); without it the table is
 * rebuilt from `events`, which only sees first visits still in the log.
 */
export function summarize(
  events: readonly StoredEvent[],
  now: number,
  live: { connectedPlayers: number; persistent: boolean; durable: boolean; dir: string | null },
  retention?: RetentionState,
): AnalyticsSummary {
  const recent = events.filter((event) => now - event.at <= RETAIN_MS && event.at <= now + 60_000);
  const table = retention ?? retentionFromEvents(recent);
  const firstSessions = new Map<string, string>();
  for (const [id, record] of table.visitors) firstSessions.set(id, record.session);
  const sessions = buildSessions(recent);
  const today = utcDay(now);
  const weekAgo = now - 7 * DAY_MS;

  let activeSessions = 0;
  let sessionsToday = 0;
  let sessions7d = 0;
  const playtimes: number[] = [];
  const playtimeByChannel = new Map<Channel, number[]>();
  const visitors = new Map<string, { firstAt: number; firstChannel: Channel; sessions: number }>();
  const platformSessions = new Map<Platform, Set<string>>();
  const platformVisitors = new Map<Platform, Set<string>>();
  for (const platform of PLATFORMS) {
    platformSessions.set(platform, new Set());
    platformVisitors.set(platform, new Set());
  }

  for (const session of sessions) {
    const span = closedDuration(session, now);
    if (!span.closed && now - session.lastAt <= IDLE_MS) activeSessions++;
    if (utcDay(session.startedAt) === today) sessionsToday++;
    if (session.startedAt >= weekAgo) sessions7d++;
    if (span.closed) {
      playtimes.push(span.ms);
      const list = playtimeByChannel.get(session.channel) ?? [];
      list.push(span.ms);
      playtimeByChannel.set(session.channel, list);
    }
    const visitor = visitors.get(session.visitor) ?? {
      firstAt: session.startedAt,
      firstChannel: session.channel,
      sessions: 0,
    };
    if (session.startedAt < visitor.firstAt) {
      visitor.firstAt = session.startedAt;
      visitor.firstChannel = session.channel;
    }
    visitor.sessions++;
    visitors.set(session.visitor, visitor);
    platformSessions.get(session.platform)?.add(session.id);
    platformVisitors.get(session.platform)?.add(session.visitor);
  }

  const histogram: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let comments = 0;
  let positive = 0;
  let mixed = 0;
  let negative = 0;
  const ratings: number[] = [];
  const ratingsByChannel = new Map<Channel, number[]>();
  let wins = 0;
  let losses = 0;
  const hearts: number[] = [];
  const heartPct: number[] = [];
  const lossWaves: number[] = [];

  for (const event of recent) {
    if (event.t === 'feedback' && event.rating !== undefined) {
      ratings.push(event.rating);
      histogram[event.rating - 1]!++;
      if (event.comment) comments++;
      if (event.rating >= 4) positive++;
      else if (event.rating <= 2) negative++;
      else mixed++;
      const list = ratingsByChannel.get(event.channel) ?? [];
      list.push(event.rating);
      ratingsByChannel.set(event.channel, list);
    }
    if (event.t === 'match_end' && event.result) {
      if (event.result === 'victory') {
        wins++;
        if (event.heartHp !== undefined) hearts.push(event.heartHp);
        if (event.heartHp !== undefined && event.heartMax) heartPct.push(event.heartHp / event.heartMax);
      } else {
        losses++;
        if (event.wave !== undefined) lossWaves.push(event.wave);
      }
    }
  }

  const byFirstChannel = new Map<Channel, Map<string, { sessions: number }>>();
  for (const channel of CHANNELS) byFirstChannel.set(channel, new Map());
  for (const [id, visitor] of visitors) {
    byFirstChannel.get(visitor.firstChannel)?.set(id, { sessions: visitor.sessions });
  }
  const overall = retentionRates(table, now);

  const channels: ChannelRow[] = CHANNELS.map((channel) => {
    const group = byFirstChannel.get(channel)!;
    let repeat = 0;
    for (const visitor of group.values()) if (visitor.sessions >= 2) repeat++;
    const channelSessions = sessions.filter((session) => session.channel === channel);
    const rates = retentionRates(table, now, channel);
    return {
      channel,
      label: CHANNEL_LABELS[channel],
      sessions: channelSessions.length,
      // Visitors, repeats and return rates are the first-session cohort for this channel.
      visitors: group.size,
      avgPlaytimeMs: average(playtimeByChannel.get(channel) ?? []),
      repeatVisitors: repeat,
      d1: rates.d1,
      d7: rates.d7,
      d30: rates.d30,
      feedbackCount: (ratingsByChannel.get(channel) ?? []).length,
      feedbackAverage: average(ratingsByChannel.get(channel) ?? []),
    };
  });

  let repeatVisitors = 0;
  for (const visitor of visitors.values()) if (visitor.sessions >= 2) repeatVisitors++;

  return {
    generatedAt: now,
    durable: live.durable,
    persistent: live.persistent,
    dir: live.dir,
    retentionDays: 30,
    idleSec: IDLE_MS / 1000,
    connectedPlayers: live.connectedPlayers,
    activeSessions,
    sessionsToday,
    sessions7d,
    sessionStarts: sessions.length,
    visitors: visitors.size,
    repeatVisitors,
    avgPlaytimeMs: average(playtimes),
    d1: overall.d1,
    d7: overall.d7,
    d30: overall.d30,
    cohortKeepDays: COHORT_KEEP_DAYS,
    cohorts: cohortDays(table, now, 10),
    funnel: summarizeFunnel(recent, firstSessions),
    matches: summarizeMatches(recent),
    errors: summarizeErrors(recent),
    feedback: {
      count: ratings.length,
      comments,
      average: average(ratings),
      histogram,
      positive,
      mixed,
      negative,
      lowVolume: ratings.length < LOW_FEEDBACK,
    },
    outcomes: {
      matches: wins + losses,
      wins,
      losses,
      avgHeartOnWin: average(hearts),
      avgHeartPctOnWin: average(heartPct),
      avgWaveOnLoss: average(lossWaves),
    },
    channels,
    platforms: PLATFORMS.map((platform) => ({
      platform,
      label: PLATFORM_LABELS[platform],
      sessions: platformSessions.get(platform)!.size,
      visitors: platformVisitors.get(platform)!.size,
    })),
  };
}
