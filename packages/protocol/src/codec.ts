import {
  SKILL_SLOTS,
  TOWER_KINDS,
  type ClientMessage,
  type Command,
  type ServerMessage,
  type SkillSlot,
  type TowerKind,
} from './types';

/** Largest client message (in characters) a host will even try to parse. */
export const MAX_CLIENT_MESSAGE_LENGTH = 512;

/** Coordinates outside this range are rejected outright (map is far smaller). */
const MAX_COORD = 10_000;

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
      return hasOnlyKeys(data, ['t']) ? { t: 'restart' } : null;
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
  if (data.t === 'welcome' && typeof data.playerId === 'string') return data as unknown as ServerMessage;
  if (data.t === 'snapshot' && isRecord(data.snap)) return data as unknown as ServerMessage;
  return null;
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
      if (!hasOnlyKeys(value, ['type', 'towerId']) || !isId(value.towerId)) return null;
      return { type: 'sell', towerId: value.towerId };
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

function isSkillSlot(value: unknown): value is SkillSlot {
  return typeof value === 'string' && (SKILL_SLOTS as readonly string[]).includes(value);
}

function isTowerKind(value: unknown): value is TowerKind {
  return typeof value === 'string' && (TOWER_KINDS as readonly string[]).includes(value);
}
