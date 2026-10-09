// POST /analytics/event from the client, and POST /analytics/count for the anonymous counts (counts.ts: a page open
// or a failed start, no id, added to a daily total). GET /analytics and /analytics/summary
// for Han, behind ANALYTICS_DASHBOARD_KEY, and the same key for a copy
// (GET /analytics/visitor?id=) or deletion (POST /analytics/forget?id=) asked for by email.
// A player's own copy and deletion (POST /analytics/mine, /analytics/mine/forget) take the
// browser's data key instead (dataKey.ts): the server derives the id, so no request can name one.
// Origins follow the WebSocket allow-list.

import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { TokenBucket } from '../rateLimit';
import { parseCount } from './counts';
import { DATA_KEY, visitorFromKey } from './dataKey';
import { parseAnalyticsEvent } from './parse';
import { renderDashboard } from './page';
import { summarize } from './summary';
import type { AnalyticsStore } from './store';

const BODY_LIMIT = 2048;
const VISITOR_ID = /^[A-Za-z0-9_-]{8,64}$/;
const ROUTES = [
  '/analytics',
  '/analytics/summary',
  '/analytics/event',
  '/analytics/count',
  '/analytics/visitor',
  '/analytics/forget',
  '/analytics/mine',
  '/analytics/mine/forget',
];
/** One event a second sustained, a short burst for start + match + rating. Counts share the same bucket. */
const PER_SECOND = 1;
const BURST = 10;
/** A player's own copy / deletion: a few at once, then one every 20 seconds, per IP. */
const MINE_PER_SECOND = 1 / 20;
const MINE_BURST = 5;
/** And for everyone together, so many addresses cannot hammer it either. */
const MINE_ALL_PER_SECOND = 1;
const MINE_ALL_BURST = 60;
const MINE_BODY_LIMIT = 256;

export interface AnalyticsHttpOptions {
  store: AnalyticsStore;
  dashboardKey: string;
  isOriginAllowed: (origin: string | undefined) => boolean;
  connectedPlayers: () => number;
  now?: () => number;
}

function presentedKey(req: IncomingMessage, url: URL): string {
  const header = req.headers['x-analytics-key'];
  if (typeof header === 'string' && header.length > 0) return header;
  return url.searchParams.get('key') ?? '';
}

export function dashboardKeyMatches(expected: string, got: string): boolean {
  if (!expected || expected.length > 200 || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !origin) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Max-Age', '600');
}

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0]!.trim().slice(0, 80);
  return req.socket.remoteAddress ?? 'unknown';
}

function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
  return new Promise((resolve) => {
    const declared = Number(req.headers['content-length'] ?? '');
    if (Number.isFinite(declared) && declared > limit) {
      req.resume();
      resolve(null);
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        finish(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => finish(null));
  });
}

