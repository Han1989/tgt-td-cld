// Creep behaviour: walk the lane, fight heroes that come close (at most `creepAi.chaseCap` per hero, on a short leash
// and a time limit, then back onto the lane ahead, never behind), shoot towers (archers, bosses) for a limited time,
// leak into the Heart. Boss abilities are in bosses.ts.

import type { EntityId } from '@tdt/protocol';
import { updateBoss } from './bosses';
import { damageHero, damageTower, emit, spawnProjectile, TOWER_RADIUS } from './combat';
import { getMap } from './map';
import type { Creep, GameState, Hero, Tower } from './state';
import { secondsToTicks, TICK_RATE } from './tuning';
import { dist, moveToward } from './vec';

export function updateCreeps(state: GameState): void {
  assignChases(state);
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
    // A taunted flyer turns from the Heart and hovers over the Warden until the taunt ends.
    const taunter = state.tick < c.tauntUntil ? state.heroes.find((h) => h.id === c.targetId && h.alive) : undefined;
    if (taunter) {
      if (dist(c.x, c.y, taunter.x, taunter.y) > 0.3) moveToward(c, taunter.x, taunter.y, step);
      c.remaining = dist(c.x, c.y, heart.x, heart.y);
      return;
    }
    moveToward(c, heart.x, heart.y, step);
    c.remaining = dist(c.x, c.y, heart.x, heart.y);
    if (c.remaining <= t.heart.radius) leak(state, c);
    return;
  }

  if (c.mode === 'chase') {
    const hero = state.heroes.find((h) => h.id === c.targetId);
    // A taunt holds the chase past its leash and its time limit.
    const taunted = state.tick < c.tauntUntil;
    if (!hero || !hero.alive) {
      stopChase(state, c, false);
    } else if (
      !taunted &&
      (state.tick >= c.chaseUntil || dist(c.x, c.y, c.anchorX, c.anchorY) > t.creepAi.leashRange)
    ) {
      stopChase(state, c, true);
    } else {
      if (inReach(state, c, hero)) attackHero(state, c, hero);
      else moveToward(c, hero.x, hero.y, step);
    }
  }

  if (c.mode === 'rejoin') {
    strikeInReach(state, c);
    if (moveToward(c, c.anchorX, c.anchorY, step)) c.mode = 'lane';
  } else if (c.mode === 'lane') {
    // Chases start in `assignChases`. A creep left out (a full cap, its aggro cooldown) strikes a hero in its reach
    // as it passes, without stopping.
    strikeInReach(state, c);
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

  if (!c.dead) updateRemaining(c);
}

/** Whether a hero stands in a creep's reach: its attack range plus both radii. */
function inReach(state: GameState, c: Creep, hero: Hero): boolean {
  const s = state.tuning.creeps[c.kind];
  return dist(c.x, c.y, hero.x, hero.y) <= s.attackRange + s.radius + state.tuning.hero[hero.kind].radius;
}

/** A creep that is not chasing still strikes the nearest hero in its reach (when its attack is ready). */
function strikeInReach(state: GameState, c: Creep): void {
  if (c.attackCd > 0 || state.tuning.creeps[c.kind].damage <= 0) return;
  let best: Hero | undefined;
  let bestD = Infinity;
  for (const h of state.heroes) {
    if (!h.alive || !inReach(state, c, h)) continue;
    const d = dist(c.x, c.y, h.x, h.y);
    if (d < bestD) {
      best = h;
      bestD = d;
    }
  }
  if (best) attackHero(state, c, best);
}

/** Whether a ground creep is chasing `heroId` on its own (a taunted one does not count against the cap). */
function chasing(state: GameState, c: Creep, heroId: EntityId): boolean {
  return !c.dead && c.mode === 'chase' && c.targetId === heroId && state.tick >= c.tauntUntil;
}

/**
 * The chase cap: at most `creepAi.chaseCap` ground creeps chase one hero at a time, taunted ones aside. Free places go
 * to the nearest creeps walking their lane within `aggroRange` of a hero (each to its nearest hero with a place);
 * creeps that are stunned or on their aggro cooldown wait. A creep already chasing keeps its place; when a taunt ends
 * with more than the cap chasing one hero, the farthest give up.
 */
