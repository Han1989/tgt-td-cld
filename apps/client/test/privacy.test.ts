// p6a-privacy: the age rule, the data key the visitor id is made from, and this browser's own copy and deletion.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ageBand, ageNow, monthOf, parseAgeAnswer, parseAgeInput } from '../src/analytics/age';
import {
  clearVisitor,
  DATA_KEY_KEY,
  ensureVisitor,
  newDataKey,
  sha256Hex,
  storedDataKey,
  VISITOR_KEY,
  visitorFromKey,
  type IdStore,
} from '../src/analytics/dataKey';
import { CHANNEL_KEY, copyMyData, deleteMyData, myDataFile, myDataLine } from '../src/analytics/myData';
import { createAnalyticsClient, type AnalyticsBody } from '../src/analytics/session';

function memory(init: Record<string, string> = {}): IdStore & { map: Map<string, string> } {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const KEY = '0123456789abcdef'.repeat(4);

describe('age question', () => {
  it('takes a whole number of years from 1 to 120, nothing else', () => {
    expect(parseAgeInput('34')).toBe(34);
    expect(parseAgeInput(' 9 ')).toBe(9);
    for (const bad of ['', '0', '121', '12.5', '-3', 'twelve', '1e1', '0x10', '1234']) expect(parseAgeInput(bad), bad).toBeNull();
  });

  it('puts ages in bands at 13 and 16', () => {
    const now = new Date(2026, 9, 5);
    const at = (age: number) => ageBand({ age, month: '2026-10' }, now);
    expect(at(1)).toBe('child');
    expect(at(12)).toBe('child');
    expect(at(13)).toBe('teen');
    expect(at(15)).toBe('teen');
    expect(at(16)).toBe('adult');
    expect(at(99)).toBe('adult');
    expect(ageBand(null, now)).toBeNull();
  });

  it('grows the age only by full years since the answer, never sooner', () => {
    const answer = { age: 12, month: '2026-10' };
    expect(ageNow(answer, new Date(2027, 8, 30))).toBe(12);
    expect(ageNow(answer, new Date(2027, 9, 1))).toBe(13);
    expect(ageBand(answer, new Date(2027, 8, 1))).toBe('child');
    expect(ageBand(answer, new Date(2030, 9, 1))).toBe('adult');
    // A clock set back does not make anyone younger than they said.
    expect(ageNow(answer, new Date(2020, 0, 1))).toBe(12);
    expect(monthOf(new Date(2026, 0, 31))).toBe('2026-01');
  });

  it('reads back only a well-formed answer', () => {
    expect(parseAgeAnswer('{"age":30,"month":"2026-10"}')).toEqual({ age: 30, month: '2026-10' });
    for (const bad of [null, '', 'x', '{}', '{"age":0,"month":"2026-10"}', '{"age":30,"month":"2026-13"}', '{"age":"30","month":"2026-10"}']) {
      expect(parseAgeAnswer(bad), String(bad)).toBeNull();
    }
  });
});

describe('data key and visitor id', () => {
  it('hashes like SHA-256', () => {
    for (const text of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(200), 'héllo ✓']) {
      expect(sha256Hex(text), text).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
    }
  });

  it('derives the id exactly as the server does', () => {
    expect(visitorFromKey(KEY)).toBe(createHash('sha256').update(`tdt-visitor-v1:${KEY}`).digest('hex').slice(0, 32));
    const server = readFileSync(new URL('../../server/src/analytics/dataKey.ts', import.meta.url), 'utf8');
    expect(server).toContain("const TAG = 'tdt-visitor-v1:';");
    expect(server).toContain('.slice(0, 32)');
  });

  it('makes a 64-hex key and an id from it once, and keeps them', () => {
    const store = memory();
    const id = ensureVisitor(store);
    const key = store.map.get(DATA_KEY_KEY)!;
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(id).toBe(visitorFromKey(key));
    expect(store.map.get(VISITOR_KEY)).toBe(id);
    expect(ensureVisitor(store)).toBe(id);
    expect(newDataKey()).not.toBe(newDataKey());
  });

  it('replaces an id from before data keys, which nothing could prove was this browser', () => {
    const store = memory({ [VISITOR_KEY]: 'legacy-0123456789' });
    const id = ensureVisitor(store, () => KEY);
    expect(id).toBe(visitorFromKey(KEY));
    expect(store.map.get(VISITOR_KEY)).toBe(id);
    clearVisitor(store);
    expect(storedDataKey(store)).toBeNull();
    expect(store.map.has(VISITOR_KEY)).toBe(false);
  });
});

