// Every balance number in the game lives in this file. Durations are in
// seconds, distances in tiles, speeds in tiles per second. The sim converts
// seconds to ticks with `secondsToTicks`.

import type { CreepKind, DamageType, LaneId, SkillSlot, TowerKind } from '@tdt/protocol';

/** Fixed simulation rate. */
export const TICK_RATE = 20;

export interface CreepStats {
  hp: number;
  armor: number;
  magicResist: number;
  speed: number;
  radius: number;
  flying: boolean;
  /** 0 = never attacks. */
  damage: number;
  damageType: DamageType;
  attackCooldown: number;
  /** Melee creeps use a short range; ranged creeps fire projectiles. */
  attackRange: number;
  ranged: boolean;
  /** Stops on its lane to shoot towers in range. */
  attacksTowers: boolean;
  bounty: number;
  xp: number;
  leakDamage: number;
}

export interface TowerStats {
  cost: number;
  hp: number;
  range: number;
  damage: number;
  damageType: DamageType;
  attackCooldown: number;
  hitsGround: boolean;
  hitsAir: boolean;
  projectileSpeed: number;
  /** Splash radius around the impact point; 0 = single target. */
  splash: number;
  /** Fractional slow applied on hit (0.3 = 30%); 0 = none. */
  slow: number;
  slowDuration: number;
}

export interface MultishotStats {
  manaCost: number[];
  cooldown: number[];
  targets: number[];
  damage: number[];
  /** Extra range on top of the hero's attack range. */
  bonusRange: number;
}

export interface SnareTrapStats {
  manaCost: number[];
  cooldown: number[];
  castRange: number;
  armDelay: number;
  lifetime: number;
  triggerRadius: number;
  rootRadius: number;
  rootDuration: number[];
  damage: number[];
  /** Bosses are rooted for this fraction of the duration. */
  bossRootFactor: number;
}

export interface HeroStats {
  hp: number;
  hpPerLevel: number;
  hpRegen: number;
  mana: number;
  manaPerLevel: number;
  manaRegen: number;
  armor: number;
  armorPerLevel: number;
  damage: number;
  damagePerLevel: number;
  attackCooldown: number;
  attackRange: number;
  /** Ranged heroes can hit flying creeps. */
  ranged: boolean;
  projectileSpeed: number;
  speed: number;
  radius: number;
  /** Idle / attack-moving heroes engage creeps within this range. */
  acquireRange: number;
  multishot: MultishotStats;
  snareTrap: SnareTrapStats;
}

export interface WaveGroup {
  kind: CreepKind;
  /** Creeps of this kind spawned in each listed lane. */
  perLane: number;
  lanes: LaneId[];
}

export interface Tuning {
  heart: { maxHp: number; radius: number };
  economy: {
    startingGold: number;
    sellRefund: number;
    waveIncomeBase: number;
    waveIncomePerWave: number;
    /** Call-early bonus per second left on the wave timer. */
    callEarlyGoldPerSecond: number;
  };
  waves: {
    buildPhase: number;
    interval: number;
    /** Delay between consecutive spawns in the same lane. */
    spawnInterval: number;
    /** Max random offset from the lane centre line. */
    laneSpread: number;
    /** Creep HP multiplier: 1 + hpGrowthPerWave × (wave − 1). */
    hpGrowthPerWave: number;
    list: WaveGroup[][];
  };
  combat: {
    /** Physical reduction = a·armor / (1 + a·armor). */
    armorFactor: number;
    xpShareRadius: number;
  };
  creepAi: {
    aggroRange: number;
    /** A chasing creep gives up once it is this far from where it left its lane. */
    leashRange: number;
    projectileSpeed: number;
  };
  boss: {
    stompCooldown: number;
    stompRadius: number;
    stompDamage: number;
    stompStun: number;
  };
  creeps: Record<CreepKind, CreepStats>;
  towers: Record<TowerKind, TowerStats>;
  hero: {
    maxLevel: number;
    /** Total XP needed to reach level i+1 (index 0 = level 1). */
    xpForLevel: number[];
    maxSkillRank: number;
    /** Skills that start at rank 1. */
    startingSkills: SkillSlot[];
    respawnBase: number;
    respawnPerLevel: number;
    ranger: HeroStats;
  };
}

