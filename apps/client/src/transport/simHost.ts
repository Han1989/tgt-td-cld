// Runs the authoritative simulation for local play. It speaks the same
// encoded protocol as the future game server: it receives raw client
// messages and emits raw server messages.

import {
  allowSocial,
  decodeClientMessage,
  encodeServerMessage,
  freshSocialClock,
  normalizeBuild,
  type Command,
  type GameMode,
  type HeroKind,
  type PlayerId,
  type SocialClock,
} from '@tdt/protocol';
import {
  createMatch,
  dailyConfig,
  heroLevelXp,
  lastWave,
  matchCommand,
  matchOver,
  matchReplay,
  matchReport,
  matchStep,
  snapshot,
  type GameState,
  type Match,
  type Tuning,
} from '@tdt/sim';

export const LOCAL_PLAYER_ID: PlayerId = 'local';

export class SimHost {
  private match!: Match;
  /** The report of the finished match has been sent. */
  private reported = false;
  private queue: Command[] = [];
  private hero: HeroKind = 'ranger';
  private mode: GameMode = 'full';
  /** A Daily run's seed: every match this host starts is that day's run (one player, Quick, Hard), Play again too. */
  private dailySeed: number | null = null;
  /** Browser tests only: tuning for the next match (see `LocalTransport`'s lab option). */
  tuning: Tuning | undefined;
  /** Same ping / emote gap the game server enforces. */
  private social: SocialClock = freshSocialClock();

  /** `build`: the client's build (git commit or 'dev'), stamped into solo match reports and replays. */
  constructor(
    private readonly emit: (raw: string) => void,
    private readonly nextSeed: () => number,
    private readonly build = 'dev',
  ) {
    this.reset();
  }

  /** Starts a fresh match and tells the client who it is. */
  reset(): void {
    const player = { id: LOCAL_PLAYER_ID, name: 'You', hero: this.hero };
    // Every match a player starts is Normal (Han, 17 Oct 2026), except the Daily run (Quick on Hard, the day's seed) and
    // Endless, whose mode sets Hard whatever the config asks.
    this.match =
      this.dailySeed === null
        ? createMatch({ players: [player], mode: this.mode, difficulty: 'normal', tuning: this.tuning }, this.nextSeed(), normalizeBuild(this.build))
        : createMatch({ ...dailyConfig(player), tuning: this.tuning }, this.dailySeed, normalizeBuild(this.build));
    this.reported = false;
    this.queue = [];
    this.social = freshSocialClock();
    this.emit(encodeServerMessage({ t: 'welcome', playerId: LOCAL_PLAYER_ID }));
    this.emit(encodeServerMessage({ t: 'snapshot', snap: snapshot(this.state) }));
  }

  /**
   * The Daily run (a worker control message, not part of the protocol): from now on every match is the run of the day
   * whose seed this is, until the host is closed. Starts one at once, as a hero or mode pick does.
   */
  setDaily(seed: number): void {
    if (!Number.isSafeInteger(seed) || seed < 0 || this.state.phase === 'waves') return;
    this.dailySeed = seed;
    this.reset();
  }

  /** Handles one raw message from the client. Malformed input is ignored. */
  receive(raw: unknown): void {
    const msg = decodeClientMessage(raw);
    if (!msg) return;
    const over = this.state.phase === 'victory' || this.state.phase === 'defeat';
    if (msg.t === 'restart') {
      if (over) this.reset();
    } else if (msg.t === 'hero' || msg.t === 'mode') {
      // Solo hero / mode pick: starts a new match with it, unless waves are already running.
      if (this.state.phase !== 'waves') {
        if (msg.t === 'hero') this.hero = msg.hero;
        else this.mode = msg.mode;
        this.reset();
      }
    } else if (msg.t === 'cmd') {
      const cmd = msg.cmd;
      if ((cmd.type === 'ping' || cmd.type === 'emote') && !allowSocial(this.social, cmd.type, performance.now())) return;
      this.queue.push(cmd);
    }
    // Other room and lobby messages only mean something to the online server.
  }

  /** Browser tests only (the worker's e2e `lose` control): the Heart drops to 0, so the match ends next tick. */
  debugLose(): void {
    this.state.heartHp = 0;
  }

  /**
   * Browser tests only (the worker's e2e `win` control): the last wave is out and its creeps gone, so the next tick ends
   * the match in victory with the Heart as it is (the record's "Personal best").
   */
  debugWin(): void {
    const s = this.state;
    if (s.phase === 'victory' || s.phase === 'defeat') return;
    s.phase = 'waves';
    s.wave = lastWave(s.tuning);
    s.nextWaveTick = -1;
    s.spawnQueue = [];
    s.creeps = [];
  }

  /** Browser tests only (the worker's e2e `damageTowers` control): every tower drops to 30% of its HP. */
  debugDamageTowers(): void {
    for (const t of this.state.towers) t.hp = Math.floor(t.maxHp * 0.3);
  }

  /**
   * Browser tests only (the worker's e2e `level` control): the hero is at `level` (past 10 only in Endless, where veteran
   * levels exist), one XP short of the next, so the next kill near it levels it up as a match would.
   */
  debugLevel(level: number): void {
    const t = this.state.tuning;
    if (!Number.isSafeInteger(level) || level < 1 || (level > t.hero.maxLevel && !t.hero.veteran.on)) return;
    for (const hero of this.state.heroes) {
      hero.level = level;
      hero.xp = Math.max(heroLevelXp(t, level), heroLevelXp(t, level + 1) - 1);
    }
  }

  /** Browser tests only (the worker's e2e `skipTo` control): wave `wave` starts on the next tick (Endless past 30). */
  debugSkipTo(wave: number): void {
    if (!Number.isSafeInteger(wave) || wave < 1 || this.state.phase === 'victory' || this.state.phase === 'defeat') return;
    this.state.wave = wave - 1;
    this.state.nextWaveTick = this.state.tick + 1;
  }

  private get state(): GameState {
    return this.match.state;
  }

  /**
   * Applies queued commands, advances one tick and broadcasts a snapshot; once the match ends, its report and
   * replay (for "Save match report").
   */
  tick(): void {
    for (const cmd of this.queue) matchCommand(this.match, LOCAL_PLAYER_ID, cmd);
    this.queue = [];
    matchStep(this.match);
    this.emit(encodeServerMessage({ t: 'snapshot', snap: snapshot(this.state) }));
    if (matchOver(this.match) && !this.reported) {
      this.reported = true;
      const report = matchReport(this.match);
      this.emit(encodeServerMessage({ t: 'report', report, replay: matchReplay(this.match) }));
    }
  }
}
