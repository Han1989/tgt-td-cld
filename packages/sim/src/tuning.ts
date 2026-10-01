// Every balance number in the game lives in this file. Durations are in
// seconds, distances in tiles, speeds in tiles per second. The sim converts
// seconds to ticks with `secondsToTicks`.

import type {
  BossKind,
  CreepKind,
  DamageType,
  Difficulty,
  GameMode,
  LaneId,
  SkillSlot,
  TowerBranch,
  TowerKind,
} from '@tdt/protocol';

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

/**
 * What a top-tier branch adds to a plain tier (docs/REPLAYABILITY.md §1). Plain tiers have none of these
 * (`NO_EFFECTS`); a branch lists the ones it uses.
 */
export interface TowerEffects {
  /** Creeps shot at once, each by its own projectile (Volley). */
  targets: number;
  /** Chance and damage multiplier of a critical hit (Sniper). */
  critChance: number;
  critMultiplier: number;
  /** Damage against ground creeps × this (Hailstorm: a Flak that can also hit ground). */
  groundDamage: number;
  /** Armour removed per hit, stacking up to `shredMax`, lasting `shredDuration` after the last hit (Shrapnel). */
  armorShred: number;
  shredMax: number;
  shredDuration: number;
  /** Every `freezeEvery`-th shot freezes (stuns) its target for `freeze` seconds; 0 = never (Glacier). */
  freezeEvery: number;
  freeze: number;
  /** No projectile: every `attackCooldown` it hits every creep in range around itself (Blizzard). */
  pulse: boolean;
  /** A hit jumps on to up to `chains` more creeps within `chainRange`, × `chainFalloff` per jump (Prism). */
  chains: number;
  chainRange: number;
  chainFalloff: number;
  /** Ignores armour and magic resist (Void). */
  ignoreResist: boolean;
  /** Extra damage per hit: this fraction of the target's max HP (Void). */
  hpPercent: number;
}

/** A top-tier branch: the numbers of a tier (its `cost` is the upgrade from tier 3), plus its effects. */
export interface BranchStats extends TowerTierStats, Partial<TowerEffects> {
  /** Overrides the tower kind's targets (Hailstorm hits ground too). */
  hitsGround?: boolean;
  hitsAir?: boolean;
}

/** Everything a tower at a given tier or branch shoots with. */
export interface TowerLevelStats extends TowerTierStats, TowerEffects {
  hitsGround: boolean;
  hitsAir: boolean;
}

export const NO_EFFECTS: TowerEffects = {
  targets: 1,
  critChance: 0,
  critMultiplier: 1,
  groundDamage: 1,
  armorShred: 0,
  shredMax: 0,
  shredDuration: 0,
  freezeEvery: 0,
  freeze: 0,
  pulse: false,
  chains: 0,
  chainRange: 0,
  chainFalloff: 1,
  ignoreResist: false,
  hpPercent: 0,
};

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

/** Every active skill has a cooldown per rank. */
export interface CooldownSkillStats {
  cooldown: number[];
}

