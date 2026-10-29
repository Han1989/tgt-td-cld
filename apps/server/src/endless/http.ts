// Endless's daily board (docs/GAME_DESIGN.md "Endless", "The board"; docs/DEPLOY.md): HTTP only, no WebSocket message.
//   GET  /endless/today            the day, when it closes, how many browsers are on its board, the top 10 (and, with
//                                  this browser's data key in `x-data-key`, its own row marked and its rank)
//   POST /endless/post             { key, name, file: { report, replay } }: checked, re-run by the server, ranked
// Built on the Daily run's parts (../daily/): the guard, CORS and refusals (routing.ts), the file's checks and the
// one-at-a-time re-run queue (verify.ts, the same queue as the Daily run's on the game server), the names
// (names.ts) and the day files (days.ts). The data key proves which browser posts; only the visitor id derived from it
// is kept. The client posts a solo Endless run by itself once the player said yes (apps/client/src/endless/board.ts).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { PROTOCOL_VERSION, type Replay } from '@tdt/protocol';
import { dailyKey, endlessRefusal, endlessRunTicks, TUNING } from '@tdt/sim';
import { clientIp, readBody } from '../analytics/http';
import { visitorFromKey } from '../analytics/dataKey';
import { READ_BURST, READ_PER_SECOND } from '../daily/http';
import { boardName } from '../daily/names';
import { allPostsBucket, guard, headerVisitor, json, parsePost, refuse, slowReads, take, type Buckets } from '../daily/routing';
import { boardFileRefusal, reportMismatch, ReplayQueue, type PostedFile } from '../daily/verify';
import type { TokenBucket } from '../rateLimit';
import { endlessView, type EndlessEntry } from './board';
import type { EndlessStore } from './store';

const ROUTES = ['/endless/today', '/endless/post'];

/**
 * The longest re-run taken: the hard stop's every wave timer plus ten minutes (`endlessRunTicks`, about 2 h 24 min of
 * match time). The re-run's cost is in its ticks: a wave-50 run is about 1.4 s of re-run, a wave-80 run 2–3 s on one
 * core (`npm run endless:rerun -w @tdt/server`), in the queue's 8 ms slices like a Daily run's, so a room's tick waits
 * at most one slice however long the run.
 */
export const ENDLESS_MAX_RUN_TICKS = endlessRunTicks(TUNING);

/**
 * A posted run's body limit. The bots log 400–2,000 entries to wave 80 (12–50 KB); Playtest 2's busiest human logged
 * 6.7 entries a second at 26 bytes each. At that rate a run to wave 80 (about 52 minutes) is about 560 KB and one to
 * the hard stop at wave 200 (about 2 h 11 min) about 1.35 MB, so 1.5 MB takes any run a person can play.
 */
export const ENDLESS_BODY_LIMIT = 1536 * 1024;

/**
 * At most this many runs in the shared re-run queue when an Endless post joins it (else "busy"): an Endless re-run is
 * 1.5–3 s where a Daily one is 0.1–0.5 s, so five keep a Daily post's wait under about 15 s.
 */
export const ENDLESS_QUEUE_ROOM = 5;

/** Posts: two at once, then one every 60 seconds, per address; all addresses together share the Daily run's bucket. */
const POST_PER_SECOND = 1 / 60;
const POST_BURST = 2;

export interface EndlessHttpOptions {
  store: EndlessStore;
  isOriginAllowed: (origin: string | undefined) => boolean;
  now?: () => number;
  /** The re-run queue (the Daily run's, on the game server). */
  queue?: ReplayQueue;
  /** Posts from all addresses together (the Daily run's, on the game server; else its own). */
  allPosts?: TokenBucket;
  /** The protocol a run must be recorded on (this build's). */
  protocol?: number;
  /** One line per post (accepted or refused), for the host's logs. No name, id or key. */
  log?: (msg: string) => void;
}

