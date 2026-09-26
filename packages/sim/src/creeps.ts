// Creep behaviour: walk the lane, fight heroes that come close (with a leash),
// shoot towers (archers, bosses) for a limited time, leak into the Heart. Boss abilities are in bosses.ts.

import { updateBoss } from './bosses';
import { damageHero, damageTower, emit, spawnProjectile, TOWER_RADIUS } from './combat';
import { getMap } from './map';
import type { Creep, GameState, Hero, Tower } from './state';
import { secondsToTicks, TICK_RATE } from './tuning';
import { dist, moveToward } from './vec';

export function updateCreeps(state: GameState): void {
  // Creeps summoned during this loop (Matriarch hatchlings) start moving next tick.
  const n = state.creeps.length;
  for (let i = 0; i < n; i++) {
    const creep = state.creeps[i]!;
    if (!creep.dead) updateCreep(state, creep);
  }
}

function updateCreep(state: GameState, c: Creep): void {
  const s = state.tuning.creeps[c.kind];
  const map = getMap();
  const heart = map.heart;
  const t = state.tuning;

  if (c.attackCd > 0) c.attackCd--;
  // Stunned creeps do nothing at all (a stunned boss can't use its ability either).
  if (state.tick < c.stunUntil) return;
  if (s.boss) updateBoss(state, c);

  const rooted = state.tick < c.rootUntil;
  const slowMult = state.tick < c.slowUntil ? 1 - c.slowPct : 1;
  const step = rooted ? 0 : (s.speed / TICK_RATE) * slowMult;

  if (s.flying) {
    moveToward(c, heart.x, heart.y, step);
    c.remaining = dist(c.x, c.y, heart.x, heart.y);
    if (c.remaining <= t.heart.radius) leak(state, c);
    return;
  }

  if (c.mode === 'chase') {
    const hero = state.heroes.find((h) => h.id === c.targetId);
    const taunted = state.tick < c.tauntUntil;
    if (!hero || !hero.alive || (!taunted && dist(c.x, c.y, c.anchorX, c.anchorY) > t.creepAi.leashRange)) {
      c.mode = 'return';
      c.targetId = -1;
    } else {
      const heroRadius = t.hero[hero.kind].radius;
      if (dist(c.x, c.y, hero.x, hero.y) <= s.attackRange + s.radius + heroRadius) attackHero(state, c, hero);
      else moveToward(c, hero.x, hero.y, step);
    }
  }

  if (c.mode === 'return') {
    if (moveToward(c, c.anchorX, c.anchorY, step)) c.mode = 'lane';
  } else if (c.mode === 'lane') {
    const hero = s.damage > 0 ? nearestHero(state, c, t.creepAi.aggroRange) : undefined;
    if (hero) {
      c.mode = 'chase';
      c.targetId = hero.id;
      c.anchorX = c.x;
      c.anchorY = c.y;
    } else {
      // Anti-stall: a creep that has spent long enough stopped at towers ignores them from then on.
      const stalled = c.towerTicks >= secondsToTicks(t.creepAi.towerAttackLimit);
      const tower =
        s.attacksTowers && !stalled ? nearestTower(state, c, s.attackRange + s.radius + TOWER_RADIUS) : undefined;
      if (tower) {
        c.towerTicks++;
        attackTower(state, c, tower);
      } else {
        walkLane(state, c, step);
      }
    }
  }

  if (!c.dead) updateRemaining(c);
}

function walkLane(state: GameState, c: Creep, step: number): void {
  const lane = getMap().lanes[c.lane]!;
  let budget = step;
  while (budget > 0 && !c.dead) {
    const last = c.wp >= lane.waypoints.length - 1;
    const wp = lane.waypoints[Math.min(c.wp, lane.waypoints.length - 1)]!;
    const tx = last ? wp.x : wp.x + c.offX;
    const ty = last ? wp.y : wp.y + c.offY;
    const before = dist(c.x, c.y, tx, ty);
    const arrived = moveToward(c, tx, ty, budget);
    budget -= Math.min(budget, before);
    const heart = getMap().heart;
    if (dist(c.x, c.y, heart.x, heart.y) <= state.tuning.heart.radius) {
      leak(state, c);
      return;
    }
    if (!arrived) return;
    if (!last) c.wp++;
  }
}

function updateRemaining(c: Creep): void {
  const lane = getMap().lanes[c.lane]!;
  const i = Math.min(c.wp, lane.waypoints.length - 1);
  const wp = lane.waypoints[i]!;
  const fromX = c.mode === 'lane' ? c.x : c.anchorX;
  const fromY = c.mode === 'lane' ? c.y : c.anchorY;
  c.remaining = dist(fromX, fromY, wp.x, wp.y) + (lane.remainingFrom[i] ?? 0);
}

function leak(state: GameState, c: Creep): void {
  const damage = state.tuning.creeps[c.kind].leakDamage;
  c.dead = true;
  state.heartHp = Math.max(0, state.heartHp - damage);
  emit(state, { type: 'leak', creepId: c.id, damage });
}

function nearestHero(state: GameState, c: Creep, range: number): Hero | undefined {
  let best: Hero | undefined;
  let bestD = range;
  for (const h of state.heroes) {
    if (!h.alive) continue;
    const d = dist(c.x, c.y, h.x, h.y);
    if (d <= bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

function nearestTower(state: GameState, c: Creep, range: number): Tower | undefined {
  let best: Tower | undefined;
  let bestD = range;
  for (const t of state.towers) {
    if (t.dead) continue;
    const d = dist(c.x, c.y, t.x, t.y);
    if (d <= bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

function attackHero(state: GameState, c: Creep, hero: Hero): void {
  if (c.attackCd > 0) return;
  const s = state.tuning.creeps[c.kind];
  c.attackCd = secondsToTicks(s.attackCooldown);
  if (s.ranged) {
    spawnProjectile(state, c, { kind: 'hero', id: hero.id, x: hero.x, y: hero.y }, {
      style: c.kind,
      speed: state.tuning.creepAi.projectileSpeed,
      damage: s.damage,
      damageType: s.damageType,
      source: null,
    });
  } else {
    damageHero(state, hero, s.damage, s.damageType);
  }
}

function attackTower(state: GameState, c: Creep, tower: Tower): void {
  if (c.attackCd > 0) return;
  const s = state.tuning.creeps[c.kind];
  c.attackCd = secondsToTicks(s.attackCooldown);
  if (s.ranged) {
    spawnProjectile(state, c, { kind: 'tower', id: tower.id, x: tower.x, y: tower.y }, {
      style: c.kind,
      speed: state.tuning.creepAi.projectileSpeed,
      damage: s.damage,
      damageType: s.damageType,
      source: null,
    });
  } else {
    damageTower(state, tower, s.damage, s.damageType);
  }
}
