// What a board's routes share (the Daily run's, http.ts, and Endless's, ../endless/http.ts): per-address token
// buckets, CORS with the data key's header, JSON answers and refusals, the caller's visitor id from `x-data-key`, the
// post's `{ key, name, file }` body, and the guard every request passes first (its path, the origin check, the
// preflight, the method).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { send } from '../analytics/http';
import { DATA_KEY, visitorFromKey } from '../analytics/dataKey';
import { TokenBucket } from '../rateLimit';

export type Buckets = Map<string, { bucket: TokenBucket; seen: number }>;

/** Posts from all addresses together (the Daily run's and Endless's): 60 at once, then one a second. */
export const POST_ALL_PER_SECOND = 1;
export const POST_ALL_BURST = 60;

/** The bucket every board's posts share on one server (server.ts makes one for both routes). */
export function allPostsBucket(at: number): TokenBucket {
  return new TokenBucket(POST_ALL_PER_SECOND, POST_ALL_BURST, at);
}

/** One token from `ip`'s bucket; addresses idle for 10 minutes are dropped once the table holds 4,000. */
export function take(table: Buckets, ip: string, at: number, perSecond: number, burst: number): boolean {
  let row = table.get(ip);
  if (!row) {
    row = { bucket: new TokenBucket(perSecond, burst, at), seen: at };
    table.set(ip, row);
    if (table.size > 4000) {
      const cutoff = at - 10 * 60 * 1000;
      for (const [key, value] of table) if (value.seen < cutoff) table.delete(key);
    }
  }
  row.seen = at;
  return row.bucket.take(at);
}

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !origin) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-data-key');
  res.setHeader('Access-Control-Max-Age', '600');
}

export const json = (res: ServerResponse, status: number, body: unknown) =>
  send(res, status, JSON.stringify(body), 'application/json; charset=utf-8');

/** A refused post: a short code the client words, and the reason in plain text. */
export const refuse = (res: ServerResponse, status: number, error: string, message: string) => json(res, status, { error, message });

/** The caller's visitor id from `x-data-key`, or null with none (or a malformed one). */
export function headerVisitor(req: IncomingMessage): string | null {
  const key = req.headers['x-data-key'];
  return typeof key === 'string' && DATA_KEY.test(key) ? visitorFromKey(key) : null;
}

/** The post's body: exactly `{ key, name, file }` with a data key. Null when it is not. */
export function parsePost(raw: string): { key: string; name: unknown; file: unknown } | null {
  try {
    const body = JSON.parse(raw) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const keys = Object.keys(body);
    if (keys.length !== 3 || !['key', 'name', 'file'].every((k) => keys.includes(k))) return null;
    const { key, name, file } = body as { key: unknown; name: unknown; file: unknown };
    return typeof key === 'string' && DATA_KEY.test(key) ? { key, name, file } : null;
  } catch {
    return null;
  }
}

/**
 * The guard in front of a board's routes. Returns the request's path when the handler should answer it, `false` when
 * the URL is not one of `routes` (another handler's), or `true` when the guard has answered already (an origin not
 * allowed, a preflight, a wrong method: POST only on `postPath`, GET on the others).
 */
export function guard(
  req: IncomingMessage,
  res: ServerResponse,
  routes: readonly string[],
  postPath: string,
  isOriginAllowed: (origin: string | undefined) => boolean,
): { path: string; url: URL } | boolean {
  let url: URL;
  try {
    url = new URL(req.url ?? '/', 'http://localhost');
  } catch {
    return false;
  }
  let path = url.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (!routes.includes(path)) return false;
  const origin = req.headers.origin;
  if (!isOriginAllowed(typeof origin === 'string' ? origin : undefined)) {
    send(res, 403, 'Forbidden\n', 'text/plain; charset=utf-8');
    return true;
  }
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    res.end();
    return true;
  }
  if (path === postPath ? req.method !== 'POST' : req.method !== 'GET') {
    send(res, 405, 'Method not allowed\n', 'text/plain; charset=utf-8');
    return true;
  }
  return { path, url };
}

/** Too many reads from one address: 429 with a one-second Retry-After. */
export function slowReads(res: ServerResponse): void {
  res.setHeader('Retry-After', '1');
  send(res, 429, 'Slow down\n', 'text/plain; charset=utf-8');
}
