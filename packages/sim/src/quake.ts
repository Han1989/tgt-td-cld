// Rampart Slam, round 2: the lane quake (Han, 4 Nov 2026, from his Full Normal match of 4 Nov).
//
// Cast within `laneReach` of a lane's centreline, the slam runs a quake along that lane from the Warden's feet in both
// directions, to the portal and to the Heart, at `quakeSpeed` tiles a second. Every creep on the lane when he casts
// (ground and air, within the lane's half width plus `quakeBand` plus half the creep's radius of its centreline: round 9
// widened it by the band) is hit once, on the tick the front passes its lane progress; creeps off the lane within
// `radius` of him take the local slam at once.
// One echo count for both, fixed at the cast over everything caught. Pure geometry here (bots use it on snapshots);
// the scheduled effect itself is `startQuake` / `updateQuakes`.

import type { CreepKind, LaneId } from '@tdt/protocol';
import { emit, heroPower, newId, stunCreep, ultimateDamage } from './combat';
import { hitFrom } from './coop';
import { getMap, type Lane } from './map';
import type { Creep, GameState, Hero, Quake } from './state';
import { secondsToTicks, TICK_RATE, type Tuning } from './tuning';

/** Where a point lies against a lane: its progress along the lane from the portal (tiles) and its distance from it. */
export interface LaneSpot {
  progress: number;
  dist: number;
}

/** A lane's length from the portal to the Heart, in tiles. */
export function laneLength(lane: Lane): number {
  return lane.remainingFrom[0] ?? 0;
}

/** The point of `lane`'s centreline nearest (x, y): its progress from the portal and the distance to it. */
export function laneSpot(lane: Lane, x: number, y: number): LaneSpot {
  const total = laneLength(lane);
  let best: LaneSpot = { progress: 0, dist: Infinity };
  for (let w = 0; w < lane.waypoints.length - 1; w++) {
    const a = lane.waypoints[w]!;
    const b = lane.waypoints[w + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lenSq));
    const d = Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
    if (d < best.dist - 1e-9) {
      const start = total - (lane.remainingFrom[w] ?? 0);
      best = { progress: start + Math.sqrt(lenSq) * t, dist: d };
    }
  }
  return best;
}

