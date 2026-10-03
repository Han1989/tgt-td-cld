// Soft-launch hook (always on, not a spike flag):
// 1. Combos — Arrow Storm and Meteor are instant rains over all three lanes. Two ultimates cast inside the combo
//    window fuse, wherever the heroes stand, into one stronger rain: Meteor Rain, Stun Storm or Shockwave.
// 2. Quick wave-10 two-lane shield — that boss takes no damage until two lanes hit it within the window.
//    Full overrides the wave list to empty.
// 3. Solo practice — an ally hero that does not count as a player (`practice` on GameConfig).

import {
  HERO_KINDS,
  type AoeEffect,
  type ComboKind,
  type DamageType,
  type CreepKind,
  type HeroKind,
  type LaneId,
  type PlayerId,
  type ShieldState,
} from '@tdt/protocol';
import { creepsInRadius, emit, heroMaxHp, heroMaxMana, newId, stunCreep, ultimateDamage } from './combat';
import { getMap, laneDistance, PAD_ZONES } from './map';
import type { BossShield, Creep, GameState, Hero, HitFrom, RecentUlt, UltKind, UltTag, Zone } from './state';
import { secondsToTicks } from './tuning';
import { dist } from './vec';

export function isPracticeAlly(state: GameState, playerId: PlayerId): boolean {
  return state.practice !== null && state.practice.allyId === playerId;
}

/** Players who count for pads, creep scaling and surge share. The practice ally does not. */
export function teamSize(state: GameState): number {
  const ally = state.practice?.allyId;
  if (!ally) return state.players.length;
  let n = 0;
  for (const p of state.players) if (p.id !== ally) n++;
  return n;
}

function leaderId(state: GameState): PlayerId | null {
  return state.players.find((p) => !isPracticeAlly(state, p.id))?.id ?? null;
}

/** A practice ally's kills pay the human. */
export function bountyCredit(state: GameState, source: PlayerId | null): PlayerId | null {
  if (source === null || !isPracticeAlly(state, source)) return source;
  return leaderId(state);
}

// ---------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------

function laneDist(x: number, y: number, lane: LaneId): number {
  const found = getMap().lanes.find((l) => l.id === lane);
  return found ? laneDistance([found], x, y) : Infinity;
}

/**
 * Lane a hero's hit counts as.
 * Inside a lane ribbon (`laneHalfWidth`), that lane.
 * Beside Mid, outside its ribbon, the nearer side lane: a melee hero can stand in the gap
 * (still in reach of a Mid-lane boss) and count as West or East. Mid-zone towers stay Mid.
 */
export function heroHitLane(x: number, y: number): LaneId {
  const map = getMap();
  let best: LaneId = 0;
  let bestD = Infinity;
  for (const lane of map.lanes) {
    const d = laneDist(x, y, lane.id);
    if (d < bestD - 1e-9) {
      bestD = d;
      best = lane.id;
    }
  }
  if (bestD <= map.laneHalfWidth + 1e-9) return best;
  if (best === 1) return laneDist(x, y, 0) <= laneDist(x, y, 2) ? 0 : 2;
  return best;
}

/** Where a hit by `attacker` comes from. A tower uses its pad zone; anyone else uses `heroHitLane`. */
export function hitFrom(_state: GameState, attacker: { x: number; y: number; padId?: number }): HitFrom {
  const pad = attacker.padId !== undefined ? getMap().pads[attacker.padId] : undefined;
  const lane = pad ? (PAD_ZONES.indexOf(pad.zone) as LaneId) : heroHitLane(attacker.x, attacker.y);
  return { x: attacker.x, lane };
}

/**
 * A point just outside the Mid ribbon, on `side` (-1 west, +1 east), close enough to hit a boss
 * whose centre is `boss` when the hero's reach is at least the gap. Null when `reach` is shorter.
 */
export function shieldStandPoint(
  boss: { x: number; y: number },
  side: -1 | 1,
  reach: number,
): { x: number; y: number } | null {
  const gap = getMap().laneHalfWidth + 0.45;
  if (gap > reach) return null;
  return { x: boss.x + side * gap, y: boss.y };
}

// ---------------------------------------------------------------------------
// Lane rains and combos
// ---------------------------------------------------------------------------

