// Verifying a posted Daily run (docs/GAME_DESIGN.md "Daily run"): the file's checks before anything else, then the
// server's own re-run of the replay with the sim. The board keeps what the re-run ends with, never what the client's
// report says; a report that disagrees is counted as a mismatch. Re-runs go one at a time, a few milliseconds per
// slice, so the rooms' 20 Hz ticks keep running while a run is verified (a Quick run is 0.1–0.5 s of re-run).

import type { HeroKind, MatchReport, Replay } from '@tdt/protocol';
import { dailyRefusal, matchOver, replayProblem, replayRefusal, replaySteps, TICK_RATE, type DailyRun, type Match } from '@tdt/sim';

/** A Quick run lasts about 11 minutes (13,500 ticks); a re-run that passes 30 minutes of match time is refused. */
export const MAX_RUN_TICKS = 30 * 60 * TICK_RATE;
/** Re-run slices: this many ms at most before the event loop gets a turn. */
export const SLICE_MS = 8;
/** Ticks stepped between two looks at the clock (about 1 ms of a solo match). */
const SLICE_TICKS = 25;
/** Runs waiting for their re-run, the one running included; past it a post is answered "busy". */
export const MAX_QUEUED = 20;

export interface PostedFile {
  report: MatchReport;
  replay: Replay;
}

/** What the server's re-run ended with. */
export interface VerifiedRun extends DailyRun {
  hero: HeroKind;
}

/** Why a file is not a daily run of the day whose seed is `seed`, or null. Before the re-run, on the file alone. */
export function fileRefusal(file: unknown, seed: number): string | null {
  if (typeof file !== 'object' || file === null || Array.isArray(file)) return 'not a match file';
  const keys = Object.keys(file);
  if (keys.length !== 2 || !keys.includes('report') || !keys.includes('replay')) return 'not a match file';
  const { report, replay } = file as { report: unknown; replay: unknown };
  const problem = replayProblem(replay);
  if (problem) return `bad replay: ${problem}`;
  const r = replay as Replay;
  const refused = replayRefusal(r) ?? dailyRefusal(r, seed);
  if (refused) return refused;
  if (r.end.tick > MAX_RUN_TICKS || r.log.some((e) => e[0] > MAX_RUN_TICKS)) return 'the run is too long';
  return reportRefusal(report, r);
}

/** The report must be this replay's: same seed, mode, difficulty and hero, one player, a result. */
function reportRefusal(value: unknown, replay: Replay): string | null {
  const report = value as Partial<MatchReport> | null;
  if (!report || typeof report !== 'object' || Array.isArray(report) || report.format !== 1) return 'bad report';
  const same =
    report.seed === replay.seed &&
    report.mode === replay.mode &&
    (report.difficulty ?? 'normal') === (replay.difficulty ?? 'normal') &&
    Array.isArray(report.heroes) &&
    report.heroes.length === 1 &&
    report.heroes[0]?.hero === replay.players[0]!.hero &&
    (report.result === 'victory' || report.result === 'defeat') &&
    [report.wave, report.heartHp, report.seconds].every((n) => typeof n === 'number' && Number.isFinite(n));
  return same ? null : "the report is not this replay's";
}

/** The re-run's result. */
export function runOf(match: Match): VerifiedRun {
  const state = match.state;
  return {
    won: state.phase === 'victory',
    heart: Math.max(0, state.heartHp),
    wave: state.wave,
    ticks: state.tick,
    hero: state.heroes[0]!.kind,
  };
}

/** The client's own report or its replay's end says something other than the re-run. */
export function reportMismatch(file: PostedFile, run: VerifiedRun): boolean {
  const { report, replay } = file;
  const result = run.won ? 'victory' : 'defeat';
  return (
    report.result !== result ||
    report.heartHp !== run.heart ||
    report.wave !== run.wave ||
    Math.round(report.seconds * TICK_RATE) !== run.ticks ||
    replay.end.result !== result ||
    Math.max(0, replay.end.heartHp) !== run.heart ||
    replay.end.wave !== run.wave ||
    replay.end.tick !== run.ticks
  );
}

export type ReRun = { ok: true; run: VerifiedRun; ms: number } | { ok: false; reason: string };

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Re-runs replays one at a time, in slices of `sliceMs`. */
export class ReplayQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private waiting = 0;

  constructor(
    private readonly sliceMs = SLICE_MS,
    private readonly maxQueued = MAX_QUEUED,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  /** Runs waiting, the one running included. */
  get length(): number {
    return this.waiting;
  }

  /** Null when the queue is full. */
  verify(replay: Replay): Promise<ReRun> | null {
    if (this.waiting >= this.maxQueued) return null;
    this.waiting++;
    const job = this.chain.then(() => this.run(replay));
    this.chain = job.catch(() => {});
    return job.finally(() => {
      this.waiting--;
    });
  }

  private async run(replay: Replay): Promise<ReRun> {
    const started = this.clock();
    try {
      const steps = replaySteps(replay, undefined, undefined, SLICE_TICKS, MAX_RUN_TICKS);
      let sliceStart = this.clock();
      for (;;) {
        const next = steps.next();
        if (next.done) {
          const match = next.value;
          if (!matchOver(match)) return { ok: false, reason: 'the run did not finish' };
          return { ok: true, run: runOf(match), ms: this.clock() - started };
        }
        if (this.clock() - sliceStart >= this.sliceMs) {
          await turn();
          sliceStart = this.clock();
        }
      }
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message.slice(0, 200) : 'the re-run failed' };
    }
  }
}
