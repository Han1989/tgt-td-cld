// Hero skills: Q/W/E/R for every hero. Ranks and learning (R unlocks at
// level 6), instant and point-targeted casts, and the ground zones left by
// ultimates (Arrow Storm, Meteor). Passives (E) are applied where they act:
// Keen Eye in hero auto-attacks, the auras in combat.ts.

import type { HeroKind, SkillSlot } from '@tdt/protocol';
import {
  applySlow,
  controlTicks,
  creepsInRadius,
  damageCreep,
  emit,
  heroCanHit,
  heroStats,
  newId,
  spawnProjectile,
  stunCreep,
} from './combat';
import type { GameState, Hero, Zone } from './state';
import { secondsToTicks, type ActiveSkillStats } from './tuning';
import { dist } from './vec';

/** How a skill is used: cast at once, cast at a clicked point, or always on. */
export type SkillMode = 'instant' | 'point' | 'passive';

export const SKILL_MODES: Record<HeroKind, Record<SkillSlot, SkillMode>> = {
  ranger: { Q: 'instant', W: 'point', E: 'passive', R: 'point' },
  warden: { Q: 'instant', W: 'instant', E: 'passive', R: 'instant' },
  arcanist: { Q: 'point', W: 'point', E: 'passive', R: 'point' },
};

export interface SkillInfo {
  mode: SkillMode;
  manaCost: number;
  cooldown: number;
  /** Cast range of point skills; Multishot's reach. 0 for self-centred skills. */
  range: number;
  /** Area radius, 0 if the skill has none. */
  radius: number;
}

// ---------------------------------------------------------------------------
// Ranks and learning
// ---------------------------------------------------------------------------

export function maxRank(state: GameState, slot: SkillSlot): number {
  return slot === 'R' ? state.tuning.hero.ultimateLevels.length : state.tuning.hero.maxSkillRank;
}

/** Hero level needed for the next rank of `slot`, or 0 when it is at max rank. */
export function nextRankLevel(state: GameState, hero: Hero, slot: SkillSlot): number {
  const rank = hero.ranks[slot];
  if (rank >= maxRank(state, slot)) return 0;
  return slot === 'R' ? (state.tuning.hero.ultimateLevels[rank] ?? 0) : 1;
}

/** Why the hero cannot spend a skill point on `slot` now, or null if it can. */
export function learnBlocker(state: GameState, hero: Hero, slot: SkillSlot): string | null {
  if (hero.skillPoints <= 0) return 'No skill points';
  if (hero.ranks[slot] >= maxRank(state, slot)) return 'Skill at max rank';
  const level = nextRankLevel(state, hero, slot);
  if (hero.level < level) return `Needs hero level ${level}`;
  return null;
}

// ---------------------------------------------------------------------------
// Skill info
// ---------------------------------------------------------------------------

function activeStats(state: GameState, kind: HeroKind, slot: SkillSlot): ActiveSkillStats | null {
  const t = state.tuning.hero;
  switch (kind) {
    case 'ranger':
      return { Q: t.ranger.multishot, W: t.ranger.snareTrap, E: null, R: t.ranger.arrowStorm }[slot];
    case 'warden':
      return { Q: t.warden.cleave, W: t.warden.taunt, E: null, R: t.warden.lastStand }[slot];
    case 'arcanist':
      return { Q: t.arcanist.fireball, W: t.arcanist.frostNova, E: null, R: t.arcanist.meteor }[slot];
  }
}

function geometry(state: GameState, hero: Hero, slot: SkillSlot): { range: number; radius: number } {
  const t = state.tuning.hero;
  switch (hero.kind) {
    case 'ranger': {
      const r = t.ranger;
      return {
        Q: { range: r.attackRange + r.multishot.bonusRange, radius: 0 },
        W: { range: r.snareTrap.castRange, radius: r.snareTrap.rootRadius },
        E: { range: 0, radius: 0 },
        R: { range: r.arrowStorm.castRange, radius: r.arrowStorm.radius },
      }[slot];
    }
    case 'warden': {
      const w = t.warden;
      return {
        Q: { range: 0, radius: w.cleave.radius },
        W: { range: 0, radius: w.taunt.radius },
        E: { range: 0, radius: w.bulwarkAura.radius },
        R: { range: 0, radius: w.lastStand.stunRadius },
      }[slot];
    }
    case 'arcanist': {
      const a = t.arcanist;
      return {
        Q: { range: a.fireball.castRange, radius: a.fireball.radius },
        W: { range: a.frostNova.castRange, radius: a.frostNova.radius },
        E: { range: 0, radius: a.clarityAura.radius },
        R: { range: a.meteor.castRange, radius: a.meteor.radius },
      }[slot];
    }
  }
}

