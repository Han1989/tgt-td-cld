// The Daily run's day files (docs/DEPLOY.md, docs/ANALYTICS.md "Daily run"): per UTC day, each browser's best run and
// the day's counts (runs posted, verification failures, report mismatches). In memory, and as `daily/YYYY-MM-DD.json`
// in the analytics directory (the same `ANALYTICS_DIR` rule: `memory` keeps RAM only, unset a temp directory lost on
// deploy, a Render Disk survives). Files are kept 90 days: pruned at startup and every 24 hours with the event log.

import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HERO_KINDS } from '@tdt/protocol';
import { DAILY_KEY, dailyKey, dayNumber, rankOrder } from '@tdt/sim';
import { FORGOTTEN_MS, PRUNE_EVERY_MS, resolveAnalyticsDir, type AnalyticsLocation } from '../analytics/store';
import { bestRun, type BestRun, type DailyEntry } from './board';

/** Day files older than this many days are deleted. */
export const DAILY_KEEP_DAYS = 90;
/** The directory under the analytics directory. */
export const DAILY_DIR = 'daily';

export interface DayCounts {
  /** Runs posted and verified (a run that did not beat the browser's best counts too). */
  posts: number;
  /** Posts refused by the checks or the re-run. */
  failures: number;
  /** Verified posts whose own report or replay end did not match the server's re-run. */
  mismatches: number;
}

interface Day extends DayCounts {
  entries: Map<string, DailyEntry>;
}

/** One day's row on the analytics dashboard. */
export interface DailyDayStat extends DayCounts {
  day: string;
  /** Browsers on the day's board. */
  players: number;
}

function emptyDay(): Day {
  return { posts: 0, failures: 0, mismatches: 0, entries: new Map() };
}

const count = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0);

function parseEntry(value: unknown): DailyEntry | null {
  const e = value as Partial<DailyEntry> | null;
  if (!e || typeof e !== 'object') return null;
  if (typeof e.visitor !== 'string' || typeof e.name !== 'string' || !HERO_KINDS.includes(e.hero as never)) return null;
  if (typeof e.won !== 'boolean') return null;
  for (const n of [e.heart, e.wave, e.ticks, e.at]) if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return { visitor: e.visitor, name: e.name, hero: e.hero!, won: e.won, heart: e.heart!, wave: e.wave!, ticks: e.ticks!, at: e.at! };
}

export function parseDayFile(value: unknown): Day | null {
  const v = value as { posts?: unknown; failures?: unknown; mismatches?: unknown; entries?: unknown } | null;
  if (!v || typeof v !== 'object' || !Array.isArray(v.entries)) return null;
  const day = emptyDay();
  day.posts = count(v.posts);
  day.failures = count(v.failures);
  day.mismatches = count(v.mismatches);
  for (const raw of v.entries) {
    const entry = parseEntry(raw);
    if (entry) day.entries.set(entry.visitor, entry);
  }
  return day;
}

function serializeDay(key: string, day: Day): string {
  return JSON.stringify({
    day: key,
    posts: day.posts,
    failures: day.failures,
    mismatches: day.mismatches,
    entries: [...day.entries.values()],
  });
}

/** Days are kept while they are fewer than `DAILY_KEEP_DAYS` days old. */
export function dayKept(key: string, now: number): boolean {
  const day = dayNumber(key);
  const today = dayNumber(dailyKey(now));
  return day !== null && today !== null && today - day < DAILY_KEEP_DAYS;
}

export class DailyStore {
  readonly location: AnalyticsLocation;
  private dir: string | null = null;
  private days = new Map<string, Day>();
  /** Days changed since they were written. */
  private dirty = new Set<string>();
  /** Day files to delete (pruned days). */
  private gone = new Set<string>();
  private writeChain: Promise<void> = Promise.resolve();
  private pruneTimer: NodeJS.Timeout | null = null;
  /** Deleted ids and until when their posts are refused, so a run already in the queue cannot put one back. */
  private forgotten = new Map<string, number>();
  persistent = false;
  diskError: string | null = null;

  constructor(configuredDir: string) {
    this.location = resolveAnalyticsDir(configuredDir);
  }

  /** Reads the day files and prunes old ones. Safe to call once at startup; never throws. */
  open(now = Date.now()): void {
    if (!this.location.dir) return;
    try {
      this.dir = path.join(this.location.dir, DAILY_DIR);
      mkdirSync(this.dir, { recursive: true });
      for (const name of readdirSync(this.dir)) {
        const key = name.endsWith('.json') ? name.slice(0, -5) : '';
        if (!DAILY_KEY.test(key)) continue;
        try {
          const day = parseDayFile(JSON.parse(readFileSync(path.join(this.dir, name), 'utf8')) as unknown);
          if (day) this.days.set(key, day);
        } catch {
          // A torn file from a crash: that day starts again.
        }
      }
      this.persistent = true;
      this.prune(now);
    } catch (err) {
      this.persistent = false;
      this.dir = null;
      this.diskError = err instanceof Error ? err.message : 'could not open the daily directory';
    }
  }

  private day(key: string): Day {
    let day = this.days.get(key);
    if (!day) {
      day = emptyDay();
      this.days.set(key, day);
    }
    return day;
  }

  /** The day's entries (empty for a day with none). */
  entries(key: string): DailyEntry[] {
    return [...(this.days.get(key)?.entries.values() ?? [])];
  }

