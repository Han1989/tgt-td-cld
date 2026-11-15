// CrazyGames' SDK in the crazygames build (q15, docs/DEPLOY.md §10 "CrazyGames' build"): the rules, pure and tested.
// Everything that touches `window.CrazyGames` is in sdk.ts and install.ts beside it; this module decides only.

import { MAX_NAME_LENGTH, MAX_PLAYERS, normalizeName, normalizeRoomCode, type LobbyState } from '@tdt/protocol';

/** `SDK.environment`: on their site, on this machine (demo data), or anywhere else (every call throws). */
export type CgEnvironment = 'crazygames' | 'local' | 'disabled';

/** How long `init()` may take before the game goes on without the SDK. */
export const INIT_TIMEOUT_MS = 3000;
/** How long the first screen waits for `init()` behind the boot splash. A later result still applies. */
export const FIRST_SCREEN_WAIT_MS = 1500;

/** The SDK is on only when its global exists, `init()` resolved and the environment is one where calls work. */
export function sdkOn(globalFound: boolean, initResolved: boolean, environment: unknown): boolean {
  return globalFound && initResolved && (environment === 'crazygames' || environment === 'local');
}

// ---------------------------------------------------------------------------------------------------------------------
// Gameplay events: never two starts or two stops in a row.
// ---------------------------------------------------------------------------------------------------------------------

/** What the page shows, as the gameplay events read it. */
export interface PlayState {
  /** A match is on screen and running: build phase or waves, no end card, no lobby, no wait card, no lost connection. */
  playing: boolean;
}

/**
 * `gameplayStart()` / `gameplayStop()` from a stream of "is play running" readings: a start when it begins or goes on,
 * a stop at every break, never two of one in a row, and no stop before the first start.
 */
export class GameplayGate {
  private on = false;

  /** The call to make for this reading, or null. */
  next(playing: boolean): 'gameplayStart' | 'gameplayStop' | null {
    if (playing === this.on) return null;
    this.on = playing;
    return playing ? 'gameplayStart' : 'gameplayStop';
  }

  get playing(): boolean {
    return this.on;
  }
}

/**
 * `happytime()` once on a victory or a new Endless best, at most once a match: a new match (play running again after
 * the end) allows it again.
 */
export class HappyGate {
  private used = false;

  /** `playing` as GameplayGate reads it; `big` a victory or "New best!" on the end card. True: call happytime now. */
  next(playing: boolean, big: boolean): boolean {
    if (playing) {
      // Still inside the match that already had its moment: nothing until it ends.
      return false;
    }
    if (!big || this.used) return false;
    this.used = true;
    return true;
  }