/** Rank index (0-based) used for numbers; an unlearned skill shows rank 1 values. */
function rankIndex(state: GameState, hero: Hero, slot: SkillSlot): number {
  return Math.max(0, Math.min(hero.ranks[slot], maxRank(state, slot)) - 1);
}

/** Mode, cost, cooldown, range and radius of a skill at its current rank. */
export function skillInfo(state: GameState, hero: Hero, slot: SkillSlot): SkillInfo {
  const active = activeStats(state, hero.kind, slot);
  const i = rankIndex(state, hero, slot);
  return {
    mode: SKILL_MODES[hero.kind][slot],
    manaCost: active?.manaCost[i] ?? 0,
    cooldown: active?.cooldown[i] ?? 0,
    ...geometry(state, hero, slot),
  };
}

// ---------------------------------------------------------------------------
// Casting
// ---------------------------------------------------------------------------

/** Why the hero cannot cast `slot` right now, or null if it can. */
export function castBlocker(state: GameState, hero: Hero, slot: SkillSlot): string | null {
  const info = skillInfo(state, hero, slot);
  if (hero.ranks[slot] === 0) return 'Skill not learned';
  if (info.mode === 'passive') return 'Passive skill';
  if (!hero.alive) return 'Hero is dead';
  if (state.tick < hero.stunUntil) return 'Stunned';
  if (hero.skillCd[slot] > 0) return 'Skill on cooldown';
  if (hero.mana < info.manaCost) return 'Not enough mana';
  return null;
}

function pay(state: GameState, hero: Hero, slot: SkillSlot): void {
  const info = skillInfo(state, hero, slot);
  hero.mana -= info.manaCost;
  hero.skillCd[slot] = secondsToTicks(info.cooldown);
}

/** Casts an instant (no-target) skill. Returns why it failed, or null. */
export function castInstant(state: GameState, hero: Hero, slot: SkillSlot): string | null {
  const blocker = castBlocker(state, hero, slot);
  if (blocker) return blocker;
  let result: string | null;
  switch (`${hero.kind}.${slot}`) {
    case 'ranger.Q':
      result = multishot(state, hero);
      break;
    case 'warden.Q':
      result = cleave(state, hero);
      break;
    case 'warden.W':
      result = taunt(state, hero);
      break;
    case 'warden.R':
      result = lastStand(state, hero);
      break;
    default:
      return 'Pick a target point';
  }
  if (result === null) emit(state, { type: 'cast', heroId: hero.id, slot, x: hero.x, y: hero.y });
  return result;
}

/**
 * Casts a point skill at (x, y); the hero is already in range. Emits a
 * `rejected` event if the cast is no longer possible (e.g. out of mana).
 */
export function castAtPoint(state: GameState, hero: Hero, slot: SkillSlot, x: number, y: number): void {
  const blocker = castBlocker(state, hero, slot);
  if (blocker) {
    emit(state, { type: 'rejected', player: hero.owner, command: 'cast', reason: blocker });
    return;
  }
  switch (`${hero.kind}.${slot}`) {
    case 'ranger.W':
      snareTrap(state, hero, x, y);
      break;
    case 'ranger.R':
      addZone(state, hero, 'arrowStorm', x, y);
      break;
    case 'arcanist.Q':
      fireball(state, hero, x, y);
      break;
    case 'arcanist.W':
      frostNova(state, hero, x, y);
      break;
    case 'arcanist.R':
      addZone(state, hero, 'meteor', x, y);
      break;
    default:
      return;
  }
  pay(state, hero, slot);
  emit(state, { type: 'cast', heroId: hero.id, slot, x, y });
}

