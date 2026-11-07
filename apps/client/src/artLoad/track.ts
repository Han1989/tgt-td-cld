// Where each of the match's pictures is (V-07d; V-08b load-all): the map plate's, the HUD frames' and the 3D sheets'
// loaders report here as their bytes come in and when they are in, so a match can wait for every one of them and the
// bar can say how far along they are (rules.ts, read each frame by gate.ts). Nothing here decides anything.

import { ART_RETRIES, downloadMoving, retryDelayMs, type SheetId, type SheetProgress } from './rules';

const sheets = new Map<SheetId, SheetProgress>();
/** When bytes of any picture last arrived (performance.now()), for the start-up watchdog. */
let lastBytesAt: number | null = null;

/** Where a picture is (idle until its loader starts). */
export function sheetProgress(id: SheetId): SheetProgress {
  return sheets.get(id) ?? { status: 'idle', received: 0, expected: null };
}

/** A picture this build does not load (the browser tests' `?towers2d`, `?creeps2d`, `?ui2d`): never awaited. */
export function sheetOff(id: SheetId): void {
  if (sheetProgress(id).status === 'idle') sheets.set(id, { status: 'off', received: 0, expected: null });
}

/** A download is under way and its bytes are still coming (the start-up watchdog does not fire over one). */
export function artDownloadMoving(now = performance.now()): boolean {
  return [...sheets.values()].some((p) => p.status === 'loading') && downloadMoving(lastBytesAt, now);
}

/** A loader's handle on its picture: the bytes as they come, then in or failed. */
export interface SheetTrack {
  bytes(received: number, expected: number | null): void;
  done(ok: boolean): void;
}

/** Starts tracking a picture's download (its loader calls this when it starts, and again on a Retry). */
export function trackSheet(id: SheetId): SheetTrack {
  sheets.set(id, { status: 'loading', received: 0, expected: null });
  return {
    bytes: (received, expected) => {
      lastBytesAt = performance.now();
      sheets.set(id, { status: 'loading', received, expected });
    },
    done: (ok) => {
      const p = sheetProgress(id);
      sheets.set(id, { status: ok ? 'in' : 'failed', received: ok ? (p.expected ?? p.received) : p.received, expected: p.expected });
    },
  };
}

export interface FetchOptions {
  /** Tries again this many times after a failure (an HTTP error or a dropped connection), with retryDelayMs between. */
  retries?: number;
  /** The fetch's priority hint (the art loads behind the shell: 'low'). */
  priority?: 'low' | 'high' | 'auto';
  /** Waits `ms` between attempts (tests pass their own). */
  wait?: (ms: number) => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/**
 * Fetches `url` whole as a Blob, reporting its bytes as they arrive (`expected`: the Content-Length, or null when the
 * server sends none or compresses the body, whose length then is not the bytes read). Throws on an HTTP error once its
 * retries are spent; a retry starts its bytes again from 0.
 */
export async function fetchWithProgress(
  url: string,
  onBytes?: (received: number, expected: number | null) => void,
  options: FetchOptions = {},
): Promise<Blob> {
  const retries = options.retries ?? 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOnce(url, onBytes, options.priority);
    } catch (e) {
      if (attempt >= retries) throw e;
      onBytes?.(0, null);
      await (options.wait ?? sleep)(retryDelayMs(attempt + 1));
    }
  }
}

/** A match sheet's download: behind the shell (low priority), tried again ART_RETRIES times before it fails. */
export function fetchSheet(url: string, onBytes?: (received: number, expected: number | null) => void): Promise<Blob> {
  return fetchWithProgress(url, onBytes, { retries: ART_RETRIES, priority: 'low' });
}

async function fetchOnce(url: string, onBytes: ((received: number, expected: number | null) => void) | undefined, priority: FetchOptions['priority']): Promise<Blob> {
  const res = await fetch(url, priority ? ({ priority } as RequestInit) : undefined);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const length = Number(res.headers.get('content-length'));
  const coding = (res.headers.get('content-encoding') ?? '').trim().toLowerCase();
  const expected = Number.isFinite(length) && length > 0 && (coding === '' || coding === 'identity') ? length : null;
  onBytes?.(0, expected);
  if (!onBytes || !res.body) return res.blob();
  const type = res.headers.get('content-type') ?? '';
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    received += value.byteLength;
    onBytes(received, expected);
  }
  return new Blob(parts as BlobPart[], type ? { type } : undefined);
}
