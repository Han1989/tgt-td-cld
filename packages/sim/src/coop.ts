// Soft-launch hook (always on, not a spike flag):
// 1. Meteor Rain — Ranger Arrow Storm and Arcanist Meteor are global lane rains. Cast the
//    second inside the combo window and they fuse into one denser shared rain.
// 2. Quick wave-10 two-lane shield — that boss takes no damage until two lanes hit it within the window.
//    Full overrides the wave list to empty.
// 3. Solo practice — an ally hero that does not count as a player (`practice` on GameConfig).

import type { CreepKind, HeroKind, LaneId, PlayerId, ShieldState } from '@tdt/protocol';
import { creepsInRadius, emit, heroMaxHp, heroMaxMana, newId, stunCreep, ultimateDamage } from './combat';
import { mix32 } from './modifiers';
import { getMap, laneDistance, PAD_ZONES } from './map';
import type { BossShield, Creep, GameState, Hero, HitFrom, RecentUlt, Zone } from './state';
import { secondsToTicks } from './tuning';
import { dist } from './vec';

/** The other half of Meteor Rain, or null for the Warden (no combo with this pair). */
export function meteorRainPartner(kind: HeroKind): HeroKind | null {
  if (kind === 'ranger') return 'arcanist';
  if (kind === 'arcanist') return 'ranger';
  return null;
}

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
// Meteor Rain
// ---------------------------------------------------------------------------

/**
 * A hero just cast Arrow Storm or Meteor. Both are global rains, so the other half
 * only has to still be falling inside the combo window: both zones end and Meteor Rain
 * (a denser shared rain) replaces them. No spatial overlap.
 */
export function onUltCast(state: GameState, hero: Hero, kind: 'arrowStorm' | 'meteor', zone: Zone): void {
  const window = secondsToTicks(state.tuning.coop.comboWindow);
  const me: RecentUlt = {
    heroId: hero.id,
    kind,
    x: zone.x,
    y: zone.y,
    radius: zone.radius,
    tick: state.tick,
    zoneId: zone.id,
    fused: false,
  };
  const partner = state.recentUlts.find(
    (u) =>
      !u.fused &&
      u.heroId !== hero.id &&
      u.kind !== kind &&
      state.tick - u.tick <= window &&
      state.zones.some((z) => z.id === u.zoneId && !z.done),
  );
  state.recentUlts.push(me);
  if (!partner) return;
  partner.fused = true;
  me.fused = true;
  for (const u of [partner, me]) {
    const z = state.zones.find((zz) => zz.id === u.zoneId);
    if (z) z.done = true;
  }
  const meteor = partner.kind === 'meteor' ? partner : me;
  const src = state.heroes.find((h) => h.id === meteor.heroId) ?? hero;
  const t = state.tuning.coop.meteorRain;
  const pulse = Math.max(1, secondsToTicks(t.pulseInterval));
  const fused = addZone(state, 'meteorRain', src, secondsToTicks(t.duration), pulse, pulse);
  fused.rank = src.ranks.R;
  emit(state, {
    type: 'combo',
    combo: 'meteorRain',
    x: fused.x,
    y: fused.y,
    radius: 0,
    heroes: [partner.heroId, me.heroId],
  });
}

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
    // Global rains have no aimed circle. Impacts are `aoe` events.
    radius: 0,
    rank: src.ranks.R,
    startTick: state.tick,
    endTick: state.tick + duration,
    nextPulseTick: state.tick + firstPulse,
    pulseTicks,
    done: false,
    laneStrikes: [0, 0, 0],
    heartStrikes: 0,
  };
  state.zones.push(zone);
  return zone;
}

