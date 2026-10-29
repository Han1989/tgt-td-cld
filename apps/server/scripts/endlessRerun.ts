// How long the game server takes to re-run a posted Endless run (src/endless/http.ts, docs/DEPLOY.md §6): bots' solo
// Endless runs from `runHeadlessMatch`, the first near wave 50 (casual) and near wave 80 (expert), each re-run on the
// server's own queue (in 8 ms slices) and once straight through, with its log and file size. The body limit and the
// queue's room for Endless runs are set from these numbers. `npm run endless:rerun -w @tdt/server`.

import type { HeroKind } from '@tdt/protocol';
import { createBalanceBot, createExpertBot, replayMatch, runHeadlessMatch, TICK_RATE, type Bot } from '@tdt/sim';
import { ReplayQueue, SLICE_MS } from '../src/daily/verify';
import { ENDLESS_BODY_LIMIT, ENDLESS_MAX_RUN_TICKS, ENDLESS_QUEUE_ROOM } from '../src/endless/http';

const HEROES: HeroKind[] = ['ranger', 'warden', 'arcanist'];

/** The first bot run within `near` waves of `wave`, trying each hero on seeds 1–6. */
function find(wave: number, near: number, make: (id: string) => Bot) {
  let closest: ReturnType<typeof runHeadlessMatch> | null = null;
  for (let seed = 1; seed <= 6; seed++) {
    for (const hero of HEROES) {
      const run = runHeadlessMatch({ bots: [make('local')], heroes: [hero], seed, mode: 'endless', record: true });
      const off = Math.abs(run.file!.replay.end.wave - wave);
      if (!closest || off < Math.abs(closest.file!.replay.end.wave - wave)) closest = run;
      if (off <= near) return closest;
    }
  }
  return closest!;
}

const queue = new ReplayQueue();
console.log(`Re-run slices: ${SLICE_MS} ms; Endless runs re-run up to ${ENDLESS_MAX_RUN_TICKS} ticks; queue room ${ENDLESS_QUEUE_ROOM}.`);
for (const [label, wave, make] of [
  ['wave 50 (casual bot)', 50, (id: string) => createBalanceBot(id)],
  ['wave 80 (expert bot)', 80, createExpertBot],
] as const) {
  const { file } = find(wave, label.includes('80') ? 2 : 3, make);
  const { replay } = file!;
  const t0 = performance.now();
  replayMatch(replay);
  const straight = performance.now() - t0;
  const queued = await queue.verify(replay, ENDLESS_MAX_RUN_TICKS)!;
  if (!queued.ok) throw new Error(queued.reason);
  const bytes = Buffer.byteLength(JSON.stringify(file));
  console.log(
    `${label}: ${replay.players[0]!.hero} seed ${replay.seed} fell on wave ${replay.end.wave} after ` +
      `${(replay.end.tick / TICK_RATE / 60).toFixed(1)} min (${replay.end.tick} ticks), ${replay.log.length} log entries, ` +
      `${(bytes / 1024).toFixed(0)} KB posted; re-run ${Math.round(straight)} ms straight, ${Math.round(queued.ms)} ms on the queue`,
  );
}
// Playtest 2's busiest human: 6.7 log entries a second, 26 bytes each.
const perSecond = 6.74 * 26.4;
const at = (minutes: number) => `${((minutes * 60 * perSecond) / 1024).toFixed(0)} KB`;
console.log(
  `At the busiest human rate: wave 80 (~52 min) ${at(52)}, the hard stop at wave 200 (~131 min) ${at(131)}; ` +
    `body limit ${(ENDLESS_BODY_LIMIT / 1024).toFixed(0)} KB.`,
);