/** A lane rain's timer. It has no circle: its strikes land on the creeps of all three lanes (`rainPulse`). */
export function addZone(
  state: GameState,
  kind: Zone['kind'],
  src: Hero,
  duration: number,
  firstPulse: number,
  pulseTicks: number,
): Zone {
  const zone: Zone = {
    id: newId(state),
    kind,
    owner: src.owner,
    x: src.x,
    y: src.y,
    radius: 0,
    rank: src.ranks.R,
    startTick: state.tick,
    endTick: state.tick + duration,
    nextPulseTick: state.tick + firstPulse,
    pulseTicks,
    kills: 0,
    done: false,
  };
  state.zones.push(zone);
  return zone;
}

/** Arrow Storm or Meteor: starts the rain. */
export function startRain(state: GameState, hero: Hero, kind: 'arrowStorm' | 'meteor'): Zone {
  const t = kind === 'arrowStorm' ? state.tuning.hero.ranger.arrowStorm : state.tuning.hero.arcanist.meteor;
  const pulse = Math.max(1, secondsToTicks(t.pulseInterval));
  return addZone(state, kind, hero, secondsToTicks(t.duration), pulse, pulse);
}

const COMBOS: { a: UltKind; b: UltKind; combo: ComboKind }[] = [
  { a: 'arrowStorm', b: 'meteor', combo: 'meteorRain' },
  { a: 'ironVow', b: 'arrowStorm', combo: 'stunStorm' },
  { a: 'meteor', b: 'ironVow', combo: 'shockwave' },
];

/** The combo two ultimate kinds make, or null (the same kind twice never does). */
export function comboOf(a: UltKind, b: UltKind): ComboKind | null {
  return COMBOS.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a))?.combo ?? null;
}

/** The two heroes of a pair of ultimates, as kinds: who can combo with whom. */
export function comboPartners(kind: HeroKind): HeroKind[] {
  return HERO_KINDS.filter((k) => k !== kind);
}

/** The ally solo practice gives `kind`: Ranger and Arcanist make Meteor Rain, the Warden makes a Stun Storm with the Ranger. */
export function practicePartner(kind: HeroKind): HeroKind {
  return kind === 'ranger' ? 'arcanist' : kind === 'arcanist' ? 'ranger' : 'ranger';
}

/** Where a hit by `owner`'s zones comes from, for the wave-10 shield (the owner's hero). */
function ownerFrom(state: GameState, owner: PlayerId): HitFrom | null {
  const hero = state.heroes.find((h) => h.owner === owner);
  return hero ? hitFrom(state, hero) : null;
}

/** How strong a combo is: its place in `coop.comboOrder` (the strongest first). */
function comboStrength(state: GameState, combo: ComboKind): number {
  return state.tuning.coop.comboOrder.length - state.tuning.coop.comboOrder.indexOf(combo);
}

/**
 * A hero just cast an ultimate: Arrow Storm or Meteor (`zone`, its rain) or Iron Vow (no zone). If another hero's
 * ultimate that pairs with it (`comboOf`) was cast inside the combo window, they fuse, wherever the heroes stand:
 * both rains end and one combo rain takes their place. Three ultimates inside the window fire only the strongest
 * pair (`coop.comboOrder`), once: a third cast that makes a stronger pair swaps the combo, the one left over casts
 * apart; one that does not makes no second combo.
 */
