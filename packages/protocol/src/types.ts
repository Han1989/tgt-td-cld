// Wire contract between a game host (local worker now, server in Phase 2) and clients.
// Everything here must stay JSON-serialisable.

/**
 * Wire-protocol version, shared by client and server. Bump it whenever a
 * message, command or snapshot changes shape or meaning. The server announces
 * it on connect (`hello`) and rejects entry messages carrying another one; the
 * client then asks the player to refresh.
 */
export const PROTOCOL_VERSION = 13;

export type PlayerId = string;
export type EntityId = number;

export const TOWER_KINDS = ['arrow', 'cannon', 'frost', 'arcane', 'flak'] as const;
export type TowerKind = (typeof TOWER_KINDS)[number];

/**
 * Top-tier specialisations (docs/REPLAYABILITY.md §1): after tier 3 a tower upgrades into one of two
 * branches, its last tier. The choice is final (except by selling).
 */
export const TOWER_BRANCH_KINDS = [
  'sniper',
  'volley',
  'mortar',
  'shrapnel',
  'glacier',
  'blizzard',
  'prism',
  'void',
  'skyguard',
  'hailstorm',
] as const;
export type TowerBranch = (typeof TOWER_BRANCH_KINDS)[number];

/** The two branches of each tower kind (A, then B). */
export const TOWER_BRANCHES: Record<TowerKind, readonly [TowerBranch, TowerBranch]> = {
  arrow: ['sniper', 'volley'],
  cannon: ['mortar', 'shrapnel'],
  frost: ['glacier', 'blizzard'],
  arcane: ['prism', 'void'],
  flak: ['skyguard', 'hailstorm'],
};

export function isBranchOf(kind: TowerKind, branch: TowerBranch): boolean {
  return TOWER_BRANCHES[kind].includes(branch);
}

/** Which creep in range a tower shoots. First = closest to the Heart along its path. */
export const TARGET_PRIORITIES = ['first', 'strongest', 'closest'] as const;
export type TargetPriority = (typeof TARGET_PRIORITIES)[number];

export const CREEP_KINDS = [
  'grunt',
  'archer',
  'runner',
  'brute',
  'wisp',
  /** Summoned by the Matriarch; never part of a wave list. */
  'hatchling',
  /** Wave 10 boss: Stomp. */
  'ironhorn',
  /** Wave 20 boss: Hatch. */
  'matriarch',
  /** Wave 30 boss: Shifting Hide. */
  'shardback',
] as const;
export type CreepKind = (typeof CREEP_KINDS)[number];

export const BOSS_KINDS = ['ironhorn', 'matriarch', 'shardback'] as const satisfies readonly CreepKind[];
export type BossKind = (typeof BOSS_KINDS)[number];

export function isBossKind(kind: CreepKind): kind is BossKind {
  return (BOSS_KINDS as readonly CreepKind[]).includes(kind);
}

export const HERO_KINDS = ['ranger', 'warden', 'arcanist'] as const;
export type HeroKind = (typeof HERO_KINDS)[number];

export const SKILL_SLOTS = ['Q', 'W', 'E', 'R'] as const;
export type SkillSlot = (typeof SKILL_SLOTS)[number];

export type LaneId = 0 | 1 | 2;

/** Match length: Full (30 waves) or Quick (15 waves, compressed difficulty). A match option picked before the start. */
export const GAME_MODES = ['full', 'quick'] as const;
export type GameMode = (typeof GAME_MODES)[number];

/**
 * How hard the creeps are. Normal is the tuned baseline. Hard raises creep HP and how many spawn
 * (not HP alone), picked in the lobby next to Full / Quick. Orthogonal to match length.
 */