  /** A new match started (play began after an end card or the lobby). */
  newMatch(): void {
    this.used = false;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The room as CrazyGames' buttons know it (`updateRoom`, `leftRoom`).
// ---------------------------------------------------------------------------------------------------------------------

export interface CgRoom {
  roomId: string;
  isJoinable: boolean;
  inviteParams: { room: string };
}

/** Joinable while the room is in its lobby with a free seat (a running match takes back only its own players, q12). */
export function roomJoinable(lobby: Pick<LobbyState, 'phase' | 'players'>): boolean {
  return lobby.phase === 'lobby' && lobby.players.length < MAX_PLAYERS;
}

/** What `updateRoom` hears for a room. */
export function cgRoom(lobby: Pick<LobbyState, 'code' | 'phase' | 'players'>): CgRoom {
  return { roomId: lobby.code, isJoinable: roomJoinable(lobby), inviteParams: { room: lobby.code } };
}

export type RoomCall = { call: 'updateRoom'; room: CgRoom } | { call: 'leftRoom' };

/** Sends on a change only: the same room again says nothing; leaving says `leftRoom` once. */
export class RoomReporter {
  private last: CgRoom | null = null;

  /** The lobby the page is in now (null: in no room). */
  next(lobby: Pick<LobbyState, 'code' | 'phase' | 'players'> | null): RoomCall | null {
    if (!lobby) {
      if (!this.last) return null;
      this.last = null;
      return { call: 'leftRoom' };
    }
    const room = cgRoom(lobby);
    const prev = this.last;
    if (prev && prev.roomId === room.roomId && prev.isJoinable === room.isJoinable) return null;
    this.last = room;
    return { call: 'updateRoom', room };
  }

  get room(): CgRoom | null {
    return this.last;
  }
}

/** The room code an invite's params carry (`{ room }`), or null. */
export function inviteRoom(params: unknown): string | null {
  if (!params || typeof params !== 'object') return null;
  return normalizeRoomCode((params as Record<string, unknown>).room);
}

// ---------------------------------------------------------------------------------------------------------------------
// The name (item 5 of the brief).
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A CrazyGames username as a room name: control characters out, spaces collapsed, cut to the protocol's 16 on a whole
 * character, then the protocol's own check (`normalizeName`). Null when nothing valid is left (the player is a guest).
 */
export function cgUsername(username: unknown): string | null {
  if (typeof username !== 'string') return null;
  const clean = username.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().replace(/\s+/g, ' ');
  let out = '';
  for (const ch of clean) {
    if (out.length + ch.length > MAX_NAME_LENGTH) break;
    out += ch;
  }
  return normalizeName(out.trim());
}

/** A guest's made-up name: "Guest" and four digits. `random` gives a number in [0, 1). */
export function guestName(random: () => number): string {
  const n = Math.min(9999, Math.max(0, Math.floor(random() * 10000)));
  return `Guest${String(n).padStart(4, '0')}`;
}

export interface NameChoice {
  /** The field's value. */
  name: string;
  /** Where it comes from: CrazyGames (locked, never stored), the stored nickname, a made-up one, or none. */
  source: 'crazygames' | 'stored' | 'made-up' | 'none';
}

/**
 * The name in the home card's field. Signed in: the CrazyGames username (cut by `cgUsername`). A guest: the stored
 * nickname; a guest with none who arrives by an invite or an instant start (`needsName`) gets a made-up one.
 */
export function nameFor(username: unknown, stored: string, needsName: boolean, random: () => number): NameChoice {
  const cg = cgUsername(username);
  if (cg) return { name: cg, source: 'crazygames' };
  const own = normalizeName(stored);
  if (own) return { name: own, source: 'stored' };
  if (needsName) return { name: guestName(random), source: 'made-up' };
  return { name: '', source: 'none' };
}

/** Whether a name the player starts a room with is written to `tdt.name`: never the CrazyGames one or an unedited made-up one. */
export function storesName(name: string, choice: NameChoice | null): boolean {
  if (!choice) return true;
  if (choice.source === 'crazygames') return false;
  if (choice.source === 'made-up') return name !== choice.name;
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// What happens at start-up and when an invite is accepted.
// ---------------------------------------------------------------------------------------------------------------------

export type StartAction = { kind: 'join'; code: string } | { kind: 'create' } | { kind: 'none' };

/** An invite's room wins over an instant start; both win over the "Rejoin your match" offer (which stays remembered). */
export function startAction(inviteParams: unknown, instant: boolean): StartAction {
  const code = inviteRoom(inviteParams);
  if (code) return { kind: 'join', code };
  if (instant) return { kind: 'create' };
  return { kind: 'none' };
}

/** Where the page is when a friend's invite is accepted (the join listener). */
export type Place = 'home' | 'room-lobby' | 'match' | 'busy';

/** Join at once from the home card or a room's lobby; in a running match ask first; while connecting, wait. */
export function acceptInvite(place: Place): 'join' | 'ask' | 'wait' {
  if (place === 'match') return 'ask';
  if (place === 'busy') return 'wait';
  return 'join';
}

/** The line ⚙ → Sound shows while CrazyGames mutes the game. */
export const MUTED_BY_CG = 'Muted by CrazyGames';
/** The home card's nickname label for a signed-in player. */
export const CG_NAME_LABEL = 'CrazyGames name';
/** The question a running match asks when a friend's invite is accepted. */
export const JOIN_ASK = "Join your friend's room? You leave this match.";
