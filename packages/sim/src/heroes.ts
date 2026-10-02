// Hero orders (move, attack, attack-move, targeted casts), auto-attacks,
// melee auto-engage, skills, regeneration and respawn.

import type { SkillSlot } from '@tdt/protocol';
import {
  damageCreep,
  heroCanHit,
  heroDamage,
  heroHpRegen,
  heroManaRegen,
  heroMaxHp,
  heroMaxMana,
  heroStats,
  random,
  respawnHero,
  emit,
  spawnProjectile,
} from './combat';
import { hitFrom } from './coop';
import { getMap } from './map';
import { findPath, nearestWalkable } from './pathfinding';
import { bloodHungerHeal, castAtPoint, keenEyeMultiplier, skillInfo } from './skills';
import type { Creep, GameState, Hero } from './state';
import { secondsToTicks, TICK_RATE } from './tuning';
import { dist, moveToward } from './vec';

const REPATH_TICKS = 10;
/**
 * After a `move`, auto-chase stays off this many ticks. The joystick resends about every 2 ticks
 * (100 ms); 6 ticks covers a dropped resend. `stop` clears it, so letting go engages at once.
 * A click-to-move that arrives inside the window waits out the rest, then engages.
 */
export const DRIVE_HOLD_TICKS = 6;

export function updateHeroes(state: GameState, creepsById: Map<number, Creep>): void {
  for (const hero of state.heroes) updateHero(state, hero, creepsById);
}