function send(res: ServerResponse, status: number, body: string, type: string): void {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

/**
 * Handles `/analytics` routes. Returns false when the URL is not one of them,
 * so the rest of the HTTP server can answer.
 */
export function createAnalyticsHttp(opts: AnalyticsHttpOptions): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const buckets = new Map<string, { bucket: TokenBucket; seen: number }>();
  const mineBuckets = new Map<string, { bucket: TokenBucket; seen: number }>();
  let mineAll: TokenBucket | null = null;
  const now = () => opts.now?.() ?? Date.now();

  function take(
    table: Map<string, { bucket: TokenBucket; seen: number }>,
    ip: string,
    at: number,
    perSecond: number,
    burst: number,
  ): boolean {
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

  function allow(ip: string, at: number): boolean {
    return take(buckets, ip, at, PER_SECOND, BURST);
  }

  function allowMine(ip: string, at: number): boolean {
    if (!take(mineBuckets, ip, at, MINE_PER_SECOND, MINE_BURST)) return false;
    mineAll ??= new TokenBucket(MINE_ALL_PER_SECOND, MINE_ALL_BURST, at);
    return mineAll.take(at);
  }

  /** The player's own copy or deletion. Same answer shape whether or not anything is held for the key. */
  async function mine(req: IncomingMessage, res: ServerResponse, forget: boolean): Promise<void> {
    const at = now();
    if (!allowMine(clientIp(req), at)) {
      res.setHeader('Retry-After', '20');
      send(res, 429, 'Slow down\n', 'text/plain; charset=utf-8');
      return;
    }
    const raw = await readBody(req, MINE_BODY_LIMIT);
    if (raw === null) {
      send(res, 413, 'Too large\n', 'text/plain; charset=utf-8');
      return;
    }
    let key: unknown;
    try {
      const json = JSON.parse(raw) as unknown;
      if (json && typeof json === 'object' && !Array.isArray(json) && Object.keys(json).length === 1) {
        key = (json as { key?: unknown }).key;
      }
    } catch {
      key = undefined;
    }
    if (typeof key !== 'string' || !DATA_KEY.test(key)) {
      send(res, 400, 'Send {"key": "<this browser\'s data key>"}\n', 'text/plain; charset=utf-8');
      return;
    }
    const visitor = visitorFromKey(key);
    if (forget) {
      const removed = opts.store.forget(visitor, at);
      await opts.store.flush();
      send(res, 200, JSON.stringify({ visitor, removedEvents: removed }), 'application/json; charset=utf-8');
    } else {
      send(res, 200, JSON.stringify({ visitor, ...opts.store.visitorData(visitor) }), 'application/json; charset=utf-8');
    }
  }

  return async (req, res) => {
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      return false;
    }
    let path = url.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    if (!ROUTES.includes(path)) return false;

    if (path === '/analytics/mine' || path === '/analytics/mine/forget') {
      const origin = req.headers.origin;
      if (!opts.isOriginAllowed(typeof origin === 'string' ? origin : undefined)) {
        send(res, 403, 'Forbidden\n', 'text/plain; charset=utf-8');
        return true;
      }
      applyCors(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        res.end();
        return true;
      }
      if (req.method !== 'POST') {
        send(res, 405, 'Method not allowed\n', 'text/plain; charset=utf-8');
        return true;
      }
      await mine(req, res, path === '/analytics/mine/forget');
      return true;
    }

    // Events and counts: the same origin check, CORS, body limit and per-address bucket.
    if (path === '/analytics/event' || path === '/analytics/count') {
      const origin = req.headers.origin;
      if (!opts.isOriginAllowed(typeof origin === 'string' ? origin : undefined)) {
        send(res, 403, 'Forbidden\n', 'text/plain; charset=utf-8');
        return true;
      }
      applyCors(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        res.end();
        return true;
      }
      if (req.method !== 'POST') {
        send(res, 405, 'Method not allowed\n', 'text/plain; charset=utf-8');
        return true;
      }
      const at = now();
      if (!allow(clientIp(req), at)) {
        res.setHeader('Retry-After', '1');
        send(res, 429, 'Slow down\n', 'text/plain; charset=utf-8');
        return true;
      }
      const raw = await readBody(req, BODY_LIMIT);
      if (raw === null) {
        send(res, 413, 'Too large\n', 'text/plain; charset=utf-8');
        return true;
      }
      const counting = path === '/analytics/count';
      let json: unknown;
      try {
        json = JSON.parse(raw) as unknown;
      } catch {
        send(res, 400, counting ? 'Bad count\n' : 'Bad event\n', 'text/plain; charset=utf-8');
        return true;
      }
      if (counting) {
        const count = parseCount(json);
        if (!count) {
          send(res, 400, 'Bad count\n', 'text/plain; charset=utf-8');
          return true;
        }
        opts.store.count(count, at);
        send(res, 204, '', 'text/plain; charset=utf-8');
        return true;
      }
      const event = parseAnalyticsEvent(json);
      if (!event) {
        send(res, 400, 'Bad event\n', 'text/plain; charset=utf-8');
        return true;
      }
      opts.store.record(event, at);
      send(res, 204, '', 'text/plain; charset=utf-8');
      return true;
    }

    if (!opts.dashboardKey) {
      send(res, 404, 'Not found\n', 'text/plain; charset=utf-8');
      return true;
    }
    const writes = path === '/analytics/forget';
    if (writes ? req.method !== 'POST' : req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, 'Method not allowed\n', 'text/plain; charset=utf-8');
      return true;
    }
    if (!dashboardKeyMatches(opts.dashboardKey, presentedKey(req, url))) {
      send(res, 401, 'Unauthorized\n', 'text/plain; charset=utf-8');
      return true;
    }
    if (path === '/analytics/visitor' || path === '/analytics/forget') {
      const id = url.searchParams.get('id') ?? '';
      if (!VISITOR_ID.test(id)) {
        send(res, 400, 'Give the browser id as ?id=\n', 'text/plain; charset=utf-8');
        return true;
      }
      if (writes) {
        const removed = opts.store.forget(id, now());
        await opts.store.flush();
        send(res, 200, JSON.stringify({ visitor: id, removedEvents: removed }), 'application/json; charset=utf-8');
      } else {
        send(res, 200, JSON.stringify({ visitor: id, ...opts.store.visitorData(id) }), 'application/json; charset=utf-8');
      }
      return true;
    }
    const summary = summarize(
      opts.store.all(),
      now(),
      {
        connectedPlayers: opts.connectedPlayers(),
        persistent: opts.store.persistent,
        durable: opts.store.location.durable && opts.store.persistent,
        dir: opts.store.location.dir,
      },
      opts.store.retentionTable(),
      opts.store.countTable(),
    );
    if (path === '/analytics/summary') {
      send(res, 200, JSON.stringify(summary), 'application/json; charset=utf-8');
      return true;
    }
    send(res, 200, renderDashboard(summary), 'text/html; charset=utf-8');
    return true;
  };
}
