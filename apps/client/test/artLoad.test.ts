// V-08b load-all (Han, 7 Nov 2026: no placeholder art on screen, ever): which pictures a match draws, the readiness
// rule (every sheet in → playable; one missing → not), the bar's numbers from the bytes, the retries, a room's ready
// rule (Ready and Start wait for 100 from every player), the portrait's crop, and what the service worker precaches.

import { CREEP_KINDS, HERO_KINDS, type LobbyState } from '@tdt/protocol';
import { tuningForMode, TUNING, waveGroups } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import {
  ART_RETRIES,
  artBytes,
  artFailed,
  artPercent,
  artReady,
  BAR_AFTER_MS,
  barDue,
  creepKinds,
  downloadMoving,
  failedLine,
  matchSheets,
  MOVING_MS,
  portraitCrop,
  portraitCss,
  readyAllowed,
  retryDelayMs,
  roomStart,
  seatState,
  waitLine,
  type SheetBytes,
  type SheetId,
  type SheetProgress,
} from '../src/artLoad/rules';
import { artDownloadMoving, fetchWithProgress, sheetOff, sheetProgress, trackSheet } from '../src/artLoad/track';
import { isMediaPath, isOnDemandSheet, isStructurePage, swSource } from '../src/platform/swSource';
import { HERO_3D } from '../src/render/art3d/layout';

const p = (status: SheetProgress['status'], received = 0, expected: number | null = null): SheetProgress => ({ status, received, expected });

describe('load-all: which pictures a match waits for', () => {
  it('solo: the plate, the frames, the structures, the first wave\'s creeps, the picked hero, then every other creep in the waves\' order', () => {
    const ids = matchSheets(tuningForMode(TUNING, 'full'), ['ranger']);
    expect(ids.slice(0, 5)).toEqual(['plate', 'ui', 'structures', 'creep:grunt', 'hero:ranger']);
    // Every creep and boss: any of them can be on the map before the match ends.
    expect(new Set(creepKinds(ids))).toEqual(new Set(CREEP_KINDS));
    expect(ids.filter((id) => id.startsWith('hero:'))).toEqual(['hero:ranger']);
    expect(new Set(ids).size).toBe(ids.length);
    // Quick's first wave has Runners too.
    expect(matchSheets(tuningForMode(TUNING, 'quick'), ['warden']).slice(0, 6)).toEqual(['plate', 'ui', 'structures', 'creep:grunt', 'creep:runner', 'hero:warden']);
  });

  it('the creeps come in the order the waves bring them (the loading order)', () => {
    for (const mode of ['full', 'quick', 'endless'] as const) {
      const tuning = tuningForMode(TUNING, mode);
      const seen: string[] = [];
      for (let w = 1; w <= tuning.waves.list.length; w++) for (const g of waveGroups(tuning, w)) if (!seen.includes(g.kind)) seen.push(g.kind);
      expect(creepKinds(matchSheets(tuning, ['ranger'])).slice(0, seen.length), mode).toEqual(seen);
    }
  });

  it('a room: all three heroes, so a hero changed in the room sends nobody back to loading', () => {
    const ids = matchSheets(TUNING, HERO_KINDS);
    expect(ids.filter((id) => id.startsWith('hero:'))).toEqual(HERO_KINDS.map((h) => `hero:${h}`));
  });
});

describe('load-all: the readiness rule', () => {
  it('every sheet in: playable', () => {
    expect(artReady([p('in'), p('in'), p('in')])).toBe(true);
    // A picture this build does not load (the browser tests' ?towers2d) is not waited for.
    expect(artReady([p('in'), p('off')])).toBe(true);
    expect(artReady([])).toBe(true);
  });

  it('one missing: not playable, whatever it is doing', () => {
    for (const s of ['idle', 'loading', 'failed'] as const) expect(artReady([p('in'), p(s), p('in')]), s).toBe(false);
  });

  it('a failure is said (the wait offers Retry); one still loading is not a failure', () => {
    expect(artFailed([p('in'), p('failed')])).toBe(true);
    expect(artFailed([p('in'), p('loading', 3, 10)])).toBe(false);
  });
});

