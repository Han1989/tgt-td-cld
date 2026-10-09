// Where new players stop: what each browser did in its first session. Pure.

import { CHANNELS, CHANNEL_LABELS, type Channel, type FunnelStep } from './channels';
import type { StoredEvent } from './summary';

/** The main funnel, in order. Every step but `landing` and `second_match` is an event the client sends. */
export const FUNNEL = ['landing', 'lobby', 'match_start', 'wave_3', 'wave_5', 'wave_10', 'match_end', 'second_match'] as const;
export type FunnelStage = (typeof FUNNEL)[number];

export const FUNNEL_LABELS: Record<FunnelStage, string> = {
  landing: 'Opened the game',
  lobby: 'Saw the lobby',
  match_start: 'Started a match',
  wave_3: 'Reached wave 3',
  wave_5: 'Reached wave 5',
  wave_10: 'Reached wave 10',
  match_end: 'Finished a match (won or lost)',
  second_match: 'Started a second match',
};

/** The steps of the per-link table, in order: the funnel from a match on. */
export const CHANNEL_FUNNEL = ['match_start', 'wave_5', 'match_end', 'second_match'] as const satisfies readonly FunnelStage[];
export type ChannelFunnelStage = (typeof CHANNEL_FUNNEL)[number];

/** The first-match lesson (solo only), in order. `move` is its first card, so reaching it means it started. */
export const LESSON = [
  'tutorial_move',
  'tutorial_build',
  'tutorial_cast',
  'tutorial_upgrade',
  'tutorial_ping',
  'tutorial_emote',
  'tutorial_done',
] as const satisfies readonly FunnelStep[];
export type LessonStage = (typeof LESSON)[number];

export const LESSON_LABELS: Record<LessonStage | 'tutorial_skip', string> = {
  tutorial_move: 'Lesson: move',
  tutorial_build: 'Lesson: build',
  tutorial_cast: 'Lesson: cast Q',
  tutorial_upgrade: 'Lesson: upgrade',
  tutorial_ping: 'Lesson: ping',
  tutorial_emote: 'Lesson: quick-chat',
  tutorial_done: 'Lesson finished',
  tutorial_skip: 'Skipped the lesson',
};

export interface FunnelRow {
  stage: FunnelStage;
  label: string;
  /** New players who did this in their first session. */
  reached: number;
  /** New players whose furthest step was this one. */
  stopped: number;
}

export interface LessonRow {
  stage: LessonStage | 'tutorial_skip';
  label: string;
  reached: number;
}

export interface ChannelFunnelStep {
  stage: ChannelFunnelStage;
  label: string;
  /** This channel's new players who did this in their first session. */
  reached: number;
  /** `reached` over the channel's new players, 0–1. */
  share: number;
}

export interface ChannelFunnelRow {
  /** The channel of the first session. */
  channel: Channel;
  label: string;
  newPlayers: number;
  steps: ChannelFunnelStep[];
}

export interface FunnelSummary {
  /** Browsers whose first session is in the event window. */
  newPlayers: number;
  rows: FunnelRow[];
  /** The step most new players stopped after, the last step aside; null with no new players. */
  biggestStop: FunnelStage | null;
  lesson: LessonRow[];
  /** One row per channel that has new players, in `CHANNELS` order. */
  byChannel: ChannelFunnelRow[];
}

/**
 * `firstSessions` maps a browser to its first session (the retention table's). Only browsers whose
 * first session opened in `events` count: one whose first visit has been pruned is not new. `byChannel`
 * puts each browser under the channel of that first session.
 */
export function summarizeFunnel(events: readonly StoredEvent[], firstSessions: ReadonlyMap<string, string>): FunnelSummary {
  const steps = new Map<string, Set<string>>();
  const matches = new Map<string, number>();
  const channels = new Map<string, Channel>();
  for (const event of events) {
    if (firstSessions.get(event.visitor) !== event.session) continue;
    let reached = steps.get(event.visitor);
    if (!reached) {
      reached = new Set();
      steps.set(event.visitor, reached);
    }
    if (event.t === 'session_start') {
      reached.add('landing');
      if (!channels.has(event.visitor)) channels.set(event.visitor, event.channel);
    } else if (event.t === 'match_end') reached.add('match_end');
    else if (event.t === 'match_start') {
      const count = (matches.get(event.visitor) ?? 0) + 1;
      matches.set(event.visitor, count);
      reached.add('match_start');
      if (count >= 2) reached.add('second_match');
    } else if (event.t === 'funnel' && event.step) reached.add(event.step);
  }

  const rows: FunnelRow[] = FUNNEL.map((stage) => ({ stage, label: FUNNEL_LABELS[stage], reached: 0, stopped: 0 }));
  const lesson: LessonRow[] = [...LESSON, 'tutorial_skip' as const].map((stage) => ({
    stage,
    label: LESSON_LABELS[stage],
    reached: 0,
  }));
  const perChannel = new Map<Channel, { newPlayers: number; reached: number[] }>();
  let newPlayers = 0;
  for (const [visitor, reached] of steps) {
    if (!reached.has('landing')) continue;
    newPlayers++;
    let furthest = 0;
    FUNNEL.forEach((stage, index) => {
      if (!reached.has(stage)) return;
      rows[index]!.reached++;
      furthest = index;
    });
    rows[furthest]!.stopped++;
    for (const row of lesson) if (reached.has(row.stage)) row.reached++;
    const channel = channels.get(visitor)!;
    let group = perChannel.get(channel);
    if (!group) {
      group = { newPlayers: 0, reached: CHANNEL_FUNNEL.map(() => 0) };
      perChannel.set(channel, group);
    }
    group.newPlayers++;
    CHANNEL_FUNNEL.forEach((stage, index) => {
      if (reached.has(stage)) group.reached[index]!++;
    });
  }
  const byChannel: ChannelFunnelRow[] = [];
  for (const channel of CHANNELS) {
    const group = perChannel.get(channel);
    if (!group) continue;
    byChannel.push({
      channel,
      label: CHANNEL_LABELS[channel],
      newPlayers: group.newPlayers,
      steps: CHANNEL_FUNNEL.map((stage, index) => ({
        stage,
        label: FUNNEL_LABELS[stage],
        reached: group.reached[index]!,
        share: group.reached[index]! / group.newPlayers,
      })),
    });
  }

  let biggestStop: FunnelStage | null = null;
  let most = 0;
  for (const row of rows.slice(0, -1)) {
    if (row.stopped > most) {
      most = row.stopped;
      biggestStop = row.stage;
    }
  }
  return { newPlayers, rows, biggestStop, lesson, byChannel };
}