/** Q and W also cost mana per rank. Ultimates (R) cost none: their cooldown is their only limit. */
export interface ActiveSkillStats extends CooldownSkillStats {
  manaCost: number[];
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
export interface ArrowStormStats extends CooldownSkillStats {
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
export interface LastStandStats extends CooldownSkillStats {
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
export interface MeteorStats extends CooldownSkillStats {
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
  /** Mana per second at level 1, plus `manaRegenPerLevel` for every level after it. */
  manaRegen: number;
  manaRegenPerLevel: number;
  armor: number;
  armorPerLevel: number;
  magicResist: number;
  damage: number;
  damagePerLevel: number;
  damageType: DamageType;
  attackCooldown: number;
  /**
   * A hero hits a creep from up to attackRange + its own radius + the creep's radius (centre to centre): the
   * same rule creeps use to hit heroes.
   */
  attackRange: number;
  /** Ranged heroes fire projectiles and can hit flying creeps; melee hits land instantly. */
  ranged: boolean;
  projectileSpeed: number;
  speed: number;
  radius: number;
  /** Attack-moving heroes engage creeps within this range (edge to edge). */
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
/**
 * How a difficulty changes creep HP and how many non-boss creeps spawn, on top of wave growth and
 * player-count scaling. `lateHp` / `lateCount` are added on the final wave and grow linearly over the
 * last third (0 before it), so the end of a Hard match is the heavy part. Normal is 1 / 1 / 0 / 0:
 * the same creeps as a build without a difficulty.
 */
/** Creep HP and count multipliers. Normal is all ones, so it changes nothing. */
export interface DifficultyBand {
  /** Non-boss creep HP × this. Boss HP uses `bossHp` (a boss leak is 20 Heart, so it is tuned on its own). */
  hp: number;
  /** Non-boss creep count × this. Bosses stay at one per listed lane. */
  count: number;
  /** Added to `hp` on the final wave; 0 before the last third. */
  lateHp: number;
  /** Added to `count` on the final wave; 0 before the last third. Bosses are not multiplied. */
  lateCount: number;
  /** Boss HP × this at wave 1. Defaults to `hp`. */
  bossHp?: number;
  /** Added to `bossHp` on the final wave; 0 before the last third. Defaults to `lateHp`. */
  lateBossHp?: number;
  /**
   * When set, `lateHp` / `lateCount` / `lateBossHp` follow match progress to this power
   * (2 = gentle early, heavy late) instead of staying 0 until the last third. Quick leaves
   * it unset so the last third carries the whole ramp.
   */
  ease?: number;
  /**
   * Flat extra non-boss creeps per lane in every group, after the count multiplier. A multiplier near 1
   * rounds away on small groups; this is how Hard adds bodies on those waves too. A fraction adds that
   * share of groups (wave by wave), so 0.5 is one extra creep in every other group.
   */
  extra?: number;
  /** Added to `extra` on the final wave; 0 before the ramp starts. */
  lateExtra?: number;
  /** Added to every creep's magic resist (Hard chips magic damage, which otherwise ignores the armour on brutes). */
  magicResist?: number;
  /**
   * Heart HP lost when the final wave starts. Combat on a long Hard match clumps a couple of HP either
   * side of the gate; this is the last, visible strain of that wave (a leak, no creep to shoot).
   */
  finale?: number;
}

/** Lane surges (docs/REPLAYABILITY.md §2). Numbers only; the schedule comes from the match seed. */
export interface SurgeTuning {
  /** First wave that can surge (1-based). It is announced when the previous wave starts. */
  fromWave: number;
  /** From `fromWave` on, a wave surges when a seed mix modulo this is 0. 3 is about one wave in three. */
  period: number;
  /** Share of that wave's regular creeps on the surge lane, for 2 and 3 players. */
  share: number;
  /** Solo share. Milder, so one player covering three lanes is not hit with the co-op pile. */
  soloShare: number;
}

/** What each match modifier changes. Swift and Fog match the replayability doc; the others are the "more". */
export interface ModifierStats {
  /** Creeps move this much faster, and kills pay this much more. */
  swift: { speed: number; bounty: number };
  /** From `fromWave`, every Nth eligible ground creep spawns as a Brute. */
  ironclad: { every: number; fromWave: number };
  /** From `fromWave`, every Nth eligible ground creep spawns as a Wisp. Brutes stay Brutes. */
  skyTide: { every: number; fromWave: number };
  /** Tower range times this. Hero experience times `xp`. */
  fog: { towerRange: number; xp: number };
  /** Starting gold and wave income times `gold`. Bounty times `bounty`. Creep count times `count`. */
  goldRush: { gold: number; bounty: number; count: number };
}

export interface DifficultyScaling extends DifficultyBand {
  /**
   * Per player count (index 0 = solo), used instead of the scalars above. One multiplier cannot put a
   * solo expert and a 3-player team on the same Heart band, so Hard sets a band for each team size.
   */
  byPlayers?: DifficultyBand[];
}

export interface ModeTuning {
  economy?: Partial<Tuning['economy']>;
  waves?: Partial<Tuning['waves']>;
  playerScaling?: Partial<Tuning['playerScaling']>;
  hero?: Partial<Pick<Tuning['hero'], 'xpForLevel'>>;
  /** Hard-only overrides for this match length, merged over `tuning.difficulty.hard`. */
  hard?: Partial<DifficultyScaling>;
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
   * Player-count scaling, by player count (index 0 = solo, 1 = 2 players, 2 = 3 players, the maximum).
   * Creep HP × (hp[n − 1] + earlyHpBonus[n − 1] × e + lateHpBonus[n − 1] × l), where e fades from 1 on
   * wave 1 to 0 on wave earlyWaves + 1, and l grows from 0 on the wave before the last `lateWaves` to 1 on
   * the final wave. Teams get their gold and heroes all at once but share the pads (a few extra pads aside),
   * so their towers hit the pad limit sooner than a solo player's: they are pressed harder early. Late on,
   * their gold goes into top-tier branches, so a growing late bonus keeps the last waves a threat.
   */
  playerScaling: {
    hp: number[];
    earlyHpBonus: number[];
    earlyWaves: number;
    lateHpBonus: number[];
    lateWaves: number;
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
   * Extra build pads for bigger teams (docs/MOBILE.md §2), by player count (index 0 = solo). The map lists
   * the extra pads; this says how many exist.
   */
  pads: {
    /** Extra pads added to each lane zone (West, Mid, East). */
    extraPerLaneZone: number[];
  };
  /** One special ability per boss. */
  bosses: {
    ironhorn: { stomp: StompStats };
    matriarch: { hatch: HatchStats };
    shardback: { shiftingHide: ShiftingHideStats };
  };
  creeps: Record<CreepKind, CreepStats>;
  towers: Record<TowerKind, TowerStats>;
  /**
   * Top-tier branches (docs/REPLAYABILITY.md §1): after the last tier in `towers[kind].tiers`, a tower
   * upgrades into one of its two branches (`TOWER_BRANCHES` in the protocol). The late-game gold sink.
   */
  branches: Record<TowerBranch, BranchStats>;
  /** Per-mode changes to the numbers above; the top-level numbers are Full mode. */
  modes: Record<GameMode, ModeTuning>;
  /**
   * Creep difficulty. The engine multiplies HP and non-boss counts by these (Normal is ×1, so it matches
   * the numbers above exactly). A mode may override Hard in `modes.<mode>.hard`.
   */
  difficulty: Record<Difficulty, DifficultyScaling>;
  /** Lane surges from wave 6. Solo uses `soloShare`. */
  surges: SurgeTuning;
  /** Match modifiers. A match runs one or two, or none. */
  modifierStats: ModifierStats;
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
    /**
     * Melee heroes left idle (no order, no joystick) step in and fight: the nearest hittable creep within
     * `range` tiles (edge to edge), or a creep that hurt them in the last `memory` seconds (a boss or an
     * Archer that outreaches them). They never stray more than `leash` tiles from where they stood, and
     * walk back there once nothing is left to fight.
     */
    autoEngage: { range: number; leash: number; memory: number };
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
  // Teams: a small early bonus and a bigger late one, so the last third of a match is the tensest (balance gate).
  playerScaling: {
    hp: [1.04, 1.43, 1.46],
    earlyHpBonus: [0, 0.4, 1.25],
    earlyWaves: 20,
    lateHpBonus: [0, 0.2, 0.55],
    lateWaves: 10,
    countPerExtraPlayer: 0.3,
  },
  combat: { armorFactor: 0.06, maxMagicResist: 0.9, xpShareRadius: 22, bossControlFactor: 0.5 },
  creepAi: { aggroRange: 5, leashRange: 9, projectileSpeed: 10, towerAttackLimit: 10 },
  pads: { extraPerLaneZone: [0, 0, 1] },
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
  // Tier 1 is what a fresh build gets; tiers 2 and 3 are bought with `upgrade`, then one of two `branches` (below).
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
  // Top-tier branches: `cost` is the upgrade from tier 3 (about 2.2× the tier-3 price), for roughly 1.5–2× the
  // tier-3 power where their effect fits the wave: the late-game gold sink once a player's pads are all tier 3.
  branches: {
    // Arrow A: long range, slow, big crits (bosses, Brutes).
    sniper: {
      cost: 600, hp: 740, range: 10, damage: 260, attackCooldown: 1.2, splash: 0, slow: 0, slowDuration: 0,
      critChance: 0.25, critMultiplier: 2.5,
    },
    // Arrow B: three targets per shot (crowds).
    volley: {
      cost: 600, hp: 740, range: 7.5, damage: 60, attackCooldown: 0.6, splash: 0, slow: 0, slowDuration: 0,
      targets: 3,
    },
    // Cannon A: very long range, huge splash, slow.
    mortar: {
      cost: 800, hp: 800, range: 10, damage: 330, attackCooldown: 2.2, splash: 3, slow: 0, slowDuration: 0,
    },
    // Cannon B: a smaller splash whose hits strip armour (every physical hit on those creeps gains).
    shrapnel: {
      cost: 800, hp: 800, range: 6.5, damage: 230, attackCooldown: 1.3, splash: 1.6, slow: 0, slowDuration: 0,
      armorShred: 3, shredMax: 12, shredDuration: 4,
    },
    // Frost A: every 3rd shot freezes its target (bosses: half as long).
    glacier: {
      cost: 650, hp: 730, range: 6.5, damage: 150, attackCooldown: 0.8, splash: 0, slow: 0.45, slowDuration: 3,
      freezeEvery: 3, freeze: 1,
    },
    // Frost B: a pulse around the tower that hurts and slows everything in range.
    blizzard: {
      cost: 650, hp: 730, range: 5.5, damage: 30, attackCooldown: 1, splash: 0, slow: 0.45, slowDuration: 2,
      pulse: true,
    },
    // Arcane A: each hit jumps on to 3 more creeps.
    prism: {
      cost: 750, hp: 730, range: 7, damage: 200, attackCooldown: 1, splash: 0, slow: 0, slowDuration: 0,
      chains: 3, chainRange: 3, chainFalloff: 0.6,
    },
    // Arcane B: ignores resistances and adds 3% of the target's max HP per hit (anti-boss).
    void: {
      cost: 750, hp: 730, range: 7, damage: 250, attackCooldown: 1, splash: 0, slow: 0, slowDuration: 0,
      ignoreResist: true, hpPercent: 0.03,
    },
    // Flak A: stronger anti-air that slows the flyers it hits.
    skyguard: {
      cost: 650, hp: 730, range: 9, damage: 450, attackCooldown: 1.2, splash: 2, slow: 0.4, slowDuration: 2,
    },
    // Flak B: also hits ground creeps, at half damage.
    hailstorm: {
      cost: 650, hp: 730, range: 8, damage: 320, attackCooldown: 1.3, splash: 1.8, slow: 0, slowDuration: 0,
      hitsGround: true, groundDamage: 0.5,
    },
  },
  modes: {
    full: {},
    // Quick mode (docs/MOBILE.md §6): 15 waves, about 11 minutes. Wave k plays like Full wave 2k (bosses on
    // waves 5, 10 and 15, air waves on 8 and 13): creep HP and armour grow about twice as fast per wave, and
    // each wave pays about as much as two Full waves. A little more starting gold, and heroes need 60% of the
    // Full XP per level (a match has half the kills), so they reach level 8–10. The team bonus fades over 10
    // waves; teams of 3 get a higher late bonus than in Full (their gold still outruns their pads).
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
      playerScaling: {
        hp: [1.012, 1.42, 1.6],
        earlyHpBonus: [0, 0.25, 1.2],
        earlyWaves: 10,
        lateHpBonus: [0, 0.3, 1.15],
        lateWaves: 5,
      },
      hero: { xpForLevel: [0, 180, 450, 810, 1260, 1800, 2430, 3150, 3960, 4860] },
      // Quick is shorter, so the same Full bands either walk over a 3-player team or cliff a solo seed.
      // Measured expert hearts (gate seeds): solo 44–78, pairs 51–78 (last third 89% of the loss),
      // three players 46–68 (37/28/35).
      hard: {
        byPlayers: [
          { hp: 1.032, count: 1.06, lateHp: 0.16, lateCount: 0.09, bossHp: 1.02, lateBossHp: 0.04 },
          { hp: 1.048, count: 1.042, lateHp: 0.115, lateCount: 0.04, bossHp: 1.02, lateBossHp: 0.03 },
          { hp: 1.08, count: 1.1, lateHp: 0.13, lateCount: 0.06, bossHp: 1.03, lateBossHp: 0.04 },
        ],
      },
    },
  },
  // Normal is identity, so existing formulas and the casual gates are unchanged. Hard multiplies non-boss
  // HP and count (more bodies, not just tougher ones). `extra` adds creeps a near-1 multiplier would round
  // away. Boss HP is its own, smaller multiplier: a boss leak is 20 Heart. One band cannot sit a solo expert
  // and a 3-player team in 40–80 Heart, so `byPlayers` is per team size (index 0 = solo). Quick overrides all
  // three in `modes.quick.hard`. Tuned for the expert bot (Decision Log).
  difficulty: {
    normal: { hp: 1, count: 1, lateHp: 0, lateCount: 0 },
    hard: {
      hp: 1.009,
      count: 1.029,
      lateHp: 0.043,
      lateCount: 0.024,
      bossHp: 1.026,
      lateBossHp: 0.02,
      extra: 0.588,
      lateExtra: 0.193,
      magicResist: 0.12,
      finale: 2,
      byPlayers: [
        // Full solo expert: 41–80 after the final-wave strain (the stuck seed was 82, the floor 43).
        {
          hp: 1.009, count: 1.029, lateHp: 0.043, lateCount: 0.024, bossHp: 1.026, lateBossHp: 0.02,
          extra: 0.588, lateExtra: 0.193, magicResist: 0.12, finale: 2,
        },
        // Full pairs: 41–80, last third 56% of the Heart lost.
        { hp: 1.005, count: 1, lateHp: 0.02, lateCount: 0, bossHp: 1.01, lateBossHp: 0.01, extra: 0.45 },
        // Full three players: 49–73, loss shares 23/0/77. Ease 2 keeps the first third light.
        {
          hp: 1, count: 1.06, lateHp: 0.26, lateCount: 0.12, bossHp: 1.01, lateBossHp: 0.035,
          extra: 0.1, lateExtra: 0.15, magicResist: 0.04, ease: 2,
        },
      ],
    },
  },
  // About one wave in three from wave 6, ~60% of that wave's regular creeps on one lane.
  // Solo is 0.44 so the pile is a nudge over an even split (one third), not the co-op crush.
  // Bosses stay on the lane the wave list names. The spawn gap tightens when a lane would
  // still be spawning at the next wave.
  surges: { fromWave: 6, period: 3, share: 0.6, soloShare: 0.44 },
  modifierStats: {
    swift: { speed: 1.15, bounty: 1.1 },
    ironclad: { every: 32, fromWave: 1 },
    skyTide: { every: 9, fromWave: 1 },
    fog: { towerRange: 0.9, xp: 1.2 },
    goldRush: { gold: 1.1, bounty: 1.1, count: 1.12 },
  },
  hero: {
    maxLevel: 10,
    xpForLevel: [0, 300, 750, 1350, 2100, 3000, 4050, 5250, 6600, 8100],
    maxSkillRank: 4,
    ultimateLevels: [6, 8, 10],
    startingSkills: ['Q', 'W'],
    respawnBase: 5,
    respawnPerLevel: 2,
    autoEngage: { range: 2.5, leash: 4, memory: 1 },
    ranger: {
      hp: 320, hpPerLevel: 40, hpRegen: 1.5,
      mana: 140, manaPerLevel: 25, manaRegen: 2.5, manaRegenPerLevel: 0.5,
      armor: 2, armorPerLevel: 0.5, magicResist: 0.1,
      damage: 20, damagePerLevel: 3, damageType: 'physical',
      attackCooldown: 0.9, attackRange: 5.6, ranged: true, projectileSpeed: 16,
      speed: 4.6, radius: 0.4, acquireRange: 6.6,
      multishot: {
        manaCost: [25, 30, 35, 40],
        cooldown: [8, 7, 6, 5],
        targets: [3, 4, 5, 6],
        damage: [30, 45, 60, 75],
        bonusRange: 1.4,
      },
      snareTrap: {
        manaCost: [30, 35, 40, 45],
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
        cooldown: [60, 55, 50],
        castRange: 10,
        radius: 3,
        duration: 3,
        pulseInterval: 0.5,
        damagePerPulse: [25, 37, 50],
      },
    },
    warden: {
      hp: 420, hpPerLevel: 60, hpRegen: 2.2,
      mana: 110, manaPerLevel: 26, manaRegen: 2.1, manaRegenPerLevel: 0.4,
      armor: 4, armorPerLevel: 0.7, magicResist: 0.1,
      damage: 24, damagePerLevel: 3.6, damageType: 'physical',
      attackCooldown: 1.1, attackRange: 1, ranged: false, projectileSpeed: 0,
      speed: 4.3, radius: 0.5, acquireRange: 5.5,
      cleave: {
        manaCost: [20, 25, 30, 35],
        cooldown: [6, 5.5, 5, 4.5],
        radius: 2.2,
        damage: [52, 85, 117, 150],
      },
      taunt: {
        manaCost: [30, 35, 40, 45],
        cooldown: [16, 15, 14, 13],
        radius: 4.5,
        duration: [2, 2.5, 3, 3.5],
      },
      bulwarkAura: {
        radius: 8,
        armor: [2, 4, 6, 8],
      },
      lastStand: {
        cooldown: [70, 65, 60],
        duration: [6, 7, 8],
        damageReduction: [0.4, 0.5, 0.6],
        stunRadius: 3,
        stun: [1.25, 1.75, 2.25],
      },
    },
    arcanist: {
      hp: 280, hpPerLevel: 35, hpRegen: 1.2,
      mana: 260, manaPerLevel: 34, manaRegen: 4.4, manaRegenPerLevel: 0.6,
      armor: 1, armorPerLevel: 0.4, magicResist: 0.2,
      damage: 18, damagePerLevel: 2.5, damageType: 'magic',
      attackCooldown: 1, attackRange: 5.1, ranged: true, projectileSpeed: 12,
      speed: 4.5, radius: 0.4, acquireRange: 6.1,
      fireball: {
        manaCost: [30, 35, 45, 50],
        cooldown: [7, 6.5, 6, 5.5],
        castRange: 8,
        radius: 2,
        damage: [50, 80, 110, 140],
        projectileSpeed: 12,
      },
      frostNova: {
        manaCost: [40, 45, 50, 55],
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
        cooldown: [60, 55, 50],
        castRange: 9,
        radius: 3,
        delay: 1.2,
        damage: [200, 300, 400],
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

/** The tier a branch counts as: one past the last regular tier. */
export function branchTier(tuning: Tuning, kind: TowerKind): number {
  return tuning.towers[kind].tiers.length + 1;
}

/** Everything a tower of `kind` at `tier` (or with `branch`, its top tier) shoots with. */
export function towerStats(tuning: Tuning, kind: TowerKind, tier: number, branch: TowerBranch | null): TowerLevelStats {
  const s = tuning.towers[kind];
  const base = { ...NO_EFFECTS, hitsGround: s.hitsGround, hitsAir: s.hitsAir };
  if (branch) return { ...base, ...tuning.branches[branch] };
  return { ...base, ...towerTier(tuning, kind, tier) };
}

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}
