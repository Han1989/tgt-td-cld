import { isShardLetter } from './roomCode';
import { parseAllowedOrigins, type OriginCheck } from './origins';

export interface ServerConfig {
  port: number;
  /** Raw ALLOWED_ORIGINS value, for logging. */
  allowedOriginsList: string;
  isOriginAllowed: OriginCheck;
  /** First letter of every room code created here (SHARD). */
  shard: string;
  maxRooms: number;
  /** Wall-clock milliseconds per sim tick (50 = 20 Hz). Tests use less. */
  tickMs: number;
  /** A full snapshot is sent every this many ticks; deltas otherwise. */
  keyframeEveryTicks: number;
  /** How long a dropped player's seat is kept. */
  reconnectWindowMs: number;
  /** A room with nobody connected is closed after this long. */
  emptyRoomTtlMs: number;
  /** On SIGTERM, running matches may continue this long before the server closes. */
  shutdownGraceMs: number;
  rateLimit: { perSecond: number; burst: number };
  /** Invalid or rate-limited messages allowed per connection before it is closed. */
  maxViolations: number;
  maxPayloadBytes: number;
  heartbeatMs: number;
  compression: boolean;
}

const DEV_ORIGINS = 'http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173';

export function defaultConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const allowedOriginsList = overrides.allowedOriginsList ?? DEV_ORIGINS;
  return {
    port: 8080,
    shard: 'A',
    maxRooms: 200,
    tickMs: 50,
    keyframeEveryTicks: 200,
    reconnectWindowMs: 60_000,
    emptyRoomTtlMs: 60_000,
    shutdownGraceMs: 280_000,
    rateLimit: { perSecond: 25, burst: 50 },
    maxViolations: 50,
    maxPayloadBytes: 1024,
    heartbeatMs: 15_000,
    compression: true,
    ...overrides,
    allowedOriginsList,
    isOriginAllowed: overrides.isOriginAllowed ?? parseAllowedOrigins(allowedOriginsList),
  };
}

/** Reads the environment. Throws on invalid values so a bad deploy fails fast. */
export function configFromEnv(env: NodeJS.ProcessEnv): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const origins = env.ALLOWED_ORIGINS?.trim();
  if (production && !origins) {
    throw new Error('ALLOWED_ORIGINS must be set in production (comma-separated origins, * wildcards allowed).');
  }
  const shard = (env.SHARD ?? 'A').trim().toUpperCase();
  if (!isShardLetter(shard)) throw new Error(`SHARD must be one room-code letter (no I or O), got "${env.SHARD}".`);
  const int = (name: string, fallback: number) => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number, got "${raw}".`);
    return n;
  };
  return defaultConfig({
    port: int('PORT', 8080),
    allowedOriginsList: origins || DEV_ORIGINS,
    shard,
    maxRooms: int('MAX_ROOMS', 200),
    shutdownGraceMs: int('SHUTDOWN_GRACE_SECONDS', 280) * 1000,
    compression: env.WS_COMPRESSION !== 'off',
  });
}
