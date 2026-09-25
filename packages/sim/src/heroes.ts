// Hero orders (move, attack, attack-move, targeted casts), auto-attacks,
// skills, regeneration and respawn.

import type { SkillSlot } from '@tdt/protocol';
import {
  emit,
  heroDamage,
  heroMaxHp,
  heroMaxMana,
  heroStats,
  newId,
  respawnHero,
  spawnProjectile,
} from './combat';
import { getMap } from './map';
import { findPath, nearestWalkable } from './pathfinding';
import type { Creep, GameState, Hero } from './state';
import { secondsToTicks, TICK_RATE } from './tuning';
import { dist, moveToward } from './vec';

const REPATH_TICKS = 10;

export function updateHeroes(state: GameState, creepsById: Map<number, Creep>): void {
  for (const hero of state.heroes) updateHero(state, hero, creepsById);
}

function updateHero(state: GameState, hero: Hero, creepsById: Map<number, Creep>): void {
  if (!hero.alive) {
    if (state.tick >= hero.respawnTick) respawnHero(state, hero);
    return;
  }
  const s = heroStats(state, hero);
  hero.hp = Math.min(heroMaxHp(state, hero), hero.hp + s.hpRegen / TICK_RATE);
  hero.mana = Math.min(heroMaxMana(state, hero), hero.mana + s.manaRegen / TICK_RATE);
  if (hero.attackCd > 0) hero.attackCd--;
  for (const slot of Object.keys(hero.skillCd) as SkillSlot[]) {
    if (hero.skillCd[slot] > 0) hero.skillCd[slot]--;
  }
  if (state.tick < hero.stunUntil) return;

  const order = hero.order;
  switch (order.type) {
    case 'idle': {
      const target = acquire(state, hero, s.attackRange);
      if (target) tryAttack(state, hero, target);
      break;
    }
    case 'move':
      if (followPath(state, hero)) hero.order = { type: 'idle' };
      break;
    case 'attack': {
      const target = creepsById.get(order.targetId);
      if (!target || target.dead) hero.order = { type: 'idle' };
      else engage(state, hero, target);
      break;
    }
    case 'attackMove': {
      const target = acquire(state, hero, s.acquireRange);
      if (target) {
        engage(state, hero, target);
        break;
      }
      const goal = hero.path[hero.path.length - 1];
      if (!goal || dist(goal.x, goal.y, order.x, order.y) > 0.01) setPath(hero, order.x, order.y);
      if (followPath(state, hero)) hero.order = { type: 'idle' };
      break;
    }
    case 'castPoint': {
      const range = castRange(state, hero, order.slot);
      if (dist(hero.x, hero.y, order.x, order.y) <= range) {
        hero.path = [];
        castAtPoint(state, hero, order.slot, order.x, order.y);
        hero.order = { type: 'idle' };
      } else {
        chase(state, hero, order.x, order.y);
      }
      break;
    }
  }
}

/** Sets the hero's path to (x, y). Returns false if the point is unreachable. */
export function setPath(hero: Hero, x: number, y: number): boolean {
  const map = getMap();
  const goal = nearestWalkable(map, x, y);
  const path = goal && findPath(map, hero, goal);
  hero.path = path ?? [];
  return path !== null && path !== undefined;
}

/** Advances along the current path. Returns true when the path is finished. */
function followPath(state: GameState, hero: Hero): boolean {
  let budget = heroStats(state, hero).speed / TICK_RATE;
  while (budget > 0 && hero.path.length > 0) {
    const next = hero.path[0]!;
    const d = dist(hero.x, hero.y, next.x, next.y);
    if (d > 0) hero.facing = Math.atan2(next.y - hero.y, next.x - hero.x);
    if (moveToward(hero, next.x, next.y, budget)) {
      hero.path.shift();
      budget -= d;
    } else {
      budget = 0;
    }
  }
  return hero.path.length === 0;
}

function chase(state: GameState, hero: Hero, x: number, y: number): void {
  if (hero.path.length === 0 || state.tick >= hero.repathTick) {
    setPath(hero, x, y);
    hero.repathTick = state.tick + REPATH_TICKS;
  }
  followPath(state, hero);
}

function canHit(state: GameState, hero: Hero, creep: Creep): boolean {
  return !state.tuning.creeps[creep.kind].flying || heroStats(state, hero).ranged;
}

function inAttackRange(state: GameState, hero: Hero, creep: Creep): boolean {
  const reach = heroStats(state, hero).attackRange + state.tuning.creeps[creep.kind].radius;
  return dist(hero.x, hero.y, creep.x, creep.y) <= reach;
}

