import {
  GAME_MODES,
  HERO_KINDS,
  MAX_NAME_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SKILL_SLOTS,
  TARGET_PRIORITIES,
  TOWER_KINDS,
  type ClientMessage,
  type Command,
  type GameMode,
  type HeroKind,
  type ServerMessage,
  type SkillSlot,
  type TargetPriority,
  type TowerKind,
} from './types';

/** Largest client message (in characters) a host will even try to parse. */
export const MAX_CLIENT_MESSAGE_LENGTH = 512;

/** Coordinates outside this range are rejected outright (map is far smaller). */
const MAX_COORD = 10_000;

/** Largest single gold gift the codec accepts; the sim also caps it at the sender's gold. */
export const MAX_GIFT_AMOUNT = 1_000_000;

export function encodeClientMessage(msg: ClientMessage): string {
  return JSON.stringify(msg);
}

export function encodeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg);
}

/**
 * Parses and validates an untrusted client message. Returns null for anything
 * malformed, oversized or of an unknown type. Game rules (gold, range, ...)
 * are checked later by the sim; this only guarantees the shape.
 */
export function decodeClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > MAX_CLIENT_MESSAGE_LENGTH) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  switch (data.t) {
    case 'restart':
    case 'start':
    case 'leave':
      return hasOnlyKeys(data, ['t']) ? { t: data.t } : null;
    // Entry messages: `v` is only shape-checked here; the server compares it
    // with PROTOCOL_VERSION so it can answer `version_mismatch`.
    case 'create': {
      if (!hasOnlyKeys(data, ['t', 'v', 'name', 'hero']) || !isVersion(data.v)) return null;
      const name = normalizeName(data.name);
      if (name === null || !isHeroKind(data.hero)) return null;
      return { t: 'create', v: data.v, name, hero: data.hero };
    }
    case 'join': {
      if (!hasOnlyKeys(data, ['t', 'v', 'code', 'name', 'hero']) || !isVersion(data.v)) return null;
      const name = normalizeName(data.name);
      const code = normalizeRoomCode(data.code);
      if (name === null || code === null || !isHeroKind(data.hero)) return null;
      return { t: 'join', v: data.v, code, name, hero: data.hero };
    }
    case 'rejoin': {
      if (!hasOnlyKeys(data, ['t', 'v', 'code', 'token']) || !isVersion(data.v)) return null;
      const code = normalizeRoomCode(data.code);
      if (code === null || typeof data.token !== 'string' || !/^[0-9a-f]{32}$/.test(data.token)) return null;
      return { t: 'rejoin', v: data.v, code, token: data.token };
    }
    case 'hero':
      if (!hasOnlyKeys(data, ['t', 'hero']) || !isHeroKind(data.hero)) return null;
      return { t: 'hero', hero: data.hero };
    case 'mode':
      if (!hasOnlyKeys(data, ['t', 'mode']) || !isGameMode(data.mode)) return null;
      return { t: 'mode', mode: data.mode };
    case 'ready':
      if (!hasOnlyKeys(data, ['t', 'ready']) || typeof data.ready !== 'boolean') return null;
      return { t: 'ready', ready: data.ready };
    case 'cmd': {
      if (!hasOnlyKeys(data, ['t', 'cmd'])) return null;
      const cmd = parseCommand(data.cmd);
      return cmd ? { t: 'cmd', cmd } : null;
    }
    default:
      return null;
  }
}

/** Parses a message from the host. The host is trusted, so only the envelope is checked. */
export function decodeServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  const ok =
    (data.t === 'hello' && typeof data.v === 'number') ||
    (data.t === 'welcome' && typeof data.playerId === 'string') ||
    (data.t === 'snapshot' && isRecord(data.snap)) ||
    (data.t === 'delta' && isRecord(data.delta)) ||
    (data.t === 'lobby' && isRecord(data.lobby)) ||
    (data.t === 'error' && typeof data.code === 'string') ||
    (data.t === 'notice' && typeof data.kind === 'string');
  return ok ? (data as unknown as ServerMessage) : null;
}

