// Shared combat rules: damage reduction, kills, bounties, XP and levelling.

import type { AoeEffect, DamageType, EntityId, GameEvent, HeroKind, PlayerId, SkillSlot } from '@tdt/protocol';
import { bountyCredit, hitFrom, isPracticeAlly, shieldedDamage } from './coop';
import { getMap } from './map';
import { bountyFactor, xpFactor } from './modifiers';
import { nextRandom } from './rng';
import type { Creep, GameState, Hero, HitFrom, Projectile, ProjectileFx, TargetKind, Tower, UltTag } from './state';
import { secondsToTicks, TICK_RATE, type HeroStats, type Tuning } from './tuning';
import { dist } from './vec';

/** Hit radius of a tower when creeps measure attack range to it. */
export const TOWER_RADIUS = 1;

export const HERO_SKILLS: Record<HeroKind, SkillSlot[]> = {
  ranger: ['Q', 'W', 'E', 'R'],
  warden: ['Q', 'W', 'E', 'R'],
  arcanist: ['Q', 'W', 'E', 'R'],
};

export function emit(state: GameState, event: GameEvent): void {
  state.pendingEvents.push(event);
}

export function newId(state: GameState): number {
  return state.nextId++;
}

export function random(state: GameState): number {
  const [next, value] = nextRandom(state.rng);
  state.rng = next;
  return value;
}

/** Fraction of physical damage that gets through `armor`. */
export function armorMultiplier(tuning: Tuning, armor: number): number {
  const a = tuning.combat.armorFactor * Math.max(0, armor);
  return 1 - a / (1 + a);
}

/** Fraction of magic damage that gets through `magicResist` (capped below immunity). */
export function magicMultiplier(tuning: Tuning, magicResist: number): number {
  return 1 - Math.max(0, Math.min(tuning.combat.maxMagicResist, magicResist));
}

/**
 * The one damage rule for every target (creeps, heroes, towers): physical
 * damage is reduced by armour, magic damage by magic resist.
 */
export function damageMultiplier(tuning: Tuning, type: DamageType, armor: number, magicResist: number): number {
  return type === 'physical' ? armorMultiplier(tuning, armor) : magicMultiplier(tuning, magicResist);
}

/** Bounty for killing `creep`, grown by its wave number. */
export function creepBounty(state: GameState, creep: Creep): number {
  const base = state.tuning.creeps[creep.kind].bounty;
  const grown = base * (1 + state.tuning.economy.bountyGrowthPerWave * (creep.wave - 1));
  return Math.round(grown * bountyFactor(state));
}

export function heroStats(state: GameState, hero: Hero): HeroStats {
  return state.tuning.hero[hero.kind];
}

export function heroMaxHp(state: GameState, hero: Hero): number {
  const s = heroStats(state, hero);
  return s.hp + s.hpPerLevel * (hero.level - 1);
}

export function heroMaxMana(state: GameState, hero: Hero): number {
  const s = heroStats(state, hero);
  return s.mana + s.manaPerLevel * (hero.level - 1);
}

/**
 * Strongest aura of `kind` reaching `target` (a hero or a tower): the highest
 * E rank among living heroes of that kind within `radius` (a hero's own aura
 * included). Auras of the same kind don't stack. Returns the rank index, or -1 for none.
 */
function auraRank(state: GameState, target: { x: number; y: number }, kind: HeroKind, radius: number): number {
  let best = -1;
  for (const h of state.heroes) {
    if (h.kind !== kind || !h.alive || h.ranks.E === 0) continue;
    if (h !== target && dist(h.x, h.y, target.x, target.y) > radius) continue;
    best = Math.max(best, h.ranks.E - 1);
  }
  return best;
}

/**
 * The strongest Iron Vow still running: highest Warden R rank, and how many ticks are left
 * on the longest vow. Two vows do not stack. Null when none is up.
 */
export function ironVow(state: GameState): { rank: number; ticksLeft: number } | null {
  let rank = -1;
  let ticksLeft = 0;
  for (const h of state.heroes) {
    if (h.kind !== 'warden' || state.tick >= h.guardianUntil) continue;
    rank = Math.max(rank, h.ranks.R - 1);
    ticksLeft = Math.max(ticksLeft, h.guardianUntil - state.tick);
  }
  return rank < 0 ? null : { rank, ticksLeft };
}

/** Mana regeneration bonus (per second) from an Arcanist's Clarity Aura. */
export function clarityBonus(state: GameState, hero: Hero): number {
  const aura = state.tuning.hero.arcanist.clarityAura;
  const rank = auraRank(state, hero, 'arcanist', aura.radius);
  return rank < 0 ? 0 : (aura.manaRegen[rank] ?? 0);
}

export function heroArmor(state: GameState, hero: Hero): number {
  const s = heroStats(state, hero);
  const vow = ironVow(state);
  const bonus = vow ? (state.tuning.hero.warden.ironVow.armor[vow.rank] ?? 0) : 0;
  return s.armor + s.armorPerLevel * (hero.level - 1) + bonus;
}