  /**
   * A verified run: counted as a post, and kept as the browser's entry if it beats its best of the day (`rankOrder`).
   * The name is updated either way. Returns whether it improved the best, or null when the id was just deleted.
   */
  record(key: string, entry: DailyEntry, at = Date.now()): { improved: boolean; best: DailyEntry } | null {
    if (this.isForgotten(entry.visitor, at)) return null;
    const day = this.day(key);
    day.posts++;
    const old = day.entries.get(entry.visitor);
    const improved = !old || rankOrder(entry, old) < 0;
    const best: DailyEntry = improved || !old ? entry : { ...old, name: entry.name };
    day.entries.set(entry.visitor, best);
    this.changed(key);
    return { improved, best };
  }

  /** A post the checks or the re-run refused. */
  failed(key: string): void {
    this.day(key).failures++;
    this.changed(key);
  }

  /** A verified post whose own report did not match the re-run (the server's result stood). */
  mismatched(key: string): void {
    this.day(key).mismatches++;
    this.changed(key);
  }

  /** Every day's entry of this browser id, oldest day first (a copy request). */
  visitorRuns(visitor: string): (BestRun & { day: string; name: string; at: number })[] {
    return [...this.days.keys()]
      .sort()
      .flatMap((key) => {
        const e = this.days.get(key)!.entries.get(visitor);
        return e ? [{ day: key, name: e.name, at: e.at, ...bestRun(e) }] : [];
      });
  }

  /** This browser's best run over the days kept, and its day; null if it has none. */
  personalBest(visitor: string): (BestRun & { day: string }) | null {
    let best: (BestRun & { day: string }) | null = null;
    for (const [key, day] of this.days) {
      const e = day.entries.get(visitor);
      if (e && (!best || rankOrder(e, best) < 0 || (rankOrder(e, best) === 0 && key > best.day))) best = { day: key, ...bestRun(e) };
    }
    return best;
  }

  /**
   * A deletion request: this id's entry on every day kept, from memory and the files (rewritten at once). Its posts
   * are refused for `FORGOTTEN_MS`. Returns how many entries went.
   */
  forget(visitor: string, now = Date.now()): number {
    if (this.forgotten.size > 10_000) {
      for (const [id, until] of this.forgotten) if (until <= now) this.forgotten.delete(id);
    }
    this.forgotten.set(visitor, now + FORGOTTEN_MS);
    let removed = 0;
    for (const [key, day] of this.days) {
      if (day.entries.delete(visitor)) {
        removed++;
        this.changed(key);
      }
    }
    return removed;
  }

  private isForgotten(visitor: string, now: number): boolean {
    const until = this.forgotten.get(visitor);
    if (until === undefined) return false;
    if (until > now) return true;
    this.forgotten.delete(visitor);
    return false;
  }

  /** The dashboard's rows: the newest `limit` days with anything posted or refused, newest first. */
  stats(limit = 30): DailyDayStat[] {
    return [...this.days.entries()]
      .filter(([, d]) => d.posts + d.failures > 0 || d.entries.size > 0)
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
      .slice(0, limit)
      .map(([day, d]) => ({ day, posts: d.posts, players: d.entries.size, failures: d.failures, mismatches: d.mismatches }));
  }

  /** Drops days that are `DAILY_KEEP_DAYS` days old or more, and their files. */
  prune(now = Date.now()): void {
    for (const key of [...this.days.keys()]) {
      if (dayKept(key, now)) continue;
      this.days.delete(key);
      this.dirty.delete(key);
      this.gone.add(key);
    }
    // Files of days that never made it into memory (torn) go too.
    if (this.dir) {
      try {
        for (const name of readdirSync(this.dir)) {
          const key = name.endsWith('.json') ? name.slice(0, -5) : '';
          if (DAILY_KEY.test(key) && !dayKept(key, now)) this.gone.add(key);
        }
      } catch {
        // The directory went away: the next write says so.
      }
    }
    if (this.gone.size > 0) this.enqueue();
  }

  /** Prunes every `everyMs` until `stopPruning`. The timer does not keep the process alive. */
  startPruning(everyMs = PRUNE_EVERY_MS, clock: () => number = Date.now): void {
    this.stopPruning();
    this.pruneTimer = setInterval(() => this.prune(clock()), everyMs);
    this.pruneTimer.unref();
  }

  stopPruning(): void {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.pruneTimer = null;
  }

  async flush(): Promise<void> {
    await this.writeChain;
  }

  private changed(key: string): void {
    this.dirty.add(key);
    this.enqueue();
  }

  private enqueue(): void {
    if (!this.dir || !this.persistent) {
      this.dirty.clear();
      this.gone.clear();
      return;
    }
    this.writeChain = this.writeChain.then(() => this.write()).catch((err: unknown) => {
      this.persistent = false;
      this.diskError = err instanceof Error ? err.message : 'write failed';
    });
  }

  /** Writes every changed day (a temp file, then a rename) and deletes pruned ones. Skips when nothing changed. */
  private async write(): Promise<void> {
    const dir = this.dir;
    if (!dir || !this.persistent) return;
    const keys = [...this.dirty];
    const gone = [...this.gone];
    this.dirty.clear();
    this.gone.clear();
    if (keys.length === 0 && gone.length === 0) return;
    await mkdir(dir, { recursive: true });
    for (const key of keys) {
      const day = this.days.get(key);
      if (!day) continue;
      const file = path.join(dir, `${key}.json`);
      await writeFile(`${file}.tmp`, serializeDay(key, day), 'utf8');
      await rename(`${file}.tmp`, file);
    }
    for (const key of gone) {
      await unlink(path.join(dir, `${key}.json`)).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') throw err;
      });
    }
  }
}
