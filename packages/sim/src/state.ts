import type {
  AoeEffect,
  CreepKind,
  DamageType,
  EntityId,
  GameEvent,
  Difficulty,
  GameMode,
  GamePhase,
  HeroKind,
  LaneId,
  Modifier,
  SurgeNotice,
  PlayerId,
  SkillSlot,
  TargetPriority,
  TowerBranch,
  TowerKind,
  ZoneKind,
} from '@tdt/protocol';
import type { PadState } from './pads';
import type { Tuning } from './tuning';

export interface PlayerConfig {
  id: PlayerId;
  name: string;
  hero: HeroKind;
}

export interface GameConfig {
  players: PlayerConfig[];
  /** Match mode (default Full); its changes are applied to the tuning (`tuningForMode`). */
  mode?: GameMode;
  /** Creep difficulty (default Normal). Normal does not change HP or counts. */
  difficulty?: Difficulty;
  /** Match modifiers (default none). At most two; the host's lobby choice, not a fresh seed roll. */
  modifiers?: Modifier[];
  /** Defaults to TUNING. Tests may pass a modified copy. */
  tuning?: Tuning;
  /**
   * Solo Meteor Rain practice. Adds `allyId` as a bot hero that does not count toward team size,
   * pad ownership, creep scaling, or wave income. Both heroes start at `startLevel` (default 6, so R
   * can be learned at once). Online matches omit this.
   */
  practice?: { allyId: PlayerId; allyName?: string; allyHero: HeroKind; startLevel?: number };
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  gold: number;
  heroId: EntityId;
  kills: number;
  /** Set by the host; a disconnected player's hero walks back to the Heart. */
  connected: boolean;
  /** Set by the host once the player is gone for good (their empty pads open to everyone). */
  left: boolean;
}

export type HeroOrder =
  | { type: 'idle' }
  | { type: 'move'; x: number; y: number }
  | { type: 'attack'; targetId: EntityId }
  | { type: 'attackMove'; x: number; y: number }
  | { type: 'castPoint'; slot: SkillSlot; x: number; y: number };

export interface Hero {
  id: EntityId;
  owner: PlayerId;
  kind: HeroKind;
  x: number;
  y: number;
  hp: number;
  mana: number;
  level: number;
  xp: number;
  skillPoints: number;
  ranks: Record<SkillSlot, number>;
  /** Ticks until each skill is ready. */
  skillCd: Record<SkillSlot, number>;
  attackCd: number;
  order: HeroOrder;
  /** Remaining waypoints of the current path. */
  path: { x: number; y: number }[];
  /** Tick at which a chase path is recomputed. */
  repathTick: number;
  alive: boolean;
  respawnTick: number;
  stunUntil: number;
  /** Iron Vow: team armour and regeneration last until this tick (0 = never cast). Survives the caster dying. */
  guardianUntil: number;
  /**
   * Joystick steering: auto-chase stays off until this tick. Each `move` refreshes it; `stop` clears it.
   * A one-shot move (a click) only holds for a few ticks after the command, so arriving still engages.
   */
  drivenUntil: number;
  facing: number;
  /** The creep that last hurt this hero (-1 = none yet) and the tick it did. */
  hitBy: EntityId;
  hitTick: number;
  /**
   * Melee auto-engage (`tuning.hero.autoEngage`): where the hero stood when it was left idle. It fights
   * creeps near it without straying further than the leash from here, and walks back here afterwards.
   * Null while it has an order (or is dead).
   */
  guard: { x: number; y: number } | null;
  /**
   * Tick the next snapshot will show for this hero's last successful R, or -1.
   * Not sent to clients. `syncCast` reads it. Instant casts store the upcoming snapshot tick.
   */
  rCastTick: number;
}

export type CreepMode = 'lane' | 'chase' | 'return';

