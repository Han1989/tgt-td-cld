// Endless (docs/GAME_DESIGN.md "Endless"): the waves after the list. A wave past the list is a pure function of the
// tuning and its number, so a replay re-runs it identically and the client can read it (`waveGroups`) like the list.

import type { BossKind } from '@tdt/protocol';
import type { Tuning, WaveGroup } from './tuning';

/** One wave past the list in Endless. */
export interface EndlessWave {
  /** The listed wave whose creeps it repeats (21–30 with `cycleFrom` 21 and Full's 30 waves). */
  source: number;
  /** Full cycles past the list, from 1: waves 31–40 are cycle 1, 41–50 cycle 2. */
  cycle: number;
  /** Creep HP × this (bosses too): `hpFirstCycle` in cycle 1, then × `hpGrowthPerCycle` for each further cycle. */
  hp: number;
  /** Non-boss creep count × this: `countGrowthPerCycle` to the power of `cycle`. */
  count: number;
  /** This wave's boss, or null. */
  boss: BossKind | null;
  /** The source wave's groups without its boss, plus `boss` in the Mid lane. */
  groups: WaveGroup[];
}

/** `base` to the power of `n` (a whole number ≥ 0) by repeated multiplication: the same double on every engine. */
function power(base: number, n: number): number {
  let out = 1;
  for (let i = 0; i < n; i++) out *= base;
  return out;
}

/** The last wave of a match: the list's length, or Endless's `maxWave`. */
export function lastWave(tuning: Tuning): number {
  return tuning.endless.on ? tuning.endless.maxWave : tuning.waves.list.length;
}

/** Wave `wave` (1-based) when it is past the list in Endless, else null (a listed wave, or not Endless). */
export function endlessWave(tuning: Tuning, wave: number): EndlessWave | null {
  const e = tuning.endless;
  const listed = tuning.waves.list.length;
  if (!e.on || wave <= listed || listed === 0) return null;
  const from = Math.min(listed, Math.max(1, e.cycleFrom));
  const period = listed - from + 1;
  const past = wave - listed - 1;
  const source = from + (past % period);
  const cycle = Math.floor(past / period) + 1;
  const after = wave - listed;
  const boss = e.bossEvery > 0 && after % e.bossEvery === 0 ? (e.bosses[(after / e.bossEvery - 1) % e.bosses.length] ?? null) : null;
  const groups = (tuning.waves.list[source - 1] ?? []).filter((g) => !tuning.creeps[g.kind].boss);
  if (boss) groups.push({ kind: boss, perLane: 1, lanes: [1] });
  const hp = e.hpFirstCycle * power(e.hpGrowthPerCycle, cycle - 1);
  return { source, cycle, hp, count: power(e.countGrowthPerCycle, cycle), boss, groups };
}

/** The creeps of wave `wave` (1-based): the list's, Endless's past it, or none. */
export function waveGroups(tuning: Tuning, wave: number): WaveGroup[] {
  if (wave < 1) return [];
  return endlessWave(tuning, wave)?.groups ?? tuning.waves.list[wave - 1] ?? [];
}