export const DIFFICULTIES = ['normal', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Lingering or delayed ground effects of hero ultimates. */
export const ZONE_KINDS = ['arrowStorm', 'meteor'] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

/** Area effects of hero skills, for visual feedback. */
export type AoeEffect =
  | 'cleave'
  | 'taunt'
  | 'lastStand'
  | 'fireball'
  | 'frostNova'
  | 'meteor'
  | 'arrowStorm'
  /** A Blizzard tower's pulse around itself. */
  | 'blizzard';

export type DamageType = 'physical' | 'magic';

/**
 * Quick-chat phrases. The wire value is one of these ids. There is no free-text chat: a message
 * that is not one of these ids, or that carries any extra text, is rejected by the codec.
 */
export const EMOTES = ['help', 'coming', 'danger', 'thanks', 'nice', 'defend'] as const;
export type Emote = (typeof EMOTES)[number];

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
  /** Next tier; from the last regular tier, `branch` picks the specialisation (required there, refused before). */
  | { type: 'upgrade'; towerId: EntityId; branch?: TowerBranch }
  | { type: 'setPriority'; towerId: EntityId; priority: TargetPriority }
  | { type: 'callEarly' }
  /** Give some of your gold to a teammate. */
  | { type: 'gift'; to: PlayerId; amount: number }
  /** A map marker for teammates. */
  | { type: 'ping'; x: number; y: number }
  /** One phrase from `EMOTES`. Not a text message. */
  | { type: 'emote'; emote: Emote };

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
  /** Cast range in tiles (Multishot: its reach), 0 for self-centred skills. */
  range: number;
  /** Area radius in tiles, 0 for single-target or passive skills. */
  radius: number;
  /** Needs a target point (left-click after the hotkey). */
  targeted: boolean;
  /** Always on; cannot be cast. */
  passive: boolean;
  /** A skill point can be spent on this skill right now. */
  learnable: boolean;
  /** Hero level needed for the next rank (0 at max rank). */
  nextRankLevel: number;
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
  /** Mana regenerated per second right now (level and Clarity Aura included); skill buttons count down from it. */
  manaRegen: number;
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
  /** Warden's Last Stand is active (reduced damage taken). */
  shielded: boolean;
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
  /** Current armour and magic resist (bosses can change theirs). */
  armor: number;
  magicResist: number;
  stunned: boolean;
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
  /** 1–3, then 4 once it has a branch. */
  tier: number;
  /** The specialisation picked at the top tier, else null. */
  branch: TowerBranch | null;
  range: number;
  spent: number;
  priority: TargetPriority;
  stunned: boolean;
}

/**
 * A build pad that exists in this match (extra pads only exist in bigger teams). Only `owner` may
 * build on it; `null` = anyone (a leaver's pads open up once their rejoin window runs out).
 */
