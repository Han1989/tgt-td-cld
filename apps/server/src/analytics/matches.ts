// Match results broken down for the dashboard. Pure.

import { HERO_KINDS } from '@tdt/protocol';
import { CHANNELS, CHANNEL_LABELS } from './channels';
import type { StoredEvent } from './summary';

export interface MatchRow {
  label: string;
  matches: number;
  wins: number;
  /** Mean wave reached (the wave the match ended on). */
  avgWave: number | null;
  /** Mean match length in seconds, over the reports that carried one. */
  avgDurationSec: number | null;
}

export interface MatchBreakdown {
  /** `match_start` events: matches begun, finished or not. */
  started: number;
  finished: number;
  byMode: MatchRow[];
  byPlayers: MatchRow[];
  byHero: MatchRow[];
  byChannel: MatchRow[];
}

const HERO_LABELS: Record<(typeof HERO_KINDS)[number], string> = {
  ranger: 'Ranger',
  warden: 'Warden',
  arcanist: 'Arcanist',
};

interface Acc {
  matches: number;
  wins: number;
  waves: number[];
  durations: number[];
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, n) => sum + n, 0) / values.length;
}

function rows(order: readonly string[], labels: (key: string) => string, acc: Map<string, Acc>, keepEmpty: boolean): MatchRow[] {
  const keys = [...order, ...[...acc.keys()].filter((key) => !order.includes(key))];
  return keys
    .map((key) => {
      const a = acc.get(key) ?? { matches: 0, wins: 0, waves: [], durations: [] };
      return { label: labels(key), matches: a.matches, wins: a.wins, avgWave: mean(a.waves), avgDurationSec: mean(a.durations) };
    })
    .filter((row) => keepEmpty || row.matches > 0);
}

export function summarizeMatches(events: readonly StoredEvent[]): MatchBreakdown {
  const byMode = new Map<string, Acc>();
  const byPlayers = new Map<string, Acc>();
  const byHero = new Map<string, Acc>();
  const byChannel = new Map<string, Acc>();
  let started = 0;
  let finished = 0;
  const add = (map: Map<string, Acc>, key: string, event: StoredEvent) => {
    const a = map.get(key) ?? { matches: 0, wins: 0, waves: [], durations: [] };
    a.matches++;
    if (event.result === 'victory') a.wins++;
    if (event.wave !== undefined) a.waves.push(event.wave);
    if (event.durationSec !== undefined) a.durations.push(event.durationSec);
    map.set(key, a);
  };
  for (const event of events) {
    if (event.t === 'match_start') started++;
    if (event.t !== 'match_end' || !event.result) continue;
    finished++;
    add(byMode, `${event.mode ?? '?'}|${event.difficulty ?? '?'}`, event);
    add(byPlayers, `${event.players ?? '?'}|${event.online === undefined ? '?' : event.online ? 'online' : 'solo'}`, event);
    if (event.hero) add(byHero, event.hero, event);
    add(byChannel, event.channel, event);
  }
  const modeLabel = (key: string) => {
    const [mode, difficulty] = key.split('|');
    const m = mode === 'full' ? 'Full' : mode === 'quick' ? 'Quick' : '?';
    const d = difficulty === 'normal' ? 'Normal' : difficulty === 'hard' ? 'Hard' : 'difficulty not sent';
    return `${m} · ${d}`;
  };
  const playersLabel = (key: string) => {
    const [players, where] = key.split('|');
    const n = players === '1' ? '1 player' : `${players} players`;
    return where === 'online' ? `${n}, room` : where === 'solo' ? `${n}, solo` : n;
  };
  return {
    started,
    finished,
    byMode: rows(['full|normal', 'full|hard', 'quick|normal', 'quick|hard'], modeLabel, byMode, false),
    byPlayers: rows(['1|solo', '1|online', '2|online', '3|online'], playersLabel, byPlayers, false),
    byHero: rows(HERO_KINDS, (key) => HERO_LABELS[key as keyof typeof HERO_LABELS] ?? key, byHero, false),
    byChannel: rows(CHANNELS, (key) => CHANNEL_LABELS[key as keyof typeof CHANNEL_LABELS] ?? key, byChannel, false),
  };
}
