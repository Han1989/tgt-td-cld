import type { CreepKind, GameEvent, HeroKind, LaneId } from '@tdt/protocol';
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

/** Heart HP a winning balance bot (solo or a team) must end with on Normal: a challenge, not a walkover. */
export const HEART_TARGET = { min: 40, max: 80 };
