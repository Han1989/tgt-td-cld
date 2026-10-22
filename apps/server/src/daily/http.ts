// The Daily run's routes (docs/GAME_DESIGN.md "Daily run", docs/DEPLOY.md): HTTP only, no WebSocket message.
//   GET  /daily/today              the day, its seed, when it closes, how many have run it, yesterday's champion
//                                  (and, with this browser's data key in `x-data-key`, its rank today and yesterday)
//   GET  /daily/board?day=         today's or yesterday's board around the caller (`x-data-key`), or its top five
//   POST /daily/post               { key, name, file: { report, replay } }: checked, re-run by the server, ranked
// The same origin check, CORS, body limits and per-address token buckets as /analytics. The data key proves which
// browser posts; only the visitor id derived from it (analytics/dataKey.ts) is kept, never the key.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { dailyClosesAt, dailyKey, dailySeed, shiftDailyKey } from '@tdt/sim';
import { clientIp, readBody, send } from '../analytics/http';
import { DATA_KEY, visitorFromKey } from '../analytics/dataKey';
import { TokenBucket } from '../rateLimit';
import { boardView, champion, type DailyEntry } from './board';
import { boardName } from './names';
import type { DailyStore } from './store';
import { fileRefusal, reportMismatch, ReplayQueue, type PostedFile } from './verify';

const ROUTES = ['/daily/today', '/daily/board', '/daily/post'];

/**
 * A posted run's body limit. `runHeadlessMatch` bots' Quick Hard runs are 3–12 KB (99–437 log entries); Playtest 2's
 * humans logged up to 4,081 entries in a Quick match (about six a second, mostly joystick moves), 108 KB as a solo
 * replay. Four times that.
 */
export const POST_BODY_LIMIT = 448 * 1024;
/** Reads (today, board): the analytics events' limit, one a second and a burst of 10, per address. */
const READ_PER_SECOND = 1;
const READ_BURST = 10;
/** Posts: three at once, then one every 20 seconds, per address; all addresses together as for /analytics/mine. */
const POST_PER_SECOND = 1 / 20;
const POST_BURST = 3;
const POST_ALL_PER_SECOND = 1;
const POST_ALL_BURST = 60;

export interface DailyHttpOptions {
  store: DailyStore;
  isOriginAllowed: (origin: string | undefined) => boolean;
  now?: () => number;
  queue?: ReplayQueue;
  /** One line per post (accepted or refused), for the host's logs. No name, id or key. */
  log?: (msg: string) => void;
}

type Buckets = Map<string, { bucket: TokenBucket; seen: number }>;

