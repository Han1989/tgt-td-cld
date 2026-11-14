// One room: a lobby (nickname, hero, ready) and, once the host starts, an
// authoritative match. The room owns the only real simulation; clients only
// send commands and receive snapshots.

import { randomBytes } from 'node:crypto';
import {
  allowSocial,
  diffSnapshot,
  encodeServerMessage,
  freshSocialClock,
  MAX_PLAYERS,
  type ClientMessage,
  type Command,
  type ErrorCode,
  type GameMode,
  type HeroKind,
  type LobbyState,
  type PlayerId,
  type ServerMessage,
  type Snapshot,
  type SocialClock,
} from '@tdt/protocol';
import {
  createMatch,
  matchCommand,
  matchPresence,
  matchRename,
  matchReplay,
  matchReport,
  matchStep,
  reportSummary,
  snapshot,
  type GameState,
  type Match,
} from '@tdt/sim';
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
  /**
   * How much of the match's art this player's page has in, 0..100 (protocol 25, V-08b load-all): Ready and the start
   * wait for 100.
   */
  art: number;
  /** Secret for reconnecting to this seat. */
  token: string;
  socket: ClientSocket | null;
  disconnectedAt: number | null;
  /**
   * Gone for good: left the lobby (or a finished match), or away past the reconnect window outside a match. During a
   * running match a seat is never `left` (protocol 28, q12): it is its player's until the match ends.
   */
  left: boolean;
  /** Away past the reconnect window (or left) during the match: the player's empty pads opened to the team. */
  padsOpen: boolean;
  /** Left the running match on purpose (a `leave`): any nickname may take the seat by the room code at once. */
  freed: boolean;
  /** Next broadcast must be a full snapshot (just joined or reconnected). */
  needsKeyframe: boolean;
  /** Last accepted ping and emote (ms). The server drops anything sooner. */
  social: SocialClock;
}

/** WebSocket close code 1012: "service restart". */
export const CLOSE_SERVICE_RESTART = 1012;
export const CLOSE_NORMAL = 1000;

/** Nicknames match a seat's without case or outer spaces (q12: a join by code with the away player's nickname). */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The seat a join by the room code takes in a running match (protocol 28, q12), or why none: a seat whose player is
 * away, with the joiner's nickname at once; otherwise one away for `windowMs` or more (or left on purpose), the one
 * away longest first. A connected seat is never taken.
 */
export function seatToTake(
  members: readonly Member[],
  name: string,
  now: number,
  windowMs: number,
): Member | 'match_full' | 'seat_recent' {
  const away = members.filter((m) => !m.left && m.socket === null);
  if (away.length === 0) return 'match_full';
  const since = (m: Member) => (m.freed ? -Infinity : (m.disconnectedAt ?? now));
  const order = [...away].sort((a, b) => since(a) - since(b));
  return order.find((m) => sameName(m.name, name)) ?? order.find((m) => now - since(m) >= windowMs) ?? 'seat_recent';
}

const newToken = () => randomBytes(16).toString('hex');

export class Room {
  readonly members: Member[] = [];
  hostId: PlayerId = '';
  phase: 'lobby' | 'playing' = 'lobby';
  /** Match mode picked by the host in the lobby; kept for the next match after "Back to lobby". */
  mode: GameMode = 'full';
  /** The running match (its state, replay log and report numbers), or null in the lobby. */
  match: Match | null = null;
  /** The match report message, encoded once when the match ends (sent again to players who rejoin). */
  private reportMessage: string | null = null;
  /** The last snapshot sent to clients. */
  lastSnap: Snapshot | null = null;
  /** Test hook: a paused room neither steps nor broadcasts. */
  paused = false;
  readonly tickTime = new RollingAverage(100);
  /** Uncompressed payload bytes sent, for /health. */
  bytesOut = 0;

  private queue: { playerId: PlayerId; cmd: Command }[] = [];
  /** Tokens of seats taken by the room code (q12): a page that still holds one hears `seat_taken`. */
  private readonly takenTokens = new Set<string>();
  private emptySince: number | null;

  constructor(
    readonly code: string,
    private readonly config: ServerConfig,
    /** A fresh seed for each match. */
    private readonly newSeed: () => number,
    now: number,
    /** Server log (one line per finished match). */
    private readonly log: (msg: string) => void = () => {},
  ) {
    this.emptySince = now;
  }

