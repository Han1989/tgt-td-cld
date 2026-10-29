// A record per hero, kept in this browser only (`tdt.record`; docs/GAME_DESIGN.md Decision Log, 28 Oct 2026): matches
// played, wins, the most Heart left in a won Full or Quick match on Normal (solo and co-op kept apart) and the best rank
// of a posted Daily run. Endless's best wave stays in `tdt.endlessBest` (endless/best.ts) and is read from there, never
// copied. Written at the end of every match from the host's report; never sent anywhere (no analytics event, nothing
// in a post). The rules are pure and tested; the store reads and writes localStorage inside try / catch (a private
// window may refuse it), and Settings → Your data's Delete my data clears it (analytics/myData.ts).

import { HERO_KINDS, type HeroKind, type MatchReport, type PlayerId } from '@tdt/protocol';

export const RECORD_KEY = 'tdt.record';

/** Where a best Heart was set: Full or Quick, alone or with friends (2 or 3 heroes). */
export const HEART_SLOTS = ['full-solo', 'full-coop', 'quick-solo', 'quick-coop'] as const;
export type HeartSlot = (typeof HEART_SLOTS)[number];

/** A posted Daily run's place on its day's board, as the post's answer gave it. */
export interface DailyRank {
  rank: number;
  total: number;
  day: string;
}

export interface HeroRecord {
  /** Finished matches (won or lost, any mode, solo or online). */
  played: number;
  wins: number;
  /** The most Heart left in a won Full or Quick match on Normal, per slot (a slot with no win has none). */
  heart: Partial<Record<HeartSlot, number>>;
  /** The best rank of a Daily run whose post went through, or null. */
  daily: DailyRank | null;
}

export interface PlayRecord {
  heroes: Partial<Record<HeroKind, HeroRecord>>;
  /** The last match counted (`matchKey`), so the same report read twice (a rejoin after the end) counts once. */
  last: string | null;
}

export const EMPTY_RECORD: PlayRecord = { heroes: {}, last: null };

/** A finished match's Heart against the slot's best before it. */
export interface HeartGain {
  slot: HeartSlot;
  heart: number;
  /** The slot's best before this match, or null on its first win. */
  previous: number | null;
  /** More Heart than every earlier win in the slot (the first win too). */
  isNew: boolean;
}

/** What a finished match changed for the player's hero. */
export interface MatchGain {
  hero: HeroKind;
  won: boolean;
  /** A won Full or Quick match on Normal, else null. */
  heart: HeartGain | null;
}

/** A posted Daily run's rank against the best before it. */
export interface DailyGain {
  rank: DailyRank;
  previous: DailyRank | null;
  /** A better place than every earlier post (the first post too). */
  isNew: boolean;
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function parseDaily(raw: unknown): DailyRank | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { rank, total, day } = raw as Record<string, unknown>;
  if (!isCount(rank) || rank < 1 || !isCount(total) || total < rank || !isDay(day)) return null;
  return { rank, total, day };
}

function parseHero(raw: unknown): HeroRecord | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const { played, wins } = data;
  if (!isCount(played) || played < 1 || !isCount(wins) || wins > played) return null;
  const heart: HeroRecord['heart'] = {};
  const stored = typeof data.heart === 'object' && data.heart !== null ? (data.heart as Record<string, unknown>) : {};
  for (const slot of HEART_SLOTS) {
    const value = stored[slot];
    if (isCount(value) && value >= 1) heart[slot] = value;
  }
  return { played, wins, heart, daily: parseDaily(data.daily) };
}

/** A stored value back to a record: unknown heroes and anything malformed are dropped, field by field. */
export function parseRecord(raw: string | null): PlayRecord {
  if (!raw) return EMPTY_RECORD;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return EMPTY_RECORD;
    const stored = (data as Record<string, unknown>).heroes;
    const heroes: PlayRecord['heroes'] = {};
    if (typeof stored === 'object' && stored !== null) {
      for (const kind of HERO_KINDS) {
        const hero = parseHero((stored as Record<string, unknown>)[kind]);
        if (hero) heroes[kind] = hero;
      }
    }
    const last = (data as Record<string, unknown>).last;
    return { heroes, last: typeof last === 'string' && last.length <= 120 ? last : null };
  } catch {
    return EMPTY_RECORD;
  }
}