export function onUltCast(state: GameState, hero: Hero, kind: UltKind, zone: Zone | null): void {
  const window = secondsToTicks(state.tuning.coop.comboWindow);
  state.ultStats.by[kind].casts++;
  const fired = state.firedCombo !== null && state.tick - state.firedCombo.tick <= window ? state.firedCombo : null;
  const me: RecentUlt = { heroId: hero.id, kind, tick: state.tick, zoneId: zone?.id ?? -1 };
  // The best partner for this cast: another hero's ultimate inside the window that pairs with it.
  let partner: RecentUlt | null = null;
  let best = 0;
  for (const u of state.recentUlts) {
    if (u.heroId === hero.id || state.tick - u.tick > window) continue;
    const combo = comboOf(u.kind, kind);
    if (combo === null || comboStrength(state, combo) <= best) continue;
    partner = u;
    best = comboStrength(state, combo);
  }
  state.recentUlts.push(me);
  if (!partner || (fired && comboStrength(state, fired.combo) >= best)) return;
  const combo = comboOf(partner.kind, kind)!;
  // Casts that fuse count as the combo's, so a rain's kills per cast are those of rains that ran on their own.
  state.ultStats.by[partner.kind].casts--;
  state.ultStats.by[kind].casts--;
  // A stronger pair replaces the combo already fired; the ultimate it leaves out casts apart again.
  if (fired) {
    const old = state.zones.find((z) => z.id === fired.zoneId);
    if (old) old.done = true;
    for (let i = 0; i < 2; i++) {
      const left = state.recentUlts.find((u) => u.heroId === fired.heroIds[i] && u.kind === fired.kinds[i]);
      if (!left || left.heroId === partner.heroId || left.heroId === hero.id) continue;
      const src = state.heroes.find((h) => h.id === left.heroId);
      if (src && src.alive && (left.kind === 'arrowStorm' || left.kind === 'meteor')) {
        left.zoneId = startRain(state, src, left.kind).id;
      }
    }
  }
  for (const u of [partner, me]) {
    const z = state.zones.find((zz) => zz.id === u.zoneId);
    if (z) z.done = true;
    u.zoneId = -1;
  }
  const heroOf = (u: RecentUlt) => state.heroes.find((h) => h.id === u.heroId) ?? hero;
  // The rain's owner: the Meteor for Meteor Rain and Shockwave, the Arrow Storm for Stun Storm.
  const lead = combo === 'stunStorm' ? (partner.kind === 'arrowStorm' ? partner : me) : partner.kind === 'meteor' ? partner : me;
  const t = state.tuning;
  const timing =
    combo === 'meteorRain' ? t.coop.meteorRain : combo === 'stunStorm' ? t.hero.ranger.arrowStorm : t.hero.arcanist.meteor;
  const pulse = Math.max(1, secondsToTicks(timing.pulseInterval));
  const duration = secondsToTicks(timing.duration);
  const rain = addZone(state, combo, heroOf(lead), duration, pulse, pulse);
  state.firedCombo = {
    combo,
    zoneId: rain.id,
    tick: state.tick,
    kinds: [partner.kind, kind],
    heroIds: [partner.heroId, hero.id],
  };
  state.ultStats.by[combo].casts++;
  emit(state, { type: 'combo', combo, x: rain.x, y: rain.y, radius: 0, heroes: [partner.heroId, hero.id] });
}

/** What one strike of a rain does. */
interface Strike {
  tag: UltTag;
  effect: AoeEffect;
  radius: number;
  damage: number;
  type: DamageType;
  stunTicks: number;
  /** Creeps (ground only) this far from the impact are pulled `distance` tiles toward it before it lands. */
  pull?: { radius: number; distance: number };
}

/** What a zone's strikes do, by its kind and rank. */
function strikeOf(state: GameState, zone: Zone): Strike {
  const i = Math.max(0, zone.rank - 1);
  const h = state.tuning.hero;
  const t = state.tuning.coop;
  switch (zone.kind) {
    case 'arrowStorm': {
      const s = h.ranger.arrowStorm;
      return {
        tag: 'arrowStorm',
        effect: 'arrowStorm',
        radius: s.strikeRadius,
        damage: s.damage[i] ?? 0,
        type: 'physical',
        stunTicks: 0,
      };
    }
    case 'meteor': {
      const s = h.arcanist.meteor;
      return {
        tag: 'meteor',
        effect: 'meteor',
        radius: s.strikeRadius,
        damage: s.damage[i] ?? 0,
        type: 'magic',
        stunTicks: secondsToTicks(s.stun[i] ?? 0),
      };
    }
    case 'meteorRain': {
      const s = t.meteorRain;
      return {
        tag: 'meteorRain',
        effect: 'meteorRain',
        radius: s.strikeRadius,
        damage: s.damage[i] ?? 0,
        type: 'magic',
        stunTicks: secondsToTicks(s.stun),
      };
    }
    case 'stunStorm': {
      const s = h.ranger.arrowStorm;
      return {
        tag: 'stunStorm',
        effect: 'stunStorm',
        radius: s.strikeRadius,
        damage: (s.damage[i] ?? 0) * t.stunStorm.damageMult,
        type: 'physical',
        stunTicks: secondsToTicks(t.stunStorm.stun),
      };
    }
    case 'shockwave': {
      const s = h.arcanist.meteor;
      return {
        tag: 'shockwave',
        effect: 'shockwave',
        radius: s.strikeRadius,
        damage: (s.damage[i] ?? 0) * t.shockwave.damageMult,
        type: 'magic',
        stunTicks: secondsToTicks(t.shockwave.stun[i] ?? 0),
        pull: { radius: t.shockwave.pullRadius, distance: t.shockwave.pullDistance },
      };
    }
  }
}

