// Wave timer, wave income, call-early and creep spawning.

import type { CreepKind, LaneId, PlayerId } from '@tdt/protocol';
import { initBoss } from './bosses';
import { emit, newId, random } from './combat';
import { getMap } from './map';
import type { Creep, GameState } from './state';
import { secondsToTicks, TICK_RATE } from './tuning';

export function totalWaves(state: GameState): number {
  return state.tuning.waves.list.length;
}

export function waveIncome(state: GameState, wave: number): number {
  const e = state.tuning.economy;
  return e.waveIncomeBase + e.waveIncomePerWave * (wave - 1);
}

/** Gold each player would get for calling the next wave right now. */
export function callEarlyBonus(state: GameState): number {
  if (state.nextWaveTick < 0) return 0;
  const secondsLeft = Math.max(0, state.nextWaveTick - state.tick) / TICK_RATE;
  return Math.floor(secondsLeft * state.tuning.economy.callEarlyGoldPerSecond);
}

export function callEarly(state: GameState, by: PlayerId): void {
  const bonus = callEarlyBonus(state);
  for (const p of state.players) p.gold += bonus;
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
  for (const p of state.players) p.gold += income;
  emit(state, { type: 'waveStart', wave, income });

  const t = state.tuning.waves;
  state.nextWaveTick = wave < totalWaves(state) ? state.tick + secondsToTicks(t.interval) : -1;

  const groups = t.list[wave - 1] ?? [];
  const spawnGap = secondsToTicks(t.spawnInterval);
  for (const lane of [0, 1, 2] as LaneId[]) {
    const laneGroups = groups.filter((g) => g.lanes.includes(lane));
    const isBoss = (kind: CreepKind) => state.tuning.creeps[kind].boss;
    const regular = laneGroups.filter((g) => !isBoss(g.kind));
    const bosses = laneGroups.filter((g) => isBoss(g.kind));
    // Interleave kinds so a lane gets a mixed stream, bosses last.
    const order: CreepKind[] = [];
    const left = regular.map((g) => scaledCount(state, g.perLane));
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
    order.forEach((kind, i) => {
      state.spawnQueue.push({ tick: state.tick + i * spawnGap, kind, lane, wave });
    });
  }
}

/** Extra players beyond the first, for player-count scaling. */
function extraPlayers(state: GameState): number {
  return Math.max(0, state.players.length - 1);
}

/** Creeps per lane after player-count scaling (+30% per extra player by default). */
export function scaledCount(state: GameState, perLane: number): number {
  return Math.round(perLane * (1 + state.tuning.playerScaling.countPerExtraPlayer * extraPlayers(state)));
}

/**
 * Creep HP multiplier for the player count on `wave`: the table value for that many players, plus the
 * early bonus for that player count, fading out linearly over the first `earlyWaves` waves, plus the late
 * bonus, growing linearly over the last `lateWaves` waves (full on the final wave).
 */
export function playerHpMultiplier(state: GameState, wave: number): number {
  const ps = state.tuning.playerScaling;
  const i = Math.max(0, state.players.length - 1);
  const at = (list: number[], fallback: number) => list[Math.min(i, list.length - 1)] ?? fallback;
  const fade = Math.max(0, 1 - (wave - 1) / ps.earlyWaves);
  const lateStart = state.tuning.waves.list.length - ps.lateWaves;
  const ramp = ps.lateWaves > 0 ? Math.min(1, Math.max(0, (wave - lateStart) / ps.lateWaves)) : 0;
  return at(ps.hp, 1) + at(ps.earlyHpBonus, 0) * fade + at(ps.lateHpBonus, 0) * ramp;
}

export function creepMaxHp(state: GameState, kind: CreepKind, wave: number): number {
  const base = state.tuning.creeps[kind].hp;
  const waveMult = 1 + state.tuning.waves.hpGrowthPerWave * (wave - 1);
  const playerMult = playerHpMultiplier(state, wave);
  return Math.round(base * waveMult * playerMult);
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
    magicResist: stats.magicResist,
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
  return creep;
}
