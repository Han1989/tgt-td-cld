// Wave timer, wave income, call-early and creep spawning.

import type { CreepKind, LaneId, PlayerId } from '@tdt/protocol';
import { initBoss } from './bosses';
import { emit, newId, random } from './combat';
import { isPracticeAlly, onBossSpawned, teamSize } from './coop';
import { getMap } from './map';
import { countFactor, flavorKind, goldFactor, surgeCounts, surgeNotice, surgeShare } from './modifiers';
import type { Creep, GameState } from './state';
import { secondsToTicks, TICK_RATE, type DifficultyBand, type WaveGroup } from './tuning';

export function totalWaves(state: GameState): number {
  return state.tuning.waves.list.length;
}

export function waveIncome(state: GameState, wave: number): number {
  const e = state.tuning.economy;
  return Math.round((e.waveIncomeBase + e.waveIncomePerWave * (wave - 1)) * goldFactor(state));
}

/** Gold each player would get for calling the next wave right now. */
export function callEarlyBonus(state: GameState): number {
  if (state.nextWaveTick < 0) return 0;
  const secondsLeft = Math.max(0, state.nextWaveTick - state.tick) / TICK_RATE;
  return Math.floor(secondsLeft * state.tuning.economy.callEarlyGoldPerSecond);
}

export function callEarly(state: GameState, by: PlayerId): void {
  const bonus = callEarlyBonus(state);
  for (const p of state.players) if (!isPracticeAlly(state, p.id)) p.gold += bonus;
  emit(state, { type: 'callEarly', by, bonus });
  state.nextWaveTick = state.tick;
}

export function updateWaves(state: GameState): void {
  if (state.nextWaveTick >= 0 && state.tick >= state.nextWaveTick) startWave(state);

  if (state.spawnQueue.length === 0) return;
  const due = state.spawnQueue.filter((s) => s.tick <= state.tick);
  if (due.length === 0) return;
  state.spawnQueue = state.spawnQueue.filter((s) => s.tick > state.tick);
  for (const s of due) spawnCreep(state, s.kind, s.lane, s.wave);
}

function startWave(state: GameState): void {
  state.wave++;
  state.phase = 'waves';
  const wave = state.wave;
  const income = waveIncome(state, wave);
  for (const p of state.players) if (!isPracticeAlly(state, p.id)) p.gold += income;
  emit(state, { type: 'waveStart', wave, income });

  const t = state.tuning.waves;
  state.nextWaveTick = wave < totalWaves(state) ? state.tick + secondsToTicks(t.interval) : -1;

  // This wave's surge, and the announcement of the next one (a wave ahead).
  state.surgeLane = state.surgeLanes[wave] ?? null;
  const ahead = surgeNotice(state.surgeLanes, wave + 1);
  const changed = ahead?.wave !== state.nextSurge?.wave || ahead?.lane !== state.nextSurge?.lane;
  state.nextSurge = ahead;
  if (ahead && changed) emit(state, { type: 'surge', wave: ahead.wave, lane: ahead.lane });

  const groups = t.list[wave - 1] ?? [];
  const natural = secondsToTicks(t.spawnInterval);
  const intervalTicks = secondsToTicks(t.interval);
  const surge = state.surgeLane;
  const share = surgeShare(state);
  const isBoss = (kind: CreepKind) => state.tuning.creeps[kind].boss;
  const countFor = (g: WaveGroup, lane: LaneId): number => {
    if (!g.lanes.includes(lane)) return 0;
    if (isBoss(g.kind)) return g.perLane;
    // A surge piles regular creeps that were listed on every lane. A single-lane group stays put.
    // Wisps fly from the portal they spawn at. Leaving them on the listed lane keeps three
    // flight paths; only the walking creeps pile onto the surge lane.
    if (surge != null && g.lanes.length >= 3 && !state.tuning.creeps[g.kind].flying) {
      const total = scaledCount(state, g.perLane) * g.lanes.length;
      return surgeCounts(total, surge, share)[lane];
    }
    return scaledCount(state, g.perLane);
  };
  for (const lane of [0, 1, 2] as LaneId[]) {
    const laneGroups = groups.filter((g) => g.lanes.includes(lane));
    const regular = laneGroups.filter((g) => !isBoss(g.kind));
    const bosses = laneGroups.filter((g) => isBoss(g.kind));
    // Interleave kinds so a lane gets a mixed stream, bosses last.
    const order: CreepKind[] = [];
    const left = regular.map((g) => countFor(g, lane));
    let any = true;
    while (any) {
      any = false;
      regular.forEach((g, i) => {
        if ((left[i] ?? 0) > 0) {
          order.push(g.kind);
          left[i] = (left[i] ?? 0) - 1;
          any = true;
        }
      });
    }
    for (const b of bosses) for (let i = 0; i < b.perLane; i++) order.push(b.kind);
    // A surged lane can hold most of the wave. Tighten the gap so the last creep still spawns
    // before the next wave, instead of stacking two waves on that portal. An ordinary lane
    // keeps the natural gap, matching matches that have no surge.
    const gap = surge == null ? natural : spawnGap(natural, intervalTicks, order.length);
    order.forEach((kind, i) => {
      state.spawnQueue.push({
        tick: state.tick + i * gap,
        kind: flavorKind(state.tuning, state.modifiers, kind, i, wave, lane),
        lane,
        wave,
      });
    });
  }
}

