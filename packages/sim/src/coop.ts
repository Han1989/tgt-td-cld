// Soft-launch hook (always on, not a spike flag):
// 1. Combos — Arrow Storm, Meteor and Iron Vow are aimed ultimates. Two of them cast inside the combo window with
//    overlapping areas fuse into one stronger effect: Meteor Rain, Stun Storm or Shockwave.
// 2. Quick wave-10 two-lane shield — that boss takes no damage until two lanes hit it within the window.
//    Full overrides the wave list to empty.
// 3. Solo practice — an ally hero that does not count as a player (`practice` on GameConfig).

import {
  HERO_KINDS,
  type ComboKind,
  type CreepKind,
  type HeroKind,
  type LaneId,
  type PlayerId,
  type ShieldState,
} from '@tdt/protocol';
import { creepsInRadius, emit, heroMaxHp, heroMaxMana, newId, random, stunCreep, ultimateDamage } from './combat';
import { getMap, laneDistance, PAD_ZONES } from './map';
import type { BossShield, Creep, GameState, Hero, HitFrom, RecentUlt, UltKind, Zone } from './state';
import { secondsToTicks, TICK_RATE } from './tuning';
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
// Ultimate zones and combos
// ---------------------------------------------------------------------------

/** An aimed ultimate zone at (x, y). Arrow Storm pulses until `duration` ends; a Meteor lands once, after its delay. */
export function addZone(
  state: GameState,
  kind: Zone['kind'],
  src: Hero,
  x: number,
  y: number,
  radius: number,
  duration: number,
  firstPulse: number,
  pulseTicks: number,
): Zone {
  const zone: Zone = {
    id: newId(state),
    kind,
    owner: src.owner,
    x,
    y,
    radius,
    rank: src.ranks.R,
    startTick: state.tick,
    endTick: state.tick + duration,
    nextPulseTick: state.tick + firstPulse,
    pulseTicks,
    done: false,
  };
  state.zones.push(zone);
  return zone;
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

/**
 * Whether the areas of two ultimates overlap. Arrow Storm and Meteor: their circles do (centres no further apart than
 * the two radii together). Iron Vow has no circle to aim: its Warden must be standing inside the other's circle.
 */
function areasOverlap(state: GameState, a: RecentUlt, b: RecentUlt): boolean {
  const vow = a.kind === 'ironVow' ? a : b.kind === 'ironVow' ? b : null;
  if (!vow) return dist(a.x, a.y, b.x, b.y) <= a.radius + b.radius;
  const other = vow === a ? b : a;
  const warden = state.heroes.find((h) => h.id === vow.heroId);
  return warden !== undefined && warden.alive && dist(warden.x, warden.y, other.x, other.y) <= other.radius;
}

/**
 * A hero just cast an ultimate: Arrow Storm (`zone`), Meteor (`zone`) or Iron Vow (no zone; `x`, `y` and `radius` are the
 * Warden's burst). If another hero's ultimate that pairs with it (`comboOf`) was cast within the combo window and the
 * areas overlap, both fuse into a combo: the zones end and one combo zone takes their place.
 */
export function onUltCast(
  state: GameState,
  hero: Hero,
  kind: UltKind,
  x: number,
  y: number,
  radius: number,
  zone: Zone | null,
): void {
  const window = secondsToTicks(state.tuning.coop.comboWindow);
  const me: RecentUlt = { heroId: hero.id, kind, x, y, radius, tick: state.tick, zoneId: zone?.id ?? -1, fused: false };
  const partner = state.recentUlts.find(
    (u) =>
      !u.fused &&
      u.heroId !== hero.id &&
      state.tick - u.tick <= window &&
      comboOf(u.kind, kind) !== null &&
      areasOverlap(state, u, me),
  );
  state.recentUlts.push(me);
  if (!partner) return;
  partner.fused = true;
  me.fused = true;
  // The two effects become one: their zones end now (a Meteor that already landed is gone already).
  for (const u of [partner, me]) {
    const z = state.zones.find((zz) => zz.id === u.zoneId);
    if (z) z.done = true;
  }
  const pick = (k: UltKind) => (partner.kind === k ? partner : me);
  const heroOf = (u: RecentUlt) => state.heroes.find((h) => h.id === u.heroId) ?? hero;
  const combo = comboOf(partner.kind, kind)!;
  const t = state.tuning.coop;
  let fused: Zone;
  if (combo === 'meteorRain') {
    const storm = pick('arrowStorm');
    const meteor = pick('meteor');
    const pulse = Math.max(1, secondsToTicks(t.meteorRain.pulseInterval));
    fused = addZone(
      state,
      'meteorRain',
      heroOf(meteor),
      (storm.x + meteor.x) / 2,
      (storm.y + meteor.y) / 2,
      Math.max(storm.radius, meteor.radius) + t.meteorRain.radiusBonus,
      secondsToTicks(t.meteorRain.duration),
      pulse,
      pulse,
    );
  } else if (combo === 'stunStorm') {
    const storm = pick('arrowStorm');
    const s = state.tuning.hero.ranger.arrowStorm;
    const pulse = Math.max(1, secondsToTicks(s.pulseInterval));
    fused = addZone(state, 'stunStorm', heroOf(storm), storm.x, storm.y, storm.radius + t.stunStorm.radiusBonus,
      secondsToTicks(s.duration), pulse, pulse);
  } else {
    const meteor = pick('meteor');
    const ticks = Math.max(1, secondsToTicks(t.shockwave.pullTime));
    fused = addZone(state, 'shockwave', heroOf(meteor), meteor.x, meteor.y, t.shockwave.radius, ticks, ticks, ticks);
  }
  emit(state, {
    type: 'combo',
    combo,
    x: fused.x,
    y: fused.y,
    radius: combo === 'shockwave' ? t.shockwave.pullRadius : fused.radius,
    heroes: [partner.heroId, me.heroId],
  });
}

/** Where a hit by `owner`'s zones comes from, for the wave-10 shield (the owner's hero). */
function ownerFrom(state: GameState, owner: PlayerId): HitFrom | null {
  const hero = state.heroes.find((h) => h.owner === owner);
  return hero ? hitFrom(state, hero) : null;
}

/** Every tick a zone lives (before its pulse): the Shockwave pulls ground creeps in. */
export function tickComboZone(state: GameState, zone: Zone): void {
  if (zone.kind !== 'shockwave' || state.tick >= zone.endTick) return;
  const t = state.tuning.coop.shockwave;
  for (const c of creepsInRadius(state, zone.x, zone.y, t.pullRadius, false)) {
    const boss = state.tuning.creeps[c.kind].boss;
    const step = (t.pullSpeed * (boss ? 0.5 : 1)) / TICK_RATE;
    const d = dist(c.x, c.y, zone.x, zone.y);
    const keep = 0.4 + state.tuning.creeps[c.kind].radius;
    if (d <= keep) continue;
    const move = Math.min(step, d - keep);
    c.x += ((zone.x - c.x) / d) * move;
    c.y += ((zone.y - c.y) / d) * move;
  }
}

/** A combo zone's pulse. Returns false for Arrow Storm and Meteor (skills.ts pulses those). */
export function pulseComboZone(state: GameState, zone: Zone): boolean {
  const i = Math.max(0, zone.rank - 1);
  const from = ownerFrom(state, zone.owner);
  const t = state.tuning.coop;
  switch (zone.kind) {
    case 'stunStorm': {
      emit(state, { type: 'aoe', effect: 'stunStorm', x: zone.x, y: zone.y, radius: zone.radius });
      const damage = state.tuning.hero.ranger.arrowStorm.damagePerPulse[i] ?? 0;
      const stun = secondsToTicks(t.stunStorm.stun);
      for (const c of creepsInRadius(state, zone.x, zone.y, zone.radius, true)) {
        stunCreep(state, c, stun);
        ultimateDamage(state, c, damage, 'physical', zone.owner, from);
      }
      return true;
    }
    case 'meteorRain': {
      const damage = t.meteorRain.damage[i] ?? 0;
      const stun = secondsToTicks(t.meteorRain.stun);
      for (let n = 0; n < t.meteorRain.meteorsPerPulse; n++) {
        const a = random(state) * Math.PI * 2;
        const r = Math.sqrt(random(state)) * zone.radius;
        const x = zone.x + Math.cos(a) * r;
        const y = zone.y + Math.sin(a) * r;
        emit(state, { type: 'aoe', effect: 'meteorRain', x, y, radius: t.meteorRain.meteorRadius });
        for (const c of creepsInRadius(state, x, y, t.meteorRain.meteorRadius, false)) {
          stunCreep(state, c, stun);
          ultimateDamage(state, c, damage, 'magic', zone.owner, from);
        }
      }
      return true;
    }
    case 'shockwave': {
      const damage = (state.tuning.hero.arcanist.meteor.damage[i] ?? 0) * t.shockwave.damageMult;
      const stun = secondsToTicks(t.shockwave.stun[i] ?? 0);
      emit(state, { type: 'aoe', effect: 'shockwave', x: zone.x, y: zone.y, radius: zone.radius });
      for (const c of creepsInRadius(state, zone.x, zone.y, zone.radius, false)) {
        stunCreep(state, c, stun);
        ultimateDamage(state, c, damage, 'magic', zone.owner, from);
      }
      return true;
    }
    default:
      return false;
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
  state.recentUlts = state.recentUlts.filter((u) => state.tick - u.tick <= window && !u.fused);
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
