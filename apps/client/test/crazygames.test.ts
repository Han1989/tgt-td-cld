// CrazyGames' SDK in the crazygames build (q15): the pure rules, the data key's store, the page's SDK tag.

import { describe, expect, it } from 'vitest';
import { DATA_KEY_KEY, VISITOR_KEY, type IdStore } from '../src/analytics/dataKey';
import { KEPT_KEYS, KeptIds, type KvBackend } from '../src/analytics/keptIds';
import { asksCrazyGames, CG_SDK_URL, CG_STAND_IN, cgSdkTags, hostedHtml } from '../src/platform/embedHost';
import {
  acceptInvite,
  cgRoom,
  cgUsername,
  GameplayGate,
  guestName,
  HappyGate,
  inviteRoom,
  nameFor,
  RoomReporter,
  sdkOn,
  startAction,
  storesName,
} from '../src/platform/crazygames/rules';

const lobby = (code: string, players: number, phase: 'lobby' | 'playing' = 'lobby') => ({
  code,
  phase,
  players: Array.from({ length: players }, (_, i) => ({ id: `p${i}` })) as never[],
});

describe('the SDK is on', () => {
  it('only with the global, a resolved init and an environment where calls work', () => {
    expect(sdkOn(true, true, 'crazygames')).toBe(true);
    expect(sdkOn(true, true, 'local')).toBe(true);
    expect(sdkOn(true, true, 'disabled')).toBe(false);
    expect(sdkOn(true, false, 'crazygames')).toBe(false);
    expect(sdkOn(false, true, 'crazygames')).toBe(false);
    expect(sdkOn(true, true, undefined)).toBe(false);
  });
});

describe('gameplay events', () => {
  it('a start when play begins or goes on, a stop at every break, never two in a row, no stop first', () => {
    const gate = new GameplayGate();
    const seen = [false, false, true, true, false, false, true, false].map((p) => gate.next(p));
    expect(seen).toEqual([null, null, 'gameplayStart', null, 'gameplayStop', null, 'gameplayStart', 'gameplayStop']);
  });

  it('happytime once a match, on the end card of a victory or a new best', () => {
    const happy = new HappyGate();
    expect(happy.next(true, false)).toBe(false);
    expect(happy.next(false, true)).toBe(true);
    expect(happy.next(false, true)).toBe(false);
    happy.newMatch();
    expect(happy.next(false, false)).toBe(false);
    expect(happy.next(false, true)).toBe(true);
  });
});

describe('the room as CrazyGames hears it', () => {
  it('joinable in its lobby with a free seat; not when full or playing; again when back with a seat', () => {
    expect(cgRoom(lobby('ABCDE', 1))).toEqual({ roomId: 'ABCDE', isJoinable: true, inviteParams: { room: 'ABCDE' } });
    expect(cgRoom(lobby('ABCDE', 3)).isJoinable).toBe(false);
    expect(cgRoom(lobby('ABCDE', 2, 'playing')).isJoinable).toBe(false);
  });

  it('updateRoom on a change only, leftRoom once', () => {
    const r = new RoomReporter();
    expect(r.next(null)).toBeNull();
    expect(r.next(lobby('ABCDE', 1))).toEqual({ call: 'updateRoom', room: cgRoom(lobby('ABCDE', 1)) });
    expect(r.next(lobby('ABCDE', 2))).toBeNull();
    expect(r.next(lobby('ABCDE', 3))?.call).toBe('updateRoom');
    expect(r.next(lobby('ABCDE', 3, 'playing'))).toBeNull();
    expect(r.next(lobby('ABCDE', 2))).toEqual({ call: 'updateRoom', room: cgRoom(lobby('ABCDE', 2)) });
    expect(r.next(lobby('FGHJK', 1))?.call).toBe('updateRoom');
    expect(r.next(null)).toEqual({ call: 'leftRoom' });
    expect(r.next(null)).toBeNull();
  });

  it("reads an invite's code through the protocol's rule", () => {
    expect(inviteRoom({ room: 'abcde' })).toBe('ABCDE');
    expect(inviteRoom({ room: 'ABC' })).toBeNull();
    expect(inviteRoom({ room: 'ABCDI' })).toBeNull();
    expect(inviteRoom(null)).toBeNull();
    expect(inviteRoom('ABCDE')).toBeNull();
  });

  it('an invite wins over an instant start; both over nothing', () => {
    expect(startAction({ room: 'ABCDE' }, true)).toEqual({ kind: 'join', code: 'ABCDE' });
    expect(startAction(null, true)).toEqual({ kind: 'create' });
    expect(startAction({ room: 'x' }, false)).toEqual({ kind: 'none' });
  });

  it('an invite accepted while open: at once from home or a lobby, asked in a match, held while connecting', () => {
    expect(acceptInvite('home')).toBe('join');
    expect(acceptInvite('room-lobby')).toBe('join');
    expect(acceptInvite('match')).toBe('ask');
    expect(acceptInvite('busy')).toBe('wait');
  });
});

