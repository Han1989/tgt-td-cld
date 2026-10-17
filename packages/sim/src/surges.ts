// Lane surges (docs/REPLAYABILITY.md §2).
// The surge schedule comes from the match seed, not from the match RNG, so it does not move creep
// offsets, and a replay repeats it.

import type { LaneId, SurgeNotice } from '@tdt/protocol';
import type { GameState } from './state';
import type { Tuning } from './tuning';

/**
 * Which waves surge. `a` and `b` mix the wave number; `laneA` and `laneB` pick the lane.
 * The pair is the one that keeps the balance-gate seeds inside the Heart band (Decision Log).
 */
const surgeMix = { a: 31, b: 32, laneA: 1, laneB: 1 };

/** Deterministic 32-bit mix. Not the match RNG. */
export function mix32(seed: number, salt: number): number {
  let x = (seed ^ Math.imul(salt | 0, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Surge lane of each wave (index 0 unused). Null means the wave is spread across the lanes.
 * From `fromWave`, about one wave in `period` surges. The lane is the seed's, not the match RNG's.
 */
export function planSurgeLanes(seed: number, waveCount: number, tuning: Tuning): (LaneId | null)[] {
  const { fromWave, period } = tuning.surges;
  const lanes: (LaneId | null)[] = [null];
  for (let wave = 1; wave <= waveCount; wave++) {
    const groups = tuning.waves.list[wave - 1] ?? [];
    const bossWave = groups.some((g) => tuning.creeps[g.kind].boss);
    // Boss waves already spike. The last two waves stay on the listed lanes so the
    // finale is the wave list, not a pile the bot rearranged for.
    const finale = wave > waveCount - 2;
    if (bossWave || finale || wave < fromWave || period < 2 || mix32(seed, wave * surgeMix.a + surgeMix.b) % period !== 0) {
      lanes.push(null);
      continue;
    }
    lanes.push((mix32(seed, wave * surgeMix.laneA + surgeMix.laneB) % 3) as LaneId);
  }
  return lanes;
}

export function surgeNotice(lanes: readonly (LaneId | null)[], wave: number): SurgeNotice | null {
  const lane = lanes[wave] ?? null;
  return lane == null ? null : { wave, lane };
}

/** Share of a surge wave's regular creeps that spawn on the surge lane. Solo is milder. */
export function surgeShare(state: GameState): number {
  const s = state.tuning.surges;
  const players = state.players.length;
  if (players <= 1) return s.soloShare;
  if (players >= 3) return s.trioShare;
  return s.share;
}

/**
 * How many of `total` regular creeps each lane gets, with `share` of them on `surge`.
 * The leftover is split across the other two lanes; an odd leftover goes to the lower lane index.
 */
export function surgeCounts(total: number, surge: LaneId, share: number): [number, number, number] {
  const on = Math.max(0, Math.min(total, Math.round(total * share)));
  const rest = total - on;
  const others = ([0, 1, 2] as LaneId[]).filter((l) => l !== surge);
  const low = Math.min(others[0]!, others[1]!);
  const high = Math.max(others[0]!, others[1]!);
  const out: [number, number, number] = [0, 0, 0];
  out[surge] = on;
  out[low] = Math.ceil(rest / 2);
  out[high] = Math.floor(rest / 2);
  return out;
}
