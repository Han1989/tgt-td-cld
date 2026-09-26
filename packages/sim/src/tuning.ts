// Every balance number in the game lives in this file. Durations are in
// seconds, distances in tiles, speeds in tiles per second. The sim converts
// seconds to ticks with `secondsToTicks`.

import type { BossKind, CreepKind, DamageType, GameMode, LaneId, SkillSlot, TowerKind } from '@tdt/protocol';

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
  /** Bosses: never multiplied by player count, shorter roots. */
  boss: boolean;
}

/** Numbers for one upgrade tier of a tower. */
export interface TowerTierStats {
  /** Tier 1: build cost. Higher tiers: the cost of upgrading to this tier. */
  cost: number;
  hp: number;
  range: number;
  damage: number;
  attackCooldown: number;
  /** Splash radius around the impact point; 0 = single target. */
  splash: number;
  /** Fractional slow applied on hit (0.3 = 30%); 0 = none. */
  slow: number;
  slowDuration: number;
}

export interface TowerStats {
  damageType: DamageType;
  /** Damage the tower itself takes: same rules as creeps and heroes (all tiers). */
  armor: number;
  magicResist: number;
  hitsGround: boolean;
  hitsAir: boolean;
  projectileSpeed: number;
  /** Tier 1 first; `tiers.length` is the max tier. */
  tiers: TowerTierStats[];
}

/** Every active skill has a mana cost and cooldown per rank. */
export interface ActiveSkillStats {
  manaCost: number[];
  cooldown: number[];
}

// Ranger ---------------------------------------------------------------------

export interface MultishotStats extends ActiveSkillStats {
  targets: number[];
  damage: number[];
  /** Extra range on top of the hero's attack range. */
  bonusRange: number;
}