describe('the name', () => {
  it('a CrazyGames username cut to 16 on a whole character, or a guest when nothing is left', () => {
    expect(cgUsername('Mira')).toBe('Mira');
    expect(cgUsername('  Mira   the  Bold ')).toBe('Mira the Bold');
    expect(cgUsername('ABCDEFGHIJKLMNOPQRST')).toBe('ABCDEFGHIJKLMNOP');
    // 15 letters and an emoji of two UTF-16 units: the emoji does not fit and is not cut in half.
    expect(cgUsername('ABCDEFGHIJKLMNO😀')).toBe('ABCDEFGHIJKLMNO');
    expect(cgUsername('ABCDEFGHIJKLMN😀')).toBe('ABCDEFGHIJKLMN😀');
    expect(cgUsername('\u0001\u0002')).toBeNull();
    expect(cgUsername('   ')).toBeNull();
    expect(cgUsername(42)).toBeNull();
  });

  it('signed in, stored, made up, or none', () => {
    const r = () => 0.0042;
    expect(nameFor('Mira', 'Own', true, r)).toEqual({ name: 'Mira', source: 'crazygames' });
    expect(nameFor(null, 'Own', true, r)).toEqual({ name: 'Own', source: 'stored' });
    expect(nameFor(null, '', true, r)).toEqual({ name: 'Guest0042', source: 'made-up' });
    expect(nameFor(null, '', false, r)).toEqual({ name: '', source: 'none' });
    expect(guestName(() => 0.99999)).toBe('Guest9999');
  });

  it('never stores the CrazyGames name, nor a made-up one until it is edited', () => {
    expect(storesName('Mira', { name: 'Mira', source: 'crazygames' })).toBe(false);
    expect(storesName('Guest0042', { name: 'Guest0042', source: 'made-up' })).toBe(false);
    expect(storesName('Bo', { name: 'Guest0042', source: 'made-up' })).toBe(true);
    expect(storesName('Own', { name: 'Own', source: 'stored' })).toBe(true);
    expect(storesName('Own', null)).toBe(true);
  });
});

/** An IndexedDB stand-in. */
function fakeBackend(start: Record<string, string> = {}, opts: { fail?: boolean; hang?: boolean } = {}) {
  const data = new Map(Object.entries(start));
  const backend: KvBackend = {
    read: (keys) => {
      if (opts.hang) return new Promise(() => {});
      if (opts.fail) return Promise.reject(new Error('no'));
      const out: Record<string, string> = {};
      for (const k of keys) if (data.has(k)) out[k] = data.get(k)!;
      return Promise.resolve(out);
    },
    write: (k, v) => {
      data.set(k, v);
      return Promise.resolve();
    },
    remove: (k) => {
      data.delete(k);
      return Promise.resolve();
    },
  };
  return { backend, data };
}

