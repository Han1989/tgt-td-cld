import type { ClientMessage, ServerMessage } from '@tdt/protocol';

/**
 * How the client talks to whoever runs the simulation: LocalTransport (sim
 * in a Web Worker) or NetworkTransport (game server). Both deliver complete
 * snapshots as `{ t: 'snapshot' }` messages, so game code doesn't care which.
 */
export interface Transport {
  send(msg: ClientMessage): void;
  /** Subscribes to server messages; returns an unsubscribe function. */
  onMessage(handler: (msg: ServerMessage) => void): () => void;
  close(): void;
  /** A game-server room, not a match in this browser (match analytics say which). */
  readonly online?: boolean;
  /** How far behind the newest snapshot the view renders (ms); INTERP_DELAY_MS when unset. */
  readonly interpDelayMs?: number;
  /** Local play only: stops or restarts the simulation clock (the page was hidden, docs/MOBILE.md §7). */
  setPaused?(paused: boolean): void;
  /**
   * Local play only: holds the simulation clock at the match's start while its first wave's art loads (V-07d), with the
   * same control as `setPaused`; the clock runs only while neither holds it. Held ticks are never stepped, so the
   * match and its replay are the same as one that was never held.
   */
  hold?(on: boolean): void;
  /** The page is visible again: check the connection now instead of waiting for a timer. */
  wake?(): void;
  /**
   * Browser-test builds, local play only: a debug control for the host (`'lose'`: the Heart drops to 0;
   * `'damageTowers'`: every tower drops to 30% of its HP; `'skipTo'`: wave `wave` starts on the next tick; `'level'`:
   * your hero is at level `wave`, one XP short of the next, past 10 in Endless).
   */
  debug?(ctl: 'lose' | 'damageTowers' | 'skipTo' | 'level', wave?: number): void;
}
