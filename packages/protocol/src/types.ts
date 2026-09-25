// Wire contract between a game host (local worker now, server in Phase 2) and clients.
// Everything here must stay JSON-serialisable.

export type PlayerId = string;
export type EntityId = number;

export const TOWER_KINDS = ['arrow', 'cannon', 'frost'] as const;
export type TowerKind = (typeof TOWER_KINDS)[number];

export const CREEP_KINDS = ['grunt', 'archer', 'runner', 'brute', 'wisp', 'boss'] as const;
export type CreepKind = (typeof CREEP_KINDS)[number];

export const HERO_KINDS = ['ranger'] as const;
export type HeroKind = (typeof HERO_KINDS)[number];

export const SKILL_SLOTS = ['Q', 'W', 'E', 'R'] as const;
export type SkillSlot = (typeof SKILL_SLOTS)[number];

export type LaneId = 0 | 1 | 2;

export type DamageType = 'physical' | 'magic';

// ---------------------------------------------------------------------------
// Commands (client -> host)
// ---------------------------------------------------------------------------

export type Command =
  | { type: 'move'; x: number; y: number }
  | { type: 'attack'; targetId: EntityId }
  | { type: 'attackMove'; x: number; y: number }
  | { type: 'stop' }
  | { type: 'cast'; slot: SkillSlot; x?: number; y?: number }
  | { type: 'learn'; slot: SkillSlot }
  | { type: 'build'; padId: number; tower: TowerKind }
  | { type: 'sell'; towerId: EntityId }
  | { type: 'callEarly' };

export type CommandType = Command['type'];

// ---------------------------------------------------------------------------
// Snapshots (host -> client)
// ---------------------------------------------------------------------------

export type GamePhase = 'build' | 'waves' | 'victory' | 'defeat';

export interface PlayerSnap {
  id: PlayerId;
  name: string;
  gold: number;
  heroId: EntityId;
  kills: number;
}

export interface SkillSnap {
  slot: SkillSlot;
  rank: number;
  maxRank: number;
  /** Ticks until ready; 0 when ready. */
  cooldown: number;
  cooldownTotal: number;
  manaCost: number;
  /** Cast range in tiles, 0 for self / no-target skills. */
  range: number;
  targeted: boolean;
}

export interface HeroSnap {
  id: EntityId;
  owner: PlayerId;
  kind: HeroKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  level: number;
  maxLevel: number;
  xp: number;
  /** XP at which the current level started / the next level starts. */
  xpLevelStart: number;
  xpNextLevel: number;
  skillPoints: number;
  skills: SkillSnap[];
  alive: boolean;
  /** Ticks until respawn when dead. */
  respawnIn: number;
  attackRange: number;
  facing: number;
  stunned: boolean;
}

export interface CreepSnap {
  id: EntityId;
  kind: CreepKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  slowed: boolean;
  rooted: boolean;
}

export interface TowerSnap {
  id: EntityId;
  owner: PlayerId;
  kind: TowerKind;
  padId: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  tier: number;
  range: number;
  spent: number;
  stunned: boolean;
}

export interface ProjectileSnap {
  id: EntityId;
  /** Visual style, e.g. tower kind, 'hero', 'archer'. */
  style: string;
  x: number;
  y: number;
}

export interface TrapSnap {
  id: EntityId;
  x: number;
  y: number;
  armed: boolean;
  radius: number;
}

export type GameEvent =
  | { type: 'waveStart'; wave: number; income: number }
  | { type: 'callEarly'; by: PlayerId; bonus: number }
  | { type: 'kill'; creepId: EntityId; kind: CreepKind; x: number; y: number; by: PlayerId | null; bounty: number }
  | { type: 'leak'; creepId: EntityId; damage: number }
  | { type: 'heroDied'; heroId: EntityId }
  | { type: 'heroRespawned'; heroId: EntityId }
  | { type: 'levelUp'; heroId: EntityId; level: number }
  | { type: 'towerBuilt'; towerId: EntityId; owner: PlayerId }
  | { type: 'towerSold'; towerId: EntityId; owner: PlayerId; refund: number }
  | { type: 'towerDestroyed'; towerId: EntityId }
  | { type: 'cast'; heroId: EntityId; slot: SkillSlot; x: number; y: number }
  | { type: 'trapTriggered'; x: number; y: number; radius: number }
  | { type: 'stomp'; x: number; y: number; radius: number }
  | { type: 'splash'; x: number; y: number; radius: number }
  | { type: 'rejected'; player: PlayerId; command: CommandType; reason: string }
  | { type: 'gameOver'; result: 'victory' | 'defeat' };

export interface Snapshot {
  tick: number;
  tickRate: number;
  phase: GamePhase;
  heartHp: number;
  heartMaxHp: number;
  /** Number of waves started so far (0 during the build phase). */
  wave: number;
  totalWaves: number;
  /** Ticks until the next wave starts, or -1 when there is no next wave. */
  nextWaveIn: number;
  /** Gold every player would receive for calling the next wave now. */
  callEarlyBonus: number;
  players: PlayerSnap[];
  heroes: HeroSnap[];
  creeps: CreepSnap[];
  towers: TowerSnap[];
  projectiles: ProjectileSnap[];
  traps: TrapSnap[];
  /** Events that happened since the previous snapshot. */
  events: GameEvent[];
}

// ---------------------------------------------------------------------------
// Transport envelopes
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { t: 'cmd'; cmd: Command }
  /** Ask the host to start a fresh match (local mode: after victory/defeat). */
  | { t: 'restart' };

export type ServerMessage =
  | { t: 'welcome'; playerId: PlayerId }
  | { t: 'snapshot'; snap: Snapshot };