describe('your data: copy and delete', () => {
  const server = 'wss://game.example';
  type Call = { url: string; body: unknown };

  function fakeFetch(status: number, reply: unknown, calls: Call[]) {
    return async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) as unknown });
      return { ok: status >= 200 && status < 300, status, json: async () => reply };
    };
  }

  it('asks for a copy with the key only, never the id, and makes a file of exactly what came back', async () => {
    const store = memory({ [DATA_KEY_KEY]: KEY, [VISITOR_KEY]: visitorFromKey(KEY) });
    const calls: Call[] = [];
    const reply = { visitor: visitorFromKey(KEY), events: [{ t: 'session_start' }], retention: null };
    const result = await copyMyData(server, store, fakeFetch(200, reply, calls), () => new Date(2026, 9, 5, 9));
    expect(calls).toEqual([{ url: 'https://game.example/analytics/mine', body: { key: KEY } }]);
    expect(result).toMatchObject({ kind: 'file', name: 'tdt-play-data-2026-10-05.json', events: 1 });
    const file = JSON.parse((result as { text: string }).text) as Record<string, unknown>;
    expect(file).toMatchObject({ visitor: reply.visitor, events: reply.events, retention: null });
    expect(String(file.about)).toContain('Nothing else is kept about you');
    expect(myDataLine(result)).toBe('Downloaded: 1 event and nothing more.');
  });

  it('deletes on the server first, then the id, key and channel here', async () => {
    const store = memory({ [DATA_KEY_KEY]: KEY, [VISITOR_KEY]: visitorFromKey(KEY), [CHANNEL_KEY]: 'reddit-cozy', 'tdt.name': 'Kim' });
    const calls: Call[] = [];
    let cleared = 0;
    const result = await deleteMyData(server, store, () => cleared++, fakeFetch(200, { visitor: 'x', removedEvents: 3 }, calls));
    expect(calls).toEqual([{ url: 'https://game.example/analytics/mine/forget', body: { key: KEY } }]);
    expect(result).toEqual({ kind: 'deleted', removed: 3 });
    expect(cleared).toBe(1);
    expect([...store.map.keys()]).toEqual(['tdt.name']);
  });

  it('keeps the key when the server cannot be reached or says slow down, so the player can try again', async () => {
    for (const [status, kind] of [
      [500, 'error'],
      [429, 'busy'],
    ] as const) {
      const store = memory({ [DATA_KEY_KEY]: KEY });
      let cleared = 0;
      const result = await deleteMyData(server, store, () => cleared++, fakeFetch(status, null, []));
      expect(result.kind).toBe(kind);
      expect(cleared).toBe(0);
      expect(storedDataKey(store)).toBe(KEY);
    }
    const thrown = await copyMyData(server, memory({ [DATA_KEY_KEY]: KEY }), async () => {
      throw new Error('offline');
    });
    expect(thrown).toEqual({ kind: 'error' });
  });

  it('says so when nothing was sent, or when the id is from before data keys', async () => {
    const calls: Call[] = [];
    expect(await copyMyData(server, memory(), fakeFetch(200, {}, calls))).toEqual({ kind: 'nothing' });
    expect(await deleteMyData(server, memory(), () => {}, fakeFetch(200, {}, calls))).toEqual({ kind: 'nothing' });
    const legacy = memory({ [VISITOR_KEY]: 'legacy-0123456789' });
    expect(await copyMyData(server, legacy, fakeFetch(200, {}, calls))).toEqual({ kind: 'legacy' });
    expect(await deleteMyData(server, legacy, () => {}, fakeFetch(200, {}, calls))).toEqual({ kind: 'cleared' });
    expect(legacy.map.size).toBe(0);
    expect(calls).toEqual([]);
    expect(await copyMyData('', memory({ [DATA_KEY_KEY]: KEY }))).toEqual({ kind: 'no-server' });
  });

  it('builds the file name from the local date', () => {
    expect(myDataFile({ visitor: 'v', events: [], retention: null }, new Date(2026, 0, 9)).name).toBe('tdt-play-data-2026-01-09.json');
  });
});

describe('analytics client reset', () => {
  it('forgets the id and session: nothing more under the old id, and a new one on the next visible tick', () => {
    const posts: AnalyticsBody[] = [];
    let n = 0;
    const api = createAnalyticsClient({
      visitor: () => `visitor-${++n}`.padEnd(12, '0'),
      channel: 'direct',
      platform: 'web',
      newSessionId: () => `session-${posts.length}`.padEnd(12, '0'),
      post: (body) => posts.push(body),
    });
    api.start(0);
    expect(posts.map((p) => [p.t, p.visitor])).toEqual([['session_start', 'visitor-1000']]);
    api.reset();
    api.feedback(5, '');
    api.funnel('lobby');
    expect(posts).toHaveLength(1);
    api.tick(true, 1000);
    expect(posts.map((p) => [p.t, p.visitor])).toEqual([
      ['session_start', 'visitor-1000'],
      ['session_start', 'visitor-2000'],
    ]);
  });
});
