// Where each of the match's pictures is (V-07d): the map plate's and the 3D sheets' loaders report here as their bytes
// come in and when they are in, so a match can hold its start for its first wave's art and say how far along it is
// (rules.ts, read each frame by firstWave.ts). Nothing here decides anything.

import type { SheetId, SheetProgress } from './rules';

const sheets = new Map<SheetId, SheetProgress>();

/** Where a picture is (idle until its loader starts). */
export function sheetProgress(id: SheetId): SheetProgress {
  return sheets.get(id) ?? { status: 'idle', received: 0, expected: null };
}

/** A picture this build does not load (the browser tests' `?towers2d`, `?creeps2d`): never awaited. */
export function sheetOff(id: SheetId): void {
  if (sheetProgress(id).status === 'idle') sheets.set(id, { status: 'off', received: 0, expected: null });
}

/** A loader's handle on its picture: the bytes as they come, then in or failed. */
export interface SheetTrack {
  bytes(received: number, expected: number | null): void;
  done(ok: boolean): void;
}

/** Starts tracking a picture's download (its loader calls this once, when it starts). */
export function trackSheet(id: SheetId): SheetTrack {
  sheets.set(id, { status: 'loading', received: 0, expected: null });
  return {
    bytes: (received, expected) => sheets.set(id, { status: 'loading', received, expected }),
    done: (ok) => {
      const p = sheetProgress(id);
      sheets.set(id, { status: ok ? 'in' : 'failed', received: ok ? (p.expected ?? p.received) : p.received, expected: p.expected });
    },
  };
}

/**
 * Fetches `url` whole as a Blob, reporting its bytes as they arrive (`expected`: the Content-Length, or null when the
 * server sends none or compresses the body, whose length then is not the bytes read). Throws on an HTTP error.
 */
export async function fetchWithProgress(url: string, onBytes?: (received: number, expected: number | null) => void): Promise<Blob> {
  const res = await fetch(url);
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
