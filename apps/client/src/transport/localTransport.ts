import { decodeServerMessage, encodeClientMessage, type ClientMessage, type ServerMessage } from '@tdt/protocol';
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
      if (q.has('lab')) this.worker.postMessage({ ctl: 'lab', auras: q.has('auras'), ult: q.has('ult') });
    }
  }

  send(msg: ClientMessage): void {
    this.worker.postMessage(encodeClientMessage(msg));
  }

  debug(ctl: 'lose' | 'win' | 'damageTowers' | 'skipTo' | 'level', wave?: number): void {
    if (import.meta.env.MODE === 'e2e') this.worker.postMessage({ ctl, wave });
  }

  /** The page was hidden (docs/MOBILE.md §7). */
  private hidden = false;
  /** The match's start is held for its first wave's art (V-07d). */
  private held = false;

  setPaused(paused: boolean): void {
    this.hidden = paused;
    this.pause();
  }

  hold(on: boolean): void {
    this.held = on;
    this.pause();
  }

  /** One clock control for both reasons: the simulation runs only while neither holds it. */
  private pause(): void {
    this.worker.postMessage({ ctl: 'pause', paused: this.hidden || this.held });
  }

  /** The Daily run: every match of this worker is the run of the day whose seed this is (a control message). */
  daily(seed: number): void {
    this.worker.postMessage({ ctl: 'daily', seed });
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
