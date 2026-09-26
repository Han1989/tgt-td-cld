// One room: a lobby (nickname, hero, ready) and, once the host starts, an
// authoritative match. The room owns the only real simulation; clients only
// send commands and receive snapshots.

import { randomBytes } from 'node:crypto';
import {
  diffSnapshot,
  encodeServerMessage,
  MAX_PLAYERS,
  type ClientMessage,
  type Command,
  type ErrorCode,
  type HeroKind,
  type LobbyState,
  type PlayerId,
  type ServerMessage,
  type Snapshot,
} from '@tdt/protocol';
import { applyCommand, createGame, setPlayerConnected, setPlayerLeft, snapshot, step, type GameState } from '@tdt/sim';
import type { ServerConfig } from './config';
import { RollingAverage } from './stats';

/** The part of a WebSocket a room needs; lets tests use fakes. */
export interface ClientSocket {
  send(data: string): void;
  close(code: number, reason: string): void;
}

export interface Member {
  id: PlayerId;
  name: string;
  hero: HeroKind;
  ready: boolean;
  /** Secret for reconnecting to this seat. */
  token: string;
  socket: ClientSocket | null;
  disconnectedAt: number | null;
  /** Gone for good: left explicitly or missed the reconnect window. */
  left: boolean;
  /** Next broadcast must be a full snapshot (just joined or reconnected). */
  needsKeyframe: boolean;
}

/** WebSocket close code 1012: "service restart". */
export const CLOSE_SERVICE_RESTART = 1012;
export const CLOSE_NORMAL = 1000;

export class Room {
  readonly members: Member[] = [];
  hostId: PlayerId = '';
  phase: 'lobby' | 'playing' = 'lobby';
  state: GameState | null = null;
  /** The last snapshot sent to clients. */
  lastSnap: Snapshot | null = null;
  /** Test hook: a paused room neither steps nor broadcasts. */
  paused = false;
  readonly tickTime = new RollingAverage(100);
  /** Uncompressed payload bytes sent, for /health. */
  bytesOut = 0;

  private queue: { playerId: PlayerId; cmd: Command }[] = [];
  private emptySince: number | null;

  constructor(
    readonly code: string,
    private readonly config: ServerConfig,
    private readonly newSeed: () => number,
    now: number,
  ) {
    this.emptySince = now;
  }

  get activeMembers(): Member[] {
    return this.members.filter((m) => !m.left);
  }

  get connectedCount(): number {
    return this.members.filter((m) => m.socket !== null).length;
  }

  get matchOver(): boolean {
    return this.state !== null && (this.state.phase === 'victory' || this.state.phase === 'defeat');
  }

  // -------------------------------------------------------------------------
  // Membership
  // -------------------------------------------------------------------------

  join(name: string, hero: HeroKind, socket: ClientSocket): Member | ErrorCode {
    if (this.phase === 'playing') return 'match_in_progress';
    if (this.activeMembers.length >= MAX_PLAYERS) return 'room_full';
    let slot = 1;
    while (this.activeMembers.some((m) => m.id === `p${slot}`)) slot++;
    const member: Member = {
      id: `p${slot}`,
      name,
      hero,
      ready: false,
      token: randomBytes(16).toString('hex'),
      socket,
      disconnectedAt: null,
      left: false,
      needsKeyframe: true,
    };
    this.members.push(member);
    this.emptySince = null;
    if (!this.hostId || !this.isActive(this.hostId)) this.hostId = member.id;
    this.sendTo(member, { t: 'welcome', playerId: member.id, room: { code: this.code, token: member.token } });
    this.broadcastLobby();
    return member;
  }

  rejoin(token: string, socket: ClientSocket): Member | ErrorCode {
    const member = this.members.find((m) => m.token === token && !m.left);
    if (!member) return 'rejoin_failed';
    member.socket?.close(CLOSE_NORMAL, 'Replaced by a new connection');
    member.socket = socket;
    member.disconnectedAt = null;
    member.needsKeyframe = true;
    this.emptySince = null;
    if (this.state) setPlayerConnected(this.state, member.id, true);
    this.sendTo(member, { t: 'welcome', playerId: member.id, room: { code: this.code, token: member.token } });
    this.broadcastLobby();
    if (this.phase === 'playing' && this.lastSnap) {
      this.sendTo(member, { t: 'snapshot', snap: this.lastSnap });
      member.needsKeyframe = false;
    }
    return member;
  }

  /** The member's connection dropped; their seat is kept for the reconnect window. */
  disconnect(member: Member, now: number): void {
    if (member.socket === null) return;
    member.socket = null;
    member.disconnectedAt = now;
    member.ready = false;
    if (this.state) setPlayerConnected(this.state, member.id, false);
    if (this.connectedCount === 0) this.emptySince = now;
    this.migrateHost();
    this.broadcastLobby();
  }

  /**
   * The member is gone for good. If a match is running their towers keep firing and stay theirs, and
   * their pads open to every teammate.
   */
  leave(member: Member, now: number): void {
    if (member.left) return;
    const socket = member.socket;
    member.socket = null;
    member.left = true;
    member.disconnectedAt ??= now;
    if (this.state) setPlayerLeft(this.state, member.id);
    if (this.phase === 'lobby') this.members.splice(this.members.indexOf(member), 1);
    socket?.close(CLOSE_NORMAL, 'Left the room');
    if (this.connectedCount === 0) this.emptySince ??= now;
    this.migrateHost();
    this.broadcastLobby();
  }

  private isActive(id: PlayerId): boolean {
    return this.activeMembers.some((m) => m.id === id);
  }