/**
 * Trims a player name and checks it: 1–16 characters, no control characters.
 * Returns null if it is not acceptable.
 */
export function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return null;
  // Reject control characters (C0, DEL, C1).
  if (/[\u0000-\u001f\u007f-\u009f]/.test(name)) return null;
  return name;
}

/** Upper-cases a room code and checks its length and alphabet. */
export function normalizeRoomCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** Validates the shape of a single command. Exported for hosts that receive commands directly. */
export function parseCommand(value: unknown): Command | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case 'move':
    case 'attackMove':
      if (!hasOnlyKeys(value, ['type', 'x', 'y'])) return null;
      if (!isCoord(value.x) || !isCoord(value.y)) return null;
      return { type: value.type, x: value.x, y: value.y };
    case 'attack':
      if (!hasOnlyKeys(value, ['type', 'targetId']) || !isId(value.targetId)) return null;
      return { type: 'attack', targetId: value.targetId };
    case 'stop':
      return hasOnlyKeys(value, ['type']) ? { type: 'stop' } : null;
    case 'callEarly':
      return hasOnlyKeys(value, ['type']) ? { type: 'callEarly' } : null;
    case 'cast': {
      if (!hasOnlyKeys(value, ['type', 'slot', 'x', 'y']) || !isSkillSlot(value.slot)) return null;
      const hasX = value.x !== undefined;
      const hasY = value.y !== undefined;
      if (hasX !== hasY) return null;
      if (hasX) {
        if (!isCoord(value.x) || !isCoord(value.y)) return null;
        return { type: 'cast', slot: value.slot, x: value.x, y: value.y };
      }
      return { type: 'cast', slot: value.slot };
    }
    case 'learn':
      if (!hasOnlyKeys(value, ['type', 'slot']) || !isSkillSlot(value.slot)) return null;
      return { type: 'learn', slot: value.slot };
    case 'build':
      if (!hasOnlyKeys(value, ['type', 'padId', 'tower'])) return null;
      if (!isId(value.padId) || !isTowerKind(value.tower)) return null;
      return { type: 'build', padId: value.padId, tower: value.tower };
    case 'sell':
    case 'upgrade':
      if (!hasOnlyKeys(value, ['type', 'towerId']) || !isId(value.towerId)) return null;
      return { type: value.type, towerId: value.towerId };
    case 'setPriority':
      if (!hasOnlyKeys(value, ['type', 'towerId', 'priority'])) return null;
      if (!isId(value.towerId) || !isTargetPriority(value.priority)) return null;
      return { type: 'setPriority', towerId: value.towerId, priority: value.priority };
    case 'gift':
      if (!hasOnlyKeys(value, ['type', 'to', 'amount']) || !isPlayerId(value.to)) return null;
      if (!isId(value.amount) || value.amount < 1 || value.amount > MAX_GIFT_AMOUNT) return null;
      return { type: 'gift', to: value.to, amount: value.amount };
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(obj: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(obj).every((k) => allowed.includes(k));
}

function isCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORD;
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isTargetPriority(value: unknown): value is TargetPriority {
  return typeof value === 'string' && (TARGET_PRIORITIES as readonly string[]).includes(value);
}

/** Player ids are short tokens such as `p1`; the sim checks that the player exists. */
function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(value);
}

function isSkillSlot(value: unknown): value is SkillSlot {
  return typeof value === 'string' && (SKILL_SLOTS as readonly string[]).includes(value);
}

function isHeroKind(value: unknown): value is HeroKind {
  return typeof value === 'string' && (HERO_KINDS as readonly string[]).includes(value);
}

function isGameMode(value: unknown): value is GameMode {
  return typeof value === 'string' && (GAME_MODES as readonly string[]).includes(value);
}

function isTowerKind(value: unknown): value is TowerKind {
  return typeof value === 'string' && (TOWER_KINDS as readonly string[]).includes(value);
}
