// In-memory event log plus an append-only JSONL file when a directory is writable.
// An explicit ANALYTICS_DIR (a Render Disk) survives deploys. The default temp
// file does not. `memory` keeps RAM only.

import { appendFile, mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isChannel, isPlatform } from './channels';
import { EVENT_TYPES, type ParsedEvent } from './parse';
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
/** Rewrite the file once it passes this, keeping only what is still in memory. */
const COMPACT_AT = 2_000_000;
const MAX_EVENTS = 20_000;
/** Drop events past RETAIN_MS and rewrite the file this often, whether or not anything was recorded. */
export const PRUNE_EVERY_MS = 24 * 60 * 60 * 1000;

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
  private events: StoredEvent[] = [];
  /** Lines waiting for the single writer. Kept separate so a compact cannot duplicate them. */
  private pending: StoredEvent[] = [];
  private writeChain: Promise<void> = Promise.resolve();
  private pruneTimer: NodeJS.Timeout | null = null;
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
      this.persistent = true;
      this.prune(now);
    } catch (err) {
      this.persistent = false;
      this.file = null;
      this.diskError = err instanceof Error ? err.message : 'could not open the analytics directory';
    }
  }

  record(event: ParsedEvent, at = Date.now()): void {
    const stored: StoredEvent = { ...event, at };
    this.events.push(stored);
    this.trim(at);
    if (!this.file || !this.persistent) return;
    this.pending.push(stored);
    this.enqueue(() => this.flushPending());
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
  }
}