/** Health regenerated per second, including Iron Vow while it covers living heroes. */
export function heroHpRegen(state: GameState, hero: Hero): number {
  const vow = ironVow(state);
  const bonus = vow ? (state.tuning.hero.warden.ironVow.regen[vow.rank] ?? 0) : 0;
  return heroStats(state, hero).hpRegen + bonus;
}

export function heroManaRegen(state: GameState, hero: Hero): number {
  const s = heroStats(state, hero);
  return s.manaRegen + s.manaRegenPerLevel * (hero.level - 1) + clarityBonus(state, hero);
}

/**
 * Whether the hero's attacks and targeted skills can hit this creep. Every hero can, melee included: a flyer is hit
 * when it is within reach (attack range plus both radii), like any creep.
 */
export function heroCanHit(_state: GameState, _hero: Hero, _creep: Creep): boolean {
  return true;
}

export function heroDamage(state: GameState, hero: Hero): number {
  const s = heroStats(state, hero);
  return s.damage + s.damagePerLevel * (hero.level - 1);
}

/** A creep's armour right now: its own, minus what Shrapnel towers stripped off (while it lasts). */
export function effectiveArmor(state: GameState, creep: Creep): number {
  return state.tick < creep.shredUntil ? creep.armor - creep.shred : creep.armor;
}

/** Strips `amount` armour (up to `max` in total) for `ticks` after this hit. */
export function shredArmor(state: GameState, creep: Creep, amount: number, max: number, ticks: number): void {
  if (state.tick >= creep.shredUntil) creep.shred = 0;
  creep.shred = Math.min(max, creep.shred + amount);
  creep.shredUntil = state.tick + ticks;
}

/**
 * Damage actually removed from the creep (0 if it was already dead or the hit was fully blocked).
 * `pierce`: the hit ignores armour and magic resist (Void towers).
 * `from`: which lane the hit counts as for a wave-10 shield. Omit it and a shielded boss ignores the hit.
 */
export function damageCreep(
  state: GameState,
  creep: Creep,
  amount: number,
  type: DamageType,
  source: PlayerId | null,
  pierce = false,
  from?: HitFrom | null,
): number {
  if (creep.dead) return 0;
  amount = shieldedDamage(state, creep, amount, from);
  const mult = pierce ? 1 : damageMultiplier(state.tuning, type, effectiveArmor(state, creep), creep.magicResist);
  const dealt = Math.min(creep.hp, Math.max(0, amount * mult));
  if (dealt > 0) {
    // Reported per source at the end of the tick (`damage` events: the clients' damage numbers).
    const bySource = (state.pendingDamage[source ?? ''] ??= {});
    bySource[creep.id] = (bySource[creep.id] ?? 0) + dealt;
  }
  creep.hp -= amount * mult;
  if (creep.hp <= 0) killCreep(state, creep, source);
  return dealt;
}

/** `damageCreep` for a hero ultimate or combo (`tag`), counted in `state.ultStats` for the balance matrix. */
export function ultimateDamage(
  state: GameState,
  creep: Creep,
  amount: number,
  type: DamageType,
  source: PlayerId | null,
  from: HitFrom | null | undefined,
  tag: UltTag,
): number {
  const alive = !creep.dead;
  if (state.tuning.creeps[creep.kind].boss) amount *= state.tuning.combat.ultimateBossFactor;
  const dealt = damageCreep(state, creep, amount, type, source, false, from);
  const stats = state.ultStats;
  stats.damage += dealt;
  stats.by[tag].damage += dealt;
  if (alive && creep.dead) {
    stats.kills++;
    stats.by[tag].kills++;
  }
  return dealt;
}

function killCreep(state: GameState, creep: Creep, source: PlayerId | null): void {
  creep.dead = true;
  creep.hp = 0;
  const stats = state.tuning.creeps[creep.kind];
  const bounty = creepBounty(state, creep);
  const credited = bountyCredit(state, source);
  const killer = credited === null ? undefined : state.players.find((p) => p.id === credited);
  if (killer) {
    killer.gold += bounty;
    killer.kills++;
  }
  emit(state, {
    type: 'kill',
    creepId: creep.id,
    kind: creep.kind,
    x: creep.x,
    y: creep.y,
    by: killer ? killer.id : null,
    bounty: killer ? bounty : 0,
  });

  const nearby = state.heroes.filter(
    (h) => h.alive && dist(h.x, h.y, creep.x, creep.y) <= state.tuning.combat.xpShareRadius && !isPracticeAlly(state, h.owner),
  );
  for (const hero of nearby) grantXp(state, hero, stats.xp / nearby.length);
}

