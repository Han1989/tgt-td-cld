import type { CreepKind, GameEvent, HeroKind, LaneId } from '@tdt/protocol';
import { createGame, step } from '../src/game';
import type { GameState } from '../src/state';
import { TUNING, type Tuning } from '../src/tuning';
import { spawnCreep } from '../src/waves';

/**
 * A game with the wave timer switched off, for isolated mechanic tests. It
 * stays in the build phase so an empty map never counts as victory.
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
  h.x = 3.5;
  h.y = 57.5;
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
