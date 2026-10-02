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
  type Difficulty,
  type GameMode,
  type HeroKind,
  type Modifier,
  type PlayerId,
  type SocialClock,
} from '@tdt/protocol';
import {
  createMatch,
  createPracticeAlly,
  matchCommand,
  matchOver,
  matchReplay,
  matchReport,
  matchStep,
  meteorRainPartner,
  normalizeModifiers,
  snapshot,
  type Bot,
  type GameState,
  type Match,
  type Tuning,
} from '@tdt/sim';

export const LOCAL_PLAYER_ID: PlayerId = 'local';
const PRACTICE_ALLY_ID: PlayerId = 'practice-ally';

export class SimHost {
  private match!: Match;
  /** The report of the finished match has been sent. */
  private reported = false;
  private queue: Command[] = [];
  private hero: HeroKind = 'ranger';
  private mode: GameMode = 'full';
  private difficulty: Difficulty = 'normal';
  /** Modifiers for the next match. Empty is none. */
  private modifiers: Modifier[] = [];
  /**
   * Seed chosen on the solo pick, so the lobby draw and the match are the same.
   * Cleared on "Play again", which takes a fresh seed and keeps the chosen modifiers.
   */
  private pinnedSeed: number | null = null;
  /** Solo Meteor Rain practice: the next match adds an ally that answers R. */
  private practice = false;
  private ally: Bot | null = null;
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
    const partner = this.practice ? meteorRainPartner(this.hero) : null;
    this.ally = partner ? createPracticeAlly(PRACTICE_ALLY_ID, LOCAL_PLAYER_ID) : null;
    this.match = createMatch(
      {
        players: [{ id: LOCAL_PLAYER_ID, name: 'You', hero: this.hero }],
        mode: this.mode,
        difficulty: this.difficulty,
        modifiers: this.modifiers,
        tuning: this.tuning,
        ...(partner ? { practice: { allyId: PRACTICE_ALLY_ID, allyHero: partner, allyName: 'Ally' } } : {}),
      },
      this.pinnedSeed ?? this.nextSeed(),
      normalizeBuild(this.build),
    );
    this.reported = false;
    this.queue = [];
    this.social = freshSocialClock();
    this.emit(encodeServerMessage({ t: 'welcome', playerId: LOCAL_PLAYER_ID }));
    this.emit(encodeServerMessage({ t: 'snapshot', snap: snapshot(this.state) }));
  }

  /** Handles one raw message from the client. Malformed input is ignored. */
  receive(raw: unknown): void {
    const msg = decodeClientMessage(raw);
    if (!msg) return;
    const over = this.state.phase === 'victory' || this.state.phase === 'defeat';
    if (msg.t === 'restart') {
      if (over) {
        this.pinnedSeed = null;
        this.reset();
      }
    } else if (msg.t === 'hero' || msg.t === 'mode' || msg.t === 'difficulty') {
      // Solo hero / mode / difficulty pick: starts a new match with it, unless waves are already running.
      if (this.state.phase !== 'waves') {
        if (msg.t === 'hero') this.hero = msg.hero;
        else if (msg.t === 'mode') this.mode = msg.mode;
        else this.difficulty = msg.difficulty;
        this.reset();
      }
    } else if (msg.t === 'cmd') {
      const cmd = msg.cmd;
      if ((cmd.type === 'ping' || cmd.type === 'emote') && !allowSocial(this.social, cmd.type, performance.now())) return;
      this.queue.push(cmd);
    }
    // Other room and lobby messages only mean something to the online server.
  }

  /**
   * Solo pick: the seed and modifiers the player is looking at. The next `reset` (hero / mode / difficulty)
   * starts the match with them. Online rooms do not use this; the server owns the draw.
   */
  /** Next solo match is Meteor Rain practice when `on` and the hero has a combo partner. */
  setPractice(on: boolean): void {
    this.practice = on;
  }

  setDeal(seed: number, modifiers: readonly string[]): void {
    if (!Number.isSafeInteger(seed) || seed < 0) return;
    this.pinnedSeed = seed;
    this.modifiers = normalizeModifiers(modifiers);
  }

  /** Browser tests only (the worker's e2e `lose` control): the Heart drops to 0, so the match ends next tick. */
  debugLose(): void {
    this.state.heartHp = 0;
  }

  private get state(): GameState {
    return this.match.state;
  }

  /**
   * Applies queued commands, advances one tick and broadcasts a snapshot; once the match ends, its report and
   * replay (for "Save match report").
   */
  tick(): void {
    if (this.ally && this.state.phase !== 'victory' && this.state.phase !== 'defeat') {
      for (const cmd of this.ally.decide(snapshot(this.state))) matchCommand(this.match, PRACTICE_ALLY_ID, cmd);
    }
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
