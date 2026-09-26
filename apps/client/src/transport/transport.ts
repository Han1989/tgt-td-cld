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
  /** Local play only: stops or restarts the simulation clock (the page was hidden, docs/MOBILE.md §7). */
  setPaused?(paused: boolean): void;
  /** The page is visible again: check the connection now instead of waiting for a timer. */
  wake?(): void;
}
