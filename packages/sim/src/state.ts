import type {
  CreepKind,
  DamageType,
  EntityId,
  GameEvent,
  GamePhase,
  HeroKind,
  LaneId,
  PlayerId,
  SkillSlot,
  TargetPriority,
  TowerKind,
} from '@tdt/protocol';
import type { Tuning } from './tuning';

export interface PlayerConfig {
  id: PlayerId;
  name: string;
  hero: HeroKind;
}

export interface GameConfig {
  players: PlayerConfig[];
  /** Defaults to TUNING. Tests may pass a modified copy. */
  tuning?: Tuning;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  gold: number;
  heroId: EntityId;
  kills: number;
  /** Set by the host; a disconnected player's hero walks back to the Heart. */
  connected: boolean;
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
  facing: number;
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
  cooldown: number;
  /** Total gold spent (build + upgrades), the base for sell refunds. */
  spent: number;
  priority: TargetPriority;
  stunUntil: number;
  dead: boolean;
}

export type TargetKind = 'creep' | 'hero' | 'tower';

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
  slow: number;
  slowTicks: number;
  /** Player credited for kills, or null for creep projectiles. */
  source: PlayerId | null;
  done: boolean;
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

export interface PendingSpawn {
  tick: number;
  kind: CreepKind;
  lane: LaneId;
  wave: number;
}

export interface GameState {
  tick: number;
  rng: number;
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
  projectiles: Projectile[];
  traps: Trap[];
  spawnQueue: PendingSpawn[];
  /** Events produced by the last step (and commands applied before it). */
  events: GameEvent[];
  /** Events collected since the last step; moved to `events` when a step ends. */
  pendingEvents: GameEvent[];
}
