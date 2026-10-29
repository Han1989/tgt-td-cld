// A day board's files (docs/DEPLOY.md, docs/ANALYTICS.md "Daily run", "Endless board"): per UTC day, each browser's
// best run and the day's counts (runs posted, verification failures, report mismatches). In memory, and as
// `<dir>/YYYY-MM-DD.json` in the analytics directory (the same `ANALYTICS_DIR` rule: `memory` keeps RAM only, unset a
// temp directory lost on deploy, a Render Disk survives). Files are kept 90 days: pruned at startup and every 24 hours
// with the event log. The Daily run's board (store.ts, `daily/`) and Endless's (../endless/store.ts, `endless/`) are
// two of these: what an entry holds and how two are ranked is theirs, the rest is here.

import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DAILY_KEY, dailyKey, dayNumber } from '@tdt/sim';
import { FORGOTTEN_MS, PRUNE_EVERY_MS, resolveAnalyticsDir, type AnalyticsLocation } from '../analytics/store';

/** Day files older than this many days are deleted. */
export const DAY_KEEP_DAYS = 90;

/** What every board keeps of a browser's best run of a day. The data key is never kept, only the id derived from it. */
export interface DayEntry {
  /** The visitor id derived from the data key (analytics/dataKey.ts). */
  visitor: string;
  name: string;
  /** When the best run was posted (server time, ms). */
  at: number;
}

export interface DayCounts {
  /** Runs posted and verified (a run that did not beat the browser's best counts too). */
  posts: number;
  /** Posts refused by the checks or the re-run. */
  failures: number;
  /** Verified posts whose own report or replay end did not match the server's re-run. */
  mismatches: number;
}

interface Day<E> extends DayCounts {
  entries: Map<string, E>;
}

/** One day's row on the analytics dashboard. */
export interface DayStat extends DayCounts {
  day: string;
  /** Browsers on the day's board. */
  players: number;
}

/** What a board is: its directory under the analytics directory, its entries' shape and its order. */
export interface DayBoard<E extends DayEntry> {
  dir: string;
  /** A stored entry back from a file (untrusted): null drops it. */
  parse(value: unknown): E | null;
  /** The board's order (negative: `a` ranks above `b`). */
  order(a: E, b: E): number;
}

function emptyDay<E>(): Day<E> {
  return { posts: 0, failures: 0, mismatches: 0, entries: new Map() };
}

const count = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0);

export function parseDayFile<E extends DayEntry>(value: unknown, parse: (entry: unknown) => E | null): Day<E> | null {
  const v = value as { posts?: unknown; failures?: unknown; mismatches?: unknown; entries?: unknown } | null;
  if (!v || typeof v !== 'object' || !Array.isArray(v.entries)) return null;
  const day = emptyDay<E>();
  day.posts = count(v.posts);
  day.failures = count(v.failures);
  day.mismatches = count(v.mismatches);
  for (const raw of v.entries) {
    const entry = parse(raw);
    if (entry) day.entries.set(entry.visitor, entry);
  }
  return day;
}

function serializeDay<E>(key: string, day: Day<E>): string {
  return JSON.stringify({
    day: key,
    posts: day.posts,
    failures: day.failures,
    mismatches: day.mismatches,
    entries: [...day.entries.values()],
  });
}

/** Days are kept while they are fewer than `DAY_KEEP_DAYS` days old. */
export function dayKept(key: string, now: number): boolean {
  const day = dayNumber(key);
  const today = dayNumber(dailyKey(now));
  return day !== null && today !== null && today - day < DAY_KEEP_DAYS;
}

/** The fields every entry has, checked on an entry read from a file. */
export function entryBase(value: unknown): DayEntry | null {
  const e = value as Partial<DayEntry> | null;
  if (!e || typeof e !== 'object' || typeof e.visitor !== 'string' || typeof e.name !== 'string') return null;
  if (typeof e.at !== 'number' || !Number.isFinite(e.at)) return null;
  return { visitor: e.visitor, name: e.name, at: e.at };
}

export class DayStore<E extends DayEntry> {
  readonly location: AnalyticsLocation;
  private dir: string | null = null;
  private days = new Map<string, Day<E>>();
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

  constructor(
    configuredDir: string,
    private readonly board: DayBoard<E>,
  ) {
    this.location = resolveAnalyticsDir(configuredDir);
  }

  /** Reads the day files and prunes old ones. Safe to call once at startup; never throws. */
  open(now = Date.now()): void {
    if (!this.location.dir) return;
    try {
      this.dir = path.join(this.location.dir, this.board.dir);
      mkdirSync(this.dir, { recursive: true });
      for (const name of readdirSync(this.dir)) {
        const key = name.endsWith('.json') ? name.slice(0, -5) : '';
        if (!DAILY_KEY.test(key)) continue;
        try {
          const day = parseDayFile(JSON.parse(readFileSync(path.join(this.dir, name), 'utf8')) as unknown, this.board.parse);
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
      this.diskError = err instanceof Error ? err.message : `could not open the ${this.board.dir} directory`;
    }
  }

  private day(key: string): Day<E> {
    let day = this.days.get(key);
    if (!day) {
      day = emptyDay();
      this.days.set(key, day);
    }
    return day;
  }

  /** The day's entries (empty for a day with none). */
  entries(key: string): E[] {
    return [...(this.days.get(key)?.entries.values() ?? [])];
  }

  /** The day keys held, oldest first. */
  protected dayKeys(): string[] {
    return [...this.days.keys()].sort();
  }

  /** This id's entry on a day, if any. */
  protected entryOn(key: string, visitor: string): E | undefined {
    return this.days.get(key)?.entries.get(visitor);
  }

  /**
   * A verified run: counted as a post, and kept as the browser's entry if it beats its best of the day (the board's
   * order). The name is updated either way. Returns whether it improved the best, or null when the id was just deleted.
   */
  record(key: string, entry: E, at = Date.now()): { improved: boolean; best: E } | null {
    if (this.isForgotten(entry.visitor, at)) return null;
    const day = this.day(key);
    day.posts++;
    const old = day.entries.get(entry.visitor);
    const improved = !old || this.board.order(entry, old) < 0;
    const best: E = improved || !old ? entry : { ...old, name: entry.name };
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
  stats(limit = 30): DayStat[] {
    return [...this.days.entries()]
      .filter(([, d]) => d.posts + d.failures > 0 || d.entries.size > 0)
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
      .slice(0, limit)
      .map(([day, d]) => ({ day, posts: d.posts, players: d.entries.size, failures: d.failures, mismatches: d.mismatches }));
  }

  /** Drops days that are `DAY_KEEP_DAYS` days old or more, and their files. */
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