/**
 * One pulse of a lane rain: on every lane, strikes land on the creeps (never on an empty road), each on the spot that
 * covers the most creeps not yet struck this pulse, until every creep of the lane has been hit (no cap, no
 * Heart pocket). Ground and air alike; a creep takes one hit per pulse.
 */
export function pulseRain(state: GameState, zone: Zone): void {
  const strike = strikeOf(state, zone);
  const from = ownerFrom(state, zone.owner);
  const reach = strike.pull ? strike.pull.radius : strike.radius;
  const hit = new Set<number>();
  const killsBefore = state.ultStats.kills;
  for (const lane of [0, 1, 2] as LaneId[]) {
    let open = state.creeps.filter((c) => !c.dead && c.lane === lane);
    while (open.length > 0) {
      // The creep whose spot covers the most of the others (ties: the first, so the lane's front is hit first).
      let centre = open[0]!;
      let most = -1;
      for (const c of open) {
        let count = 0;
        for (const o of open) if (dist(c.x, c.y, o.x, o.y) <= reach + state.tuning.creeps[o.kind].radius) count++;
        if (count > most) {
          most = count;
          centre = c;
        }
      }
      const { x, y } = centre;
      emit(state, { type: 'aoe', effect: strike.effect, x, y, radius: strike.radius });
      if (strike.pull) pullCreeps(state, x, y, lane, strike.pull);
      for (const c of creepsInRadius(state, x, y, strike.radius, true)) {
        if (hit.has(c.id)) continue;
        hit.add(c.id);
        if (strike.stunTicks > 0) stunCreep(state, c, strike.stunTicks);
        ultimateDamage(state, c, strike.damage, strike.type, zone.owner, from, strike.tag);
      }
      hit.add(centre.id);
      open = open.filter((c) => !c.dead && !hit.has(c.id));
    }
  }
  zone.kills += state.ultStats.kills - killsBefore;
}

/** The Shockwave's pull: the ground creeps of `lane` within `radius` of (x, y) step `distance` tiles toward it. */
function pullCreeps(state: GameState, x: number, y: number, lane: LaneId, pull: { radius: number; distance: number }): void {
  for (const c of creepsInRadius(state, x, y, pull.radius, false)) {
    if (c.lane !== lane) continue;
    const stats = state.tuning.creeps[c.kind];
    const d = dist(c.x, c.y, x, y);
    const keep = 0.3;
    if (d <= keep) continue;
    const move = Math.min(pull.distance * (stats.boss ? 0.5 : 1), d - keep);
    c.x += ((x - c.x) / d) * move;
    c.y += ((y - c.y) / d) * move;
  }
}

// ---------------------------------------------------------------------------
// Boss shield
// ---------------------------------------------------------------------------

/** A creep just spawned. Wave-10 bosses (and only those) get a shield. */
export function onBossSpawned(state: GameState, creep: Creep): void {
  if (!state.tuning.creeps[creep.kind].boss) return;
  if (!state.tuning.coop.bossShield.waves.includes(creep.wave)) return;
  state.shields.push({ creepId: creep.id, up: true, lastHit: [-1, -1, -1], side: null, sideTick: 0 });
  emit(state, { type: 'shieldUp', creepId: creep.id, kind: creep.kind as CreepKind, x: creep.x, y: creep.y });
}

/**
 * Damage about to land on `creep`. A shielded boss takes `damageTaken` of it (0) unless this hit
 * is from a second lane within the window, which breaks the shield and lands in full.
 */