function assignChases(state: GameState): void {
  const ai = state.tuning.creepAi;
  const free = new Map<EntityId, number>();
  for (const h of state.heroes) {
    if (!h.alive) continue;
    const chasers = state.creeps.filter((c) => chasing(state, c, h.id));
    if (chasers.length > ai.chaseCap) {
      const far = chasers
        .map((c) => ({ c, d: dist(c.x, c.y, h.x, h.y) }))
        .sort((a, b) => b.d - a.d)
        .slice(0, chasers.length - ai.chaseCap);
      for (const { c } of far) stopChase(state, c, true);
    }
    free.set(h.id, Math.max(0, ai.chaseCap - chasers.length));
  }
  if (![...free.values()].some((n) => n > 0)) return;

  const pairs: { c: Creep; h: Hero; d: number }[] = [];
  for (const c of state.creeps) {
    const s = state.tuning.creeps[c.kind];
    if (c.dead || c.mode !== 'lane' || s.flying || s.damage <= 0) continue;
    if (state.tick < c.stunUntil || state.tick < c.noAggroUntil) continue;
    for (const h of state.heroes) {
      if ((free.get(h.id) ?? 0) <= 0) continue;
      const d = dist(c.x, c.y, h.x, h.y);
      if (d <= ai.aggroRange) pairs.push({ c, h, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  for (const { c, h } of pairs) {
    const n = free.get(h.id) ?? 0;
    if (c.mode !== 'lane' || n <= 0) continue;
    startChase(state, c, h.id);
    free.set(h.id, n - 1);
  }
}

/**
 * A creep starts chasing a hero: one walking its lane leaves it here; one rejoining keeps the lane point it was
 * heading for as where it left. The chase lasts at most `creepAi.chaseSeconds` (a chase already on keeps its end).
 */
export function startChase(state: GameState, c: Creep, heroId: EntityId): void {
  if (c.mode === 'lane') {
    c.anchorX = c.x;
    c.anchorY = c.y;
  }
  if (c.mode !== 'chase') c.chaseUntil = state.tick + secondsToTicks(state.tuning.creepAi.chaseSeconds);
  c.mode = 'chase';
  c.targetId = heroId;
}

/**
 * Ends a chase. The creep rejoins its lane ahead (`rejoinLane`), never walking back; one that gave up (its leash, its
 * time limit, a full cap) starts no new chase for `creepAi.aggroCooldown` seconds.
 */
function stopChase(state: GameState, c: Creep, gaveUp: boolean): void {
  c.targetId = -1;
  c.tauntUntil = 0;
  if (gaveUp) c.noAggroUntil = state.tick + secondsToTicks(state.tuning.creepAi.aggroCooldown);
  rejoinLane(c);
}

/**
 * Sends a creep onto its lane at the point of its own line (its waypoints shifted by its offset, as it walks them)
 * nearest to it, at or past where it left the lane (`anchorX`, `anchorY`, on the leg to waypoint `wp`), never behind.
 * That point becomes its anchor, so `remaining` counts from it at once, and its next waypoint is the end of that leg.
 */
export function rejoinLane(c: Creep): void {
  const lane = getMap().lanes[c.lane]!;
  const last = lane.waypoints.length - 1;
  const point = (i: number) => {
    const w = lane.waypoints[i]!;
    if (i === last) return w;
    // Creeps spawn at the portal no higher than its row (waves.ts).
    return { x: w.x + c.offX, y: w.y + (i === 0 ? Math.max(0, c.offY) : c.offY) };
  };
  const from = Math.min(Math.max(c.wp, 1), last);
  let best = { x: c.x, y: c.y, wp: from, d: Infinity };
  for (let i = from; i <= last; i++) {
    const a = point(i - 1);
    const b = point(i);
    const tMin = i === from ? along(c.anchorX, c.anchorY, a, b) : 0;
    const t = Math.max(tMin, along(c.x, c.y, a, b));
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const d = dist(c.x, c.y, x, y);
    if (d < best.d) best = { x, y, wp: i, d };
  }
  c.mode = 'rejoin';
  c.anchorX = best.x;
  c.anchorY = best.y;
  c.wp = best.wp;
  updateRemaining(c);
}

/** Where the point (x, y) projects onto the leg a → b, from 0 (at a) to 1 (at b). */
function along(x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  return lenSq === 0 ? 1 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lenSq));
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
  emit(state, { type: 'leak', creepId: c.id, damage, lane: c.lane });
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
      attacker: c.id,
    });
  } else {
    damageHero(state, hero, s.damage, s.damageType, c);
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