export interface SnareTrapStats extends ActiveSkillStats {
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

/** Passive: auto-attacks sometimes crit. */
export interface KeenEyeStats {
  critChance: number[];
  critMultiplier: number[];
}

/** Ultimate: arrows rain on an area in pulses (ground and air). */
export interface ArrowStormStats extends ActiveSkillStats {
  castRange: number;
  radius: number;
  duration: number;
  pulseInterval: number;
  damagePerPulse: number[];
}

// Warden ---------------------------------------------------------------------

/** Instant physical hit on every ground creep around the Warden. */
export interface CleaveStats extends ActiveSkillStats {
  radius: number;
  damage: number[];
}

/** Instant: nearby ground creeps must attack the Warden and ignore their leash. */
export interface TauntStats extends ActiveSkillStats {
  radius: number;
  duration: number[];
}

/** Passive: armour for allied heroes (the Warden included) within the radius. */
export interface BulwarkAuraStats {
  radius: number;
  armor: number[];
}

/** Ultimate: the Warden takes less damage for a while and stuns nearby ground creeps. */
export interface LastStandStats extends ActiveSkillStats {
  duration: number[];
  damageReduction: number[];
  stunRadius: number;
  stun: number[];
}

// Arcanist -------------------------------------------------------------------

/** A bolt that explodes at a point: magic damage to ground and air creeps. */
export interface FireballStats extends ActiveSkillStats {
  castRange: number;
  radius: number;
  damage: number[];
  projectileSpeed: number;
}

/** Instant magic burst at a point that slows ground and air creeps. */
export interface FrostNovaStats extends ActiveSkillStats {
  castRange: number;
  radius: number;
  damage: number[];
  slow: number[];
  slowDuration: number;
}

/** Passive: mana regeneration (per second) for allied heroes within the radius. */
export interface ClarityAuraStats {
  radius: number;
  manaRegen: number[];
}

/** Ultimate: after a delay, a meteor hits ground creeps in an area and stuns them. */
export interface MeteorStats extends ActiveSkillStats {
  castRange: number;
  radius: number;
  delay: number;
  damage: number[];
  stun: number[];
}

/** Base stats shared by every hero. */
export interface HeroStats {
  hp: number;
  hpPerLevel: number;
  hpRegen: number;
  mana: number;
  manaPerLevel: number;
  manaRegen: number;
  armor: number;
  armorPerLevel: number;
  magicResist: number;
  damage: number;
  damagePerLevel: number;
  damageType: DamageType;
  attackCooldown: number;
  attackRange: number;
  /** Ranged heroes fire projectiles and can hit flying creeps; melee hits land instantly. */
  ranged: boolean;
  projectileSpeed: number;
  speed: number;
  radius: number;
  /** Idle / attack-moving heroes engage creeps within this range. */
  acquireRange: number;
}

export interface RangerStats extends HeroStats {
  multishot: MultishotStats;
  snareTrap: SnareTrapStats;
  keenEye: KeenEyeStats;
  arrowStorm: ArrowStormStats;
}

export interface WardenStats extends HeroStats {
  cleave: CleaveStats;
  taunt: TauntStats;
  /** Armour for heroes and towers within `radius`. */
  bulwarkAura: BulwarkAuraStats;
  lastStand: LastStandStats;
}

export interface ArcanistStats extends HeroStats {
  fireball: FireballStats;
  frostNova: FrostNovaStats;
  clarityAura: ClarityAuraStats;
  meteor: MeteorStats;
}

export interface WaveGroup {
  kind: CreepKind;
  /** Creeps of this kind spawned in each listed lane. */
  perLane: number;
  lanes: LaneId[];
}

export interface StompStats {
  cooldown: number;
  radius: number;
  damage: number;
  stun: number;
}

export interface HatchStats {
  cooldown: number;
  /** Hatchlings per cast. */
  count: number;
  /** A Matriarch stops hatching after this many hatchlings. */
  max: number;
  /** Random offset of each hatchling from the Matriarch. */
  spread: number;
}

export interface ShiftingHideStats {
  /** Seconds between switching Stone ↔ Ether hide. */
  interval: number;
  /** Stone hide: armour added to the base armour. */
  stoneArmor: number;
  /** Ether hide: magic resist added to the base magic resist. */
  etherMagicResist: number;
}

/**
 * What a match mode changes (docs/MOBILE.md §6). Each section is merged over the Full-mode numbers of
 * the same section; anything left out keeps its Full-mode value. `tuningForMode` applies it.
 */
export interface ModeTuning {
  economy?: Partial<Tuning['economy']>;
  waves?: Partial<Tuning['waves']>;
  playerScaling?: Partial<Tuning['playerScaling']>;
  hero?: Partial<Pick<Tuning['hero'], 'xpForLevel'>>;
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
    /** Kill bounty × (1 + bountyGrowthPerWave × (wave − 1)), rounded. */
    bountyGrowthPerWave: number;
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
    /** Armour added to every creep: armorGrowthPerWave × (wave − 1). */
    armorGrowthPerWave: number;
    list: WaveGroup[][];
  };
  /**
   * Player-count scaling, by player count (index 0 = solo; the last entry also covers bigger teams).
   * Creep HP × (hp[n − 1] + earlyHpBonus[n − 1] × e), where e fades from 1 on wave 1 to 0 on wave
   * earlyWaves + 1. Teams get their gold and heroes all at once but share the pads (a few extra pads
   * aside), so their tower power hits the pad limit sooner than a solo player's: they are pressed
   * harder early than late.
   */
  playerScaling: {
    hp: number[];
    earlyHpBonus: number[];
    earlyWaves: number;
    /** Creep count × (1 + countPerExtraPlayer × (players − 1)); bosses are not multiplied. */
    countPerExtraPlayer: number;
  };
  combat: {
    /** Physical reduction = a·armor / (1 + a·armor). */
    armorFactor: number;
    /** Magic resist never goes above this (1 would be immunity). */
    maxMagicResist: number;
    xpShareRadius: number;
    /** Bosses are stunned / taunted for this fraction of the duration. */
    bossControlFactor: number;
  };
  creepAi: {
    aggroRange: number;
    /** A chasing creep gives up once it is this far from where it left its lane. */
    leashRange: number;
    projectileSpeed: number;
    /**
     * Anti-stall: after this many seconds stopped to attack towers (in total), a creep stops attacking
     * towers and carries on down its lane. It still fights heroes.
     */
    towerAttackLimit: number;
  };
  /**
   * Extra build pads for bigger teams (docs/MOBILE.md §2), by player count (index 0 = solo; the last
   * entry also covers bigger teams). The map lists the extra pads; these say how many exist.
   */
  pads: {
    /** Extra pads added to each lane zone (West, Mid, East). */
    extraPerLaneZone: number[];
    /** Pads of the Core zone (a 4th player's zone where the lanes converge). */
    core: number[];
  };
  /** One special ability per boss. */
  bosses: {
    ironhorn: { stomp: StompStats };
    matriarch: { hatch: HatchStats };
    shardback: { shiftingHide: ShiftingHideStats };
  };
  creeps: Record<CreepKind, CreepStats>;
  towers: Record<TowerKind, TowerStats>;
  /** Per-mode changes to the numbers above; the top-level numbers are Full mode. */
  modes: Record<GameMode, ModeTuning>;
  hero: {
    maxLevel: number;
    /** Total XP needed to reach level i+1 (index 0 = level 1). */
    xpForLevel: number[];
    /** Max rank of Q, W and E. */
    maxSkillRank: number;
    /** Hero level needed for each rank of R; its length is R's max rank. */
    ultimateLevels: number[];
    /** Skills that start at rank 1. */
    startingSkills: SkillSlot[];
    respawnBase: number;
    respawnPerLevel: number;
    ranger: RangerStats;
    warden: WardenStats;
    arcanist: ArcanistStats;
  };
}

