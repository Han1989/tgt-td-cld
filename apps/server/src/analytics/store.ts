// In-memory event log plus an append-only JSONL file when a directory is writable.
// An explicit ANALYTICS_DIR (a Render Disk) survives deploys. The default temp
// file does not. `memory` keeps RAM only. Beside the log: retention.json (retention.ts)
// and counts.json, the anonymous daily totals (counts.ts), which hold no id and no address.

import { appendFile, mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isChannel, isPlatform } from './channels';
import {
  addCount,
  emptyCounts,
  expireCounts,
  parseCounts,
  serializeCounts,
  type CountBody,
  type CountState,
} from './counts';
import { EVENT_TYPES, type ParsedEvent } from './parse';
import {
  emptyRetention,
  expireRetention,
  forgetVisitor,
  observe,
  parseRetention,
  serializeRetention,
  type RetentionState,
  type VisitorRecord,
} from './retention';
import { RETAIN_MS, type StoredEvent } from './summary';

function isStoredEvent(value: unknown): value is StoredEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as StoredEvent;
  return (
    typeof event.at === 'number' &&
    Number.isFinite(event.at) &&
    (EVENT_TYPES as readonly string[]).includes(event.t) &&
    typeof event.visitor === 'string' &&
    typeof event.session === 'string' &&
    isChannel(event.channel) &&
    isPlatform(event.platform)
  );
}

const FILE_NAME = 'events.jsonl';
/** First visits and daily return counts (retention.ts), beside the event log. */
const RETENTION_FILE = 'retention.json';
/** Anonymous daily totals (counts.ts): page opens and failed starts, no id. */
const COUNTS_FILE = 'counts.json';
/** Rewrite the file once it passes this, keeping only what is still in memory. */
const COMPACT_AT = 2_000_000;
const MAX_EVENTS = 20_000;
/** Drop events past RETAIN_MS and rewrite the file this often, whether or not anything was recorded. */
export const PRUNE_EVERY_MS = 24 * 60 * 60 * 1000;
/**
 * After a deletion, events for that id are dropped for this long: a heartbeat already in flight, or a game tab
 * that has not seen the new id yet, must not put the browser back. Memory only.
 */
export const FORGOTTEN_MS = 15 * 60 * 1000;

export interface AnalyticsLocation {
  /** Null when events stay in memory. */
  dir: string | null;
  /** True only for an explicit directory, not the temp fallback. */
  durable: boolean;
}

/** `memory` / `off` stay in RAM. Empty uses the system temp dir (lost on deploy). */
export function resolveAnalyticsDir(configured: string): AnalyticsLocation {
  const value = configured.trim();
  if (value === 'memory' || value === 'off') return { dir: null, durable: false };
  if (value === '') return { dir: path.join(tmpdir(), 'tdt-analytics'), durable: false };
  return { dir: value, durable: true };
}

export class AnalyticsStore {
  readonly location: AnalyticsLocation;
  private file: string | null = null;
  private retentionFile: string | null = null;
  private countsFile: string | null = null;
  private events: StoredEvent[] = [];
  private retention: RetentionState = emptyRetention();
  /** The retention table changed since it was last written. */
  private retentionDirty = false;
  /** Totals only: per UTC day, what, channel, platform and browser, how many. Nothing per request. */
  private counts: CountState = emptyCounts();
  private countsDirty = false;
  /** Lines waiting for the single writer. Kept separate so a compact cannot duplicate them. */
  private pending: StoredEvent[] = [];
  private writeChain: Promise<void> = Promise.resolve();
  private pruneTimer: NodeJS.Timeout | null = null;
  /** Deleted ids and when their events may be recorded again. */
  private forgotten = new Map<string, number>();
  persistent = false;
  diskError: string | null = null;

  constructor(configuredDir: string) {
    this.location = resolveAnalyticsDir(configuredDir);
  }