describe('load-all: the bar', () => {
  const sizes: SheetBytes = { plate: 1_000_000, structures: 7_000_000, 'creep:grunt': 100_000 };
  const ids: SheetId[] = ['plate', 'structures', 'creep:grunt'];
  const at = (m: Partial<Record<SheetId, SheetProgress>>) => (id: SheetId) => m[id] ?? p('idle');

  it('is the bytes done over the whole total from the first frame (the files\' sizes at build time)', () => {
    expect(artBytes(ids, at({}), sizes)).toEqual({ done: 0, total: 8_100_000 });
    // One in counts whole, one under way its bytes received.
    expect(artBytes(ids, at({ plate: p('in', 1_000_000, 1_000_000), structures: p('loading', 2_100_000, null) }), sizes)).toEqual({ done: 3_100_000, total: 8_100_000 });
  });

  it('takes a download\'s Content-Length over the build\'s size, and never counts past it', () => {
    expect(artBytes(['plate'], at({ plate: p('loading', 900, 800) }), sizes)).toEqual({ done: 800, total: 800 });
  });

  it('leaves out what this build does not load', () => {
    expect(artBytes(ids, at({ structures: p('off') }), sizes).total).toBe(1_100_000);
  });

  it('a percent for the room: 100 only once the match may start, never a rounded-up 100 before', () => {
    expect(artPercent({ done: 0, total: 0 }, false)).toBe(0);
    expect(artPercent({ done: 3_100_000, total: 7_900_000 }, false)).toBe(39);
    expect(artPercent({ done: 7_899_999, total: 7_900_000 }, false)).toBe(99);
    expect(artPercent({ done: 7_900_000, total: 7_900_000 }, false)).toBe(99);
    expect(artPercent({ done: 1, total: 7_900_000 }, true)).toBe(100);
  });

  it('one line: what is downloading and the megabytes; what failed, after the retries', () => {
    const now = at({ plate: p('in', 1_000_000, 1_000_000), structures: p('loading', 2_100_000, null) });
    expect(waitLine(ids, now, sizes)).toBe('Loading the towers… 3.1 of 8.1 MB');
    expect(waitLine(ids, at({ plate: p('in') }), sizes)).toBe('Loading the towers… 1.0 of 8.1 MB');
    expect(waitLine(['creep:grunt'], at({ 'creep:grunt': p('loading', 50_000, 100_000) }), sizes)).toBe('Loading the creeps… 0.1 of 0.1 MB');
    expect(failedLine(ids, at({ structures: p('failed') }))).toBe('Could not download the towers. Check the connection and try again.');
  });

  it('shows nothing under 400 ms of wait; with every byte in and only decoding left, nothing under 1 s', () => {
    expect(BAR_AFTER_MS).toBe(400);
    const coming = { done: 3, total: 10 };
    const decoding = { done: 10, total: 10 };
    expect(barDue(399, coming)).toBe(false);
    expect(barDue(400, coming)).toBe(true);
    expect(barDue(999, decoding)).toBe(false);
    expect(barDue(1000, decoding)).toBe(true);
  });
});