/** The point at `progress` tiles along `lane` from its portal (clamped to the lane). */
export function lanePointAt(lane: Lane, progress: number): { x: number; y: number } {
  const total = laneLength(lane);
  const p = Math.max(0, Math.min(total, progress));
  for (let w = 0; w < lane.waypoints.length - 1; w++) {
    const start = total - (lane.remainingFrom[w] ?? 0);
    const end = total - (lane.remainingFrom[w + 1] ?? 0);
    if (p <= end || w === lane.waypoints.length - 2) {
      const a = lane.waypoints[w]!;
      const b = lane.waypoints[w + 1]!;
      const t = end > start ? (p - start) / (end - start) : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  const last = lane.waypoints[lane.waypoints.length - 1]!;
  return { x: last.x, y: last.y };
}

/** Anything with a place and a kind: a creep in the state or in a snapshot. */
export interface QuakeCreep {
  id: number;
  kind: CreepKind;
  x: number;
  y: number;
}

/**
 * Whether a creep stands on `lane` for the quake: within the lane's half width plus `quakeBand` plus half its own radius
 * (round 9: the band takes the lane's shoulders and the chasers beside it). A creep on the stretch the lanes share above
 * the Heart is on every lane that runs through it, so a quake along any of them hits it, whatever lane it walks.
 */
export function onQuakeLane(tuning: Tuning, lane: Lane, c: QuakeCreep): boolean {
  const band = getMap().laneHalfWidth + tuning.hero.warden.rampartSlam.quakeBand + tuning.creeps[c.kind].radius / 2;
  return laneSpot(lane, c.x, c.y).dist <= band + 1e-9;
}

/** What a slam cast at (x, y) would catch: the quake's lane (or null), the creeps on it, and the local slam's others. */
export interface QuakeCatch<C extends QuakeCreep> {
  lane: LaneId | null;
  /** The quake's lane progress at the Warden's feet (0 when there is no lane). */
  from: number;
  onLane: C[];
  local: C[];
}

/**
 * What a Rampart Slam cast at (x, y) catches. The quake's lane is the nearest lane within `laneReach` of the Warden;
 * where lanes share their centreline (West and East join Mid above the Heart), the one catching the most creeps,
 * then the lower id. Off every lane, only the local slam (`radius`, measured to each creep's edge).
 */
export function quakeCatch<C extends QuakeCreep>(tuning: Tuning, creeps: readonly C[], x: number, y: number): QuakeCatch<C> {
  const s = tuning.hero.warden.rampartSlam;
  const map = getMap();
  let pick: { lane: Lane; from: number; onLane: C[] } | null = null;
  let pickDist = Infinity;
  for (const lane of map.lanes) {
    const spot = laneSpot(lane, x, y);
    if (spot.dist > s.laneReach + 1e-9) continue;
    const nearer = spot.dist < pickDist - 1e-6;
    const tied = Math.abs(spot.dist - pickDist) <= 1e-6;
    if (!nearer && !tied) continue;
    const onLane = creeps.filter((c) => onQuakeLane(tuning, lane, c));
    if (nearer || (tied && pick && onLane.length > pick.onLane.length)) {
      pick = { lane, from: spot.progress, onLane };
      pickDist = Math.min(pickDist, spot.dist);
    }
  }
  const caught = new Set(pick?.onLane.map((c) => c.id) ?? []);
  const local = creeps.filter(
    (c) => !caught.has(c.id) && Math.hypot(c.x - x, c.y - y) <= s.radius + tuning.creeps[c.kind].radius,
  );
  return { lane: pick?.lane.id ?? null, from: pick?.from ?? 0, onLane: pick?.onLane ?? [], local };
}

/** The quake's front, in tiles from the cast point, `ticks` after the cast (the cast's own tick is the first step). */
function frontReach(tuning: Tuning, ticks: number): number {
  return (tuning.hero.warden.rampartSlam.quakeSpeed / TICK_RATE) * (ticks + 1);
}

/** Ticks the front takes from `from` to the far end of a lane of `length` tiles. */
export function quakeTicks(tuning: Tuning, length: number, from: number): number {
  const far = Math.max(from, length - from);
  return Math.max(1, Math.ceil(far / (tuning.hero.warden.rampartSlam.quakeSpeed / TICK_RATE)));
}

/**
 * Rampart Slam's hits: the local slam lands at once and the quake starts (its first step this tick). The `ultResult`
 * (the local slam's and the quake's kills together) waits for the quake's last creep (`updateQuakes`), or is emitted
 * here when the cast is off every lane.
 */
export function startQuake(state: GameState, hero: Hero, rank: number): void {
  const t = state.tuning;
  const s = t.hero.warden.rampartSlam;
  const i = Math.max(0, rank - 1);
  const living = state.creeps.filter((c) => !c.dead);
  const caught = quakeCatch(t, living, hero.x, hero.y);
  const count = caught.onLane.length + caught.local.length;
  const echo = (s.echo[i] ?? 0) * Math.min(s.echoCap, Math.max(0, count - 1));
  const power = heroPower(state, hero);
  const from = hitFrom(state, hero);
  const stun = secondsToTicks(s.stun[i] ?? 0);
  const killsBefore = state.ultStats.kills;
  const strike = (c: Creep, hit: number, boss: number) => {
    if (c.dead) return;
    stunCreep(state, c, stun);
    ultimateDamage(state, c, t.creeps[c.kind].boss ? boss : hit, 'physical', hero.owner, from, 'rampartSlam');
  };
  const hit = ((s.base[i] ?? 0) + echo) * power;
  const bossHit = (s.base[i] ?? 0) * power;
  for (const c of caught.local) strike(c, hit, bossHit);
  if (caught.lane === null) {
    emit(state, { type: 'ultResult', ult: 'rampartSlam', by: hero.owner, kills: state.ultStats.kills - killsBefore });
    return;
  }
  const lane = getMap().lanes[caught.lane]!;
  const ticks = quakeTicks(t, laneLength(lane), caught.from);
  emit(state, { type: 'quake', hero: hero.id, lane: caught.lane, from: round2(caught.from), ticks });
  const quake: Quake = {
    id: newId(state),
    owner: hero.owner,
    lane: caught.lane,
    from: caught.from,
    startTick: state.tick,
    endTick: state.tick + ticks,
    pending: caught.onLane.map((c) => c.id),
    hit,
    bossHit,
    stunTicks: stun,
    src: from,
    kills: state.ultStats.kills - killsBefore,
    done: false,
  };
  state.quakes.push(quake);
  stepQuake(state, quake);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Each quake's front moves on; every creep it passes is hit. A quake that has hit all its creeps reports its kills. */
export function updateQuakes(state: GameState): void {
  for (const q of state.quakes) if (!q.done) stepQuake(state, q);
  state.quakes = state.quakes.filter((q) => !q.done);
}

function stepQuake(state: GameState, q: Quake): void {
  const t = state.tuning;
  const lane = getMap().lanes[q.lane]!;
  const reach = frontReach(t, state.tick - q.startTick);
  const byId = new Map(state.creeps.map((c) => [c.id, c]));
  const killsBefore = state.ultStats.kills;
  const left: number[] = [];
  for (const id of q.pending) {
    const c = byId.get(id);
    if (!c || c.dead) continue;
    if (Math.abs(laneSpot(lane, c.x, c.y).progress - q.from) > reach + 1e-9 && state.tick < q.endTick) {
      left.push(id);
      continue;
    }
    stunCreep(state, c, q.stunTicks);
    ultimateDamage(state, c, t.creeps[c.kind].boss ? q.bossHit : q.hit, 'physical', q.owner, q.src, 'rampartSlam');
  }
  q.pending = left;
  q.kills += state.ultStats.kills - killsBefore;
  if (left.length === 0) {
    q.done = true;
    emit(state, { type: 'ultResult', ult: 'rampartSlam', by: q.owner, kills: q.kills });
  }
}