export interface PadSnap {
  /** Index into the map's pad list. */
  id: number;
  owner: PlayerId | null;
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

export interface ZoneSnap {
  id: EntityId;
  kind: ZoneKind;
  x: number;
  y: number;
  radius: number;
  /** Tick the zone was created and the tick it ends (Meteor: lands). */
  startTick: number;
  endTick: number;
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
  | { type: 'towerUpgraded'; towerId: EntityId; owner: PlayerId; tier: number; branch: TowerBranch | null }
  | { type: 'towerDestroyed'; towerId: EntityId }
  | { type: 'cast'; heroId: EntityId; slot: SkillSlot; x: number; y: number }
  | { type: 'trapTriggered'; x: number; y: number; radius: number }
  | { type: 'stomp'; x: number; y: number; radius: number }
  | { type: 'hatch'; creepId: EntityId; x: number; y: number; count: number }
  | { type: 'hideShift'; creepId: EntityId; x: number; y: number; hide: 'stone' | 'ether' }
  | { type: 'gift'; from: PlayerId; to: PlayerId; amount: number }
  | { type: 'splash'; x: number; y: number; radius: number }
  | { type: 'aoe'; effect: AoeEffect; x: number; y: number; radius: number }
  /** A Keen Eye critical hit by `by`'s hero. */
  | { type: 'crit'; x: number; y: number; damage: number; by: PlayerId | null }
  /**
   * Damage one player (or no one: `null`) dealt to creeps this tick, as flat pairs
   * `[creepId, amount, creepId, amount, …]`: whole damage actually dealt (after armour and
   * magic resist, capped at the HP left), summed per creep. At most one per source per tick,
   * listed before the tick's other events. Clients use it for floating damage numbers.
   */
  | { type: 'damage'; by: PlayerId | null; hits: number[] }
  /** A hero's auto-attack went off (a melee hit lands now; a ranged one launches its projectile), at the target's position. */
  | { type: 'heroAttack'; heroId: EntityId; x: number; y: number }
  | { type: 'rejected'; player: PlayerId; command: CommandType; reason: string }
  /** A map marker from a teammate. */
  | { type: 'ping'; by: PlayerId; x: number; y: number }
  /** A quick-chat phrase from a teammate (`EMOTES`). */
  | { type: 'emote'; by: PlayerId; emote: Emote }
  | { type: 'gameOver'; result: 'victory' | 'defeat' };

export interface Snapshot {
  tick: number;
  tickRate: number;
  /** Match mode (fixed for the whole match). */
  mode: GameMode;
  /** Creep difficulty (fixed for the whole match). Normal is the baseline. */
  difficulty: Difficulty;
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
  pads: PadSnap[];
  projectiles: ProjectileSnap[];
  traps: TrapSnap[];
  zones: ZoneSnap[];
  /** Events that happened since the previous snapshot. */
  events: GameEvent[];
}

// ---------------------------------------------------------------------------
// Match reports and replays (sent once, when a match ends)
// ---------------------------------------------------------------------------

/** How one hero's match went (`MatchReport.heroes`). Seconds are match time (ticks / tick rate). */
export interface HeroReport {
  player: PlayerId;
  name: string;
  hero: HeroKind;
  /** Level at the end. */
  level: number;
  kills: number;
  deaths: number;
  /** Second each level was reached: index 0 = level 2. */
  levelUps: number[];
  /** Level when each wave ended (same indices as `MatchReport.heartAfterWave`). */
  levelByWave: number[];
  casts: { Q: number; W: number; R: number };
  /** Seconds Q / W were learned and off cooldown but cost more mana than the hero had (while alive). */
  noManaSeconds: { Q: number; W: number };
  /** Ultimates cast within 2 s of another hero's ultimate (either side). */
  rOverlaps: number;
  /** Towers this player built. */
  towersBuilt: number;
  /** Tier upgrades (not the tier-4 branch). */
  upgrades: number;
  /** Towers taken into a tier-4 branch. */
  branches: number;
  /** Net gold paid for towers: builds and upgrades, minus sell refunds. */
  goldSpent: number;
  /** Gold still held when the match ended. */
  goldUnspent: number;
  /** Waves this player called early. */
  wavesCalledEarly: number;
}

/** A summary of a finished match, built by the host (server or local worker) from the simulation. */
export interface MatchReport {
  /** Report format version. */
  format: 1;
  protocol: number;
  /** The host's build: its git commit (server: Render's, solo: the client's from Vercel), or 'dev'. */
  build: string;
  mode: GameMode;
  /** Creep difficulty (Normal is the tuned baseline). */
  difficulty: Difficulty;
  seed: number;
  result: 'victory' | 'defeat';
  /** Waves started (the last one reached on a defeat) and the match's total. */
  wave: number;
  totalWaves: number;
  seconds: number;
  heartHp: number;
  heartMaxHp: number;
  /** Heart HP when each wave ended (when the next one started; the last: when the match ended). */
  heartAfterWave: number[];
  heroes: HeroReport[];
}

/**
 * One entry of a replay log, applied when the simulation is at `tick` (before stepping to tick + 1):
 * `[tick, player index, command type, …arguments]` (see `encodeReplayCommand`), or
 * `[tick, player index, 'join' | 'drop' | 'leave']` (reconnected / disconnected / gone for good).
 */
export type ReplayEntry = [tick: number, player: number, what: string, ...args: (string | number)[]];

/** Everything needed to re-run a match with the simulation: the seed, the setup and every input with its tick. */
export interface Replay {
  /** Replay format version. */
  format: 1;
  protocol: number;
  /** The build that recorded it (see `MatchReport.build`): re-run it on that commit to get the same result. */
  build: string;
  seed: number;
  mode: GameMode;
  /** Absent on replays saved before Hard existed: those matches were Normal. */
  difficulty?: Difficulty;
  players: { id: PlayerId; name: string; hero: HeroKind }[];
  /** Inputs in the order the host applied them. */
  log: ReplayEntry[];
  /** How the match ended; a re-run must end the same way. */
  end: { tick: number; result: GamePhase; wave: number; heartHp: number };
}

// ---------------------------------------------------------------------------
// Rooms and lobby (online play)
// ---------------------------------------------------------------------------

/** Players per match: one per lane (docs/MOBILE.md §2). */
export const MAX_PLAYERS = 3;
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
  /** Match mode the host picked; used when the match starts. */
  mode: GameMode;
  /** Creep difficulty the host picked; used when the match starts. */
  difficulty: Difficulty;
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
  | 'rate_limited'
  /** The client was built for another PROTOCOL_VERSION: it must reload. */
  | 'version_mismatch';

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

export type SnapshotScalars = Omit<
  Snapshot,
  'players' | 'heroes' | 'creeps' | 'towers' | 'pads' | 'projectiles' | 'traps' | 'zones' | 'events'
>;

export interface SnapshotDelta {
  /** Tick of the snapshot this delta applies to. */
  base: number;
  /** Changed top-level fields (always includes `tick`). */
  scalars: Partial<SnapshotScalars> & { tick: number };
  players?: EntityListDelta<PlayerSnap>;
  heroes?: EntityListDelta<HeroSnap>;
  creeps?: EntityListDelta<CreepSnap>;
  towers?: EntityListDelta<TowerSnap>;
  pads?: EntityListDelta<PadSnap>;
  projectiles?: EntityListDelta<ProjectileSnap>;
  traps?: EntityListDelta<TrapSnap>;
  zones?: EntityListDelta<ZoneSnap>;
  /** Events are per tick, so they are always sent in full. */
  events: GameEvent[];
}

// ---------------------------------------------------------------------------
// Transport envelopes
// ---------------------------------------------------------------------------

export type ClientMessage =
  // Entry messages carry the client's PROTOCOL_VERSION as `v`.
  /** Create a room and join it as host (online). */
  | { t: 'create'; v: number; name: string; hero: HeroKind }
  /** Join an existing room by code (online). */
  | { t: 'join'; v: number; code: string; name: string; hero: HeroKind }
  /** Take back a seat after a disconnect, within the reconnect window (online). */
  | { t: 'rejoin'; v: number; code: string; token: string }
  /** Lobby: change hero. */
  | { t: 'hero'; hero: HeroKind }
  /**
   * Lobby: pick the match mode (online: host only, before the start). Local solo: start a new match
   * in that mode, like `hero`.
   */
  | { t: 'mode'; mode: GameMode }
  /**
   * Lobby: pick Normal or Hard (online: host only, before the start). Local solo: start a new match
   * at that difficulty, like `mode`.
   */
  | { t: 'difficulty'; difficulty: Difficulty }
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
  /** Sent first on every connection (online): the server's PROTOCOL_VERSION. */
  | { t: 'hello'; v: number }
  /** `room` is present online: the room code and a secret token for reconnecting. */
  | { t: 'welcome'; playerId: PlayerId; room?: { code: string; token: string } }
  | { t: 'lobby'; lobby: LobbyState }
  /** A complete snapshot (keyframe). */
  | { t: 'snapshot'; snap: Snapshot }
  /** Changes since the previous snapshot. */
  | { t: 'delta'; delta: SnapshotDelta }
  | { t: 'error'; code: ErrorCode; message: string }
  /** The server is shutting down; it closes this connection within `closesInMs`. */
  | { t: 'notice'; kind: 'server_restarting'; message: string; closesInMs: number }
  /** Sent once when a match ends (and again to a player who rejoins after): its report and full replay. */
  | { t: 'report'; report: MatchReport; replay: Replay };