/** Handles `/endless` routes. Returns false when the URL is not one of them. */
export function createEndlessHttp(opts: EndlessHttpOptions): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const reads: Buckets = new Map();
  const posts: Buckets = new Map();
  let postAll: TokenBucket | null = opts.allPosts ?? null;
  const queue = opts.queue ?? new ReplayQueue();
  const now = () => opts.now?.() ?? Date.now();
  const log = opts.log ?? (() => {});
  const protocol = opts.protocol ?? PROTOCOL_VERSION;
  const refusal = (replay: Replay) => endlessRefusal(replay, protocol);

  function today(req: IncomingMessage, res: ServerResponse): void {
    const day = dailyKey(now());
    json(res, 200, endlessView(day, opts.store.entries(day), headerVisitor(req)));
  }

  async function post(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const at = now();
    if (!take(posts, clientIp(req), at, POST_PER_SECOND, POST_BURST)) {
      res.setHeader('Retry-After', '60');
      refuse(res, 429, 'slow', 'Slow down: one post a minute.');
      return;
    }
    postAll ??= allPostsBucket(at);
    if (!postAll.take(at)) {
      res.setHeader('Retry-After', '5');
      refuse(res, 429, 'slow', 'The board is busy. Try again in a moment.');
      return;
    }
    const raw = await readBody(req, ENDLESS_BODY_LIMIT);
    if (raw === null) {
      refuse(res, 413, 'size', 'The run is too large to post.');
      return;
    }
    const body = parsePost(raw);
    if (!body) {
      refuse(res, 400, 'body', 'Send {"key", "name", "file": {"report", "replay"}}.');
      return;
    }
    // The day is the one the post arrived on: a run counts on the board of the day it was posted.
    const day = dailyKey(at);
    const refused = boardFileRefusal(body.file, refusal, ENDLESS_MAX_RUN_TICKS);
    if (refused) {
      opts.store.failed(day);
      log(`endless ${day} refused: ${refused}`);
      // Recorded on another protocol (refused by `endlessRefusal`, or before it by `replayRefusal`): worded on its own.
      const recorded = (body.file as { replay?: { protocol?: unknown } } | null)?.replay?.protocol;
      if (typeof recorded === 'number' && recorded !== protocol) refuse(res, 409, 'version', 'This run is from another version of the game.');
      else refuse(res, 400, 'file', `Not a solo Endless run: ${refused}.`);
      return;
    }
    const file = body.file as PostedFile;
    const job = queue.verify(file.replay, ENDLESS_MAX_RUN_TICKS, ENDLESS_QUEUE_ROOM);
    if (!job) {
      res.setHeader('Retry-After', '10');
      refuse(res, 503, 'busy', 'Many runs are being checked. Try again in a moment.');
      return;
    }
    const rerun = await job;
    if (!rerun.ok) {
      opts.store.failed(day);
      log(`endless ${day} refused: re-run failed (${rerun.reason})`);
      refuse(res, 400, 'rerun', 'The server could not re-run this run.');
      return;
    }
    const { run } = rerun;
    const visitor = visitorFromKey(body.key);
    const mismatch = reportMismatch(file, run);
    if (mismatch) opts.store.mismatched(day);
    const entry: EndlessEntry = { visitor, name: boardName(body.name), hero: run.hero, wave: run.wave, ticks: run.ticks, at: now() };
    const kept = opts.store.record(day, entry, entry.at);
    if (!kept) {
      refuse(res, 409, 'forgotten', 'This browser’s data was just deleted. Post again later.');
      return;
    }
    const view = endlessView(day, opts.store.entries(day), visitor);
    log(
      `endless ${day} accepted: wave ${run.wave} ticks ${run.ticks} rank ${view.you?.rank}/${view.runs}` +
        `${kept.improved ? ' (best)' : ''}${mismatch ? ' report mismatch' : ''} re-run ${Math.round(rerun.ms)} ms`,
    );
    json(res, 200, { ...view, run: { wave: run.wave, ticks: run.ticks, hero: run.hero }, improved: kept.improved });
  }

  return async (req, res) => {
    const route = guard(req, res, ROUTES, '/endless/post', opts.isOriginAllowed);
    if (typeof route === 'boolean') return route;
    if (route.path === '/endless/post') {
      await post(req, res);
      return true;
    }
    if (!take(reads, clientIp(req), now(), READ_PER_SECOND, READ_BURST)) {
      slowReads(res);
      return true;
    }
    today(req, res);
    return true;
  };
}
