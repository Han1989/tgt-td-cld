// Towers, projectiles and Snare Traps.

import type { TargetPriority, TowerBranch } from '@tdt/protocol';
import {
  applySlow,
  creepsInRadius,
  damageCreep,
  damageHero,
  damageTower,
  emit,
  random,
  shredArmor,
  spawnProjectile,
  stunCreep,
} from './combat';
import type { Creep, GameState, Projectile, ProjectileFx, Tower } from './state';
import { secondsToTicks, TICK_RATE, towerStats, type TowerLevelStats } from './tuning';
import { dist, moveToward } from './vec';

export function updateTowers(state: GameState): void {
  for (const tower of state.towers) {
    if (tower.dead) continue;
    if (tower.cooldown > 0) tower.cooldown--;
    if (state.tick < tower.stunUntil || tower.cooldown > 0) continue;
    const st = towerStats(state.tuning, tower.kind, tower.tier, tower.branch);
    if (st.pulse) {
      if (pulse(state, tower, st)) tower.cooldown = secondsToTicks(st.attackCooldown);
      continue;
    }
    const targets = pickTargets(state, tower, st);
    if (targets.length === 0) continue;
    tower.cooldown = secondsToTicks(st.attackCooldown);
    for (const target of targets) fire(state, tower, st, target);
  }
}

/**
 * The creeps `tower` shoots this time: the best one by its priority (Volley: the best `targets`). A tower
 * that is weaker against ground creeps (Hailstorm) shoots flyers first, whatever its priority.
 */
function pickTargets(state: GameState, tower: Tower, st: TowerLevelStats): Creep[] {
  const airFirst = st.hitsAir && st.hitsGround && st.groundDamage < 1;
  const better = (a: Creep, ad: number, b: Creep, bd: number): boolean => {
    if (airFirst) {
      const fa = state.tuning.creeps[a.kind].flying;
      if (fa !== state.tuning.creeps[b.kind].flying) return fa;
    }
    return isBetterTarget(tower.priority, a, ad, b, bd);
  };
  const inRange: { c: Creep; d: number }[] = [];
  let best: Creep | undefined;
  let bestDist = 0;
  for (const c of state.creeps) {
    if (c.dead) continue;
    const s = state.tuning.creeps[c.kind];
    if (s.flying ? !st.hitsAir : !st.hitsGround) continue;
    const d = dist(tower.x, tower.y, c.x, c.y);
    if (d > st.range + s.radius) continue;
    if (st.targets > 1) inRange.push({ c, d });
    else if (!best || better(c, d, best, bestDist)) {
      best = c;
      bestDist = d;
    }
  }
  if (st.targets <= 1) return best ? [best] : [];
  // A stable sort keeps list order on ties, like the single-target loop.
  inRange.sort((a, b) => (better(a.c, a.d, b.c, b.d) ? -1 : better(b.c, b.d, a.c, a.d) ? 1 : 0));
  return inRange.slice(0, st.targets).map((x) => x.c);
}

function fire(state: GameState, tower: Tower, st: TowerLevelStats, target: Creep): void {
  const s = state.tuning.towers[tower.kind];
  tower.shots++;
  let damage = st.damage;
  let crit = false;
  if (st.critChance > 0 && random(state) < st.critChance) {
    damage *= st.critMultiplier;
    crit = true;
  }
  const freeze = st.freezeEvery > 0 && tower.shots % st.freezeEvery === 0;
  spawnProjectile(state, tower, { kind: 'creep', id: target.id, x: target.x, y: target.y }, {
    style: tower.kind,
    speed: s.projectileSpeed,
    damage,
    damageType: s.damageType,
    source: tower.owner,
    splash: st.splash,
    splashGround: st.hitsGround,
    splashAir: st.hitsAir,
    slow: st.slow,
    slowDuration: st.slowDuration,
    crit,
    // Plain tiers carry no effects, so their shots stay exactly as before branches existed.
    ...(tower.branch
      ? {
          fx: {
            groundDamage: st.groundDamage,
            armorShred: st.armorShred,
            shredMax: st.shredMax,
            shredTicks: secondsToTicks(st.shredDuration),
            freezeTicks: freeze ? secondsToTicks(st.freeze) : 0,
            chains: st.chains,
            chainRange: st.chainRange,
            chainFalloff: st.chainFalloff,
            chainHit: [],
            ignoreResist: st.ignoreResist,
            hpPercent: st.hpPercent,
          },
        }
      : {}),
  });
}

