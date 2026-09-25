import { describe, expect, it } from 'vitest';
import { configFromEnv } from '../src/config';
import { parseAllowedOrigins } from '../src/origins';
import { TokenBucket } from '../src/rateLimit';
import { generateRoomCode, shardOf } from '../src/roomCode';

describe('ALLOWED_ORIGINS', () => {
  const allowed = parseAllowedOrigins(
    'https://tgt-td-cld.vercel.app, https://tgt-td-cld-*-han1989s-projects.vercel.app,http://localhost:5173/',
  );

  it.each([
    'https://tgt-td-cld.vercel.app',
    'https://TGT-TD-CLD.vercel.app',
    'https://tgt-td-cld-git-feature-x-han1989s-projects.vercel.app',
    'https://tgt-td-cld-abc123xyz-han1989s-projects.vercel.app',
    'http://localhost:5173',
  ])('allows %s', (origin) => expect(allowed(origin)).toBe(true));

  it.each([
    undefined,
    '',
    'null',
    'https://evil.example',
    'https://tgt-td-cld.vercel.app.evil.example',
    'https://tgt-td-cld-x.evil-han1989s-projects.vercel.app',
    'http://tgt-td-cld.vercel.app',
    'http://localhost:5174',
  ])('rejects %s', (origin) => expect(allowed(origin)).toBe(false));
});

describe('room codes', () => {
  it('start with the shard letter and avoid taken codes', () => {
    let i = 0;
    const seq = [0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5];
    const code = generateRoomCode('K', (c) => c === 'KAAAA', () => seq[i++ % seq.length]!);
    expect(code).toMatch(/^K[A-Z]{4}$/);
    expect(code).not.toBe('KAAAA');
    expect(shardOf(code)).toBe('K');
  });

  it('rejects invalid shard letters', () => {
    expect(() => generateRoomCode('O', () => false, Math.random)).toThrow();
    expect(() => generateRoomCode('AB', () => false, Math.random)).toThrow();
  });
});

describe('TokenBucket', () => {
  it('allows a burst, then refills over time', () => {
    const b = new TokenBucket(10, 3, 0);
    expect([b.take(0), b.take(0), b.take(0), b.take(0)]).toEqual([true, true, true, false]);
    expect(b.take(50)).toBe(false);
    expect(b.take(100)).toBe(true);
  });
});

describe('configFromEnv', () => {
  it('requires ALLOWED_ORIGINS in production', () => {
    expect(() => configFromEnv({ NODE_ENV: 'production' })).toThrow(/ALLOWED_ORIGINS/);
    const c = configFromEnv({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://a.example', PORT: '10000', SHARD: 'b' });
    expect(c.port).toBe(10000);
    expect(c.shard).toBe('B');
    expect(c.isOriginAllowed('https://a.example')).toBe(true);
    expect(c.isOriginAllowed('http://localhost:5173')).toBe(false);
  });

  it('defaults to localhost origins in development', () => {
    expect(configFromEnv({}).isOriginAllowed('http://localhost:5173')).toBe(true);
  });

  it('rejects bad values', () => {
    expect(() => configFromEnv({ SHARD: 'I' })).toThrow(/SHARD/);
    expect(() => configFromEnv({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