/** Ticks between spawns in one lane. The natural gap, unless that would run past the next wave. */
function spawnGap(natural: number, intervalTicks: number, count: number): number {
  if (count <= 1) return natural;
  if ((count - 1) * natural < intervalTicks) return natural;
  return Math.max(1, Math.floor((intervalTicks - 1) / (count - 1)));
}

/** Extra players beyond the first, for player-count scaling. */
function extraPlayers(state: GameState): number {
  return Math.max(0, teamSize(state) - 1);
}

/**
 * Difficulty multipliers on wave `wave` (1-based). Normal is 1 and 1, so HP and counts match the formulas
 * without a difficulty. The late terms grow from 0 at the start of the last third to their full value on
 * the final wave. A band may set `ease` to follow match progress instead (still 0 at wave 1, full on the
 * final wave). Boss counts are not multiplied (callers apply `count` only through `scaledCount`).
 */
function difficultyBand(state: GameState): DifficultyBand {
  const base = state.tuning.difficulty[state.difficulty];
  const over = state.difficulty === 'hard' ? state.tuning.modes[state.mode].hard : undefined;
  // A team-size row replaces the scalars. Missing optional fields stay off — they must not inherit another
  // row's extra creeps or the final-wave strain (Quick rows leave those unset on purpose).
  const picked = over?.byPlayers?.[state.players.length - 1] ?? base.byPlayers?.[state.players.length - 1];
  const src = picked ?? over ?? base;
  const hp = src.hp ?? base.hp;
  const lateHp = src.lateHp ?? base.lateHp;
  return {
    hp,
    count: src.count ?? base.count,
    lateHp,
    lateCount: src.lateCount ?? base.lateCount,
    bossHp: src.bossHp ?? hp,
    lateBossHp: src.lateBossHp ?? lateHp,
    ease: src.ease,
    extra: src.extra ?? 0,
    lateExtra: src.lateExtra ?? 0,
    magicResist: src.magicResist ?? 0,
  };
}

export function difficultyScaling(
  state: GameState,
  wave: number,
): { hp: number; count: number; bossHp: number; extra: number; magicResist: number } {
  const band = difficultyBand(state);
  const waves = state.tuning.waves.list.length;
  const lateWaves = Math.max(1, Math.ceil(waves / 3));
  const start = waves - lateWaves;
  const linear = Math.min(1, Math.max(0, (wave - start) / lateWaves));
  const progress = (wave - 1) / Math.max(1, waves - 1);
  const ramp = band.ease != null && band.ease > 0 ? Math.pow(progress, band.ease) : linear;
  return {
    hp: band.hp + band.lateHp * ramp,
    count: band.count + band.lateCount * ramp,
    bossHp: (band.bossHp ?? band.hp) + (band.lateBossHp ?? band.lateHp) * ramp,
    extra: (band.extra ?? 0) + (band.lateExtra ?? 0) * ramp,
    magicResist: band.magicResist ?? 0,
  };
}

/**
 * Whole creeps from a fractional `extra`. The fraction steps through groups (salted by the listed size and
 * the wave) so a 0.5 adds one creep to every other group instead of rounding the whole wave up at once.
 */
