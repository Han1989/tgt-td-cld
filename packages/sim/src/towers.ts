// Towers, projectiles and Snare Traps.

import { applySlow, damageCreep, damageHero, damageTower, emit, spawnProjectile } from './combat';
import type { Creep, GameState, Projectile } from './state';
import { secondsToTicks } from './tuning';
import { dist, moveToward } from './vec';

export function updateTowers(state: GameState): void {
  for (const tower of state.towers) {
    if (tower.dead) continue;
    if (tower.cooldown > 0) tower.cooldown--;
    if (state.tick < tower.stunUntil || tower.cooldown > 0) continue;
    const s = state.tuning.towers[tower.kind];

    // Target priority "First": the creep with the least path left to the Heart.
    let target: Creep | undefined;
    for (const c of state.creeps) {
      if (c.dead) continue;
      const flying = state.tuning.creeps[c.kind].flying;
      if (flying ? !s.hitsAir : !s.hitsGround) continue;
      const radius = state.tuning.creeps[c.kind].radius;
      if (dist(tower.x, tower.y, c.x, c.y) > s.range + radius) continue;
      if (!target || c.remaining < target.remaining) target = c;
    }
    if (!target) continue;

    tower.cooldown = secondsToTicks(s.attackCooldown);
    spawnProjectile(state, tower, { kind: 'creep', id: target.id, x: target.x, y: target.y }, {
      style: tower.kind,
      speed: s.projectileSpeed,
      damage: s.damage,
      damageType: s.damageType,
      source: tower.owner,
      splash: s.splash,
      slow: s.slow,
      slowDuration: s.slowDuration,
    });
  }
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
    if (t) damageTower(state, t, p.damage);
    return;
  }
  if (p.splash > 0) {
    // Splash hits ground creeps only (cannons can't hit air).
    emit(state, { type: 'splash', x: p.tx, y: p.ty, radius: p.splash });
    for (const c of state.creeps) {
      if (c.dead || state.tuning.creeps[c.kind].flying) continue;
      if (dist(p.tx, p.ty, c.x, c.y) <= p.splash + state.tuning.creeps[c.kind].radius) {
        damageCreep(state, c, p.damage, p.damageType, p.source);
      }
    }
    return;
  }
  const c = creepsById.get(p.targetId);
  if (!c || c.dead) return;
  if (p.slow > 0) applySlow(state, c, p.slow, p.slowTicks);
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
    const owner = state.players.find((p) => p.id === trap.owner);
    const hero = owner && state.heroes.find((h) => h.id === owner.heroId);
    if (!hero) continue;
    const s = state.tuning.hero[hero.kind].snareTrap;
    const ground = state.creeps.filter((c) => !c.dead && !state.tuning.creeps[c.kind].flying);
    if (!ground.some((c) => dist(trap.x, trap.y, c.x, c.y) <= s.triggerRadius)) continue;

    trap.done = true;
    const rank = trap.rank - 1;
    const duration = secondsToTicks(s.rootDuration[rank] ?? 0);
    const damage = s.damage[rank] ?? 0;
    emit(state, { type: 'trapTriggered', x: trap.x, y: trap.y, radius: s.rootRadius });
    for (const c of ground) {
      if (dist(trap.x, trap.y, c.x, c.y) > s.rootRadius) continue;
      const ticks = c.kind === 'boss' ? Math.round(duration * s.bossRootFactor) : duration;
      c.rootUntil = Math.max(c.rootUntil, state.tick + ticks);
      damageCreep(state, c, damage, 'physical', trap.owner);
    }
  }
}
