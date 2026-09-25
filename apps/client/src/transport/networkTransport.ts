// WebSocket connection to the game server. Rebuilds full snapshots from
// keyframes + deltas, and reconnects to the same seat (with the room token)
// if the connection drops, for up to the server's 60 s reconnect window.
// If the server speaks another PROTOCOL_VERSION it closes for good with the
// status detail 'version_mismatch' (the page must be reloaded).

import {
  applySnapshotDelta,
  decodeServerMessage,
  encodeClientMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
  type Snapshot,
} from '@tdt/protocol';
import type { Transport } from './transport';

export type NetStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** `closed` status detail when client and server protocol versions differ. */
export const VERSION_MISMATCH = 'version_mismatch';

export interface RoomSession {
  url: string;
  code: string;
  token: string;
}

/** The server keeps a dropped seat this long. */
const RECONNECT_WINDOW_MS = 60_000;
const SESSION_KEY = 'tdt.session';

/** Remembers the current room per browser tab, so a reload can rejoin. */
export const sessionStore = {
  load(): RoomSession | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as RoomSession) : null;
    } catch {
      return null;
    }
  },
  save(session: RoomSession): void {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Storage may be unavailable (private mode); reconnects still work in this page.
    }
  },
  clear(): void {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  },
};

export class NetworkTransport implements Transport {
  status: NetStatus = 'connecting';
  session: RoomSession | null = null;

  private ws: WebSocket | null = null;
  private handlers: ((msg: ServerMessage) => void)[] = [];
  private statusHandlers: ((status: NetStatus, detail?: string) => void)[] = [];
  private snap: Snapshot | null = null;
  private closedByUs = false;
  /** Set when the server announced a restart: the room will not exist afterwards. */
  private serverRestarting = false;
  private droppedAt = 0;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly url: string,
    first: ClientMessage,
  ) {
    this.open(first);
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeClientMessage(msg));
  }

  onMessage(handler: (msg: ServerMessage) => void): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  onStatus(handler: (status: NetStatus, detail?: string) => void): void {
    this.statusHandlers.push(handler);
  }

  /** Leaves the room for good and closes the connection. */
  close(): void {
    this.send({ t: 'leave' });
    sessionStore.clear();
    this.dispose();
    this.setStatus('closed', 'left');
  }

  /** Closes the socket without leaving the room and stops reconnecting. */
  dispose(): void {
    this.closedByUs = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close(1000, 'Closed');
    this.handlers = [];
  }

  private setStatus(status: NetStatus, detail?: string): void {
    this.status = status;
    for (const h of this.statusHandlers) h(status, detail);
  }

  private open(first: ClientMessage): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.setStatus('closed', 'Invalid server URL');
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      ws.send(encodeClientMessage(first));
    };
    ws.onmessage = (e: MessageEvent<unknown>) => this.onRaw(e.data);
    ws.onclose = (e) => this.onClose(e);
  }

  private onRaw(data: unknown): void {
    const msg = decodeServerMessage(data);
    if (!msg) return;
    switch (msg.t) {
      case 'hello':
        if (msg.v !== PROTOCOL_VERSION) return this.versionMismatch();
        break;
      case 'welcome':
        if (msg.room) {
          this.session = { url: this.url, code: msg.room.code, token: msg.room.token };
          sessionStore.save(this.session);
        }
        this.setStatus('open');
        break;
      case 'snapshot':
        this.snap = msg.snap;
        break;
      case 'delta': {
        // Deltas apply to the previous snapshot; if we are out of step, wait for the next keyframe.
        const next = this.snap ? applySnapshotDelta(this.snap, msg.delta) : null;
        if (!next) return;
        this.snap = next;
        this.emit({ t: 'snapshot', snap: next });
        return;
      }
      case 'lobby':
        if (msg.lobby.phase === 'lobby') this.snap = null;
        break;
      case 'notice':
        this.serverRestarting = true;
        break;
      case 'error':
        if (msg.code === 'version_mismatch') {
          this.emit(msg);
          return this.versionMismatch();
        }
        if (msg.code === 'rejoin_failed' || msg.code === 'room_not_found' || msg.code === 'wrong_server') {
          if (this.session) sessionStore.clear();
          this.session = null;
        }
        break;
    }
    this.emit(msg);
  }

  /** Client and server disagree on the protocol: stop for good; only a reload helps. */
  private versionMismatch(): void {
    if (this.closedByUs) return;
    sessionStore.clear();
    this.session = null;
    this.dispose();
    this.setStatus('closed', VERSION_MISMATCH);
  }

  private emit(msg: ServerMessage): void {
    for (const h of this.handlers) h(msg);
  }

  private onClose(e: CloseEvent): void {
    if (this.closedByUs) return;
    const now = performance.now();
    const canRetry = this.session !== null && !this.serverRestarting && e.code !== 1008;
    if (!canRetry) {
      if (this.serverRestarting) sessionStore.clear();
      this.setStatus('closed', this.serverRestarting ? 'server_restarting' : e.reason || `code ${e.code}`);
      return;
    }
    if (this.status !== 'reconnecting') this.droppedAt = now;
    if (now - this.droppedAt > RECONNECT_WINDOW_MS) {
      sessionStore.clear();
      this.setStatus('closed', 'Could not reconnect');
      return;
    }
    this.setStatus('reconnecting');
    const delay = Math.min(8000, 500 * 2 ** this.attempt++);
    const session = this.session!;
    this.retryTimer = setTimeout(() => this.open({ t: 'rejoin', v: PROTOCOL_VERSION, code: session.code, token: session.token }), delay);
  }
}