const ALL: LaneId[] = [0, 1, 2];
const MID: LaneId[] = [1];

/** One wave: `perLane` creeps of each kind in every lane, plus an optional boss in the middle lane. */
function w(perLane: Partial<Record<CreepKind, number>>, boss?: BossKind): WaveGroup[] {
  const groups: WaveGroup[] = Object.entries(perLane).map(([kind, n]) => ({
    kind: kind as CreepKind,
    perLane: n,
    lanes: ALL,
  }));
  if (boss) groups.push({ kind: boss, perLane: 1, lanes: MID });
  return groups;
}

export const TUNING: Tuning = {
  heart: { maxHp: 100, radius: 1.8 },
  economy: {
    startingGold: 100,
    sellRefund: 0.7,
    waveIncomeBase: 40,
    waveIncomePerWave: 16,
    callEarlyGoldPerSecond: 0.5,
    bountyGrowthPerWave: 0,
  },
  waves: {
    buildPhase: 30,
    interval: 40,
    spawnInterval: 0.9,
    laneSpread: 0.8,
    hpGrowthPerWave: 0.1,
    armorGrowthPerWave: 0.1,
    list: [
      // 1–10: the Phase 1 waves.
      w({ grunt: 4 }),
      w({ grunt: 4, runner: 2 }),
      w({ grunt: 4, archer: 3 }),
      w({ grunt: 3, runner: 3, brute: 1 }),
      w({ grunt: 4, archer: 2, wisp: 2 }), // 5: first wisps
      w({ runner: 5, brute: 2, wisp: 2 }),
      w({ grunt: 5, archer: 3, brute: 2 }),
      w({ grunt: 4, runner: 4, archer: 2, wisp: 3 }),
      w({ grunt: 5, brute: 3, archer: 3, wisp: 3 }),
      w({ grunt: 5, archer: 3, brute: 2, wisp: 3 }, 'ironhorn'), // 10: boss (Stomp)
      // 11–20
      w({ grunt: 6, archer: 3, runner: 3, wisp: 3 }),
      w({ grunt: 5, runner: 2, archer: 3, brute: 3, wisp: 3 }),
      w({ runner: 8, brute: 3, archer: 3, wisp: 3 }),
      w({ grunt: 7, archer: 4, brute: 3, wisp: 4 }),
      w({ wisp: 8, grunt: 6, archer: 5 }), // 15: air wave
      w({ grunt: 7, runner: 4, archer: 4, brute: 4, wisp: 1 }),
      w({ grunt: 8, archer: 5, brute: 4, wisp: 4 }),
      w({ runner: 10, brute: 4, archer: 4, wisp: 4 }),
      w({ grunt: 8, archer: 5, brute: 5, wisp: 5 }),
      w({ grunt: 8, archer: 5, brute: 4, wisp: 5 }, 'matriarch'), // 20: boss (Hatch)
      // 21–30
      w({ grunt: 9, runner: 5, archer: 5, brute: 4, wisp: 2 }),
      w({ grunt: 8, archer: 6, brute: 6, wisp: 6 }),
      w({ runner: 12, archer: 5, brute: 5, wisp: 5 }),
      w({ grunt: 10, archer: 6, brute: 6, wisp: 6 }),
      w({ wisp: 12, grunt: 10, archer: 8 }), // 25: air wave
      w({ grunt: 11, runner: 6, archer: 6, brute: 6, wisp: 3 }),
      w({ grunt: 12, archer: 7, brute: 8, wisp: 7 }),
      w({ runner: 14, archer: 7, brute: 8, wisp: 7 }),
      w({ grunt: 14, archer: 8, brute: 8, wisp: 8 }),
      w({ grunt: 14, runner: 2, archer: 8, brute: 8, wisp: 8 }, 'shardback'), // 30: final boss (Shifting Hide)
    ],
  },
  playerScaling: { hp: [1, 1.45, 1.45, 1.5], earlyHpBonus: [0, 0.5, 1.6, 2.4], earlyWaves: 20, countPerExtraPlayer: 0.3 },
  combat: { armorFactor: 0.06, maxMagicResist: 0.9, xpShareRadius: 22, bossControlFactor: 0.5 },
  creepAi: { aggroRange: 5, leashRange: 9, projectileSpeed: 10, towerAttackLimit: 10 },
  pads: { extraPerLaneZone: [0, 0, 1, 1], core: [0, 0, 0, 4] },
  bosses: {
    ironhorn: { stomp: { cooldown: 7, radius: 3, damage: 40, stun: 2 } },
    matriarch: { hatch: { cooldown: 6, count: 3, max: 24, spread: 0.8 } },
    shardback: { shiftingHide: { interval: 8, stoneArmor: 25, etherMagicResist: 0.6 } },
  },
  creeps: {
    grunt: {
      hp: 81, armor: 1, magicResist: 0, speed: 1.6, radius: 0.35, flying: false,
      damage: 7, damageType: 'physical', attackCooldown: 1, attackRange: 0.6, ranged: false, attacksTowers: false,
      bounty: 3, xp: 10, leakDamage: 1, boss: false,
    },
    archer: {
      hp: 74, armor: 0, magicResist: 0.15, speed: 1.6, radius: 0.33, flying: false,
      damage: 6, damageType: 'physical', attackCooldown: 1.4, attackRange: 4.5, ranged: true, attacksTowers: true,
      bounty: 4, xp: 12, leakDamage: 1, boss: false,
    },
    runner: {
      hp: 59, armor: 0, magicResist: 0, speed: 3.2, radius: 0.3, flying: false,
      damage: 4, damageType: 'physical', attackCooldown: 0.8, attackRange: 0.6, ranged: false, attacksTowers: false,
      bounty: 3, xp: 8, leakDamage: 1, boss: false,
    },
    brute: {
      hp: 323, armor: 6, magicResist: 0, speed: 1, radius: 0.5, flying: false,
      damage: 14, damageType: 'physical', attackCooldown: 1.5, attackRange: 0.7, ranged: false, attacksTowers: false,
      bounty: 8, xp: 25, leakDamage: 1, boss: false,
    },
    wisp: {
      hp: 81, armor: 0, magicResist: 0.25, speed: 1.8, radius: 0.3, flying: true,
      damage: 0, damageType: 'magic', attackCooldown: 1, attackRange: 0, ranged: false, attacksTowers: false,
      bounty: 4, xp: 12, leakDamage: 1, boss: false,
    },
    hatchling: {
      hp: 44, armor: 0, magicResist: 0, speed: 2.6, radius: 0.25, flying: false,
      damage: 4, damageType: 'physical', attackCooldown: 0.8, attackRange: 0.5, ranged: false, attacksTowers: false,
      bounty: 1, xp: 3, leakDamage: 1, boss: false,
    },
    ironhorn: {
      hp: 1400, armor: 4, magicResist: 0.1, speed: 0.9, radius: 0.9, flying: false,
      damage: 40, damageType: 'physical', attackCooldown: 1.5, attackRange: 1.6, ranged: false, attacksTowers: true,
      bounty: 90, xp: 300, leakDamage: 20, boss: true,
    },
    matriarch: {
      hp: 1600, armor: 3, magicResist: 0.2, speed: 0.8, radius: 0.95, flying: false,
      damage: 35, damageType: 'physical', attackCooldown: 1.5, attackRange: 1.6, ranged: false, attacksTowers: true,
      bounty: 120, xp: 400, leakDamage: 20, boss: true,
    },
    shardback: {
      hp: 2000, armor: 5, magicResist: 0.1, speed: 0.75, radius: 1, flying: false,
      damage: 50, damageType: 'physical', attackCooldown: 1.6, attackRange: 1.7, ranged: false, attacksTowers: true,
      bounty: 180, xp: 500, leakDamage: 20, boss: true,
    },
  },
  // Tier 1 is what a fresh build gets; tiers 2 and 3 are bought with `upgrade`.
  // Selling refunds economy.sellRefund of everything spent on the tower.
  towers: {
    arrow: {
      damageType: 'physical', armor: 2, magicResist: 0, hitsGround: true, hitsAir: true, projectileSpeed: 14,
      tiers: [
        { cost: 60, hp: 500, range: 6, damage: 16, attackCooldown: 0.7, splash: 0, slow: 0, slowDuration: 0 },
        { cost: 140, hp: 580, range: 6.5, damage: 36, attackCooldown: 0.65, splash: 0, slow: 0, slowDuration: 0 },
        { cost: 275, hp: 660, range: 7, damage: 70, attackCooldown: 0.6, splash: 0, slow: 0, slowDuration: 0 },
      ],
    },
    cannon: {
      damageType: 'physical', armor: 4, magicResist: 0, hitsGround: true, hitsAir: false, projectileSpeed: 8,
      tiers: [
        { cost: 90, hp: 550, range: 5.5, damage: 36, attackCooldown: 1.6, splash: 1.6, slow: 0, slowDuration: 0 },
        { cost: 200, hp: 630, range: 6, damage: 81, attackCooldown: 1.5, splash: 1.8, slow: 0, slowDuration: 0 },
        { cost: 375, hp: 720, range: 6.5, damage: 158, attackCooldown: 1.4, splash: 2, slow: 0, slowDuration: 0 },
      ],
    },
    frost: {
      damageType: 'magic', armor: 2, magicResist: 0, hitsGround: true, hitsAir: true, projectileSpeed: 10,
      tiers: [
        { cost: 70, hp: 500, range: 5, damage: 10, attackCooldown: 1, splash: 0, slow: 0.3, slowDuration: 2 },
        { cost: 160, hp: 570, range: 5.5, damage: 25, attackCooldown: 0.95, splash: 0, slow: 0.35, slowDuration: 2.5 },
        { cost: 300, hp: 650, range: 6, damage: 49, attackCooldown: 0.9, splash: 0, slow: 0.4, slowDuration: 3 },
      ],
    },
    // Magic damage ignores armour: the answer to Brutes.
    arcane: {
      damageType: 'magic', armor: 2, magicResist: 0, hitsGround: true, hitsAir: true, projectileSpeed: 12,
      tiers: [
        { cost: 100, hp: 500, range: 6, damage: 30, attackCooldown: 1.2, splash: 0, slow: 0, slowDuration: 0 },
        { cost: 180, hp: 570, range: 6.5, damage: 70, attackCooldown: 1.1, splash: 0, slow: 0, slowDuration: 0 },
        { cost: 350, hp: 650, range: 7, damage: 140, attackCooldown: 1, splash: 0, slow: 0, slowDuration: 0 },
      ],
    },
    // Air only: heavy bursts that also catch nearby flyers.
    flak: {
      damageType: 'physical', armor: 2, magicResist: 0, hitsGround: false, hitsAir: true, projectileSpeed: 16,
      tiers: [
        { cost: 80, hp: 500, range: 7, damage: 60, attackCooldown: 1.5, splash: 1.2, slow: 0, slowDuration: 0 },
        { cost: 160, hp: 570, range: 7.5, damage: 133, attackCooldown: 1.4, splash: 1.4, slow: 0, slowDuration: 0 },
        { cost: 300, hp: 650, range: 8, damage: 262, attackCooldown: 1.3, splash: 1.6, slow: 0, slowDuration: 0 },
      ],
    },
  },
  modes: {
    full: {},
    // Quick mode (docs/MOBILE.md §6): 15 waves, about 11 minutes. Wave k plays like Full wave 2k (bosses on
    // waves 5, 10 and 15, air waves on 8 and 13): creep HP and armour grow about twice as fast per wave, and
    // each wave pays about as much as two Full waves. A little more starting gold, and heroes need 60% of the
    // Full XP per level (a match has half the kills), so they reach level 8–10. The team bonus fades over 10
    // waves; teams of 3–4 get a higher late multiplier than in Full (their gold still outruns their pads).
    quick: {
      economy: { startingGold: 120, waveIncomeBase: 84, waveIncomePerWave: 64 },
      waves: {
        hpGrowthPerWave: 0.21,
        armorGrowthPerWave: 0.2,
        list: [
          w({ grunt: 4, runner: 2 }),
          w({ grunt: 4, archer: 3, runner: 1 }),
          w({ grunt: 4, archer: 2, brute: 1, wisp: 2 }), // 3: first wisps
          w({ grunt: 5, archer: 3, brute: 2, wisp: 2 }),
          w({ grunt: 5, archer: 3, brute: 2, wisp: 3 }, 'ironhorn'), // 5: boss (Stomp)
          w({ grunt: 5, runner: 2, archer: 3, brute: 3, wisp: 3 }),
          w({ grunt: 7, archer: 4, brute: 3, wisp: 4 }),
          w({ wisp: 8, grunt: 6, archer: 5 }), // 8: air wave
          w({ runner: 10, brute: 4, archer: 4, wisp: 4 }),
          w({ grunt: 8, archer: 5, brute: 4, wisp: 5 }, 'matriarch'), // 10: boss (Hatch)
          w({ grunt: 8, archer: 6, brute: 6, wisp: 6 }),
          w({ grunt: 10, archer: 6, brute: 6, wisp: 6 }),
          w({ wisp: 12, grunt: 10, archer: 8 }), // 13: air wave
          w({ runner: 14, archer: 7, brute: 8, wisp: 7 }),
          w({ grunt: 14, runner: 2, archer: 8, brute: 8, wisp: 8 }, 'shardback'), // 15: final boss (Shifting Hide)
        ],
      },
      playerScaling: { hp: [1, 1.45, 1.6, 1.8], earlyHpBonus: [0, 0.5, 1.6, 2.2], earlyWaves: 10 },
      hero: { xpForLevel: [0, 180, 450, 810, 1260, 1800, 2430, 3150, 3960, 4860] },
    },
  },
  hero: {
    maxLevel: 10,
    xpForLevel: [0, 300, 750, 1350, 2100, 3000, 4050, 5250, 6600, 8100],
    maxSkillRank: 4,
    ultimateLevels: [6, 8, 10],
    startingSkills: ['Q', 'W'],
    respawnBase: 5,
    respawnPerLevel: 2,
    ranger: {
      hp: 320, hpPerLevel: 40, hpRegen: 1.5,
      mana: 120, manaPerLevel: 20, manaRegen: 1.5,
      armor: 2, armorPerLevel: 0.5, magicResist: 0.1,
      damage: 20, damagePerLevel: 3, damageType: 'physical',
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
      keenEye: {
        critChance: [0.15, 0.2, 0.25, 0.3],
        critMultiplier: [1.75, 2, 2.25, 2.5],
      },
      arrowStorm: {
        manaCost: [100, 125, 150],
        cooldown: [60, 55, 50],
        castRange: 10,
        radius: 3,
        duration: 3,
        pulseInterval: 0.5,
        damagePerPulse: [30, 45, 60],
      },
    },
    warden: {
      hp: 480, hpPerLevel: 60, hpRegen: 2.5,
      mana: 100, manaPerLevel: 15, manaRegen: 1.2,
      armor: 5, armorPerLevel: 0.7, magicResist: 0.1,
      damage: 26, damagePerLevel: 3.8, damageType: 'physical',
      attackCooldown: 1.1, attackRange: 1, ranged: false, projectileSpeed: 0,
      speed: 3.2, radius: 0.5, acquireRange: 6,
      cleave: {
        manaCost: [25, 30, 35, 40],
        cooldown: [6, 5.5, 5, 4.5],
        radius: 2.2,
        damage: [52, 85, 117, 150],
      },
      taunt: {
        manaCost: [40, 45, 50, 55],
        cooldown: [16, 15, 14, 13],
        radius: 4.5,
        duration: [2, 2.5, 3, 3.5],
      },
      bulwarkAura: {
        radius: 8,
        armor: [2, 4, 6, 8],
      },
      lastStand: {
        manaCost: [100, 125, 150],
        cooldown: [70, 65, 60],
        duration: [6, 7, 8],
        damageReduction: [0.4, 0.5, 0.6],
        stunRadius: 3,
        stun: [1.5, 2, 2.5],
      },
    },
    arcanist: {
      hp: 280, hpPerLevel: 35, hpRegen: 1.2,
      mana: 200, manaPerLevel: 30, manaRegen: 2.2,
      armor: 1, armorPerLevel: 0.4, magicResist: 0.2,
      damage: 18, damagePerLevel: 2.5, damageType: 'magic',
      attackCooldown: 1, attackRange: 5.5, ranged: true, projectileSpeed: 12,
      speed: 3.3, radius: 0.4, acquireRange: 6.5,
      fireball: {
        manaCost: [35, 45, 55, 65],
        cooldown: [7, 6.5, 6, 5.5],
        castRange: 8,
        radius: 2,
        damage: [50, 80, 110, 140],
        projectileSpeed: 12,
      },
      frostNova: {
        manaCost: [50, 55, 60, 65],
        cooldown: [12, 11, 10, 9],
        castRange: 7,
        radius: 2.5,
        damage: [25, 40, 55, 70],
        slow: [0.35, 0.4, 0.45, 0.5],
        slowDuration: 3,
      },
      clarityAura: {
        radius: 8,
        manaRegen: [1, 1.75, 2.5, 3.25],
      },
      meteor: {
        manaCost: [150, 175, 200],
        cooldown: [60, 55, 50],
        castRange: 9,
        radius: 3,
        delay: 1.2,
        damage: [220, 330, 440],
        stun: [1, 1.5, 2],
      },
    },
  },
};

/** `tuning` with the changes of `mode` applied (Full mode changes nothing). */
export function tuningForMode(tuning: Tuning, mode: GameMode): Tuning {
  const m = tuning.modes[mode];
  return {
    ...tuning,
    economy: { ...tuning.economy, ...m.economy },
    waves: { ...tuning.waves, ...m.waves },
    playerScaling: { ...tuning.playerScaling, ...m.playerScaling },
    hero: { ...tuning.hero, ...m.hero },
  };
}

/** Stats of `kind` at `tier` (1-based), clamped to the tiers that exist. */
export function towerTier(tuning: Tuning, kind: TowerKind, tier: number): TowerTierStats {
  const tiers = tuning.towers[kind].tiers;
  return tiers[Math.max(1, Math.min(tiers.length, tier)) - 1]!;
}

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}