// ---------------------------------------------------------------------------
// Ranger
// ---------------------------------------------------------------------------

/** Multishot: one arrow at each of the nearest N creeps in range. */
function multishot(state: GameState, hero: Hero): string | null {
  const s = state.tuning.hero.ranger.multishot;
  const i = rankIndex(state, hero, 'Q');
  const range = skillInfo(state, hero, 'Q').range;
  const targets = state.creeps
    .filter((c) => !c.dead && heroCanHit(state, hero, c) && dist(hero.x, hero.y, c.x, c.y) <= range)
    .sort((a, b) => dist(hero.x, hero.y, a.x, a.y) - dist(hero.x, hero.y, b.x, b.y) || a.id - b.id)
    .slice(0, s.targets[i] ?? 0);
  if (targets.length === 0) return 'No targets in range';
  pay(state, hero, 'Q');
  for (const c of targets) {
    spawnProjectile(state, hero, { kind: 'creep', id: c.id, x: c.x, y: c.y }, {
      style: 'multishot',
      speed: heroStats(state, hero).projectileSpeed,
      damage: s.damage[i] ?? 0,
      damageType: 'physical',
      source: hero.owner,
    });
  }
  return null;
}

function snareTrap(state: GameState, hero: Hero, x: number, y: number): void {
  const s = state.tuning.hero.ranger.snareTrap;
  state.traps.push({
    id: newId(state),
    owner: hero.owner,
    x,
    y,
    rank: hero.ranks.W,
    armTick: state.tick + secondsToTicks(s.armDelay),
    expireTick: state.tick + secondsToTicks(s.lifetime),
    done: false,
  });
}

/** Keen Eye: the multiplier for one auto-attack (1 = no crit). Rolls the seeded RNG only if learned. */
export function keenEyeMultiplier(state: GameState, hero: Hero, roll: () => number): number {
  if (hero.kind !== 'ranger' || hero.ranks.E === 0) return 1;
  const s = state.tuning.hero.ranger.keenEye;
  const i = rankIndex(state, hero, 'E');
  return roll() < (s.critChance[i] ?? 0) ? (s.critMultiplier[i] ?? 1) : 1;
}

// ---------------------------------------------------------------------------
// Warden
// ---------------------------------------------------------------------------

function cleave(state: GameState, hero: Hero): string | null {
  const s = state.tuning.hero.warden.cleave;
  const targets = creepsInRadius(state, hero.x, hero.y, s.radius, false);
  if (targets.length === 0) return 'No targets in range';
  pay(state, hero, 'Q');
  const damage = s.damage[rankIndex(state, hero, 'Q')] ?? 0;
  emit(state, { type: 'aoe', effect: 'cleave', x: hero.x, y: hero.y, radius: s.radius });
  for (const c of targets) damageCreep(state, c, damage, 'physical', hero.owner);
  return null;
}

/** Taunt: nearby ground creeps that can attack must chase the Warden, ignoring their leash. */
function taunt(state: GameState, hero: Hero): string | null {
  const s = state.tuning.hero.warden.taunt;
  const targets = creepsInRadius(state, hero.x, hero.y, s.radius, false).filter(
    (c) => state.tuning.creeps[c.kind].damage > 0,
  );
  if (targets.length === 0) return 'No targets in range';
  pay(state, hero, 'W');
  const ticks = secondsToTicks(s.duration[rankIndex(state, hero, 'W')] ?? 0);
  emit(state, { type: 'aoe', effect: 'taunt', x: hero.x, y: hero.y, radius: s.radius });
  for (const c of targets) {
    if (c.mode === 'lane') {
      c.anchorX = c.x;
      c.anchorY = c.y;
    }
    c.mode = 'chase';
    c.targetId = hero.id;
    c.tauntUntil = Math.max(c.tauntUntil, state.tick + controlTicks(state, c, ticks));
  }
  return null;
}