  get state(): GameState | null {
    return this.match?.state ?? null;
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

  join(name: string, hero: HeroKind, socket: ClientSocket, now: number): Member | ErrorCode {
    if (this.phase === 'playing') return this.matchOver ? 'match_in_progress' : this.takeSeat(name, socket, now);
    if (this.activeMembers.length >= MAX_PLAYERS) return 'room_full';
    let slot = 1;
    while (this.activeMembers.some((m) => m.id === `p${slot}`)) slot++;
    const member: Member = {
      id: `p${slot}`,
      name,
      hero,
      ready: false,
      art: 0,
      token: newToken(),
      socket,
      disconnectedAt: null,
      left: false,
      padsOpen: false,
      freed: false,
      needsKeyframe: true,
      social: freshSocialClock(),
    };
    this.members.push(member);
    this.emptySince = null;
    if (!this.hostId || !this.isActive(this.hostId)) this.hostId = member.id;
    this.sendTo(member, { t: 'welcome', playerId: member.id, room: { code: this.code, token: member.token } });
    this.broadcastLobby();
    return member;
  }

  /** Back to the seat with its token, at any time until the match ends (protocol 28: not only within the window). */
  rejoin(token: string, socket: ClientSocket): Member | ErrorCode {
    if (this.takenTokens.has(token)) return 'seat_taken';
    const member = this.members.find((m) => m.token === token && !m.left);
    if (!member) return 'rejoin_failed';
    return this.seat(member, socket);
  }

  /**
   * A join by the room code into a running match (protocol 28, q12): takes a seat whose player is away (`seatToTake`),
   * with its hero, level, gold and towers, under the joiner's nickname. The seat gets a new token; the old one answers
   * `seat_taken` from now on.
   */
  private takeSeat(name: string, socket: ClientSocket, now: number): Member | ErrorCode {
    const seat = seatToTake(this.members, name, now, this.config.reconnectWindowMs);
    if (typeof seat === 'string') return seat;
    if (!seat.freed) this.takenTokens.add(seat.token);
    seat.token = newToken();
    if (this.match) matchRename(this.match, seat.id, name);
    seat.name = name;
    return this.seat(seat, socket);
  }

  /** Puts a connection in a seat (a rejoin, or a seat taken by code) and brings it up to date. */
  private seat(member: Member, socket: ClientSocket): Member {
    member.socket?.close(CLOSE_NORMAL, 'Replaced by a new connection');
    member.socket = socket;
    member.disconnectedAt = null;
    member.freed = false;
    member.needsKeyframe = true;
    this.emptySince = null;
    if (this.match) matchPresence(this.match, member.id, 'join');
    this.sendTo(member, { t: 'welcome', playerId: member.id, room: { code: this.code, token: member.token } });
    this.broadcastLobby();
    if (this.phase === 'playing' && this.lastSnap) {
      this.sendTo(member, { t: 'snapshot', snap: this.lastSnap });
      member.needsKeyframe = false;
      if (this.reportMessage) this.sendRaw(member, this.reportMessage);
    }
    return member;
  }

  /**
   * The member's connection dropped. In the lobby their seat is kept for the reconnect window; in a match it is theirs
   * until the match ends, and their pads open after the window (`tick`).
   */
  disconnect(member: Member, now: number): void {
    if (member.socket === null) return;
    member.socket = null;
    member.disconnectedAt = now;
    member.ready = false;
    if (this.match) matchPresence(this.match, member.id, 'drop');
    if (this.connectedCount === 0) this.emptySince = now;
    this.migrateHost();
    this.broadcastLobby();
  }

  /**
   * The member leaves. In a running match (protocol 28, q12) the seat stays in the match, free for a join by the room
   * code at once: its empty pads open now, its towers keep firing and stay the seat's, and its token stops working.
   * Otherwise the member is gone for good (removed in the lobby).
   */
  leave(member: Member, now: number): void {
    if (member.left) return;
    const socket = member.socket;
    member.socket = null;
    member.disconnectedAt ??= now;
    if (this.phase === 'playing' && !this.matchOver) {
      member.freed = true;
      member.ready = false;
      member.token = newToken();
      this.openPads(member);
    } else {
      member.left = true;
      if (this.match) matchPresence(this.match, member.id, 'leave');
      if (this.phase === 'lobby') this.members.splice(this.members.indexOf(member), 1);
    }
    socket?.close(CLOSE_NORMAL, 'Left the room');
    if (this.connectedCount === 0) this.emptySince ??= now;
    this.migrateHost();
    this.broadcastLobby();
  }

  /** The member's empty pads open to the team, once (away past the window, or left, during a match). */
  private openPads(member: Member): void {
    if (member.padsOpen) return;
    member.padsOpen = true;
    if (this.match) matchPresence(this.match, member.id, 'leave');
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
      case 'mode':
        if (member.id !== this.hostId) return this.error(member, 'not_host', 'Only the host can change the mode');
        if (this.phase !== 'lobby') return this.error(member, 'bad_request', 'The mode is locked once the match starts');
        this.mode = msg.mode;
        this.broadcastLobby();
        return;
      case 'art':
        // The art a page has in (V-08b load-all): shown on every seat, and the start waits for 100 from everyone.
        if (member.art === msg.pct) return;
        member.art = msg.pct;
        this.broadcastLobby();
        return;
      case 'ready':
        if (this.phase !== 'lobby') return;
        // A player is Ready only once their art is in (the client's button waits for it too).
        if (msg.ready && member.art < 100) return this.error(member, 'not_ready', 'Your art is still loading');
        member.ready = msg.ready;
        this.broadcastLobby();
        return;
      case 'start': {
        if (member.id !== this.hostId) return this.error(member, 'not_host', 'Only the host can start the match');
        if (this.phase !== 'lobby') return;
        const waiting = this.activeMembers.filter((m) => m.art < 100 || (m.id !== this.hostId && (!m.ready || !m.socket)));
        if (waiting.length > 0) {
          const who = waiting.map((m) => (m.art < 100 ? `${m.name} (loading ${m.art}%)` : m.name));
          return this.error(member, 'not_ready', `Waiting for ${who.join(', ')}`);
        }
        this.startMatch();
        return;
      }
      case 'cmd':
        if (this.phase === 'playing' && this.state && !this.matchOver) {
          if ((msg.cmd.type === 'ping' || msg.cmd.type === 'emote') && !allowSocial(member.social, msg.cmd.type, now)) {
            return this.error(member, 'rate_limited', 'Slow down');
          }
          // End run is for a solo Endless match on the player's own device, never a room (protocol 26).
          if (msg.cmd.type === 'endRun') return this.error(member, 'bad_request', 'End run is for solo Endless runs');
          this.queue.push({ playerId: member.id, cmd: msg.cmd });
        }
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
    // Every match a player starts is Normal (Han, 17 Oct 2026): Hard is for the game to choose later.
    this.match = createMatch({ players, mode: this.mode, difficulty: 'normal' }, this.newSeed(), this.config.build);
    this.reportMessage = null;
    this.phase = 'playing';
    this.queue = [];
    this.lastSnap = snapshot(this.match.state);
    this.broadcastLobby();
    this.broadcast(encodeServerMessage({ t: 'snapshot', snap: this.lastSnap }));
    for (const m of this.members) m.needsKeyframe = false;
  }

  private backToLobby(): void {
    this.phase = 'lobby';
    this.match = null;
    this.reportMessage = null;
    this.lastSnap = null;
    this.queue = [];
    for (let i = this.members.length - 1; i >= 0; i--) {
      const m = this.members[i]!;
      if (m.left || m.freed) this.members.splice(i, 1);
      else {
        m.ready = false;
        m.padsOpen = false;
      }
    }
    this.migrateHost();
    this.broadcastLobby();
  }

  // -------------------------------------------------------------------------
  // Tick
  // -------------------------------------------------------------------------

  /** Called at the server tick rate. Returns true if the sim advanced. */
  tick(now: number, measure: () => number): boolean {
    // The reconnect window: in a match it is when the pads open (the seat stays the player's until the match ends);
    // in the lobby, when the seat is given up.
    for (const m of [...this.members]) {
      if (!m.left && m.socket === null && m.disconnectedAt !== null && now - m.disconnectedAt >= this.config.reconnectWindowMs) {
        if (this.phase === 'playing') this.openPads(m);
        else this.leave(m, now);
      }
    }
    const match = this.match;
    if (this.phase !== 'playing' || !match || this.paused) return false;
    const state = match.state;
    if (this.matchOver && this.lastSnap && this.lastSnap.phase === state.phase) return false;

    const t0 = measure();
    for (const { playerId, cmd } of this.queue) matchCommand(match, playerId, cmd);
    this.queue = [];
    matchStep(match);
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
    if (this.matchOver && !this.reportMessage) this.finishMatch(match);
    this.tickTime.add(measure() - t0);
    return true;
  }

  /** The match just ended: log its one-line summary and send every player the report and the replay. */
  private finishMatch(match: Match): void {
    const report = matchReport(match);
    this.log(reportSummary(report, this.code));
    this.reportMessage = encodeServerMessage({ t: 'report', report, replay: matchReplay(match) });
    this.broadcast(this.reportMessage);
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
      mode: this.mode,
      players: this.activeMembers.map((m) => ({
        id: m.id,
        name: m.name,
        hero: m.hero,
        ready: m.ready || m.id === this.hostId,
        connected: m.socket !== null,
        art: m.art,
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