export function grantXp(state: GameState, hero: Hero, amount: number): void {
  const { xpForLevel, maxLevel } = state.tuning.hero;
  const cap = xpForLevel[maxLevel - 1] ?? 0;
  hero.xp = Math.min(cap, hero.xp + amount * xpFactor(state));
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

/** `attacker`: the creep dealing the damage, if any (a melee hero left idle fights back: see heroes.ts). */
export function damageHero(state: GameState, hero: Hero, amount: number, type: DamageType, attacker?: Creep): void {
  if (!hero.alive) return;
  if (attacker) {
    hero.hitBy = attacker.id;
    hero.hitTick = state.tick;
  }
  const mult = damageMultiplier(state.tuning, type, heroArmor(state, hero), heroStats(state, hero).magicResist);
  hero.hp -= amount * mult;
  if (hero.hp > 0) return;
  hero.hp = 0;
  hero.alive = false;
  hero.order = { type: 'idle' };
  hero.path = [];
  const t = state.tuning.hero;
  hero.respawnTick = state.tick + secondsToTicks(t.respawnBase + t.respawnPerLevel * hero.level);
  emit(state, { type: 'heroDied', heroId: hero.id });
}

export function respawnHero(state: GameState, hero: Hero): void {
  const spawn = getMap().heroSpawn;
  hero.alive = true;
  hero.x = spawn.x;
  hero.y = spawn.y;
  hero.hp = heroMaxHp(state, hero);
  hero.mana = heroMaxMana(state, hero);
  hero.stunUntil = 0;
  hero.order = { type: 'idle' };
  hero.path = [];
  emit(state, { type: 'heroRespawned', heroId: hero.id });
}

export function damageTower(state: GameState, tower: Tower, amount: number, type: DamageType): void {
  if (tower.dead) return;
  const s = state.tuning.towers[tower.kind];
  const armor = s.armor;
  tower.hp -= amount * damageMultiplier(state.tuning, type, armor, s.magicResist);
  if (tower.hp > 0) return;
  tower.hp = 0;
  tower.dead = true;
  emit(state, { type: 'towerDestroyed', towerId: tower.id, owner: tower.owner });
}

export function spawnProjectile(
  state: GameState,
  from: { x: number; y: number; padId?: number },
  target: { kind: TargetKind; id: number; x: number; y: number },
  opts: {
    style: string;
    speed: number;
    damage: number;
    damageType: DamageType;
    source: PlayerId | null;
    splash?: number;
    /** Splash targets; default ground only. */
    splashGround?: boolean;
    splashAir?: boolean;
    aoe?: AoeEffect;
    slow?: number;
    slowDuration?: number;
    crit?: boolean;
    fx?: ProjectileFx;
    /** The creep firing it. */
    attacker?: EntityId;
    /** Lane of the hit when it is not the shooter's (a Prism chain keeps its tower's). */
    hitFrom?: HitFrom | null;
  },
): void {
  const p: Projectile = {
    id: newId(state),
    style: opts.style,
    x: from.x,
    y: from.y,
    speed: opts.speed / TICK_RATE,
    targetKind: target.kind,
    targetId: target.id,
    tx: target.x,
    ty: target.y,
    damage: opts.damage,
    damageType: opts.damageType,
    splash: opts.splash ?? 0,
    splashGround: opts.splashGround ?? true,
    splashAir: opts.splashAir ?? false,
    aoe: opts.aoe ?? null,
    slow: opts.slow ?? 0,
    slowTicks: secondsToTicks(opts.slowDuration ?? 0),
    crit: opts.crit ?? false,
    fx: opts.fx ?? null,
    source: opts.source,
    attacker: opts.attacker ?? -1,
    from: opts.hitFrom ?? hitFrom(state, from),
    done: false,
  };
  state.projectiles.push(p);
}

export function applySlow(state: GameState, creep: Creep, pct: number, ticks: number): void {
  // Slows don't stack: keep the strongest, refresh the duration.
  if (state.tick >= creep.slowUntil) creep.slowPct = pct;
  else creep.slowPct = Math.max(creep.slowPct, pct);
  creep.slowUntil = Math.max(creep.slowUntil, state.tick + ticks);
}

/** Crowd control lasts `bossControlFactor` as long on bosses. */
export function controlTicks(state: GameState, creep: Creep, ticks: number): number {
  return state.tuning.creeps[creep.kind].boss ? Math.round(ticks * state.tuning.combat.bossControlFactor) : ticks;
}

/** Stuns a creep: it neither moves nor attacks. Stuns don't stack; the longer one wins. */
export function stunCreep(state: GameState, creep: Creep, ticks: number): void {
  creep.stunUntil = Math.max(creep.stunUntil, state.tick + controlTicks(state, creep, ticks));
}

/** Living creeps within `radius` of (x, y), measured to their edge. */
export function creepsInRadius(state: GameState, x: number, y: number, radius: number, hitsAir: boolean): Creep[] {
  return state.creeps.filter((c) => {
    if (c.dead) return false;
    const s = state.tuning.creeps[c.kind];
    if (s.flying && !hitsAir) return false;
    return dist(x, y, c.x, c.y) <= radius + s.radius;
  });
}