export interface Creep {
  id: EntityId;
  kind: CreepKind;
  lane: LaneId;
  /** Wave the creep belongs to (drives HP, armour and bounty growth). */
  wave: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Current armour and magic resist: base stats + wave growth + boss effects. */
  armor: number;
  magicResist: number;
  /** Index of the next lane waypoint. */
  wp: number;
  /** Personal offset from the lane centre line. */
  offX: number;
  offY: number;
  mode: CreepMode;
  /** Where the creep left its lane to chase a hero. */
  anchorX: number;
  anchorY: number;
  /** Hero being chased, or -1. */
  targetId: EntityId;
  attackCd: number;
  /** Boss ability: ticks until the next use, and how many units it has summoned so far. */
  abilityCd: number;
  abilityUses: number;
  /** Shardback's current hide, null for everything else. */
  hide: 'stone' | 'ether' | null;
  slowPct: number;
  slowUntil: number;
  rootUntil: number;
  /** Stunned creeps neither move nor attack. */
  stunUntil: number;
  /** A taunted creep keeps chasing its target and ignores its leash until this tick. */
  tauntUntil: number;
  /** Ticks spent stopped to attack towers so far (anti-stall: see `creepAi.towerAttackLimit`). */
  towerTicks: number;
  /** Armour stripped by Shrapnel towers, until `shredUntil` (see `effectiveArmor`). */
  shred: number;
  shredUntil: number;
  /** Path distance left to the Heart; lower = further along ("First"). */
  remaining: number;
  dead: boolean;
}

export interface Tower {
  id: EntityId;
  owner: PlayerId;
  kind: TowerKind;
  padId: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  tier: number;
  /** The top-tier specialisation (tier = last regular tier + 1), else null. */
  branch: TowerBranch | null;
  /** Shots fired so far (Glacier freezes on every Nth). */
  shots: number;
  cooldown: number;
  /** Total gold spent (build + upgrades), the base for sell refunds. */
  spent: number;
  priority: TargetPriority;
  stunUntil: number;
  dead: boolean;
}

/** What a branch tower's shot does on top of its damage (see `TowerEffects`). */
export interface ProjectileFx {
  /** Damage × this against ground creeps (Hailstorm). */
  groundDamage: number;
  armorShred: number;
  shredMax: number;
  shredTicks: number;
  /** Freezes the creep it hits for this long (Glacier), 0 = no. */
  freezeTicks: number;
  /** Jumps left, their reach and the damage kept per jump (Prism). */
  chains: number;
  chainRange: number;
  chainFalloff: number;
  /** Creeps this chain already hit. */
  chainHit: EntityId[];
  /** Ignores armour and magic resist (Void). */
  ignoreResist: boolean;
  /** Extra damage: this fraction of the target's max HP (Void). */
  hpPercent: number;
}

/** 'point': a projectile that flies to (tx, ty) and explodes there (Fireball). */
export type TargetKind = 'creep' | 'hero' | 'tower' | 'point';

export interface Projectile {
  id: EntityId;
  style: string;
  x: number;
  y: number;
  /** Tiles per tick. */
  speed: number;
  targetKind: TargetKind;
  targetId: EntityId;
  /** Last known target position; splash projectiles land here if the target dies. */
  tx: number;
  ty: number;
  damage: number;
  damageType: DamageType;
  splash: number;
  /** Which creeps a splash hurts (single-target shots only hit their target). */
  splashGround: boolean;
  splashAir: boolean;
  /** Event emitted when a splash lands; null = a plain 'splash' event. */
  aoe: AoeEffect | null;
  slow: number;
  slowTicks: number;
  /** A critical hit (shown to players on impact). */
  crit: boolean;
  /** Top-tier tower effects carried by the shot, or null. */
  fx: ProjectileFx | null;
  /** Player credited for kills, or null for creep projectiles. */
  source: PlayerId | null;
  /** The creep that fired it (heroes remember who shot them), or -1. */
  attacker: EntityId;
  /** Lane this shot counts as for a boss shield (the tower's pad zone, or the hero's hit lane). */
  from: HitFrom;
  done: boolean;
}

/** Where a hit came from. Towers use their pad zone; heroes use `heroHitLane`. */
export interface HitFrom {
  x: number;
  lane: LaneId;
}

