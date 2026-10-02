import type { CreepKind, GameEvent, GameMode, HeroKind, LaneId } from '@tdt/protocol';
import { afterAll, expect } from 'vitest';
import { createNoviceBot } from '../src/bots';
import { runHeadlessMatch, type HeadlessResult } from '../src/headless';
import { createGame, step } from '../src/game';
import { getMap } from '../src/map';
import type { GameState } from '../src/state';
import { TUNING, type Tuning } from '../src/tuning';
import { spawnCreep } from '../src/waves';

/** A base pad beside the Mid lane (centre 16.5, 13.5; the Mid lane runs down x = 13). */
export const LAB_PAD = 15;

/** A point on the Mid lane, well away from the Heart and the portals. */
export const MID = { x: 13, y: 12 };

/**
 * A game with the wave timer switched off, for isolated mechanic tests. It
 * stays in the build phase so an empty map never counts as victory. Every pad
 * on the map exists and is open to everyone (pad zones have their own tests).
 */
export function labGame(tuning: Tuning = TUNING, players = 1, heroes: HeroKind[] = []): GameState {
  const state = createGame(
    {
      players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, hero: heroes[i] ?? 'ranger' })),
      tuning,
    },
    7,
  );
  state.nextWaveTick = -1;
  state.pads = getMap().pads.map((p) => ({ id: p.id, owner: null }));
  return state;
}

export function placeCreep(state: GameState, kind: CreepKind, x: number, y: number, lane: LaneId = 1) {
  const c = spawnCreep(state, kind, lane, 1);
  c.x = x;
  c.y = y;
  c.offX = 0;
  c.offY = 0;
  return c;
}

/** Moves the hero out of the way so it neither fights nor gets aggro. */
export function parkHero(state: GameState, index = 0): void {
  const h = state.heroes[index]!;
  // In the forest of the safe zone, far from the lanes.
  h.x = 3.5 + index;
  h.y = 46.5;
  h.order = { type: 'idle' };
  h.path = [];
  h.guard = null;
}

export function run(state: GameState, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(state);
}

/** Runs `ticks` steps and returns every event they produced. */
export function runCollect(state: GameState, ticks: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    step(state);
    events.push(...state.events);
  }
  return events;
}

/** A deep copy of the tuning so a test can change numbers safely. */
export function tuningCopy(): Tuning {
  return JSON.parse(JSON.stringify(TUNING)) as Tuning;
}

/** Seeds of the headless balance gates (`balance*.test.ts`). */
export const BALANCE_SEEDS = [1, 2, 3, 42, 1234];

/** The 2-player pairs of the balance gates; each gate seed plays the next pair in this list. */
export const PAIRS: [HeroKind, HeroKind][] = [
  ['ranger', 'warden'],
  ['warden', 'arcanist'],
  ['arcanist', 'ranger'],
];

/** The 3-player team of the balance gates: one hero of each kind (West, Mid, East). */
export const TEAM_OF_3: HeroKind[] = ['ranger', 'warden', 'arcanist'];

/** Heroes should reach about level 8–10 in Quick mode. */
export const QUICK_MIN_LEVEL = 8;

/**
 * Heart HP a winning casual balance bot (solo or a team) must end with on Normal (playtest 2: Normal is for first-time
 * players): comfortable, not a walkover.
 */
export const HEART_TARGET = { min: 50, max: 90 };

/** An expert bot on Normal ends with at least this much Heart; on Hard it ends inside `HARD_TARGET`. */
export const EXPERT_NORMAL_MIN = 85;
export const HARD_TARGET = { min: 40, max: 80 };

/** A novice bot (first-time player) wins at least this share of the seeds on Normal, in every team size and mode. */
export const NOVICE_WIN_RATE = 0.8;

/**
 * Difficulty curve of teams (2 and 3 players): over a gate's matches, the share of all Heart HP lost that each third
 * of the match costs (`HeadlessResult.heartLost`). The last third must be the tensest: at least `lastMin`, and the
 * first at most `firstMax`.
 */
export const CURVE = { firstMax: 0.45, lastMin: 0.25 };

/** Shares of the Heart HP lost per third, summed over `results` (0 / 0 / 0 if nothing was lost). */
export function lostShares(results: HeadlessResult[]): number[] {
  const lost = [0, 1, 2].map((i) => results.reduce((sum, r) => sum + (r.heartLost[i] ?? 0), 0));
  const total = lost.reduce((a, b) => a + b, 0);
  return lost.map((x) => (total > 0 ? x / total : 0));
}

/** Asserts the team difficulty curve (`CURVE`) over a gate's matches. */
export function expectTeamCurve(results: HeadlessResult[]): void {
  const [first, , last] = lostShares(results);
  expect(first).toBeLessThanOrEqual(CURVE.firstMax);
  expect(last).toBeGreaterThanOrEqual(CURVE.lastMin);
}

/** Share of the gate seeds the novice bot wins, over every team in `teams`. */
export function noviceWinRate(teams: HeroKind[][], mode: GameMode): number {
  let wins = 0;
  let played = 0;
  for (const heroes of teams) {
    for (const seed of BALANCE_SEEDS) {
      const result = runHeadlessMatch({
        bots: heroes.map((_, i) => createNoviceBot(`p${i + 1}`, undefined, i)),
        heroes,
        seed,
        mode,
      });
      played++;
      if (result.result === 'victory') wins++;
    }
  }
  return wins / played;
}

/**
 * Collects the Heart HP of a gate's matches (call it inside a `describe`, then `add` each result). After the last test
 * the matrix's lesson is enforced: a single seed swings +-20 Heart, so no per-seed band can hold on every seed, but the
 * mean must sit inside `band` and at least `share` of the seeds must (every match must still win: assert that per seed).
 */
export function heartGate(band: { min: number; max: number }, share: number, slack = 5): (heartHp: number) => void {
  const hearts: number[] = [];
  afterAll(() => {
    if (hearts.length === 0) return;
    const mean = hearts.reduce((a, b) => a + b, 0) / hearts.length;
    const inBand = hearts.filter((x) => x >= band.min && x <= band.max).length / hearts.length;
    expect(mean, `mean Heart ${mean.toFixed(1)} of ${hearts.join(', ')}`).toBeGreaterThanOrEqual(band.min - slack);
    expect(mean, `mean Heart ${mean.toFixed(1)} of ${hearts.join(', ')}`).toBeLessThanOrEqual(band.max + slack);
    expect(inBand, `seeds inside ${band.min}-${band.max}: ${hearts.join(', ')}`).toBeGreaterThanOrEqual(share);
  });
  return (heartHp) => void hearts.push(heartHp);
}

/** The gates' bands: casual Normal 50-90 (60% of the seeds), expert Normal at least 85 (80%), Hard 40-80 (60%). */
export const CASUAL_SHARE = 0.6;
export const EXPERT_NORMAL = { min: EXPERT_NORMAL_MIN, max: 100 };
export const EXPERT_NORMAL_SHARE = 0.8;
export const HARD_SHARE = 0.6;
