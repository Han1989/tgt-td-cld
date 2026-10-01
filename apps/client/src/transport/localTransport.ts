import { decodeServerMessage, encodeClientMessage, type ClientMessage, type Modifier, type ServerMessage } from '@tdt/protocol';
import { SOLO_INTERP_DELAY_MS } from '../snapshotBuffer';
import type { Transport } from './transport';

/** Runs the simulation in a Web Worker and exchanges encoded protocol messages with it. */
export class LocalTransport implements Transport {
  private readonly worker: Worker;
  private handlers: ((msg: ServerMessage) => void)[] = [];
  /** No network: the view renders just behind the newest tick. */
  readonly interpDelayMs = SOLO_INTERP_DELAY_MS;

  constructor() {
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<unknown>) => {
      const msg = decodeServerMessage(e.data);
      if (!msg) return;
      for (const h of this.handlers) h(msg);
    };
    if (import.meta.env.MODE === 'e2e') {
      const q = new URLSearchParams(location.search);
      if (q.has('lab')) this.worker.postMessage({ ctl: 'lab', auras: q.has('auras') });
    }
  }

  send(msg: ClientMessage): void {
    this.worker.postMessage(encodeClientMessage(msg));
  }

  /** Solo pick: pin the seed and modifiers before the match-starting hero / mode / difficulty messages. */
  setDeal(seed: number, modifiers: readonly Modifier[]): void {
    this.worker.postMessage({ ctl: 'deal', seed, modifiers });
  }

  debug(ctl: 'lose'): void {
    if (import.meta.env.MODE === 'e2e') this.worker.postMessage({ ctl });
  }

  setPaused(paused: boolean): void {
    this.worker.postMessage({ ctl: 'pause', paused });
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