function take(table: Buckets, ip: string, at: number, perSecond: number, burst: number): boolean {
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

const json = (res: ServerResponse, status: number, body: unknown) =>
  send(res, status, JSON.stringify(body), 'application/json; charset=utf-8');

/** A refused post: a short code the client words, and the reason in plain text. */
const refuse = (res: ServerResponse, status: number, error: string, message: string) => json(res, status, { error, message });

/** The caller's visitor id from `x-data-key`, or null with none (or a malformed one). */
function headerVisitor(req: IncomingMessage): string | null {
  const key = req.headers['x-data-key'];
  return typeof key === 'string' && DATA_KEY.test(key) ? visitorFromKey(key) : null;
}

/** The post's body: exactly `{ key, name, file }` with a data key. Null when it is not. */
function parsePost(raw: string): { key: string; name: unknown; file: unknown } | null {
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

/** Handles `/daily` routes. Returns false when the URL is not one of them. */
export function createDailyHttp(opts: DailyHttpOptions): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const reads: Buckets = new Map();
  const posts: Buckets = new Map();
  let postAll: TokenBucket | null = null;
  const queue = opts.queue ?? new ReplayQueue();
  const now = () => opts.now?.() ?? Date.now();
  const log = opts.log ?? (() => {});

  function rankOf(day: string, visitor: string | null): { rank: number; total: number } | null {
    if (!visitor) return null;
    const view = boardView(day, opts.store.entries(day), visitor);
    return view.rank === null ? null : { rank: view.rank, total: view.total };
  }

  function today(req: IncomingMessage, res: ServerResponse): void {
    const at = now();
    const day = dailyKey(at);
    const yesterday = shiftDailyKey(day, -1);
    const visitor = headerVisitor(req);
    json(res, 200, {
      day,
      seed: dailySeed(day),
      closesAt: dailyClosesAt(day),
      runs: opts.store.entries(day).length,
      champion: champion(opts.store.entries(yesterday)),
      ...(visitor ? { you: { today: rankOf(day, visitor), yesterday: rankOf(yesterday, visitor) } } : {}),
    });
  }

  function board(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const day = dailyKey(now());
    const asked = url.searchParams.get('day') ?? day;
    if (asked !== day && asked !== shiftDailyKey(day, -1)) {
      refuse(res, 400, 'day', 'Only today’s and yesterday’s boards are open.');
      return;
    }
    json(res, 200, boardView(asked, opts.store.entries(asked), headerVisitor(req)));
  }

  async function post(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const at = now();
    if (!take(posts, clientIp(req), at, POST_PER_SECOND, POST_BURST)) {
      res.setHeader('Retry-After', '20');
      refuse(res, 429, 'slow', 'Slow down: one post every 20 seconds.');
      return;
    }
    postAll ??= new TokenBucket(POST_ALL_PER_SECOND, POST_ALL_BURST, at);
    if (!postAll.take(at)) {
      res.setHeader('Retry-After', '5');
      refuse(res, 429, 'slow', 'The board is busy. Try again in a moment.');
      return;
    }
    const raw = await readBody(req, POST_BODY_LIMIT);
    if (raw === null) {
      refuse(res, 413, 'size', 'The run is too large to post.');
      return;
    }
    const body = parsePost(raw);
    if (!body) {
      refuse(res, 400, 'body', 'Send {"key", "name", "file": {"report", "replay"}}.');
      return;
    }
    // The day is the one the post arrived on; its seed is the only one taken.
    const day = dailyKey(at);
    const refused = fileRefusal(body.file, dailySeed(day));
    if (refused) {
      opts.store.failed(day);
      log(`daily ${day} refused: ${refused}`);
      if (refused === "not today's seed") refuse(res, 409, 'day', 'This run is from another day’s seed.');
      else refuse(res, 400, 'file', `Not a daily run: ${refused}.`);
      return;
    }
    const file = body.file as PostedFile;
    const job = queue.verify(file.replay);
    if (!job) {
      res.setHeader('Retry-After', '10');
      refuse(res, 503, 'busy', 'Many runs are being checked. Try again in a moment.');
      return;
    }
    const rerun = await job;
    if (!rerun.ok) {
      opts.store.failed(day);
      log(`daily ${day} refused: re-run failed (${rerun.reason})`);
      refuse(res, 400, 'rerun', 'The server could not re-run this run.');
      return;
    }
    const { run } = rerun;
    const visitor = visitorFromKey(body.key);
    const mismatch = reportMismatch(file, run);
    if (mismatch) opts.store.mismatched(day);
    const entry: DailyEntry = { visitor, name: boardName(body.name), ...run, at: now() };
    const kept = opts.store.record(day, entry, entry.at);
    if (!kept) {
      refuse(res, 409, 'forgotten', 'This browser’s data was just deleted. Post again later.');
      return;
    }
    const view = boardView(day, opts.store.entries(day), visitor);
    log(
      `daily ${day} accepted: ${run.won ? 'victory' : 'defeat'} wave ${run.wave} heart ${run.heart} ticks ${run.ticks} ` +
        `rank ${view.rank}/${view.total}${kept.improved ? ' (best)' : ''}${mismatch ? ' report mismatch' : ''} ` +
        `re-run ${Math.round(rerun.ms)} ms`,
    );
    json(res, 200, {
      ...view,
      run: { won: run.won, heart: run.heart, wave: run.wave, ticks: run.ticks, hero: run.hero },
      improved: kept.improved,
      personalBest: opts.store.personalBest(visitor),
    });
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
    const posting = path === '/daily/post';
    if (posting ? req.method !== 'POST' : req.method !== 'GET') {
      send(res, 405, 'Method not allowed\n', 'text/plain; charset=utf-8');
      return true;
    }
    if (posting) {
      await post(req, res);
      return true;
    }
    if (!take(reads, clientIp(req), now(), READ_PER_SECOND, READ_BURST)) {
      res.setHeader('Retry-After', '1');
      send(res, 429, 'Slow down\n', 'text/plain; charset=utf-8');
      return true;
    }
    if (path === '/daily/today') today(req, res);
    else board(req, res, url);
    return true;
  };
}