function updateHero(state: GameState, hero: Hero, creepsById: Map<number, Creep>): void {
  if (!hero.alive) {
    hero.guard = null;
    if (state.tick >= hero.respawnTick) respawnHero(state, hero);
    return;
  }
  // Any order (the joystick sends moves) ends the idle hero's guard; it starts again where the hero next stops.
  if (hero.order.type !== 'idle') hero.guard = null;
  const s = heroStats(state, hero);
  hero.hp = Math.min(heroMaxHp(state, hero), hero.hp + heroHpRegen(state, hero) / TICK_RATE);
  hero.mana = Math.min(heroMaxMana(state, hero), hero.mana + heroManaRegen(state, hero) / TICK_RATE);
  if (hero.attackCd > 0) hero.attackCd--;
  for (const slot of Object.keys(hero.skillCd) as SkillSlot[]) {
    if (hero.skillCd[slot] > 0) hero.skillCd[slot]--;
  }
  if (state.tick < hero.stunUntil) return;

  const order = hero.order;
  switch (order.type) {
    case 'idle':
      // A stick that just finished its step is still held: shoot in range, do not step toward a creep.
      if (s.ranged || state.tick < hero.drivenUntil) autoAttack(state, hero);
      else autoEngage(state, hero);
      break;
    case 'move':
      // Heroes shoot the nearest enemy in range while they walk (the path is kept). No chase.
      autoAttack(state, hero);
      if (hero.path.length === 0) {
        const dx = order.x - hero.x;
        const dy = order.y - hero.y;
        if (dx * dx + dy * dy > 1e-4) hero.facing = Math.atan2(dy, dx);
      }
      if (followPath(state, hero) && state.tick >= hero.drivenUntil) hero.order = { type: 'idle' };
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
      const range = skillInfo(state, hero, order.slot).range;
      if (dist(hero.x, hero.y, order.x, order.y) <= range) {
        hero.path = [];
        castAtPoint(state, hero, order.slot, order.x, order.y);
        hero.order = { type: 'idle' };
      } else {
        autoAttack(state, hero);
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

/**
 * How far apart (centre to centre) a hero and a creep can be for the hero's attack to land: attack range plus
 * both radii, the same rule creeps use to hit heroes.
 */
function reach(state: GameState, hero: Hero, creep: Creep): number {
  return heroStats(state, hero).attackRange + state.tuning.creeps[creep.kind].radius + heroStats(state, hero).radius;
}

function inAttackRange(state: GameState, hero: Hero, creep: Creep): boolean {
  return dist(hero.x, hero.y, creep.x, creep.y) <= reach(state, hero, creep);
}

/** Attacks the nearest hittable creep within attack range, if any, without leaving the current order. */
function autoAttack(state: GameState, hero: Hero): void {
  const target = acquire(state, hero, heroStats(state, hero).attackRange);
  if (target) tryAttack(state, hero, target);
}

/** Nearest hittable creep within `range` of the hero, edge to edge (both radii count, as for creeps). */
function acquire(state: GameState, hero: Hero, range: number): Creep | undefined {
  let best: Creep | undefined;
  let bestD = Infinity;
  const heroRadius = heroStats(state, hero).radius;
  for (const c of state.creeps) {
    if (c.dead || !heroCanHit(state, hero, c)) continue;
    const d = dist(hero.x, hero.y, c.x, c.y) - state.tuning.creeps[c.kind].radius - heroRadius;
    if (d <= range && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/**
 * A melee hero left idle fights instead of standing there being hit: it hits whatever is in reach; otherwise it
 * steps in to the nearest hittable creep within `autoEngage.range`, or to the creep that hurt it in the last
 * `autoEngage.memory` seconds (bosses and Archers outreach it), but never further than `autoEngage.leash` from
 * where it stood (`hero.guard`); with nothing left to fight it walks back there.
 */
function autoEngage(state: GameState, hero: Hero): void {
  const e = state.tuning.hero.autoEngage;
  const guard = (hero.guard ??= { x: hero.x, y: hero.y });
  const inReach = acquire(state, hero, heroStats(state, hero).attackRange);
  if (inReach) {
    hero.path = [];
    tryAttack(state, hero, inReach);
    return;
  }
  const target = engageTarget(state, hero, guard);
  if (target) {
    const { x, y } = hero;
    walkTo(state, hero, target.x, target.y);
    // A path around an obstacle can bend past the leash: stop at its edge.
    if (dist(hero.x, hero.y, guard.x, guard.y) > e.leash) {
      hero.x = x;
      hero.y = y;
      hero.path = [];
    }
    return;
  }
  if (dist(hero.x, hero.y, guard.x, guard.y) <= 0.05) {
    hero.path = [];
    return;
  }
  walkTo(state, hero, guard.x, guard.y);
  // Nowhere to walk back to (the spot is blocked now): stand guard here instead.
  if (hero.path.length === 0 && dist(hero.x, hero.y, guard.x, guard.y) > 0.05) hero.guard = { x: hero.x, y: hero.y };
}

/**
 * The creep an idle melee hero steps in to: the nearest hittable creep within `autoEngage.range` (edge to edge) or
 * the one that just hurt it, among those it can reach without standing further than the leash from its guard spot.
 */
function engageTarget(state: GameState, hero: Hero, guard: { x: number; y: number }): Creep | undefined {
  const e = state.tuning.hero.autoEngage;
  const heroRadius = heroStats(state, hero).radius;
  const hurtSince = state.tick - secondsToTicks(e.memory);
  let best: Creep | undefined;
  let bestD = Infinity;
  for (const c of state.creeps) {
    if (c.dead || !heroCanHit(state, hero, c)) continue;
    const d = dist(hero.x, hero.y, c.x, c.y);
    const gap = d - state.tuning.creeps[c.kind].radius - heroRadius;
    const hitMe = c.id === hero.hitBy && hero.hitTick >= hurtSince;
    if (gap > e.range && !hitMe) continue;
    // Where the hero would have to stand to hit it, measured from its guard spot.
    if (dist(guard.x, guard.y, c.x, c.y) - reach(state, hero, c) > e.leash) continue;
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Walks toward (x, y), a point that may move (a creep): re-paths now and then, or at once if it moved away. */
function walkTo(state: GameState, hero: Hero, x: number, y: number): void {
  const goal = hero.path[hero.path.length - 1];
  if (!goal || dist(goal.x, goal.y, x, y) > 1) hero.repathTick = 0;
  chase(state, hero, x, y);
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
  emit(state, { type: 'heroAttack', heroId: hero.id, x: target.x, y: target.y });
  const mult = keenEyeMultiplier(state, hero, () => random(state));
  const damage = heroDamage(state, hero) * mult;
  if (!s.ranged) {
    // Melee hits land at once. Blood Hunger heals from the damage that actually landed.
    const dealt = damageCreep(state, target, damage, s.damageType, hero.owner, false, hitFrom(state, hero));
    bloodHungerHeal(state, hero, dealt);
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

