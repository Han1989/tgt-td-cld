// Hero orders (move, attack, attack-move, targeted casts), auto-attacks,
// skills, regeneration and respawn.

import type { SkillSlot } from '@tdt/protocol';
import {
  damageCreep,
  heroCanHit,
  heroDamage,
  heroManaRegen,
  heroMaxHp,
  heroMaxMana,
  heroStats,
  random,
  respawnHero,
  spawnProjectile,
} from './combat';
import { getMap } from './map';
import { findPath, nearestWalkable } from './pathfinding';
import { castAtPoint, keenEyeMultiplier, skillInfo } from './skills';
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
  hero.mana = Math.min(heroMaxMana(state, hero), hero.mana + heroManaRegen(state, hero) / TICK_RATE);
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
    case 'move': {
      // Portrait spike: shoot the nearest enemy in range while walking (the path is kept).
      const target = state.moveAndShoot ? acquire(state, hero, s.attackRange) : undefined;
      if (target) tryAttack(state, hero, target);
      if (followPath(state, hero)) hero.order = { type: 'idle' };
      break;
    }
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
      const range = skillInfo(state, hero, order.slot).range;
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

function inAttackRange(state: GameState, hero: Hero, creep: Creep): boolean {
  const reach = heroStats(state, hero).attackRange + state.tuning.creeps[creep.kind].radius;
  return dist(hero.x, hero.y, creep.x, creep.y) <= reach;
}

/** Nearest hittable creep within `range` of the hero. */
function acquire(state: GameState, hero: Hero, range: number): Creep | undefined {
  let best: Creep | undefined;
  let bestD = Infinity;
  for (const c of state.creeps) {
    if (c.dead || !heroCanHit(state, hero, c)) continue;
    const d = dist(hero.x, hero.y, c.x, c.y) - state.tuning.creeps[c.kind].radius;
    if (d <= range && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

function engage(state: GameState, hero: Hero, target: Creep): void {
  if (!heroCanHit(state, hero, target)) {
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
  const mult = keenEyeMultiplier(state, hero, () => random(state));
  const damage = heroDamage(state, hero) * mult;
  if (!s.ranged) {
    // Melee hits land at once.
    damageCreep(state, target, damage, s.damageType, hero.owner);
    return;
  }
  spawnProjectile(state, hero, { kind: 'creep', id: target.id, x: target.x, y: target.y }, {
    style: mult > 1 ? 'crit' : hero.kind,
    speed: s.projectileSpeed,
    damage,
    damageType: s.damageType,
    source: hero.owner,
    crit: mult > 1,
  });
}