describe('load-all: the downloads', () => {
  const answer = (chunks: Uint8Array[], headers: Record<string, string>) =>
    new Response(new ReadableStream({ start: (c) => (chunks.forEach((x) => c.enqueue(x)), c.close()) }), { headers });

  it('tracks a picture from loading to in, and leaves a picture that is off alone once it has started', () => {
    expect(sheetProgress('hero:warden')).toEqual(p('idle'));
    const t = trackSheet('hero:warden');
    t.bytes(40, 100);
    expect(sheetProgress('hero:warden')).toEqual(p('loading', 40, 100));
    expect(artDownloadMoving()).toBe(true);
    t.done(true);
    expect(sheetProgress('hero:warden')).toEqual(p('in', 100, 100));
    sheetOff('hero:warden');
    expect(sheetProgress('hero:warden').status).toBe('in');
    sheetOff('creep:shardback');
    expect(sheetProgress('creep:shardback').status).toBe('off');
    // A failed picture is tracked again from 0 on a Retry.
    trackSheet('creep:wisp').done(false);
    expect(sheetProgress('creep:wisp').status).toBe('failed');
    trackSheet('creep:wisp');
    expect(sheetProgress('creep:wisp')).toEqual(p('loading'));
  });

  it('a download is moving while its last bytes came within 3 s', () => {
    expect(MOVING_MS).toBe(3000);
    expect(downloadMoving(null, 1000)).toBe(false);
    expect(downloadMoving(1000, 3999)).toBe(true);
    expect(downloadMoving(1000, 4000)).toBe(false);
  });

  it('reads a file in chunks, its bytes against its Content-Length; a compressed answer has no size to go by', async () => {
    const chunks = [new Uint8Array(3), new Uint8Array(5), new Uint8Array(2)];
    const real = globalThis.fetch;
    try {
      globalThis.fetch = (async () => answer(chunks, { 'content-length': '10', 'content-type': 'image/webp' })) as typeof fetch;
      const seen: [number, number | null][] = [];
      const blob = await fetchWithProgress('/a.webp', (r, e) => seen.push([r, e]));
      expect(seen).toEqual([[0, 10], [3, 10], [8, 10], [10, 10]]);
      expect([blob.size, blob.type]).toEqual([10, 'image/webp']);
      globalThis.fetch = (async () => answer(chunks, { 'content-length': '4', 'content-encoding': 'br' })) as typeof fetch;
      const sizes: (number | null)[] = [];
      await fetchWithProgress('/b.webp', (_r, e) => sizes.push(e));
      expect(new Set(sizes)).toEqual(new Set([null]));
      globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;
      await expect(fetchWithProgress('/c.webp')).rejects.toThrow('404');
    } finally {
      globalThis.fetch = real;
    }
  });

  it('a download that fails is tried again 3 times with backoff (0.5 s, 1.5 s, 4.5 s), its bytes from 0 each time', async () => {
    expect(ART_RETRIES).toBe(3);
    expect([1, 2, 3].map(retryDelayMs)).toEqual([500, 1500, 4500]);
    const real = globalThis.fetch;
    try {
      let calls = 0;
      // Two failures (an HTTP error, then a dropped connection), then the file.
      globalThis.fetch = (async () => {
        calls++;
        if (calls === 1) return new Response('', { status: 503 });
        if (calls === 2) throw new TypeError('network');
        return answer([new Uint8Array(4)], { 'content-length': '4' });
      }) as typeof fetch;
      const waits: number[] = [];
      const seen: [number, number | null][] = [];
      const wait = async (ms: number) => void waits.push(ms);
      const blob = await fetchWithProgress('/a.webp', (r, e) => seen.push([r, e]), { retries: ART_RETRIES, wait });
      expect([calls, blob.size, waits]).toEqual([3, 4, [500, 1500]]);
      expect(seen).toEqual([[0, null], [0, null], [0, 4], [4, 4]]);
      // Four failures: the retries are spent and it fails.
      calls = 0;
      waits.length = 0;
      globalThis.fetch = (async () => (calls++, new Response('', { status: 500 }))) as typeof fetch;
      await expect(fetchWithProgress('/b.webp', undefined, { retries: ART_RETRIES, wait })).rejects.toThrow('500');
      expect([calls, waits]).toEqual([4, [500, 1500, 4500]]);
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe('load-all: a room (protocol 25)', () => {
  const seat = (id: string, name: string, art: number, ready = true, connected = true): LobbyState['players'][number] => ({
    id,
    name,
    hero: 'ranger',
    ready,
    connected,
    art,
  });

  it('Ready only once this page\'s art is in', () => {
    expect(readyAllowed(99)).toBe(false);
    expect(readyAllowed(100)).toBe(true);
  });

  it('every seat says how far its art is; Ready, Host and away as before once it is in', () => {
    expect(seatState(seat('p2', 'Mya', 63), false)).toEqual({ text: 'Loading 63%', kind: 'loading' });
    expect(seatState(seat('p1', 'Han', 40), true)).toEqual({ text: 'Loading 40%', kind: 'loading' });
    expect(seatState(seat('p1', 'Han', 100), true)).toEqual({ text: 'Host', kind: 'host' });
    expect(seatState(seat('p2', 'Mya', 100), false).text).toBe('Ready');
    expect(seatState(seat('p2', 'Mya', 100, false), false).text).toBe('Not ready');
    expect(seatState(seat('p2', 'Mya', 63, true, false), false).text).toBe('reconnecting…');
  });

  it('the host starts only once every player is at 100: a second player still loading holds it, and the host sees who', () => {
    const room = (players: LobbyState['players']) => ({ hostId: 'p1', players });
    expect(roomStart(room([seat('p1', 'Han', 100), seat('p2', 'Mya', 63)]))).toEqual({ ok: false, label: 'Loading: Mya 63%' });
    expect(roomStart(room([seat('p1', 'Han', 80), seat('p2', 'Mya', 100)]))).toEqual({ ok: false, label: 'Loading: Han 80%' });
    expect(roomStart(room([seat('p1', 'Han', 100), seat('p2', 'Mya', 100, false)]))).toEqual({ ok: false, label: 'Waiting for players…' });
    expect(roomStart(room([seat('p1', 'Han', 100), seat('p2', 'Mya', 100)]))).toEqual({ ok: true, label: 'Start match' });
  });
});

describe('load-all: the portrait', () => {
  it('is a square of the hero\'s stage poster round his own box, inside the poster', () => {
    for (const hero of HERO_KINDS) {
      const stage = HERO_3D[hero]!.stage;
      const c = portraitCrop(stage);
      expect(c.sx, hero).toBeGreaterThanOrEqual(0);
      expect(c.sy, hero).toBeGreaterThanOrEqual(0);
      expect(c.sx + c.size, hero).toBeLessThanOrEqual(stage.w);
      expect(c.sy + c.size, hero).toBeLessThanOrEqual(stage.h);
      // His whole box across.
      expect(c.sx, hero).toBeLessThanOrEqual(stage.own.x0);
      expect(c.sx + c.size, hero).toBeGreaterThanOrEqual(stage.own.x1);
    }
    expect(portraitCss({ sx: 100, sy: 50, size: 500 }, 2400, 900, 100)).toEqual({ size: '480.0px 180.0px', position: '-20.0px -10.0px' });
  });
});

describe('load-all: the service worker', () => {
  const PAGE_0 = '/assets/structures-match-0-Bf8A_88E.webp';
  const PAGE_3 = '/assets/structures-match-3-D2xq-0aL.webp';
  const SHEETS = ['/assets/grunt-match-Co320hkV.webp', '/assets/shardback-match-D9-c_Gh.webp', '/assets/ranger-match-CB7K37RF.png', '/assets/warden-match-BRXA0Qy2.png'];
  const FILES = ['/index.html', '/map/spire.webp', PAGE_0, PAGE_3, ...SHEETS];

  it('precaches the shell first, then the structures\' pages; the creeps\' and heroes\' sheets are kept on first use', () => {
    expect(isOnDemandSheet('/map/spire.webp')).toBe(false);
    for (const s of [PAGE_0, PAGE_3, ...SHEETS]) {
      expect(isOnDemandSheet(s), s).toBe(true);
      expect(isMediaPath(s), s).toBe(false);
    }
    expect([PAGE_0, PAGE_3, ...SHEETS].map(isStructurePage)).toEqual([true, true, false, false, false, false]);
    expect(isOnDemandSheet('/assets/index-CeQBLyDq.js')).toBe(false);
    expect(isOnDemandSheet('/assets/ui-CDnhCoLV.webp')).toBe(false);
    const sw = swSource('v', FILES);
    const list = (name: string) => JSON.parse(new RegExp(`const ${name} = (\\[.*\\]);`).exec(sw)![1]!) as string[];
    expect(list('SHELL')).toEqual(['/index.html', '/map/spire.webp']);
    expect(list('PAGES')).toEqual([PAGE_0, PAGE_3]);
    expect(list('SHEETS')).toEqual(SHEETS);
  });

  /** The generated worker against fake caches and a fake network. */
  function worker(version: string, files: string[], stores: Map<string, Map<string, string>>, active: boolean) {
    const net: string[] = [];
    const store = (name: string) => stores.get(name) ?? stores.set(name, new Map()).get(name)!;
    const abs = (u: string) => (u.startsWith('http') ? u : `https://td.test${u}`);
    const res = (url: string, body: string) => ({ ok: true, status: 200, url, body, clone: () => res(url, body) });
    const listeners: Record<string, (e: unknown) => void> = {};
    const self = {
      location: { origin: 'https://td.test' },
      registration: { active: active ? {} : null },
      addEventListener: (type: string, f: (e: unknown) => void) => (listeners[type] = f),
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    };
    const caches = {
      open: async (name: string) => ({
        addAll: async (urls: string[]) => {
          for (const u of urls) {
            net.push(abs(u));
            store(name).set(abs(u), `net:${abs(u)}`);
          }
        },
        match: async (req: { url: string } | string) => {
          const url = abs(typeof req === 'string' ? req : req.url);
          const body = store(name).get(url);
          return body === undefined ? undefined : res(url, body);
        },
        put: async (req: { url: string } | string, r: { body: string }) => void store(name).set(abs(typeof req === 'string' ? req : req.url), r.body),
      }),
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async (req: { url: string }) => {
        for (const s of stores.values()) if (s.has(req.url)) return res(req.url, s.get(req.url)!);
        return undefined;
      },
    };
    const fetch = async (req: { url: string } | string) => {
      const url = abs(typeof req === 'string' ? req : req.url);
      net.push(url);
      return res(url, `net:${url}`);
    };
    new Function('self', 'caches', 'fetch', swSource(version, files))(self, caches, fetch);
    const install = async () => {
      let w: Promise<unknown> | undefined;
      listeners.install!({ waitUntil: (p: Promise<unknown>) => (w = p) });
      await w;
    };
    const get = async (path: string) => {
      let answered: Promise<{ body: string }> | undefined;
      listeners.fetch!({ request: { method: 'GET', url: `https://td.test${path}`, mode: 'cors' }, respondWith: (a: Promise<{ body: string }>) => (answered = a) });
      const r = await answered!;
      await new Promise((ok) => setTimeout(ok, 0));
      return r.body;
    };
    const keep = async (urls: unknown[]) => {
      let w: Promise<unknown> | undefined;
      listeners.message!({ data: { type: 'KEEP_SHEETS', urls }, waitUntil: (p: Promise<unknown>) => (w = p) });
      await w;
    };
    return { net, store, install, get, keep };
  }

  it('a first install fetches the shell only: its page is downloading the pages, and says so once it has them', async () => {
    const stores = new Map<string, Map<string, string>>();
    const w = worker('v1', FILES, stores, false);
    await w.install();
    expect(w.net).toEqual(['https://td.test/index.html', 'https://td.test/map/spire.webp']);
    // The page has them: told, the worker keeps them (from the HTTP cache), and nothing else.
    w.net.length = 0;
    await w.keep([PAGE_0, PAGE_3, ...SHEETS, 'https://elsewhere.test/assets/grunt-match-x.webp', '/assets/index-a.js', 7]);
    expect(w.net.sort()).toEqual([PAGE_0, PAGE_3, ...SHEETS].map((s) => `https://td.test${s}`).sort());
    for (const s of [PAGE_0, PAGE_3, ...SHEETS]) expect(w.store('tdt-v1').has(`https://td.test${s}`), s).toBe(true);
    // From then on, from the cache.
    w.net.length = 0;
    expect(await w.get(PAGE_0)).toBe(`net:https://td.test${PAGE_0}`);
    expect(w.net).toEqual([]);
  });

  it('a page asked for before the worker had it is kept on first use', async () => {
    const stores = new Map<string, Map<string, string>>();
    const w = worker('v1', FILES, stores, false);
    await w.install();
    w.net.length = 0;
    expect(await w.get(PAGE_3)).toBe(`net:https://td.test${PAGE_3}`);
    expect(await w.get(PAGE_3)).toBe(`net:https://td.test${PAGE_3}`);
    expect(w.net).toEqual([`https://td.test${PAGE_3}`]);
  });

  it('an update precaches the pages after the shell: the same files copied from the old cache, a changed one fetched; the next visit waits for nothing', async () => {
    const stores = new Map<string, Map<string, string>>();
    const old = worker('v1', FILES, stores, false);
    await old.install();
    await old.keep([PAGE_0, PAGE_3, ...SHEETS]);
    // The next deploy changed page 3 (a new hash) and the Ranger's sheet; the rest are the same files.
    const PAGE_3B = '/assets/structures-match-3-NEWHASH.webp';
    const RANGER_B = '/assets/ranger-match-NEWHASH.png';
    const files = ['/index.html', '/map/spire.webp', PAGE_0, PAGE_3B, SHEETS[0]!, SHEETS[1]!, RANGER_B, SHEETS[3]!];
    const next = worker('v2', files, stores, true);
    await next.install();
    // The shell, then only the changed page from the network: the sheet that changed waits for its first use.
    expect(next.net).toEqual(['https://td.test/index.html', 'https://td.test/map/spire.webp', `https://td.test${PAGE_3B}`]);
    for (const s of [PAGE_0, PAGE_3B, SHEETS[0]!, SHEETS[1]!, SHEETS[3]!]) expect(next.store('tdt-v2').has(`https://td.test${s}`), s).toBe(true);
    expect(next.store('tdt-v2').has(`https://td.test${RANGER_B}`)).toBe(false);
    next.net.length = 0;
    for (const s of [PAGE_0, PAGE_3B]) await next.get(s);
    expect(next.net).toEqual([]);
  });
});