export interface Trap {
  id: EntityId;
  owner: PlayerId;
  x: number;
  y: number;
  rank: number;
  armTick: number;
  expireTick: number;
  done: boolean;
}

/** A lingering or delayed hero-ultimate effect on the ground. */
export interface Zone {
  id: EntityId;
  kind: ZoneKind;
  owner: PlayerId;
  x: number;
  y: number;
  radius: number;
  rank: number;
  startTick: number;
  /** Last tick of the effect; the zone is removed after it. */
  endTick: number;
  /** Next tick that deals damage; pulses repeat every `pulseTicks` until `endTick`. */
  nextPulseTick: number;
  pulseTicks: number;
  done: boolean;
  /** Impacts already dropped on each lane, and inside the Heart cap, for this rain. */
  laneStrikes: [number, number, number];
  heartStrikes: number;
}

export interface PendingSpawn {
  tick: number;
  kind: CreepKind;
  lane: LaneId;
  wave: number;
}

export interface GameState {
  tick: number;
  rng: number;
  mode: GameMode;
  /** Creep difficulty. Normal leaves HP and counts exactly as the tuning states them. */
  difficulty: Difficulty;
  /** Modifiers in force. Empty is a normal match. */
  modifiers: Modifier[];
  /**
   * Surge lane of each wave (index 0 unused). Null spreads the wave. Fixed at the start from the seed,
   * so a replay repeats it without logging it.
   */
  surgeLanes: (LaneId | null)[];
  /** This wave's surge lane, or null. */
  surgeLane: LaneId | null;
  /** The next wave's surge, announced a wave ahead, or null. */
  nextSurge: SurgeNotice | null;
  /** The tuning of this match, with the mode's changes applied. */
  tuning: Tuning;
  phase: GamePhase;
  heartHp: number;
  wave: number;
  /** Tick the next wave starts, or -1 when none is left. */
  nextWaveTick: number;
  nextId: number;
  players: PlayerState[];
  heroes: Hero[];
  creeps: Creep[];
  towers: Tower[];
  /** The build pads that exist in this match and who may build on them (see pads.ts). */
  pads: PadState[];
  projectiles: Projectile[];
  traps: Trap[];
  zones: Zone[];
  spawnQueue: PendingSpawn[];
  /** Events produced by the last step (and commands applied before it). */
  events: GameEvent[];
  /** Events collected since the last step; moved to `events` when a step ends. */
  pendingEvents: GameEvent[];
  /** Damage dealt to creeps since the last step, per source ('' = no one), per creep id; becomes `damage` events. */
  pendingDamage: Record<string, Record<number, number>>;
  /** Solo Meteor Rain practice, or null. */
  practice: PracticeState | null;
  /** Arrow Storm and Meteor casts still inside the combo window. */
  recentUlts: RecentUlt[];
  /** Wave-10 bosses that spawned with a shield (kept until the creep is gone). */
  shields: BossShield[];
  /** What hero ultimates and combos did, for the balance matrix. Not in snapshots or reports. */
  ultStats: UltStats;
}

/** Damage dealt and creeps killed by hero ultimates (and combos) over the match. */
export interface UltStats {
  damage: number;
  kills: number;
}

/** Solo practice: the bot ally and the level both heroes started at. */
export interface PracticeState {
  allyId: PlayerId;
  startLevel: number;
}

/** An ultimate still waiting to fuse. Only Arrow Storm and Meteor combo. */
export interface RecentUlt {
  heroId: EntityId;
  kind: 'arrowStorm' | 'meteor';
  x: number;
  y: number;
  radius: number;
  tick: number;
  zoneId: EntityId;
  fused: boolean;
}

/** A wave-10 boss shield. */
export interface BossShield {
  creepId: EntityId;
  up: boolean;
  /** Last tick each lane hit it (-1: never). */
  lastHit: [number, number, number];
  /** The half lit by the latest hit, and when; null once the window ran out. */
  side: 'left' | 'right' | null;
  sideTick: number;
}