function wholeExtra(extra: number, wave: number, perLane: number): number {
  if (extra <= 0) return 0;
  const whole = Math.floor(extra + 1e-9);
  const frac = extra - whole;
  if (frac <= 1e-9) return whole;
  const phase = ((wave * 5 + perLane * 3) % 32) / 32;
  return whole + (frac > phase ? 1 : 0);
}

/** Creeps per lane after player-count scaling (+30% per extra player by default) and difficulty. */
export function scaledCount(state: GameState, perLane: number): number {
  const scale = difficultyScaling(state, Math.max(1, state.wave));
  let multiplied = Math.round(
    perLane * scale.count * (1 + state.tuning.playerScaling.countPerExtraPlayer * extraPlayers(state)),
  );
  const rush = countFactor(state);
  if (rush !== 1) multiplied = Math.max(0, Math.round(multiplied * rush));
  return multiplied + wholeExtra(scale.extra, Math.max(1, state.wave), perLane);
}

/**
 * Creep HP multiplier for the player count on `wave`: the table value for that many players, plus the
 * early bonus for that player count, fading out linearly over the first `earlyWaves` waves, plus the late
 * bonus, growing linearly over the last `lateWaves` waves (full on the final wave).
 */
export function playerHpMultiplier(state: GameState, wave: number): number {
  const ps = state.tuning.playerScaling;
  const i = Math.max(0, teamSize(state) - 1);
  const at = (list: number[], fallback: number) => list[Math.min(i, list.length - 1)] ?? fallback;
  const fade = Math.max(0, 1 - (wave - 1) / ps.earlyWaves);
  const lateStart = state.tuning.waves.list.length - ps.lateWaves;
  const ramp = ps.lateWaves > 0 ? Math.min(1, Math.max(0, (wave - lateStart) / ps.lateWaves)) : 0;
  return at(ps.hp, 1) + at(ps.earlyHpBonus, 0) * fade + at(ps.lateHpBonus, 0) * ramp;
}

export function creepMaxHp(state: GameState, kind: CreepKind, wave: number): number {
  const base = state.tuning.creeps[kind].hp;
  const w = state.tuning.waves;
  const waveMult = 1 + w.hpGrowthPerWave * (wave - 1) + w.lateHpGrowthPerWave * Math.max(0, wave - w.lateGrowthFrom);
  const playerMult = playerHpMultiplier(state, wave);
  const scale = difficultyScaling(state, wave);
  const diffHp = state.tuning.creeps[kind].boss ? scale.bossHp : scale.hp;
  return Math.round(base * waveMult * playerMult * diffHp);
}

export function spawnCreep(state: GameState, kind: CreepKind, lane: LaneId, wave: number): Creep {
  const path = getMap().lanes[lane]!;
  const portal = path.waypoints[0]!;
  const spread = state.tuning.waves.laneSpread;
  const offX = (random(state) * 2 - 1) * spread;
  const offY = (random(state) * 2 - 1) * spread;
  const maxHp = creepMaxHp(state, kind, wave);
  const stats = state.tuning.creeps[kind];
  const creep: Creep = {
    id: newId(state),
    kind,
    lane,
    wave,
    x: portal.x + offX,
    y: portal.y + Math.max(0, offY),
    hp: maxHp,
    maxHp,
    armor: stats.armor + state.tuning.waves.armorGrowthPerWave * (wave - 1),
    magicResist: Math.min(
      state.tuning.combat.maxMagicResist,
      stats.magicResist + difficultyScaling(state, wave).magicResist,
    ),
    wp: 1,
    offX,
    offY,
    mode: 'lane',
    anchorX: 0,
    anchorY: 0,
    targetId: -1,
    attackCd: 0,
    abilityCd: 0,
    abilityUses: 0,
    hide: null,
    slowPct: 0,
    slowUntil: 0,
    rootUntil: 0,
    stunUntil: 0,
    tauntUntil: 0,
    towerTicks: 0,
    shred: 0,
    shredUntil: 0,
    remaining: path.remainingFrom[0] ?? 0,
    dead: false,
  };
  initBoss(state, creep);
  state.creeps.push(creep);
  onBossSpawned(state, creep);
  return creep;
}
