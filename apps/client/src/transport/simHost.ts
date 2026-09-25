// Runs the authoritative simulation for local play. It speaks the same
// encoded protocol as the future game server: it receives raw client
// messages and emits raw server messages.

import {
  decodeClientMessage,
  encodeServerMessage,
  type Command,
  type HeroKind,
  type PlayerId,
} from '@tdt/protocol';
import { applyCommand, createGame, snapshot, step, type GameState } from '@tdt/sim';

export const LOCAL_PLAYER_ID: PlayerId = 'local';

export class SimHost {
  private state!: GameState;
  private queue: Command[] = [];
  private hero: HeroKind = 'ranger';

  constructor(
    private readonly emit: (raw: string) => void,
    private readonly nextSeed: () => number,
  ) {
    this.reset();
  }

  /** Starts a fresh match and tells the client who it is. */
  reset(): void {
    this.state = createGame({ players: [{ id: LOCAL_PLAYER_ID, name: 'You', hero: this.hero }] }, this.nextSeed());
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
    } else if (msg.t === 'hero') {
      // Solo hero pick: starts a new match with that hero, unless waves are already running.
      if (this.state.phase !== 'waves') {
        this.hero = msg.hero;
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
