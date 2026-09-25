import { decodeServerMessage, encodeClientMessage, type ClientMessage, type ServerMessage } from '@tdt/protocol';
import type { Transport } from './transport';

/** Runs the simulation in a Web Worker and exchanges encoded protocol messages with it. */
export class LocalTransport implements Transport {
  private readonly worker: Worker;
  private handlers: ((msg: ServerMessage) => void)[] = [];

  constructor() {
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<unknown>) => {
      const msg = decodeServerMessage(e.data);
      if (!msg) return;
      for (const h of this.handlers) h(msg);
    };
  }

  send(msg: ClientMessage): void {
    this.worker.postMessage(encodeClientMessage(msg));
  }

  onMessage(handler: (msg: ServerMessage) => void): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  close(): void {
    this.worker.terminate();
    this.handlers = [];
  }
}
