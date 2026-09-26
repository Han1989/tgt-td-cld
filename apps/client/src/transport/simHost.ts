// Runs the authoritative simulation for local play. It speaks the same
// encoded protocol as the future game server: it receives raw client
// messages and emits raw server messages.

import {
  decodeClientMessage,
  encodeServerMessage,
  type Command,
  type GameMode,
  type HeroKind,
  type PlayerId,
} from '@tdt/protocol';
import { applyCommand, createGame, snapshot, step, type GameState, type Tuning } from '@tdt/sim';

export const LOCAL_PLAYER_ID: PlayerId = 'local';

export class SimHost {
  private state!: GameState;
  private queue: Command[] = [];
  private hero: HeroKind = 'ranger';
  private mode: GameMode = 'full';
  /** Browser tests only: tuning for the next match (see `LocalTransport`'s lab option). */
  tuning: Tuning | undefined;

  constructor(
    private readonly emit: (raw: string) => void,
    private readonly nextSeed: () => number,
  ) {
    this.reset();
  }

  /** Starts a fresh match and tells the client who it is. */
  reset(): void {
    this.state = createGame(
      { players: [{ id: LOCAL_PLAYER_ID, name: 'You', hero: this.hero }], mode: this.mode, tuning: this.tuning },
      this.nextSeed(),
    );
    this.queue = [];
    this.emit(encodeServerMessage({ t: 'welcome', playerId: LOCAL_PLAYER_ID }));
    this.emit(encodeServerMessage({ t: 'snapshot', snap: snapshot(this.state) }));
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
      this.queue.push(msg.cmd);
    }
    // Other room and lobby messages only mean something to the online server.
  }

  /** Applies queued commands, advances one tick and broadcasts a snapshot. */
  tick(): void {
    for (const cmd of this.queue) applyCommand(this.state, LOCAL_PLAYER_ID, cmd);
    this.queue = [];
    step(this.state);
    this.emit(encodeServerMessage({ t: 'snapshot', snap: snapshot(this.state) }));
  }
}