const ALL: LaneId[] = [0, 1, 2];
const MID: LaneId[] = [1];

export const TUNING: Tuning = {
  heart: { maxHp: 100, radius: 1.8 },
  economy: {
    startingGold: 150,
    sellRefund: 0.7,
    waveIncomeBase: 20,
    waveIncomePerWave: 5,
    callEarlyGoldPerSecond: 0.5,
  },
  waves: {
    buildPhase: 30,
    interval: 40,
    spawnInterval: 0.9,
    laneSpread: 0.8,
    hpGrowthPerWave: 0.12,
    list: [
      // 1
      [{ kind: 'grunt', perLane: 4, lanes: ALL }],
      // 2
      [
        { kind: 'grunt', perLane: 4, lanes: ALL },
        { kind: 'runner', perLane: 2, lanes: ALL },
      ],
      // 3
      [
        { kind: 'grunt', perLane: 4, lanes: ALL },
        { kind: 'archer', perLane: 3, lanes: ALL },
      ],
      // 4
      [
        { kind: 'grunt', perLane: 3, lanes: ALL },
        { kind: 'runner', perLane: 3, lanes: ALL },
        { kind: 'brute', perLane: 1, lanes: ALL },
      ],
      // 5: first wisps
      [
        { kind: 'grunt', perLane: 4, lanes: ALL },
        { kind: 'archer', perLane: 2, lanes: ALL },
        { kind: 'wisp', perLane: 2, lanes: ALL },
      ],
      // 6
      [
        { kind: 'runner', perLane: 5, lanes: ALL },
        { kind: 'brute', perLane: 2, lanes: ALL },
        { kind: 'wisp', perLane: 2, lanes: ALL },
      ],
      // 7
      [
        { kind: 'grunt', perLane: 5, lanes: ALL },
        { kind: 'archer', perLane: 3, lanes: ALL },
        { kind: 'brute', perLane: 2, lanes: ALL },
      ],
      // 8
      [
        { kind: 'grunt', perLane: 4, lanes: ALL },
        { kind: 'runner', perLane: 4, lanes: ALL },
        { kind: 'archer', perLane: 2, lanes: ALL },
        { kind: 'wisp', perLane: 3, lanes: ALL },
      ],
      // 9
      [
        { kind: 'grunt', perLane: 5, lanes: ALL },
        { kind: 'brute', perLane: 3, lanes: ALL },
        { kind: 'archer', perLane: 3, lanes: ALL },
        { kind: 'wisp', perLane: 3, lanes: ALL },
      ],
      // 10: boss
      [
        { kind: 'grunt', perLane: 5, lanes: ALL },
        { kind: 'archer', perLane: 3, lanes: ALL },
        { kind: 'brute', perLane: 2, lanes: ALL },
        { kind: 'wisp', perLane: 3, lanes: ALL },
        { kind: 'boss', perLane: 1, lanes: MID },
      ],
    ],
  },
  combat: { armorFactor: 0.06, xpShareRadius: 12 },
  creepAi: { aggroRange: 5, leashRange: 9, projectileSpeed: 10 },
  boss: { stompCooldown: 7, stompRadius: 3, stompDamage: 40, stompStun: 2 },
  creeps: {
    grunt: {
      hp: 55, armor: 1, magicResist: 0, speed: 1.6, radius: 0.35, flying: false,
      damage: 7, damageType: 'physical', attackCooldown: 1, attackRange: 0.6, ranged: false, attacksTowers: false,
      bounty: 5, xp: 10, leakDamage: 1,
    },
    archer: {
      hp: 50, armor: 0, magicResist: 0, speed: 1.6, radius: 0.33, flying: false,
      damage: 6, damageType: 'physical', attackCooldown: 1.4, attackRange: 4.5, ranged: true, attacksTowers: true,
      bounty: 7, xp: 12, leakDamage: 1,
    },
    runner: {
      hp: 40, armor: 0, magicResist: 0, speed: 3.2, radius: 0.3, flying: false,
      damage: 4, damageType: 'physical', attackCooldown: 0.8, attackRange: 0.6, ranged: false, attacksTowers: false,
      bounty: 5, xp: 8, leakDamage: 1,
    },
    brute: {
      hp: 220, armor: 6, magicResist: 0, speed: 1, radius: 0.5, flying: false,
      damage: 14, damageType: 'physical', attackCooldown: 1.5, attackRange: 0.7, ranged: false, attacksTowers: false,
      bounty: 14, xp: 25, leakDamage: 1,
    },
    wisp: {
      hp: 55, armor: 0, magicResist: 0, speed: 1.8, radius: 0.3, flying: true,
      damage: 0, damageType: 'magic', attackCooldown: 1, attackRange: 0, ranged: false, attacksTowers: false,
      bounty: 7, xp: 12, leakDamage: 1,
    },
    boss: {
      hp: 1400, armor: 4, magicResist: 0.1, speed: 0.9, radius: 0.9, flying: false,
      damage: 40, damageType: 'physical', attackCooldown: 1.5, attackRange: 1.6, ranged: false, attacksTowers: true,
      bounty: 150, xp: 300, leakDamage: 20,
    },
  },
  towers: {
    arrow: {
      cost: 60, hp: 500, range: 6, damage: 16, damageType: 'physical', attackCooldown: 0.7,
      hitsGround: true, hitsAir: true, projectileSpeed: 14, splash: 0, slow: 0, slowDuration: 0,
    },
    cannon: {
      cost: 90, hp: 550, range: 5.5, damage: 36, damageType: 'physical', attackCooldown: 1.6,
      hitsGround: true, hitsAir: false, projectileSpeed: 8, splash: 1.6, slow: 0, slowDuration: 0,
    },
    frost: {
      cost: 70, hp: 500, range: 5, damage: 10, damageType: 'magic', attackCooldown: 1,
      hitsGround: true, hitsAir: true, projectileSpeed: 10, splash: 0, slow: 0.3, slowDuration: 2,
    },
  },
  hero: {
    maxLevel: 5,
    xpForLevel: [0, 100, 250, 450, 700],
    maxSkillRank: 4,
    startingSkills: ['Q', 'W'],
    respawnBase: 5,
    respawnPerLevel: 2,
    ranger: {
      hp: 320, hpPerLevel: 40, hpRegen: 1.5,
      mana: 120, manaPerLevel: 20, manaRegen: 1.5,
      armor: 2, armorPerLevel: 0.5,
      damage: 20, damagePerLevel: 3,
      attackCooldown: 0.9, attackRange: 6, ranged: true, projectileSpeed: 16,
      speed: 3.4, radius: 0.4, acquireRange: 7,
      multishot: {
        manaCost: [30, 35, 40, 45],
        cooldown: [8, 7, 6, 5],
        targets: [3, 4, 5, 6],
        damage: [30, 45, 60, 75],
        bonusRange: 1,
      },
      snareTrap: {
        manaCost: [40, 45, 50, 55],
        cooldown: [14, 13, 12, 11],
        castRange: 8,
        armDelay: 0.5,
        lifetime: 25,
        triggerRadius: 1.2,
        rootRadius: 2.5,
        rootDuration: [2, 2.5, 3, 3.5],
        damage: [20, 35, 50, 65],
        bossRootFactor: 0.5,
      },
    },
  },
};

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}
