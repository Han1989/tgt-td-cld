// HTTP server (/health) + WebSocket rooms on one port, with a fixed-rate
// tick loop, per-connection hardening and graceful draining.

import { randomInt } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { performance } from 'node:perf_hooks';
import {
  decodeClientMessage,
  encodeServerMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from '@tdt/protocol';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { ServerConfig } from './config';
import { TokenBucket } from './rateLimit';
import { CLOSE_SERVICE_RESTART, Room, type Member } from './room';
import { generateRoomCode, shardOf } from './roomCode';
import { RollingAverage } from './stats';

/** WebSocket close code 1008: policy violation. */
const CLOSE_POLICY = 1008;
/** Application close code: the client speaks another PROTOCOL_VERSION. */
export const CLOSE_VERSION_MISMATCH = 4001;

export interface HealthReport {
  status: 'ok' | 'draining';
  shard: string;
  uptimeSec: number;
  rooms: number;
  roomsPlaying: number;
  players: number;
  connections: number;
  /** Average wall time of one server tick (all rooms), over the last ~5 s. */
  avgTickMs: number;
  maxTickMs: number;
  /** Average wall time to tick one playing room. */
  avgRoomTickMs: number;
  /** Uncompressed payload sent per second, all clients. */
  bytesOutPerSec: number;
  tickMs: number;
}

export interface GameServer {
  readonly config: ServerConfig;
  readonly rooms: Map<string, Room>;
  /** Starts listening; resolves with the bound port (use port 0 for a random one). */
  listen(port?: number): Promise<number>;
  health(): HealthReport;
  /** Graceful shutdown: notify everyone, let running matches finish (up to the grace period), then close. */
  drain(log?: (msg: string) => void): Promise<void>;
  /** Immediate shutdown (tests). */
  close(): Promise<void>;
}

interface Conn {
  ws: WebSocket;
  bucket: TokenBucket;
  violations: number;
  room: Room | null;
  member: Member | null;
  alive: boolean;
}

export function createGameServer(config: ServerConfig): GameServer {
  const startedAt = performance.now();
  const rooms = new Map<string, Room>();
  const conns = new Set<Conn>();
  const tickTime = new RollingAverage(Math.max(1, Math.round(5000 / Math.max(1, config.tickMs))));
  const bytesWindow: { t: number; bytes: number }[] = [];
  let draining = false;
  let drainDeadline = 0;
  let stopped = false;
  let tickTimer: NodeJS.Timeout | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const httpServer: Server = createServer((req, res) => handleHttp(req, res));
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: config.maxPayloadBytes,
    perMessageDeflate: config.compression
      ? { threshold: 256, zlibDeflateOptions: { level: 1 }, serverMaxWindowBits: 13, concurrencyLimit: 10 }
      : false,
  });

  httpServer.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const reject = (status: string) => {
      socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
    };
    if (draining) return reject('503 Service Unavailable');
    if (!config.isOriginAllowed(req.headers.origin)) return reject('403 Forbidden');
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws));
  });

  function handleHttp(req: IncomingMessage, res: ServerResponse): void {
    const path = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && (path === '/health' || path === '/healthz')) {
      const body = JSON.stringify(health());
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(body);
      return;
    }
    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Tower Defense Together game server. See /health.\n');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found\n');
  }

  // ---------------------------------------------------------------------------
  // Connections
  // ---------------------------------------------------------------------------

  function onConnection(ws: WebSocket): void {
    const conn: Conn = {
      ws,
      bucket: new TokenBucket(config.rateLimit.perSecond, config.rateLimit.burst, performance.now()),
      violations: 0,
      room: null,
      member: null,
      alive: true,
    };
    conns.add(conn);
    ws.on('pong', () => (conn.alive = true));
    ws.on('message', (data: RawData, isBinary: boolean) => onMessage(conn, data, isBinary));
    ws.on('close', () => {
      conns.delete(conn);
      if (conn.room && conn.member && conn.member.socket === socketOf(conn)) {
        conn.room.disconnect(conn.member, performance.now());
      }
    });
    ws.on('error', () => ws.terminate());
    // First message on every connection, so an outdated client can tell the player to refresh.
    send(conn, { t: 'hello', v: PROTOCOL_VERSION });
  }

  // One adapter per connection so the room can compare identities.
  const adapters = new WeakMap<Conn, { send(d: string): void; close(c: number, r: string): void }>();
  function socketOf(conn: Conn) {
    let a = adapters.get(conn);
    if (!a) {
      a = {
        send: (d) => {
          if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(d);
        },
        close: (c, r) => conn.ws.close(c, r),
      };
      adapters.set(conn, a);
    }
    return a;
  }

  function send(conn: Conn, msg: ServerMessage): void {
    socketOf(conn).send(encodeServerMessage(msg));
  }

  function violation(conn: Conn): void {
    conn.violations++;
    if (conn.violations > config.maxViolations) conn.ws.close(CLOSE_POLICY, 'Too many invalid or rate-limited messages');
  }

  function onMessage(conn: Conn, data: RawData, isBinary: boolean): void {
    const now = performance.now();
    if (!conn.bucket.take(now)) {
      violation(conn);
      if (conn.violations % 10 === 1) send(conn, { t: 'error', code: 'rate_limited', message: 'Slow down' });
      return;
    }
    if (isBinary) return violation(conn);
    const msg = decodeClientMessage(data.toString());
    if (!msg) return violation(conn);

    if (conn.room && conn.member) {
      conn.room.handle(conn.member, msg, now);
      if (conn.member.left) {
        conn.room = null;
        conn.member = null;
      }
      return;
    }
    handleEntry(conn, msg, now);
  }

  function entryError(conn: Conn, code: ErrorCode, message: string): void {
    send(conn, { t: 'error', code, message });
  }

  /** Messages from a connection that is not in a room yet: create, join, rejoin. */
  function handleEntry(conn: Conn, msg: ClientMessage, now: number): void {
    if (msg.t !== 'create' && msg.t !== 'join' && msg.t !== 'rejoin') {
      return entryError(conn, 'bad_request', 'Create or join a room first');
    }
    if (msg.v !== PROTOCOL_VERSION) {
      entryError(conn, 'version_mismatch', 'New version available — refresh');
      conn.ws.close(CLOSE_VERSION_MISMATCH, 'Protocol version mismatch');
      return;
    }
    if (draining) return entryError(conn, 'server_draining', 'The server is restarting; try again in a moment');

    if (msg.t === 'create') {
      if (rooms.size >= config.maxRooms) return entryError(conn, 'server_full', 'The server is full; try again later');
      const code = generateRoomCode(config.shard, (c) => rooms.has(c), () => randomInt(0, 1 << 30) / (1 << 30));
      const room = new Room(code, config, () => randomInt(0, 2 ** 31 - 1), now);
      rooms.set(code, room);
      enter(conn, room, room.join(msg.name, msg.hero, socketOf(conn)));
      return;
    }

    const room = rooms.get(msg.code);
    if (!room) {
      if (shardOf(msg.code) !== config.shard) {
        return entryError(conn, 'wrong_server', 'That room is hosted on another server');
      }
      return entryError(conn, 'room_not_found', 'No room with that code');
    }
    enter(conn, room, msg.t === 'join' ? room.join(msg.name, msg.hero, socketOf(conn)) : room.rejoin(msg.token, socketOf(conn)));
  }

  function enter(conn: Conn, room: Room, result: Member | ErrorCode): void {
    if (typeof result === 'string') {
      const messages: Partial<Record<ErrorCode, string>> = {
        match_in_progress: 'That match has already started',
        room_full: 'That room is full',
        rejoin_failed: 'Your seat in that room is no longer available',
      };
      return entryError(conn, result, messages[result] ?? 'Could not join');
    }
    conn.room = room;
    conn.member = result;
  }

  // ---------------------------------------------------------------------------
  // Tick loop
  // ---------------------------------------------------------------------------

  function tickAll(): void {
    const now = performance.now();
    const t0 = now;
    for (const [code, room] of rooms) {
      room.tick(now, () => performance.now());
      const finishedWhileDraining = draining && (room.phase !== 'playing' || room.matchOver);
      if (room.activeMembers.length === 0 || room.isAbandoned(now) || finishedWhileDraining) {
        room.closeAll(CLOSE_SERVICE_RESTART, draining ? 'Server restarting' : 'Room closed');
        rooms.delete(code);
      }
    }
    const elapsed = performance.now() - t0;
    tickTime.add(elapsed);
    let bytes = 0;
    for (const room of rooms.values()) {
      bytes += room.bytesOut;
      room.bytesOut = 0;
    }
    bytesWindow.push({ t: now, bytes });
    while (bytesWindow.length > 0 && now - bytesWindow[0]!.t > 5000) bytesWindow.shift();
  }

  function startLoops(): void {
    let next = performance.now() + config.tickMs;
    const loop = () => {
      if (stopped) return;
      const now = performance.now();
      if (now >= next) {
        tickAll();
        next += config.tickMs;
        // After a long stall, don't try to catch up (that would spiral).
        if (now - next > 250) next = now + config.tickMs;
      }
      tickTimer = setTimeout(loop, Math.max(0, next - performance.now()));
    };
    tickTimer = setTimeout(loop, config.tickMs);

    heartbeatTimer = setInterval(() => {
      for (const conn of conns) {
        if (!conn.alive) {
          conn.ws.terminate();
          continue;
        }
        conn.alive = false;
        conn.ws.ping();
      }
    }, config.heartbeatMs);
  }

  function health(): HealthReport {
    const playing = [...rooms.values()].filter((r) => r.phase === 'playing');
    const roomTicks = playing.map((r) => r.tickTime.average).filter((v) => v > 0);
    const windowBytes = bytesWindow.reduce((s, b) => s + b.bytes, 0);
    const windowSec = bytesWindow.length > 1 ? (bytesWindow.at(-1)!.t - bytesWindow[0]!.t) / 1000 : 0;
    const round = (v: number) => Math.round(v * 1000) / 1000;
    return {
      status: draining ? 'draining' : 'ok',
      shard: config.shard,
      uptimeSec: Math.round((performance.now() - startedAt) / 1000),
      rooms: rooms.size,
      roomsPlaying: playing.length,
      players: [...rooms.values()].reduce((n, r) => n + r.connectedCount, 0),
      connections: conns.size,
      avgTickMs: round(tickTime.average),
      maxTickMs: round(tickTime.max),
      avgRoomTickMs: round(roomTicks.length ? roomTicks.reduce((a, b) => a + b, 0) / roomTicks.length : 0),
      bytesOutPerSec: windowSec > 0 ? Math.round(windowBytes / windowSec) : 0,
      tickMs: config.tickMs,
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  function shutdownNow(): Promise<void> {
    stopped = true;
    if (tickTimer) clearTimeout(tickTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    for (const room of rooms.values()) room.closeAll(CLOSE_SERVICE_RESTART, 'Server restarting');
    rooms.clear();
    for (const conn of conns) conn.ws.close(CLOSE_SERVICE_RESTART, 'Server restarting');
    return new Promise((resolve) => {
      // Give close frames a moment to flush, then drop whatever is left.
      setTimeout(() => {
        for (const conn of conns) conn.ws.terminate();
        wss.close();
        httpServer.close(() => resolve());
        httpServer.closeAllConnections();
      }, 250);
    });
  }

  return {
    config,
    rooms,
    listen(port = config.port) {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, () => {
          startLoops();
          resolve((httpServer.address() as AddressInfo).port);
        });
      });
    },
    health,
    drain(log = () => {}) {
      if (draining) return Promise.resolve();
      draining = true;
      drainDeadline = performance.now() + config.shutdownGraceMs;
      const playing = [...rooms.values()].filter((r) => r.phase === 'playing' && !r.matchOver).length;
      log(`Draining: ${rooms.size} rooms (${playing} mid-match), up to ${Math.round(config.shutdownGraceMs / 1000)} s`);
      for (const room of rooms.values()) {
        const midMatch = room.phase === 'playing' && !room.matchOver;
        const closesInMs = midMatch ? config.shutdownGraceMs : 0;
        room.broadcast(
          encodeServerMessage({
            t: 'notice',
            kind: 'server_restarting',
            message: midMatch
              ? 'The server is restarting. You can finish this match if it ends in time.'
              : 'The server is restarting. Please create a new room in a moment.',
            closesInMs,
          }),
        );
      }
      for (const conn of conns) {
        if (!conn.room) conn.ws.close(CLOSE_SERVICE_RESTART, 'Server restarting');
      }
      return new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (rooms.size === 0 || performance.now() >= drainDeadline) {
            clearInterval(check);
            log(rooms.size === 0 ? 'All rooms finished; closing' : `Grace period over; closing ${rooms.size} rooms`);
            void shutdownNow().then(resolve);
          }
        }, 100);
      });
    },
    close: shutdownNow,
  };
}