/** Nearest hittable creep within `range` of the hero. */
function acquire(state: GameState, hero: Hero, range: number): Creep | undefined {
  let best: Creep | undefined;
  let bestD = Infinity;
  for (const c of state.creeps) {
    if (c.dead || !canHit(state, hero, c)) continue;
    const d = dist(hero.x, hero.y, c.x, c.y) - state.tuning.creeps[c.kind].radius;
    if (d <= range && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

function engage(state: GameState, hero: Hero, target: Creep): void {
  if (!canHit(state, hero, target)) {
    hero.order = { type: 'idle' };
    return;
  }
  if (inAttackRange(state, hero, target)) {
    hero.path = [];
    tryAttack(state, hero, target);
  } else {
    chase(state, hero, target.x, target.y);
  }
}

function tryAttack(state: GameState, hero: Hero, target: Creep): void {
  hero.facing = Math.atan2(target.y - hero.y, target.x - hero.x);
  if (hero.attackCd > 0) return;
  const s = heroStats(state, hero);
  hero.attackCd = secondsToTicks(s.attackCooldown);
  spawnProjectile(state, hero, { kind: 'creep', id: target.id, x: target.x, y: target.y }, {
    style: 'hero',
    speed: s.projectileSpeed,
    damage: heroDamage(state, hero),
    damageType: 'physical',
    source: hero.owner,
  });
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export interface SkillInfo {
  targeted: boolean;
  manaCost: number;
  cooldown: number;
  range: number;
}

/** Cost/cooldown/range of a skill at its current rank (rank 1 if unlearned). */
export function skillInfo(state: GameState, hero: Hero, slot: SkillSlot): SkillInfo | null {
  const s = heroStats(state, hero);
  const i = Math.max(0, hero.ranks[slot] - 1);
  switch (slot) {
    case 'Q':
      return {
        targeted: false,
        manaCost: s.multishot.manaCost[i] ?? 0,
        cooldown: s.multishot.cooldown[i] ?? 0,
        range: s.attackRange + s.multishot.bonusRange,
      };
    case 'W':
      return {
        targeted: true,
        manaCost: s.snareTrap.manaCost[i] ?? 0,
        cooldown: s.snareTrap.cooldown[i] ?? 0,
        range: s.snareTrap.castRange,
      };
    default:
      return null;
  }
}

function castRange(state: GameState, hero: Hero, slot: SkillSlot): number {
  return skillInfo(state, hero, slot)?.range ?? 0;
}

/** Why the hero cannot cast `slot` right now, or null if it can. */
export function castBlocker(state: GameState, hero: Hero, slot: SkillSlot): string | null {
  const info = skillInfo(state, hero, slot);
  if (!info || hero.ranks[slot] === 0) return 'Skill not learned';
  if (!hero.alive) return 'Hero is dead';
  if (state.tick < hero.stunUntil) return 'Stunned';
  if (hero.skillCd[slot] > 0) return 'Skill on cooldown';
  if (hero.mana < info.manaCost) return 'Not enough mana';
  return null;
}

function payForCast(hero: Hero, slot: SkillSlot, info: SkillInfo): void {
  hero.mana -= info.manaCost;
  hero.skillCd[slot] = secondsToTicks(info.cooldown);
}

/** Multishot: one arrow at each of the nearest N creeps in range. */
export function castMultishot(state: GameState, hero: Hero): string | null {
  const blocker = castBlocker(state, hero, 'Q');
  if (blocker) return blocker;
  const info = skillInfo(state, hero, 'Q')!;
  const s = heroStats(state, hero).multishot;
  const rank = hero.ranks.Q - 1;
  const targets = state.creeps
    .filter((c) => !c.dead && canHit(state, hero, c) && dist(hero.x, hero.y, c.x, c.y) <= info.range)
    .sort((a, b) => dist(hero.x, hero.y, a.x, a.y) - dist(hero.x, hero.y, b.x, b.y) || a.id - b.id)
    .slice(0, s.targets[rank] ?? 0);
  if (targets.length === 0) return 'No targets in range';
  payForCast(hero, 'Q', info);
  for (const c of targets) {
    spawnProjectile(state, hero, { kind: 'creep', id: c.id, x: c.x, y: c.y }, {
      style: 'multishot',
      speed: heroStats(state, hero).projectileSpeed,
      damage: s.damage[rank] ?? 0,
      damageType: 'physical',
      source: hero.owner,
    });
  }
  emit(state, { type: 'cast', heroId: hero.id, slot: 'Q', x: hero.x, y: hero.y });
  return null;
}

function castAtPoint(state: GameState, hero: Hero, slot: SkillSlot, x: number, y: number): void {
  const blocker = castBlocker(state, hero, slot);
  if (blocker) {
    emit(state, { type: 'rejected', player: hero.owner, command: 'cast', reason: blocker });
    return;
  }
  if (slot !== 'W') return;
  const info = skillInfo(state, hero, slot)!;
  const s = heroStats(state, hero).snareTrap;
  payForCast(hero, slot, info);
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
  emit(state, { type: 'cast', heroId: hero.id, slot, x, y });
}
