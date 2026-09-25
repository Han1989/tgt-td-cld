// Shared combat rules: damage reduction, kills, bounties, XP and levelling.

import type { DamageType, GameEvent, HeroKind, PlayerId, SkillSlot } from '@tdt/protocol';
import { getMap } from './map';
import { nextRandom } from './rng';
import type { Creep, GameState, Hero, Projectile, TargetKind, Tower } from './state';
import { secondsToTicks, TICK_RATE, type HeroStats, type Tuning } from './tuning';
import { dist } from './vec';

/** Hit radius of a tower when creeps measure attack range to it. */
export const TOWER_RADIUS = 1;

export const HERO_SKILLS: Record<HeroKind, SkillSlot[]> = {
  ranger: ['Q', 'W'],
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
  return Math.round(base * (1 + state.tuning.economy.bountyGrowthPerWave * (creep.wave - 1)));
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

export function heroArmor(state: GameState, hero: Hero): number {
  const s = heroStats(state, hero);
  return s.armor + s.armorPerLevel * (hero.level - 1);
}

export function heroDamage(state: GameState, hero: Hero): number {
  const s = heroStats(state, hero);
  return s.damage + s.damagePerLevel * (hero.level - 1);
}

export function damageCreep(
  state: GameState,
  creep: Creep,
  amount: number,
  type: DamageType,
  source: PlayerId | null,
): void {
  if (creep.dead) return;
  creep.hp -= amount * damageMultiplier(state.tuning, type, creep.armor, creep.magicResist);
  if (creep.hp <= 0) killCreep(state, creep, source);
}

function killCreep(state: GameState, creep: Creep, source: PlayerId | null): void {
  creep.dead = true;
  creep.hp = 0;
  const stats = state.tuning.creeps[creep.kind];
  const bounty = creepBounty(state, creep);
  const killer = source === null ? undefined : state.players.find((p) => p.id === source);
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
    (h) => h.alive && dist(h.x, h.y, creep.x, creep.y) <= state.tuning.combat.xpShareRadius,
  );
  for (const hero of nearby) grantXp(state, hero, stats.xp / nearby.length);
}

export function grantXp(state: GameState, hero: Hero, amount: number): void {
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

export function damageHero(state: GameState, hero: Hero, amount: number, type: DamageType): void {
  if (!hero.alive) return;
  hero.hp -= amount * damageMultiplier(state.tuning, type, heroArmor(state, hero), heroStats(state, hero).magicResist);
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
  tower.hp -= amount * damageMultiplier(state.tuning, type, s.armor, s.magicResist);
  if (tower.hp > 0) return;
  tower.hp = 0;
  tower.dead = true;
  emit(state, { type: 'towerDestroyed', towerId: tower.id });
}

export function spawnProjectile(
  state: GameState,
  from: { x: number; y: number },
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
    slow?: number;
    slowDuration?: number;
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
    slow: opts.slow ?? 0,
    slowTicks: secondsToTicks(opts.slowDuration ?? 0),
    source: opts.source,
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