export function shieldedDamage(state: GameState, creep: Creep, amount: number, from: HitFrom | null | undefined): number {
  const shield = state.shields.find((s) => s.creepId === creep.id && s.up);
  if (!shield) return amount;
  const t = state.tuning.coop.bossShield;
  if (from) {
    const window = secondsToTicks(t.window);
    const other = ([0, 1, 2] as LaneId[]).find(
      (l) => l !== from.lane && shield.lastHit[l] >= 0 && state.tick - shield.lastHit[l] <= window,
    );
    shield.lastHit[from.lane] = state.tick;
    if (other !== undefined) {
      shield.up = false;
      emit(state, { type: 'shieldBreak', creepId: creep.id, x: creep.x, y: creep.y, lanes: [other, from.lane] });
      return amount;
    }
    if (shield.side === null) {
      shield.side = from.x < creep.x ? 'left' : 'right';
      emit(state, { type: 'shieldHit', creepId: creep.id, side: shield.side, lane: from.lane });
    }
    shield.sideTick = state.tick;
  }
  return amount * t.damageTaken;
}

/** What a creep's snapshot shows of its shield. Undefined: this creep has none. */
export function shieldSnap(state: GameState, creep: Creep): ShieldState | undefined {
  const s: BossShield | undefined = state.shields.find((sh) => sh.creepId === creep.id);
  if (!s) return undefined;
  if (!s.up) return 'off';
  return s.side ?? 'up';
}

// ---------------------------------------------------------------------------
// Practice start level and the end of each tick
// ---------------------------------------------------------------------------

/** Both heroes start at the practice level, with the skill points those levels give, and no level-up spam. */
export function applyPracticeLevels(state: GameState): void {
  const practice = state.practice;
  if (!practice || practice.startLevel <= 1) return;
  const level = Math.min(practice.startLevel, state.tuning.hero.maxLevel);
  const xp = state.tuning.hero.xpForLevel[level - 1] ?? 0;
  for (const hero of state.heroes) {
    hero.xp = xp;
    hero.level = level;
    hero.skillPoints = level - 1;
    hero.hp = heroMaxHp(state, hero);
    hero.mana = heroMaxMana(state, hero);
  }
}

/** Forget old ultimates, drop shields of dead bosses, let a lit half fade, and keep the ally levelled with you. */
export function updateCoop(state: GameState): void {
  const window = secondsToTicks(state.tuning.coop.comboWindow);
  state.recentUlts = state.recentUlts.filter((u) => state.tick - u.tick <= window);
  if (state.firedCombo && state.tick - state.firedCombo.tick > window) state.firedCombo = null;
  const alive = new Set(state.creeps.map((c) => c.id));
  state.shields = state.shields.filter((s) => alive.has(s.creepId));
  const shieldWindow = secondsToTicks(state.tuning.coop.bossShield.window);
  for (const s of state.shields) if (s.side && state.tick - s.sideTick > shieldWindow) s.side = null;
  const practice = state.practice;
  if (!practice) return;
  const leader = state.heroes.find((h) => h.owner === leaderId(state));
  const ally = state.heroes.find((h) => h.owner === practice.allyId);
  if (!leader || !ally || ally.xp >= leader.xp) return;
  addUnscaledXp(state, ally, leader.xp - ally.xp);
}

/** XP with no Fog multiplier: the ally copies the leader's total, which is already scaled. */
function addUnscaledXp(state: GameState, hero: Hero, amount: number): void {
  const { xpForLevel, maxLevel } = state.tuning.hero;
  const cap = xpForLevel[maxLevel - 1] ?? 0;
  hero.xp = Math.min(cap, hero.xp + amount);
  while (hero.level < maxLevel && hero.xp >= (xpForLevel[hero.level] ?? Infinity)) {
    const oldHp = heroMaxHp(state, hero);
    const oldMana = heroMaxMana(state, hero);
    hero.level++;
    hero.skillPoints++;
    hero.hp += heroMaxHp(state, hero) - oldHp;
    hero.mana += heroMaxMana(state, hero) - oldMana;
    emit(state, { type: 'levelUp', heroId: hero.id, level: hero.level });
  }
}
