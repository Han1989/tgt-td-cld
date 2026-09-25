import type { ClientMessage, ServerMessage } from '@tdt/protocol';

/**
 * How the client talks to whoever runs the simulation. Phase 1 uses
 * LocalTransport (sim in a Web Worker); Phase 2 adds a NetworkTransport with
 * the same interface, so game code does not change.
 */
export interface Transport {
  send(msg: ClientMessage): void;
  onMessage(handler: (msg: ServerMessage) => void): void;
  close(): void;
}