function lastStand(state: GameState, hero: Hero): string | null {
  const s = state.tuning.hero.warden.lastStand;
  const i = rankIndex(state, hero, 'R');
  pay(state, hero, 'R');
  hero.shieldUntil = state.tick + secondsToTicks(s.duration[i] ?? 0);
  hero.shieldPct = s.damageReduction[i] ?? 0;
  emit(state, { type: 'aoe', effect: 'lastStand', x: hero.x, y: hero.y, radius: s.stunRadius });
  const stun = secondsToTicks(s.stun[i] ?? 0);
  for (const c of creepsInRadius(state, hero.x, hero.y, s.stunRadius, false)) stunCreep(state, c, stun);
  return null;
}

// ---------------------------------------------------------------------------
// Arcanist
// ---------------------------------------------------------------------------

function fireball(state: GameState, hero: Hero, x: number, y: number): void {
  const s = state.tuning.hero.arcanist.fireball;
  spawnProjectile(state, hero, { kind: 'point', id: -1, x, y }, {
    style: 'fireball',
    speed: s.projectileSpeed,
    damage: s.damage[rankIndex(state, hero, 'Q')] ?? 0,
    damageType: 'magic',
    source: hero.owner,
    splash: s.radius,
    splashAir: true,
    aoe: 'fireball',
  });
}

function frostNova(state: GameState, hero: Hero, x: number, y: number): void {
  const s = state.tuning.hero.arcanist.frostNova;
  const i = rankIndex(state, hero, 'W');
  const damage = s.damage[i] ?? 0;
  const slowTicks = secondsToTicks(s.slowDuration);
  emit(state, { type: 'aoe', effect: 'frostNova', x, y, radius: s.radius });
  for (const c of creepsInRadius(state, x, y, s.radius, true)) {
    applySlow(state, c, s.slow[i] ?? 0, slowTicks);
    damageCreep(state, c, damage, 'magic', hero.owner);
  }
}

// ---------------------------------------------------------------------------
// Zones (Arrow Storm, Meteor)
// ---------------------------------------------------------------------------

function addZone(state: GameState, hero: Hero, kind: Zone['kind'], x: number, y: number): void {
  const t = state.tuning.hero;
  let radius: number;
  let pulseTicks: number;
  let endTick: number;
  if (kind === 'arrowStorm') {
    radius = t.ranger.arrowStorm.radius;
    pulseTicks = Math.max(1, secondsToTicks(t.ranger.arrowStorm.pulseInterval));
    endTick = state.tick + secondsToTicks(t.ranger.arrowStorm.duration);
  } else {
    radius = t.arcanist.meteor.radius;
    pulseTicks = Math.max(1, secondsToTicks(t.arcanist.meteor.delay));
    endTick = state.tick + pulseTicks;
  }
  state.zones.push({
    id: newId(state),
    kind,
    owner: hero.owner,
    x,
    y,
    radius,
    rank: hero.ranks.R,
    startTick: state.tick,
    endTick,
    nextPulseTick: state.tick + pulseTicks,
    pulseTicks,
    done: false,
  });
}

export function updateZones(state: GameState): void {
  for (const zone of state.zones) {
    if (zone.done) continue;
    if (state.tick >= zone.nextPulseTick && zone.nextPulseTick <= zone.endTick) {
      pulseZone(state, zone);
      zone.nextPulseTick += zone.pulseTicks;
    }
    if (state.tick >= zone.endTick) zone.done = true;
  }
}

function pulseZone(state: GameState, zone: Zone): void {
  const i = Math.max(0, zone.rank - 1);
  emit(state, { type: 'aoe', effect: zone.kind, x: zone.x, y: zone.y, radius: zone.radius });
  if (zone.kind === 'arrowStorm') {
    const damage = state.tuning.hero.ranger.arrowStorm.damagePerPulse[i] ?? 0;
    for (const c of creepsInRadius(state, zone.x, zone.y, zone.radius, true)) {
      damageCreep(state, c, damage, 'physical', zone.owner);
    }
  } else {
    const s = state.tuning.hero.arcanist.meteor;
    const damage = s.damage[i] ?? 0;
    const stun = secondsToTicks(s.stun[i] ?? 0);
    for (const c of creepsInRadius(state, zone.x, zone.y, zone.radius, false)) {
      stunCreep(state, c, stun);
      damageCreep(state, c, damage, 'magic', zone.owner);
    }
  }
}