/** The slot a match's Heart counts in: a won Full or Quick match on Normal (so never the Daily run, which is Hard). */
export function heartSlot(report: Pick<MatchReport, 'result' | 'difficulty' | 'mode' | 'heroes'>): HeartSlot | null {
  if (report.result !== 'victory' || report.difficulty !== 'normal') return null;
  if (report.mode !== 'full' && report.mode !== 'quick') return null;
  return `${report.mode}-${report.heroes.length > 1 ? 'coop' : 'solo'}`;
}

/** Tells one finished match from another: the same report read twice has the same key. */
export function matchKey(report: MatchReport): string {
  const kills = report.heroes.reduce((n, h) => n + h.kills, 0);
  return [report.seed, report.mode, report.result, report.wave, report.seconds, report.heartHp, kills].join(':');
}

const blank = (): HeroRecord => ({ played: 0, wins: 0, heart: {}, daily: null });

/**
 * The record once `me`'s hero finished the match `report` describes, and what it changed (null: `me` had no hero in
 * it, or this report was already counted).
 */
export function withMatch(record: PlayRecord, report: MatchReport, me: PlayerId | null): { record: PlayRecord; gain: MatchGain | null } {
  const mine = report.heroes.find((h) => h.player === me);
  const key = matchKey(report);
  if (!mine || record.last === key) return { record, gain: null };
  const before = record.heroes[mine.hero] ?? blank();
  const won = report.result === 'victory';
  const slot = heartSlot(report);
  let heart: HeartGain | null = null;
  const best = { ...before.heart };
  if (slot) {
    const previous = before.heart[slot] ?? null;
    const isNew = report.heartHp >= 1 && (previous === null || report.heartHp > previous);
    if (isNew) best[slot] = report.heartHp;
    heart = { slot, heart: report.heartHp, previous, isNew };
  }
  const after: HeroRecord = { ...before, played: before.played + 1, wins: before.wins + (won ? 1 : 0), heart: best };
  return { record: { heroes: { ...record.heroes, [mine.hero]: after }, last: key }, gain: { hero: mine.hero, won, heart } };
}

/** The record once `hero`'s Daily run was posted at `rank` (a better place is a smaller number). */
export function withDailyRank(record: PlayRecord, hero: HeroKind, rank: DailyRank): { record: PlayRecord; gain: DailyGain } {
  const before = record.heroes[hero] ?? null;
  const previous = before?.daily ?? null;
  const isNew = previous === null || rank.rank < previous.rank;
  if (!isNew) return { record, gain: { rank, previous, isNew } };
  // A rank posted before any match counted (a page reloaded at the end) still makes the hero's record.
  const after: HeroRecord = { ...(before ?? { ...blank(), played: 1 }), daily: rank };
  return { record: { ...record, heroes: { ...record.heroes, [hero]: after } }, gain: { rank, previous, isNew } };
}

/** The hero has won Full (solo or with friends): his button's star. */
export function wonFull(hero: HeroRecord | undefined): boolean {
  return hero?.heart['full-solo'] !== undefined || hero?.heart['full-coop'] !== undefined;
}

function readRecord(): PlayRecord {
  try {
    return parseRecord(localStorage.getItem(RECORD_KEY));
  } catch {
    return EMPTY_RECORD;
  }
}

function writeRecord(record: PlayRecord): void {
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(record));
  } catch {
    // ignore: the end screen still says it, the record is not kept
  }
}

/** Every hero's record in this browser. */
export function storedRecord(): PlayRecord {
  return readRecord();
}

/** Counts a finished match from the host's report, and says what it changed (null: nothing, see `withMatch`). */
export function recordMatch(report: MatchReport, me: PlayerId | null): MatchGain | null {
  const { record, gain } = withMatch(readRecord(), report, me);
  if (gain) writeRecord(record);
  return gain;
}

/** Counts a Daily run's rank from a post that went through, and says how it compares. */
export function recordDailyRank(hero: HeroKind, rank: DailyRank): DailyGain {
  const { record, gain } = withDailyRank(readRecord(), hero, rank);
  if (gain.isNew) writeRecord(record);
  return gain;
}