/** One global-rain impact (Arrow Storm, Meteor, or Meteor Rain). */
export function rainStrike(
  state: GameState,
  zone: Zone,
  effect: 'arrowStorm' | 'meteor' | 'meteorRain',
  opts: {
    damage: number;
    radius: number;
    air: boolean;
    stunTicks: number;
    magic: boolean;
    laneCap: number;
    heartCap: number;
    heartRadius: number;
    /** Extra multiplier against bosses. Regular creeps keep `damage`. */
    bossDamage?: number;
  },
): void {
  const spot = pickRainSpot(state, zone, opts.air, opts.laneCap, opts.heartCap, opts.heartRadius);
  if (!spot) return;
  const owner = state.heroes.find((h) => h.owner === zone.owner);
  const from = owner ? hitFrom(state, owner) : { x: spot.x, lane: spot.lane };
  emit(state, { type: 'aoe', effect, x: spot.x, y: spot.y, radius: opts.radius });
  for (const c of creepsInRadius(state, spot.x, spot.y, opts.radius, opts.air)) {
    if (opts.stunTicks > 0) stunCreep(state, c, opts.stunTicks);
    const boss = opts.bossDamage !== undefined && state.tuning.creeps[c.kind].boss;
    ultimateDamage(state, c, boss ? opts.damage * opts.bossDamage! : opts.damage, opts.magic ? 'magic' : 'physical', zone.owner, from);
  }
}

/** A Meteor Rain pulse. Returns false for Arrow Storm and Meteor (skills.ts pulses those). */
export function pulseMeteorRain(state: GameState, zone: Zone): boolean {
  if (zone.kind !== 'meteorRain') return false;
  const t = state.tuning.coop.meteorRain;
  const i = Math.max(0, zone.rank - 1);
  for (let n = 0; n < t.strikesPerPulse; n++) {
    rainStrike(state, zone, 'meteorRain', {
      damage: t.damage[i] ?? 0,
      radius: t.strikeRadius,
      air: false,
      stunTicks: secondsToTicks(t.stun),
      magic: true,
      laneCap: t.laneCap,
      heartCap: t.heartCap,
      heartRadius: t.heartRadius,
    });
  }
  return true;
}

interface Spot {
  x: number;
  y: number;
  lane: LaneId;
}

let laneSpots: Spot[] | null = null;

/** Points along every lane, about 2 tiles apart. Corners off the path are not included. */
function lanePathSpots(): Spot[] {
  if (laneSpots) return laneSpots;
  const out: Spot[] = [];
  for (const lane of getMap().lanes) {
    const wps = lane.waypoints;
    for (let i = 0; i < wps.length - 1; i++) {
      const a = wps[i]!;
      const b = wps[i + 1]!;
      const len = dist(a.x, a.y, b.x, b.y);
      const steps = Math.max(1, Math.round(len / 2));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, lane: lane.id });
      }
    }
  }
  laneSpots = out;
  return out;
}

function pickRainSpot(
  state: GameState,
  zone: Zone,
  air: boolean,
  laneCap: number,
  heartCap: number,
  heartRadius: number,
): Spot | null {
  const heart = getMap().heart;
  const open: { spot: Spot; w: number; heart: boolean }[] = [];
  for (const spot of lanePathSpots()) {
    const nearHeart = dist(spot.x, spot.y, heart.x, heart.y) <= heartRadius;
    if (nearHeart && zone.heartStrikes >= heartCap) continue;
    if (zone.laneStrikes[spot.lane] >= laneCap) continue;
    let creeps = 0;
    for (const c of state.creeps) {
      if (c.dead) continue;
      if (!air && state.tuning.creeps[c.kind].flying) continue;
      if (dist(c.x, c.y, spot.x, spot.y) <= 2.4) creeps++;
    }
    // A pack on the path takes almost every strike until its lane or Heart cap.
    // Empty path tiles keep a little weight so a quiet lane is not a dead zone.
    const w = 0.05 + creeps * creeps * 40;
    open.push({ spot, w, heart: nearHeart });
  }
  // Caps are hard: once every lane and the Heart pocket are full, the rest of the rain misses.
  if (open.length === 0) return null;
  let total = 0;
  for (const c of open) total += c.w;
  // Not the match RNG: a rain must not move later creep offsets.
  const fired = zone.laneStrikes[0] + zone.laneStrikes[1] + zone.laneStrikes[2];
  let roll = (mix32(zone.id, fired + 1) / 4294967296) * total;
  let picked = open[open.length - 1]!;
  for (const c of open) {
    roll -= c.w;
    if (roll <= 0) {
      picked = c;
      break;
    }
  }
  zone.laneStrikes[picked.spot.lane]++;
  if (picked.heart) zone.heartStrikes++;
  return picked.spot;
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