  /** Hands the host role to the first connected member if the host is away. */
  private migrateHost(): void {
    const host = this.members.find((m) => m.id === this.hostId);
    if (host && host.socket && !host.left) return;
    const next = this.members.find((m) => m.socket && !m.left);
    if (next) this.hostId = next.id;
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  handle(member: Member, msg: ClientMessage, now: number): void {
    switch (msg.t) {
      case 'hero':
        if (this.phase !== 'lobby') return this.error(member, 'bad_request', 'Heroes are locked once the match starts');
        member.hero = msg.hero;
        this.broadcastLobby();
        return;
      case 'ready':
        if (this.phase !== 'lobby') return;
        member.ready = msg.ready;
        this.broadcastLobby();
        return;
      case 'start': {
        if (member.id !== this.hostId) return this.error(member, 'not_host', 'Only the host can start the match');
        if (this.phase !== 'lobby') return;
        const waiting = this.activeMembers.filter((m) => m.id !== this.hostId && (!m.ready || !m.socket));
        if (waiting.length > 0) {
          return this.error(member, 'not_ready', `Waiting for ${waiting.map((m) => m.name).join(', ')}`);
        }
        this.startMatch();
        return;
      }
      case 'cmd':
        if (this.phase === 'playing' && this.state && !this.matchOver) this.queue.push({ playerId: member.id, cmd: msg.cmd });
        return;
      case 'restart':
        if (member.id !== this.hostId) return this.error(member, 'not_host', 'Only the host can return to the lobby');
        if (this.phase === 'playing' && this.matchOver) this.backToLobby();
        return;
      case 'leave':
        this.leave(member, now);
        return;
      case 'create':
      case 'join':
      case 'rejoin':
        return this.error(member, 'bad_request', 'Already in a room');
    }
  }

  private startMatch(): void {
    const players = this.activeMembers.map((m) => ({ id: m.id, name: m.name, hero: m.hero }));
    this.state = createGame({ players }, this.newSeed());
    this.phase = 'playing';
    this.queue = [];
    this.lastSnap = snapshot(this.state);
    this.broadcastLobby();
    this.broadcast(encodeServerMessage({ t: 'snapshot', snap: this.lastSnap }));
    for (const m of this.members) m.needsKeyframe = false;
  }

  private backToLobby(): void {
    this.phase = 'lobby';
    this.state = null;
    this.lastSnap = null;
    this.queue = [];
    for (let i = this.members.length - 1; i >= 0; i--) {
      const m = this.members[i]!;
      if (m.left) this.members.splice(i, 1);
      else m.ready = false;
    }
    this.migrateHost();
    this.broadcastLobby();
  }

  // -------------------------------------------------------------------------
  // Tick
  // -------------------------------------------------------------------------

  /** Called at the server tick rate. Returns true if the sim advanced. */
  tick(now: number, measure: () => number): boolean {
    for (const m of this.members) {
      if (!m.left && m.socket === null && m.disconnectedAt !== null && now - m.disconnectedAt >= this.config.reconnectWindowMs) {
        this.leave(m, now);
      }
    }
    const state = this.state;
    if (this.phase !== 'playing' || !state || this.paused) return false;
    if (this.matchOver && this.lastSnap && this.lastSnap.phase === state.phase) return false;

    const t0 = measure();
    for (const { playerId, cmd } of this.queue) applyCommand(state, playerId, cmd);
    this.queue = [];
    step(state);
    const snap = snapshot(state);
    const prev = this.lastSnap;
    const keyframe = !prev || state.tick % this.config.keyframeEveryTicks === 0;
    let full: string | null = null;
    const delta = keyframe || !prev ? null : encodeServerMessage({ t: 'delta', delta: diffSnapshot(prev, snap) });
    for (const m of this.members) {
      if (!m.socket) continue;
      if (keyframe || m.needsKeyframe || !delta) {
        full ??= encodeServerMessage({ t: 'snapshot', snap });
        this.sendRaw(m, full);
        m.needsKeyframe = false;
      } else {
        this.sendRaw(m, delta);
      }
    }
    this.lastSnap = snap;
    this.tickTime.add(measure() - t0);
    return true;
  }

  /** True once nobody has been connected for the empty-room TTL. */
  isAbandoned(now: number): boolean {
    return this.connectedCount === 0 && this.emptySince !== null && now - this.emptySince >= this.config.emptyRoomTtlMs;
  }

  lobbyState(): LobbyState {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      players: this.activeMembers.map((m) => ({
        id: m.id,
        name: m.name,
        hero: m.hero,
        ready: m.ready || m.id === this.hostId,
        connected: m.socket !== null,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------------

  broadcastLobby(): void {
    this.broadcast(encodeServerMessage({ t: 'lobby', lobby: this.lobbyState() }));
  }

  broadcast(raw: string): void {
    for (const m of this.members) if (m.socket) this.sendRaw(m, raw);
  }

  sendTo(member: Member, msg: ServerMessage): void {
    this.sendRaw(member, encodeServerMessage(msg));
  }

  private sendRaw(member: Member, raw: string): void {
    if (!member.socket) return;
    this.bytesOut += raw.length;
    member.socket.send(raw);
  }

  error(member: Member, code: ErrorCode, message: string): void {
    this.sendTo(member, { t: 'error', code, message });
  }

  /** Closes every connection (used on shutdown and when the room is removed). */
  closeAll(code: number, reason: string): void {
    for (const m of this.members) {
      const socket = m.socket;
      m.socket = null;
      socket?.close(code, reason);
    }
  }
}
