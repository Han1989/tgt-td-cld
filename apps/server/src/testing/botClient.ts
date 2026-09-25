// A scripted player that talks to the server over a real WebSocket, exactly
// like a browser: it rebuilds snapshots from keyframes + deltas and feeds
// them to a sim bot, which answers with commands. Used by the integration
// test and the load test; not part of the server bundle.

import {
  applySnapshotDelta,
  decodeServerMessage,
  encodeClientMessage,
  type ClientMessage,
  type LobbyState,
  type PlayerId,
  type ServerMessage,
  type Snapshot,
} from '@tdt/protocol';
import { createBalanceBot, type Bot } from '@tdt/sim';
import WebSocket from 'ws';

export interface BotClientOptions {
  url: string;
  origin: string;
  name: string;
  /** Balance-bot guard spot. */
  index?: number;
  /** Decide every N snapshots (default 5 = 4 decisions/s at 20 Hz). */
  decideEvery?: number;
  /** Extra behaviour hook, e.g. calling waves early in load tests. */
  onSnapshot?: (client: BotClient, snap: Snapshot) => void;
}

export class BotClient {
  readonly ws: WebSocket;
  playerId: PlayerId | null = null;
  code: string | null = null;
  token: string | null = null;
  lobby: LobbyState | null = null;
  snap: Snapshot | null = null;
  errors: ServerMessage[] = [];
  notices: ServerMessage[] = [];
  closed: { code: number; reason: string } | null = null;
  snapshotsReceived = 0;
  bytesReceived = 0;
  /** Deltas that did not match our snapshot (should stay 0). */
  deltaMismatches = 0;
  /** When false the bot keeps its state in sync but issues no commands. */
  acting = true;

  private bot: Bot | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly opened: Promise<void>;

  constructor(private readonly opts: BotClientOptions) {
    this.ws = new WebSocket(opts.url, { origin: opts.origin });
    this.opened = new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
      this.ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    });
    this.ws.on('message', (data) => this.onMessage(data.toString()));
    this.ws.on('close', (code, reason) => {
      this.closed = { code, reason: reason.toString() };
      this.notify();
    });
    this.ws.on('error', () => {});
  }

  open(): Promise<void> {
    return this.opened;
  }

  send(msg: ClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(encodeClientMessage(msg));
  }

  async create(): Promise<string> {
    await this.open();
    this.send({ t: 'create', name: this.opts.name, hero: 'ranger' });
    await this.waitFor(() => this.code !== null || this.errors.length > 0);
    if (!this.code) throw new Error(`create failed: ${JSON.stringify(this.errors)}`);
    return this.code;
  }

  async join(code: string): Promise<void> {
    await this.open();
    this.send({ t: 'join', code, name: this.opts.name, hero: 'ranger' });
    await this.waitFor(() => this.playerId !== null || this.errors.length > 0);
    if (!this.playerId) throw new Error(`join failed: ${JSON.stringify(this.errors)}`);
  }

  get isHost(): boolean {
    return this.lobby?.hostId === this.playerId;
  }

  close(): void {
    this.ws.close();
  }

  /** Resolves when `predicate` holds (checked after every message). */
  waitFor(predicate: () => boolean, timeoutMs = 30_000): Promise<void> {
    if (predicate()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(new Error(`Timed out waiting (${this.opts.name})`));
      }, timeoutMs);
      const check = () => {
        if (!predicate()) return;
        clearTimeout(timer);
        this.listeners.delete(check);
        resolve();
      };
      this.listeners.add(check);
    });
  }

  private notify(): void {
    for (const l of [...this.listeners]) l();
  }

  private onMessage(raw: string): void {
    this.bytesReceived += raw.length;
    const msg = decodeServerMessage(raw);
    if (!msg) return;
    switch (msg.t) {
      case 'welcome':
        this.playerId = msg.playerId;
        if (msg.room) {
          this.code = msg.room.code;
          this.token = msg.room.token;
        }
        this.bot = createBalanceBot(msg.playerId, undefined, this.opts.index ?? 0);
        break;
      case 'lobby':
        this.lobby = msg.lobby;
        if (msg.lobby.phase === 'lobby') this.snap = null;
        break;
      case 'snapshot':
        this.onSnapshot(msg.snap);
        break;
      case 'delta': {
        if (!this.snap) break;
        const next = applySnapshotDelta(this.snap, msg.delta);
        if (!next) {
          this.deltaMismatches++;
          break;
        }
        this.onSnapshot(next);
        break;
      }
      case 'error':
        this.errors.push(msg);
        break;
      case 'notice':
        this.notices.push(msg);
        break;
    }
    this.notify();
  }

  private onSnapshot(snap: Snapshot): void {
    this.snap = snap;
    this.snapshotsReceived++;
    this.opts.onSnapshot?.(this, snap);
    if (!this.acting || !this.bot || snap.tick % (this.opts.decideEvery ?? 5) !== 0) return;
    for (const cmd of this.bot.decide(snap)) this.send({ t: 'cmd', cmd });
  }
}