/** Blizzard: hits and slows every creep in range around the tower. Returns false when there was none. */
function pulse(state: GameState, tower: Tower, st: TowerLevelStats): boolean {
  const hit = creepsInRadius(state, tower.x, tower.y, st.range, st.hitsAir).filter(
    (c) => st.hitsGround || state.tuning.creeps[c.kind].flying,
  );
  if (hit.length === 0) return false;
  emit(state, { type: 'aoe', effect: 'blizzard', x: tower.x, y: tower.y, radius: st.range });
  const type = state.tuning.towers[tower.kind].damageType;
  for (const c of hit) {
    if (st.slow > 0) applySlow(state, c, st.slow, secondsToTicks(st.slowDuration));
    damageCreep(state, c, st.damage, type, tower.owner, st.ignoreResist);
  }
  return true;
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

/**
 * Upgrades `tower` one tier (from the last regular tier: into `branch`): new stats, and max HP grows by the
 * difference (current HP with it). `applyCommand` checks that the upgrade is allowed.
 */
export function upgradeTower(state: GameState, tower: Tower, branch: TowerBranch | null = null): void {
  const next = towerStats(state.tuning, tower.kind, tower.tier + 1, branch);
  tower.tier++;
  tower.branch = branch;
  tower.spent += next.cost;
  tower.hp += next.hp - tower.maxHp;
  tower.maxHp = next.hp;
  emit(state, { type: 'towerUpgraded', towerId: tower.id, owner: tower.owner, tier: tower.tier, branch });
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
      if (dist(p.tx, p.ty, c.x, c.y) > p.splash + state.tuning.creeps[c.kind].radius) continue;
      // Splash slows too (Skyguard); no plain tier has both.
      if (p.slow > 0) applySlow(state, c, p.slow, p.slowTicks);
      hitCreep(state, p, c);
    }
    return;
  }
  const c = creepsById.get(p.targetId);
  if (!c || c.dead) return;
  if (p.slow > 0) applySlow(state, c, p.slow, p.slowTicks);
  if (p.crit) emit(state, { type: 'crit', x: c.x, y: c.y, damage: Math.round(p.damage) });
  hitCreep(state, p, c);
  if (p.fx && p.fx.chains > 0) chain(state, p, p.fx, c);
}

/** Deals a projectile's damage to one creep, with its branch effects (if any). */
function hitCreep(state: GameState, p: Projectile, c: Creep): void {
  const fx = p.fx;
  if (!fx) return damageCreep(state, c, p.damage, p.damageType, p.source);
  if (fx.freezeTicks > 0) stunCreep(state, c, fx.freezeTicks);
  const ground = !state.tuning.creeps[c.kind].flying;
  const amount = p.damage * (ground ? fx.groundDamage : 1) + fx.hpPercent * c.maxHp;
  damageCreep(state, c, amount, p.damageType, p.source, fx.ignoreResist);
  if (fx.armorShred > 0 && !c.dead) shredArmor(state, c, fx.armorShred, fx.shredMax, fx.shredTicks);
}

/** Prism: the hit jumps on from `from` to the nearest creep it hasn't hit yet, weaker each jump. */
function chain(state: GameState, p: Projectile, fx: ProjectileFx, from: Creep): void {
  const hit = [...fx.chainHit, from.id];
  let next: Creep | undefined;
  let nextD = Infinity;
  for (const c of state.creeps) {
    if (c.dead || hit.includes(c.id) || !(state.tuning.creeps[c.kind].flying ? p.splashAir : p.splashGround)) continue;
    const d = dist(from.x, from.y, c.x, c.y);
    if (d <= fx.chainRange + state.tuning.creeps[c.kind].radius && d < nextD) {
      next = c;
      nextD = d;
    }
  }
  if (!next) return;
  spawnProjectile(state, from, { kind: 'creep', id: next.id, x: next.x, y: next.y }, {
    style: p.style,
    speed: p.speed * TICK_RATE,
    damage: p.damage * fx.chainFalloff,
    damageType: p.damageType,
    source: p.source,
    splashGround: p.splashGround,
    splashAir: p.splashAir,
    fx: { ...fx, chains: fx.chains - 1, chainHit: hit, freezeTicks: 0 },
  });
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
