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
  /** False while the player is disconnected or after they left. */
  connected: boolean;
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
// Rooms and lobby (online play)
// ---------------------------------------------------------------------------

export const MAX_PLAYERS = 4;
export const MAX_NAME_LENGTH = 16;
/** Letters used in room codes: no I or O, which are easily confused with 1 and 0. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 5;

export interface LobbyPlayer {
  id: PlayerId;
  name: string;
  hero: HeroKind;
  ready: boolean;
  connected: boolean;
}

export interface LobbyState {
  code: string;
  /** 'lobby' while picking heroes; 'playing' once the host started the match. */
  phase: 'lobby' | 'playing';
  hostId: PlayerId;
  players: LobbyPlayer[];
}

export type ErrorCode =
  | 'bad_request'
  | 'room_not_found'
  | 'room_full'
  | 'match_in_progress'
  | 'rejoin_failed'
  | 'not_host'
  | 'not_ready'
  | 'wrong_server'
  | 'server_full'
  | 'server_draining'
  | 'rate_limited';

// ---------------------------------------------------------------------------
// Delta snapshots
// ---------------------------------------------------------------------------

/** Changes to one list of entities, keyed by `id`. */
export interface EntityListDelta<T extends { id: string | number }> {
  /** Entities that are new since the base snapshot (complete). */
  add?: T[];
  /** Changed entities: `id` plus only the fields that changed. */
  upd?: (Partial<T> & Pick<T, 'id'>)[];
  /** Ids of entities that are gone. */
  del?: T['id'][];
}

export type SnapshotScalars = Omit<Snapshot, 'players' | 'heroes' | 'creeps' | 'towers' | 'projectiles' | 'traps' | 'events'>;

export interface SnapshotDelta {
  /** Tick of the snapshot this delta applies to. */
  base: number;
  /** Changed top-level fields (always includes `tick`). */
  scalars: Partial<SnapshotScalars> & { tick: number };
  players?: EntityListDelta<PlayerSnap>;
  heroes?: EntityListDelta<HeroSnap>;
  creeps?: EntityListDelta<CreepSnap>;
  towers?: EntityListDelta<TowerSnap>;
  projectiles?: EntityListDelta<ProjectileSnap>;
  traps?: EntityListDelta<TrapSnap>;
  /** Events are per tick, so they are always sent in full. */
  events: GameEvent[];
}

// ---------------------------------------------------------------------------
// Transport envelopes
// ---------------------------------------------------------------------------

export type ClientMessage =
  /** Create a room and join it as host (online). */
  | { t: 'create'; name: string; hero: HeroKind }
  /** Join an existing room by code (online). */
  | { t: 'join'; code: string; name: string; hero: HeroKind }
  /** Take back a seat after a disconnect, within the reconnect window (online). */
  | { t: 'rejoin'; code: string; token: string }
  /** Lobby: change hero. */
  | { t: 'hero'; hero: HeroKind }
  /** Lobby: toggle ready. */
  | { t: 'ready'; ready: boolean }
  /** Lobby: host starts the match. */
  | { t: 'start' }
  /** Leave the room for good (online). */
  | { t: 'leave' }
  | { t: 'cmd'; cmd: Command }
  /** After victory/defeat: local mode starts a new match; online the host returns the room to the lobby. */
  | { t: 'restart' };

export type ServerMessage =
  /** `room` is present online: the room code and a secret token for reconnecting. */
  | { t: 'welcome'; playerId: PlayerId; room?: { code: string; token: string } }
  | { t: 'lobby'; lobby: LobbyState }
  /** A complete snapshot (keyframe). */
  | { t: 'snapshot'; snap: Snapshot }
  /** Changes since the previous snapshot. */
  | { t: 'delta'; delta: SnapshotDelta }
  | { t: 'error'; code: ErrorCode; message: string }
  /** The server is shutting down; it closes this connection within `closesInMs`. */
  | { t: 'notice'; kind: 'server_restarting'; message: string; closesInMs: number };