  /** Loads an existing file and rewrites it without expired lines. Safe to call once at startup; never throws. */
  open(): void {
    if (!this.location.dir) return;
    try {
      mkdirSync(this.location.dir, { recursive: true });
      this.file = path.join(this.location.dir, FILE_NAME);
      this.retentionFile = path.join(this.location.dir, RETENTION_FILE);
      this.countsFile = path.join(this.location.dir, COUNTS_FILE);
      try {
        this.retention = parseRetention(JSON.parse(readFileSync(this.retentionFile, 'utf8')) as unknown);
      } catch (err) {
        // Missing (first start) or torn: rebuilt from the event log below, as far as it reaches.
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT' && !(err instanceof SyntaxError)) throw err;
      }
      try {
        this.counts = parseCounts(JSON.parse(readFileSync(this.countsFile, 'utf8')) as unknown);
      } catch (err) {
        // Missing (first start) or torn: the totals start again; nothing else holds them.
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT' && !(err instanceof SyntaxError)) throw err;
      }
      this.countsDirty = true;
      let raw = '';
      try {
        raw = readFileSync(this.file, 'utf8');
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') throw err;
      }
      const now = Date.now();
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as unknown;
          if (isStoredEvent(parsed)) this.events.push(parsed);
        } catch {
          // A torn last line from a crash is skipped.
        }
      }
      // Replaying is idempotent, so this only fills in what the table missed (a crash before it was written).
      for (const event of [...this.events].sort((a, b) => a.at - b.at)) observe(this.retention, event);
      this.retentionDirty = true;
      this.persistent = true;
      this.prune(now);
    } catch (err) {
      this.persistent = false;
      this.file = null;
      this.diskError = err instanceof Error ? err.message : 'could not open the analytics directory';
    }
  }

  /** Keeps the event, unless its id was deleted in the last `FORGOTTEN_MS`. Returns whether it was kept. */
  record(event: ParsedEvent, at = Date.now()): boolean {
    if (this.isForgotten(event.visitor, at)) return false;
    const stored: StoredEvent = { ...event, at };
    this.events.push(stored);
    if (observe(this.retention, stored)) this.retentionDirty = true;
    this.trim(at);
    if (!this.file || !this.persistent) return true;
    this.pending.push(stored);
    this.enqueue(() => this.flushPending());
    return true;
  }

  /**
   * An anonymous count (a page open or a failed start): one more in that day's total. Nothing else about the request
   * is kept, and it never reaches the event log.
   */
  count(body: CountBody, at = Date.now()): void {
    addCount(this.counts, body, at);
    this.countsDirty = true;
    this.trim(at);
    if (!this.file || !this.persistent) return;
    // Queued writes run one at a time and skip when nothing changed, so a burst of counts writes the file a few times.
    this.enqueue(() => this.writeCounts());
  }

  /** The daily totals (read-only for the dashboard). */
  countTable(): CountState {
    return this.counts;
  }

  /**
   * A deletion request: every event and the retention line of this browser id, from memory and from
   * both files (rewritten at once). Events for the id are then dropped for `FORGOTTEN_MS`. Returns how
   * many events went.
   */
  forget(visitor: string, now = Date.now()): number {
    if (this.forgotten.size > 10_000) {
      for (const [id, until] of this.forgotten) if (until <= now) this.forgotten.delete(id);
    }
    this.forgotten.set(visitor, now + FORGOTTEN_MS);
    const before = this.events.length;
    this.events = this.events.filter((event) => event.visitor !== visitor);
    this.pending = this.pending.filter((event) => event.visitor !== visitor);
    const removed = before - this.events.length;
    if (forgetVisitor(this.retention, visitor)) this.retentionDirty = true;
    if (this.file && this.persistent) this.enqueue(() => this.compact());
    return removed;
  }

  /** A copy request: this browser id's events and retention line. */
  visitorData(visitor: string): { events: StoredEvent[]; retention: VisitorRecord | null } {
    const record = this.retention.visitors.get(visitor);
    return {
      events: this.events.filter((event) => event.visitor === visitor),
      retention: record ? { ...record } : null,
    };
  }

  private isForgotten(visitor: string, now: number): boolean {
    const until = this.forgotten.get(visitor);
    if (until === undefined) return false;
    if (until > now) return true;
    this.forgotten.delete(visitor);
    return false;
  }

  retentionTable(): RetentionState {
    return this.retention;
  }

  /** Drops events older than RETAIN_MS from memory and rewrites the file from memory, whatever its size. */
  prune(now = Date.now()): void {
    this.trim(now);
    if (!this.file || !this.persistent) return;
    this.enqueue(() => this.compact());
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

  all(): readonly StoredEvent[] {
    return this.events;
  }

  async flush(): Promise<void> {
    await this.writeChain;
  }

  private trim(now: number): void {
    const cutoff = now - RETAIN_MS;
    if (this.events.some((event) => event.at < cutoff)) {
      this.events = this.events.filter((event) => event.at >= cutoff);
    }
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    if (expireRetention(this.retention, now)) this.retentionDirty = true;
    if (expireCounts(this.counts, now)) this.countsDirty = true;
  }

  private enqueue(fn: () => Promise<void>): void {
    this.writeChain = this.writeChain.then(fn).catch((err: unknown) => {
      this.persistent = false;
      this.pending = [];
      this.diskError = err instanceof Error ? err.message : 'write failed';
    });
  }

  private async flushPending(): Promise<void> {
    if (!this.file || !this.persistent) return;
    const batch = this.pending;
    this.pending = [];
    if (batch.length === 0) return;
    await appendFile(this.file, batch.map((event) => JSON.stringify(event)).join('\n') + '\n', 'utf8');
    const info = await stat(this.file);
    if (info.size > COMPACT_AT) await this.compact();
    else await this.writeRetention();
  }

  /** Rewrites retention.json when it changed. It changes on a new browser, a return or a new day, not per heartbeat. */
  private async writeRetention(): Promise<void> {
    if (!this.retentionFile || !this.retentionDirty) return;
    this.retentionDirty = false;
    const tmp = `${this.retentionFile}.tmp`;
    await writeFile(tmp, JSON.stringify(serializeRetention(this.retention)), 'utf8');
    await rename(tmp, this.retentionFile);
  }

  /** Rewrites counts.json when the totals changed, the same way as retention.json. */
  private async writeCounts(): Promise<void> {
    if (!this.countsFile || !this.countsDirty) return;
    this.countsDirty = false;
    const tmp = `${this.countsFile}.tmp`;
    await writeFile(tmp, JSON.stringify(serializeCounts(this.counts)), 'utf8');
    await rename(tmp, this.countsFile);
  }

  private async compact(): Promise<void> {
    if (!this.file) return;
    // Snapshot first, then drop queued copies of those events so the next
    // append cannot write them again. Events recorded after this stay queued.
    const snapshot = this.events.slice();
    const written = new Set(snapshot);
    this.pending = this.pending.filter((event) => !written.has(event));
    const tmp = `${this.file}.tmp`;
    const body = snapshot.map((event) => JSON.stringify(event)).join('\n') + (snapshot.length ? '\n' : '');
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(tmp, body, 'utf8');
    await rename(tmp, this.file);
    this.retentionDirty = true;
    await this.writeRetention();
    await this.writeCounts();
  }
}
