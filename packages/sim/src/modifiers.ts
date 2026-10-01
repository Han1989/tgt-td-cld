// Lane surges and match modifiers (docs/REPLAYABILITY.md §2).
// The draw and the surge schedule come from the match seed, not from the match RNG, so a
// reroll or a "no modifiers" choice does not move creep offsets, and a replay repeats them.

import { MODIFIERS, type CreepKind, type LaneId, type Modifier, type SurgeNotice } from '@tdt/protocol';
import type { GameState } from './state';
import type { Tuning } from './tuning';

/** Deterministic 32-bit mix. Not the match RNG. */
export function mix32(seed: number, salt: number): number {
  let x = (seed ^ Math.imul(salt | 0, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * One or two modifiers from `seed`, and a different draw for the host's one reroll.
 * Both lists follow `MODIFIERS` order so the lobby text is stable.
 */
export function modifierRolls(seed: number): { offer: Modifier[]; reroll: Modifier[] } {
  const take = (salt: number): Modifier[] => {
    const count = (mix32(seed, salt) % 2) + 1;
    let s = mix32(seed, salt + 99);
    const order = [...MODIFIERS];
    for (let i = order.length - 1; i > 0; i--) {
      s = mix32(s, i + 1);
      const j = s % (i + 1);
      const swap = order[i]!;
      order[i] = order[j]!;
      order[j] = swap;
    }
    const picked = order.slice(0, count);
    return MODIFIERS.filter((m) => picked.includes(m));
  };
  const offer = take(1);
  let reroll = take(2);
  let salt = 3;
  while (sameModifiers(offer, reroll) && salt < 12) {
    reroll = take(salt);
    salt++;
  }
  return { offer, reroll };
}

export function sameModifiers(a: readonly Modifier[], b: readonly Modifier[]): boolean {
  return a.length === b.length && a.every((m, i) => m === b[i]);
}

/** Known modifiers only, no duplicates, at most two, in `MODIFIERS` order. */
export function normalizeModifiers(list: readonly string[] | undefined): Modifier[] {
  const picked: Modifier[] = [];
  for (const raw of list ?? []) {
    if (!(MODIFIERS as readonly string[]).includes(raw)) continue;
    const id = raw as Modifier;
    if (picked.includes(id)) continue;
    picked.push(id);
    if (picked.length >= 2) break;
  }
  return MODIFIERS.filter((m) => picked.includes(m));
}

/**
 * Surge lane of each wave (index 0 unused). Null means the wave is spread across the lanes.
 * From `fromWave`, about one wave in `period` surges. The lane is the seed's, not the match RNG's.
 */
export function planSurgeLanes(seed: number, waveCount: number, tuning: Tuning): (LaneId | null)[] {
  const { fromWave, period } = tuning.surges;
  const lanes: (LaneId | null)[] = [null];
  for (let wave = 1; wave <= waveCount; wave++) {
    if (wave < fromWave || period < 2 || mix32(seed, wave * 17 + 3) % period !== 0) {
      lanes.push(null);
      continue;
    }
    lanes.push((mix32(seed, wave * 29 + 11) % 3) as LaneId);
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
  return state.players.length <= 1 ? s.soloShare : s.share;
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

/**
 * Ironclad and Sky Tide change what spawns, not how many. A spread of ground creeps (not Brutes,
 * bosses or flyers) becomes a Brute or a Wisp. The slot mixes the wave and the lane, so the lead
 * creep of every lane is not always the one that changes. With both modifiers, the two replacements
 * take different slots.
 */
export function flavorKind(
  tuning: Tuning,
  modifiers: readonly Modifier[],
  kind: CreepKind,
  index: number,
  wave = 1,
  lane = 0,
): CreepKind {
  const stats = tuning.creeps[kind];
  if (stats.boss || stats.flying || kind === 'brute') return kind;
  // Spread through the wave. Index 0 is the lead creep of every lane, so a plain `index % n` would
  // turn that lead creep into a Brute on every lane from wave 1.
  const slot = wave * 13 + lane * 5 + index;
  const iron = modifiers.includes('ironclad');
  const sky = modifiers.includes('skyTide');
  const ironStats = tuning.modifierStats.ironclad;
  const skyStats = tuning.modifierStats.skyTide;
  const ironOn = iron && wave >= ironStats.fromWave;
  const skyOn = sky && wave >= skyStats.fromWave;
  if (ironOn && skyOn) {
    const span = ironStats.every + skyStats.every;
    if (slot % span === 0) return 'brute';
    if (slot % span === ironStats.every) return 'wisp';
    return kind;
  }
  if (ironOn && slot % ironStats.every === 0) return 'brute';
  if (skyOn && slot % skyStats.every === 0) return 'wisp';
  return kind;
}

export function bountyFactor(state: GameState): number {
  const m = state.tuning.modifierStats;
  let factor = 1;
  if (state.modifiers.includes('swift')) factor *= m.swift.bounty;
  if (state.modifiers.includes('goldRush')) factor *= m.goldRush.bounty;
  return factor;
}

export function goldFactor(state: GameState): number {
  return state.modifiers.includes('goldRush') ? state.tuning.modifierStats.goldRush.gold : 1;
}

export function countFactor(state: GameState): number {
  return state.modifiers.includes('goldRush') ? state.tuning.modifierStats.goldRush.count : 1;
}

export function xpFactor(state: GameState): number {
  return state.modifiers.includes('fog') ? state.tuning.modifierStats.fog.xp : 1;
}

export function speedFactor(state: GameState): number {
  return state.modifiers.includes('swift') ? state.tuning.modifierStats.swift.speed : 1;
}

/** Fog shortens tower range. 1 when Fog is off. */
export function towerRangeScale(modifiers: readonly Modifier[], tuning: Tuning): number {
  return modifiers.includes('fog') ? tuning.modifierStats.fog.towerRange : 1;
}

export function scaledTowerRange(state: GameState, range: number): number {
  return range * towerRangeScale(state.modifiers, state.tuning);
}
