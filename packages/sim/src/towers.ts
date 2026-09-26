// Towers, projectiles and Snare Traps.

import type { TargetPriority } from '@tdt/protocol';
import { applySlow, damageCreep, damageHero, damageTower, emit, spawnProjectile } from './combat';
import type { Creep, GameState, Projectile, Tower } from './state';
import { secondsToTicks, towerTier } from './tuning';
import { dist, moveToward } from './vec';

export function updateTowers(state: GameState): void {
  for (const tower of state.towers) {
    if (tower.dead) continue;
    if (tower.cooldown > 0) tower.cooldown--;
    if (state.tick < tower.stunUntil || tower.cooldown > 0) continue;
    const s = state.tuning.towers[tower.kind];
    const tier = towerTier(state.tuning, tower.kind, tower.tier);

    let target: Creep | undefined;
    let targetDist = 0;
    for (const c of state.creeps) {
      if (c.dead) continue;
      const flying = state.tuning.creeps[c.kind].flying;
      if (flying ? !s.hitsAir : !s.hitsGround) continue;
      const d = dist(tower.x, tower.y, c.x, c.y);
      if (d > tier.range + state.tuning.creeps[c.kind].radius) continue;
      if (!target || isBetterTarget(tower.priority, c, d, target, targetDist)) {
        target = c;
        targetDist = d;
      }
    }
    if (!target) continue;

    tower.cooldown = secondsToTicks(tier.attackCooldown);
    spawnProjectile(state, tower, { kind: 'creep', id: target.id, x: target.x, y: target.y }, {
      style: tower.kind,
      speed: s.projectileSpeed,
      damage: tier.damage,
      damageType: s.damageType,
      source: tower.owner,
      splash: tier.splash,
      splashGround: s.hitsGround,
      splashAir: s.hitsAir,
      slow: tier.slow,
      slowDuration: tier.slowDuration,
    });
  }
}

/**
 * Target priority. First: least path left to the Heart. Strongest: most
 * current HP. Closest: nearest to the tower. Ties fall back to First, then to
 * the older creep (list order), so targeting stays deterministic.
 */
function isBetterTarget(priority: TargetPriority, c: Creep, d: number, best: Creep, bestDist: number): boolean {
  if (priority === 'strongest' && c.hp !== best.hp) return c.hp > best.hp;
  if (priority === 'closest' && d !== bestDist) return d < bestDist;
  return c.remaining < best.remaining;
}

/** Upgrades `tower` one tier: new stats, and max HP grows by the difference (current HP with it). */
export function upgradeTower(state: GameState, tower: Tower): void {
  const next = towerTier(state.tuning, tower.kind, tower.tier + 1);
  tower.tier++;
  tower.spent += next.cost;
  tower.hp += next.hp - tower.maxHp;
  tower.maxHp = next.hp;
  emit(state, { type: 'towerUpgraded', towerId: tower.id, owner: tower.owner, tier: tower.tier });
}

export function updateProjectiles(state: GameState, creepsById: Map<number, Creep>): void {
  for (const p of state.projectiles) {
    if (p.done) continue;
    const target = findTarget(state, p, creepsById);
    if (target) {
      p.tx = target.x;
      p.ty = target.y;
    } else if (p.splash === 0) {
      // Single-target shots fizzle when their target is gone.
      p.done = true;
      continue;
    }
    if (moveToward(p, p.tx, p.ty, p.speed)) impact(state, p, creepsById);
  }
}

function findTarget(
  state: GameState,
  p: Projectile,
  creepsById: Map<number, Creep>,
): { x: number; y: number } | undefined {
  switch (p.targetKind) {
    case 'creep': {
      const c = creepsById.get(p.targetId);
      return c && !c.dead ? c : undefined;
    }
    case 'hero': {
      const h = state.heroes.find((x) => x.id === p.targetId);
      return h && h.alive ? h : undefined;
    }
    case 'tower': {
      const t = state.towers.find((x) => x.id === p.targetId);
      return t && !t.dead ? t : undefined;
    }
    case 'point':
      return undefined;
  }
}

function impact(state: GameState, p: Projectile, creepsById: Map<number, Creep>): void {
  p.done = true;
  if (p.targetKind === 'hero') {
    const h = state.heroes.find((x) => x.id === p.targetId);
    if (h) damageHero(state, h, p.damage, p.damageType);
    return;
  }
  if (p.targetKind === 'tower') {
    const t = state.towers.find((x) => x.id === p.targetId);
    if (t) damageTower(state, t, p.damage, p.damageType);
    return;
  }
  if (p.splash > 0) {
    // Splash hits the creeps its projectile can target (cannon: ground, flak: air, Fireball: both).
    if (p.aoe) emit(state, { type: 'aoe', effect: p.aoe, x: p.tx, y: p.ty, radius: p.splash });
    else emit(state, { type: 'splash', x: p.tx, y: p.ty, radius: p.splash });
    for (const c of state.creeps) {
      if (c.dead || !(state.tuning.creeps[c.kind].flying ? p.splashAir : p.splashGround)) continue;
      if (dist(p.tx, p.ty, c.x, c.y) <= p.splash + state.tuning.creeps[c.kind].radius) {
        damageCreep(state, c, p.damage, p.damageType, p.source);
      }
    }
    return;
  }
  const c = creepsById.get(p.targetId);
  if (!c || c.dead) return;
  if (p.slow > 0) applySlow(state, c, p.slow, p.slowTicks);
  if (p.crit) emit(state, { type: 'crit', x: c.x, y: c.y, damage: Math.round(p.damage), by: p.source });
  damageCreep(state, c, p.damage, p.damageType, p.source);
}

export function updateTraps(state: GameState): void {
  for (const trap of state.traps) {
    if (trap.done) continue;
    if (state.tick >= trap.expireTick) {
      trap.done = true;
      continue;
    }
    if (state.tick < trap.armTick) continue;
    const s = state.tuning.hero.ranger.snareTrap;
    const ground = state.creeps.filter((c) => !c.dead && !state.tuning.creeps[c.kind].flying);
    if (!ground.some((c) => dist(trap.x, trap.y, c.x, c.y) <= s.triggerRadius)) continue;

    trap.done = true;
    const rank = trap.rank - 1;
    const duration = secondsToTicks(s.rootDuration[rank] ?? 0);
    const damage = s.damage[rank] ?? 0;
    emit(state, { type: 'trapTriggered', x: trap.x, y: trap.y, radius: s.rootRadius });
    for (const c of ground) {
      if (dist(trap.x, trap.y, c.x, c.y) > s.rootRadius) continue;
      const ticks = state.tuning.creeps[c.kind].boss ? Math.round(duration * s.bossRootFactor) : duration;
      c.rootUntil = Math.max(c.rootUntil, state.tick + ticks);
      damageCreep(state, c, damage, 'physical', trap.owner);
    }
  }
}