function memStore(start: Record<string, string> = {}): IdStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(start));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('the data key in IndexedDB', () => {
  const key = 'ab'.repeat(32);

  it('keeps the same two keys as dataKey.ts', () => {
    expect([...KEPT_KEYS].sort()).toEqual([DATA_KEY_KEY, VISITOR_KEY].sort());
  });

  it('reads them, writes through and removes', async () => {
    const { backend, data } = fakeBackend({ [DATA_KEY_KEY]: key });
    const kept = new KeptIds();
    await kept.load(backend, memStore());
    expect(kept.persistent).toBe(true);
    expect(kept.getItem(DATA_KEY_KEY)).toBe(key);
    kept.setItem(VISITOR_KEY, 'visitor-1');
    await flush();
    expect(data.get(VISITOR_KEY)).toBe('visitor-1');
    kept.removeItem(DATA_KEY_KEY);
    await flush();
    expect(data.has(DATA_KEY_KEY)).toBe(false);
    expect(kept.getItem(DATA_KEY_KEY)).toBeNull();
  });

  it("moves a key found in localStorage, and removes it there; IndexedDB's own wins", async () => {
    const { backend, data } = fakeBackend({ [VISITOR_KEY]: 'kept-id' });
    const local = memStore({ [DATA_KEY_KEY]: key, [VISITOR_KEY]: 'old-id', 'tdt.name': 'Own' });
    const kept = new KeptIds();
    await kept.load(backend, local);
    await flush();
    expect(kept.getItem(DATA_KEY_KEY)).toBe(key);
    expect(data.get(DATA_KEY_KEY)).toBe(key);
    expect(kept.getItem(VISITOR_KEY)).toBe('kept-id');
    expect(local.data.has(DATA_KEY_KEY)).toBe(false);
    expect(local.data.has(VISITOR_KEY)).toBe(false);
    expect(local.data.get('tdt.name')).toBe('Own');
  });

  it('memory only with no IndexedDB, a failure or a hang past the timeout; localStorage still emptied', async () => {
    for (const backend of [null, fakeBackend({}, { fail: true }).backend, fakeBackend({}, { hang: true }).backend]) {
      const local = memStore({ [DATA_KEY_KEY]: key });
      const kept = new KeptIds();
      await kept.load(backend, local, 5);
      expect(kept.persistent).toBe(false);
      expect(kept.getItem(DATA_KEY_KEY)).toBe(key);
      expect(local.data.has(DATA_KEY_KEY)).toBe(false);
    }
  });
});

describe("the page's SDK tag", () => {
  const html = '<!doctype html><html><head><meta charset="utf-8" /><script type="module" src="./a.js"></script></head><body></body></html>';

  it('one tag in the head, before the game, in the crazygames build only', () => {
    const cg = hostedHtml(html, 'https://tgt-td-cld.vercel.app', 'crazygames');
    expect(cgSdkTags(cg)).toBe(1);
    expect(cg.indexOf(CG_SDK_URL)).toBeLessThan(cg.indexOf('./a.js'));
    expect(cg.indexOf(CG_SDK_URL)).toBeGreaterThan(cg.indexOf('<head>'));
    for (const host of ['itch', 'newgrounds'] as const) {
      const page = hostedHtml(html, 'https://tgt-td-cld.vercel.app', host);
      expect(asksCrazyGames(page)).toBe(false);
      expect(cgSdkTags(page)).toBe(0);
    }
    expect(asksCrazyGames(hostedHtml(html, 'https://tgt-td-cld.vercel.app'))).toBe(false);
  });

  it("the browser test's zip points the tag at the stand-in", () => {
    const page = hostedHtml(html, 'http://localhost:4183', 'crazygames', `./${CG_STAND_IN}`);
    expect(asksCrazyGames(page)).toBe(false);
    expect(cgSdkTags(page, `./${CG_STAND_IN}`)).toBe(1);
  });
});
