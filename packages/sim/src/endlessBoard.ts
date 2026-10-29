// Endless's daily board (docs/GAME_DESIGN.md "Endless", "The board"; Han, 28 Oct 2026): the top 10 of each UTC day,
// solo runs only, ranked by the wave the Heart fell on and then the shorter time. The day is the Daily run's (the UTC
// date, `dailyKey`); Endless has no seed of the day, so any seed counts. Which replays may post (`endlessRefusal`) and
// how long a re-run may take (`endlessRunTicks`) are here so the server and its tests agree. Pure.

import { PROTOCOL_VERSION, type Replay } from '@tdt/protocol';
import { TICK_RATE, tuningForMode, type Tuning } from './tuning';

/** How many rows the board shows. */
export const ENDLESS_BOARD_SIZE = 10;

/** One run as the board ranks it: the wave the run ended on and the match ticks it lasted. */
export interface EndlessRun {
  wave: number;
  ticks: number;
}

/** The board's order, as a sort comparator (negative: `a` ranks above `b`): a later wave, then the shorter time. */
export function endlessRankOrder(a: EndlessRun, b: EndlessRun): number {
  return b.wave - a.wave || a.ticks - b.ticks;
}

/**
 * Why a replay may not post to the Endless board, or null: exactly one player, Endless, recorded on this build's
 * protocol (`protocol`: the host's own; a run from another version would re-run differently or not at all), no
 * practice and no match modifiers. Check `replayProblem` (the shape) and `replayRefusal` (rules that are gone) first.
 */
export function endlessRefusal(
  replay: Pick<Replay, 'players' | 'mode' | 'protocol' | 'practice' | 'modifiers'>,
  protocol = PROTOCOL_VERSION,
): string | null {
  if (replay.mode !== 'endless') return 'the board takes Endless runs';
  if (replay.players.length !== 1) return 'the board takes solo runs';
  if (replay.protocol !== protocol) return `recorded under protocol ${replay.protocol}, this server runs ${protocol}`;
  if (replay.practice) return 'an Endless run is not practice';
  if (replay.modifiers && replay.modifiers.length > 0) return 'an Endless run has no modifiers';
  return null;
}

/**
 * The longest an Endless run can last, in ticks: the build phase and every wave's full timer up to the hard stop
 * (`endless.maxWave`), plus ten minutes, as `runHeadlessMatch` allows. A re-run past it is refused.
 */
export function endlessRunTicks(tuning: Tuning): number {
  const t = tuningForMode(tuning, 'endless');
  return Math.ceil((t.waves.buildPhase + t.waves.interval * t.endless.maxWave + 10 * 60) * TICK_RATE);
}
