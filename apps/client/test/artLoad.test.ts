// V-07d, the first minute's art: which pictures a match's first wave needs, when a solo match stops holding its start
// for them (all in, or 6 s), how far along they are, the line's rules, the downloads' tracking, the host's clock held
// with the same control as the hidden-page pause, and what the service worker precaches.

import { decodeServerMessage, encodeClientMessage, type ServerMessage } from '@tdt/protocol';
import { matchReplay, replayMatch, snapshot, tuningForMode, TUNING, waveGroups, type Match } from '@tdt/sim';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  allSettled,
  ART_HOLD_MS,
  artFraction,
  creepKinds,
  firstWaveSheets,
  holdOver,
  onlineLineAllowed,
  type SheetProgress,
} from '../src/artLoad/rules';
import { fetchWithProgress, sheetOff, sheetProgress, trackSheet } from '../src/artLoad/track';
import { isMediaPath, isOnDemandSheet, swSource } from '../src/platform/swSource';
import { SimHost } from '../src/transport/simHost';

// The controller starts the downloads through order.ts, which loads Pixi and the sheets: not here.
const wanted: string[][] = [];
vi.mock('../src/artLoad/order', () => ({ wantFirstWave: (ids: string[]) => wanted.push([...ids]) }));
const { FirstWaveArt } = await import('../src/artLoad/firstWave');

const p = (status: SheetProgress['status'], received = 0, expected: number | null = null): SheetProgress => ({ status, received, expected });

describe('the first wave\'s art: which pictures', () => {
  it('is the map plate, the structures, the first wave\'s creep kinds and the picked hero, in that order', () => {
    expect(firstWaveSheets(tuningForMode(TUNING, 'full'), ['ranger'])).toEqual(['plate', 'structures', 'creep:grunt', 'hero:ranger']);
    // Quick's first wave has Runners too; Endless's is Full's.
    expect(firstWaveSheets(tuningForMode(TUNING, 'quick'), ['warden'])).toEqual(['plate', 'structures', 'creep:grunt', 'creep:runner', 'hero:warden']);
    expect(firstWaveSheets(tuningForMode(TUNING, 'endless'), ['arcanist'])).toEqual(['plate', 'structures', 'creep:grunt', 'hero:arcanist']);
  });

  it('reads the kinds from waveGroups(tuning, 1), each once, whatever the mode', () => {
    for (const mode of ['full', 'quick', 'endless'] as const) {
      const tuning = tuningForMode(TUNING, mode);
      const kinds = [...new Set(waveGroups(tuning, 1).map((g) => g.kind))];
      expect(creepKinds(firstWaveSheets(tuning, ['ranger'])), mode).toEqual(kinds);
    }
  });

  it('online: every hero in the room, each once', () => {
    const ids = firstWaveSheets(tuningForMode(TUNING, 'full'), ['warden', 'arcanist', 'warden']);
    expect(ids.filter((id) => id.startsWith('hero:'))).toEqual(['hero:warden', 'hero:arcanist']);
  });
});

describe('the first wave\'s art: the hold', () => {
  it('ends when every picture is in, at once', () => {
    expect(holdOver([p('in'), p('in'), p('in')], 0)).toBe(true);
  });

  it('ends at 6 s with pictures still coming, not before', () => {
    const items = [p('in'), p('loading', 10, 100), p('idle')];
    expect(ART_HOLD_MS).toBe(6000);
    expect(holdOver(items, 0)).toBe(false);
    expect(holdOver(items, 5999)).toBe(false);
    expect(holdOver(items, 6000)).toBe(true);
  });

  it('does not wait for a picture that failed or that this build does not load', () => {
    expect(allSettled([p('in'), p('failed'), p('off')])).toBe(true);
    expect(holdOver([p('in'), p('failed'), p('off')], 10)).toBe(true);
    expect(allSettled([p('in'), p('loading')])).toBe(false);
  });
});

describe('the first wave\'s art: how far along', () => {
  it('is the bytes received over the bytes expected once every picture has told its size', () => {
    expect(artFraction([p('loading', 50, 100), p('loading', 0, 300)])).toBeCloseTo(50 / 400);
    // A picture that is in counts whole.
    expect(artFraction([p('in', 100, 100), p('loading', 150, 300)])).toBeCloseTo(250 / 400);
    // Never past a file's size.
    expect(artFraction([p('loading', 500, 100), p('loading', 0, 100)])).toBeCloseTo(0.5);
  });

  it('is the share of pictures in while a size is unknown (no Content-Length, or not asked for yet)', () => {
    expect(artFraction([p('in', 100, 100), p('loading', 10, null), p('idle'), p('failed')])).toBeCloseTo(2 / 4);
    expect(artFraction([p('loading', 0, 100), p('idle')])).toBe(0);
  });

  it('leaves out what this build does not load, and is 1 once everything is in', () => {
    expect(artFraction([p('off'), p('loading', 30, 60)])).toBeCloseTo(0.5);
    expect(artFraction([p('in', 1, 1), p('failed'), p('off')])).toBe(1);
    expect(artFraction([])).toBe(1);
  });

  it('online, the line is for the build phase and the first wave only', () => {
    expect(onlineLineAllowed('build', 0)).toBe(true);
    expect(onlineLineAllowed('waves', 1)).toBe(true);
    expect(onlineLineAllowed('waves', 2)).toBe(false);
    expect(onlineLineAllowed('victory', 1)).toBe(false);
    expect(onlineLineAllowed('defeat', 1)).toBe(false);
  });
});

describe('the first wave\'s art: the downloads', () => {
  it('tracks a picture from loading to in, and leaves a picture that is off alone once it has started', () => {
    expect(sheetProgress('hero:warden')).toEqual(p('idle'));
    const t = trackSheet('hero:warden');
    t.bytes(40, 100);
    expect(sheetProgress('hero:warden')).toEqual(p('loading', 40, 100));
    t.done(true);
    expect(sheetProgress('hero:warden')).toEqual(p('in', 100, 100));
    sheetOff('hero:warden');
    expect(sheetProgress('hero:warden').status).toBe('in');
    sheetOff('creep:shardback');
    expect(sheetProgress('creep:shardback').status).toBe('off');
  });

  it('reads a file in chunks, its bytes against its Content-Length; a compressed answer has no size to go by', async () => {
    const chunks = [new Uint8Array(3), new Uint8Array(5), new Uint8Array(2)];
    const answer = (headers: Record<string, string>) =>
      new Response(new ReadableStream({ start: (c) => (chunks.forEach((x) => c.enqueue(x)), c.close()) }), { headers });
    const real = globalThis.fetch;
    try {
      globalThis.fetch = (async () => answer({ 'content-length': '10', 'content-type': 'image/webp' })) as typeof fetch;
      const seen: [number, number | null][] = [];
      const blob = await fetchWithProgress('/a.webp', (r, e) => seen.push([r, e]));
      expect(seen).toEqual([[0, 10], [3, 10], [8, 10], [10, 10]]);
      expect([blob.size, blob.type]).toEqual([10, 'image/webp']);
      globalThis.fetch = (async () => answer({ 'content-length': '4', 'content-encoding': 'br' })) as typeof fetch;
      const sizes: (number | null)[] = [];
      await fetchWithProgress('/b.webp', (_r, e) => sizes.push(e));
      expect(new Set(sizes)).toEqual(new Set([null]));
      globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;
      await expect(fetchWithProgress('/c.webp')).rejects.toThrow('404');
    } finally {
      globalThis.fetch = real;
    }
  });
});

/** A stand-in for the HUD's line. */
function fakeLine() {
  const line = { shown: false, fraction: -1, shows: 0, show: (f: number) => ((line.shown = true), (line.fraction = f), line.shows++), hide: () => (line.shown = false) };
  return line;
}

describe('the first wave\'s art: a match holding its start', () => {
  beforeEach(() => {
    wanted.length = 0;
  });

  it('solo: holds before the first tick, shows the line, releases the moment the set is in', () => {
    const line = fakeLine();
    const art = new FirstWaveArt(line as never);
    const holds: boolean[] = [];
    art.begin(0, { solo: true, hold: (on) => holds.push(on), pick: { mode: 'quick', heroes: ['arcanist'] } });
    expect(wanted).toEqual([['plate', 'structures', 'creep:grunt', 'creep:runner', 'hero:arcanist']]);
    expect([art.held, holds]).toEqual([true, [true]]);
    for (const id of ['plate', 'structures', 'creep:grunt', 'creep:runner'] as const) trackSheet(id).done(true);
    trackSheet('hero:arcanist').bytes(10, 100);
    art.frame(2000, undefined);
    expect([art.held, line.shown]).toEqual([true, true]);
    expect(line.fraction).toBeCloseTo(4 / 5);
    trackSheet('hero:arcanist').done(true);
    art.frame(2500, undefined);
    expect([art.held, holds, line.shown]).toEqual([false, [true, false], false]);
  });

  it('solo: releases at 6 s with pictures still coming, and never holds when everything is in already', () => {
    const line = fakeLine();
    const art = new FirstWaveArt(line as never);
    const holds: boolean[] = [];
    trackSheet('hero:ranger');
    art.begin(1000, { solo: true, hold: (on) => holds.push(on), pick: { mode: 'full', heroes: ['ranger'] } });
    art.frame(6999, undefined);
    expect(art.held).toBe(true);
    art.frame(7000, undefined);
    expect([art.held, holds, line.shown]).toEqual([false, [true, false], false]);
    // Later frames never bring it back.
    art.frame(9000, undefined);
    expect(line.shown).toBe(false);
    trackSheet('hero:ranger').done(true);
    const again: boolean[] = [];
    art.begin(0, { solo: true, hold: (on) => again.push(on), pick: { mode: 'full', heroes: ['ranger'] } });
    art.frame(1, undefined);
    expect([art.held, again, line.shown]).toEqual([false, [], false]);
  });

  it('online: never holds; the line shows while the set loads, until the first wave is over', () => {
    const line = fakeLine();
    const art = new FirstWaveArt(line as never);
    trackSheet('hero:warden');
    art.begin(0, { solo: false, hold: null, pick: null });
    expect(wanted).toEqual([]);
    const snap = (phase: 'build' | 'waves', wave: number) =>
      ({ phase, wave, mode: 'full', heroes: [{ kind: 'warden' }, { kind: 'ranger' }] }) as never;
    art.frame(100, snap('build', 0));
    expect(wanted).toEqual([['plate', 'structures', 'creep:grunt', 'hero:warden', 'hero:ranger']]);
    expect([art.held, line.shown]).toEqual([false, true]);
    art.frame(20_000, snap('waves', 1));
    expect(line.shown).toBe(true);
    art.frame(40_000, snap('waves', 2));
    expect(line.shown).toBe(false);
  });

  it('a match that ends releases its hold', () => {
    const art = new FirstWaveArt(fakeLine() as never);
    const holds: boolean[] = [];
    trackSheet('hero:warden');
    art.begin(0, { solo: true, hold: (on) => holds.push(on), pick: { mode: 'full', heroes: ['warden'] } });
    art.end();
    expect([art.held, holds]).toEqual([false, [true, false]]);
  });
});

describe('the first wave\'s art: the host\'s clock', () => {
  const posted: unknown[] = [];
  const RealWorker = globalThis.Worker;
  beforeEach(() => {
    posted.length = 0;
    globalThis.Worker = class {
      onmessage: unknown = null;
      postMessage(m: unknown) {
        posted.push(m);
      }
      terminate() {}
    } as unknown as typeof Worker;
  });
  afterEach(() => {
    globalThis.Worker = RealWorker;
  });

  it('is held with the pause control, and runs only while neither the hold nor a hidden page holds it', async () => {
    const { LocalTransport } = await import('../src/transport/localTransport');
    const t = new LocalTransport();
    const last = () => posted.at(-1);
    t.hold(true);
    expect(last()).toEqual({ ctl: 'pause', paused: true });
    t.setPaused(true);
    t.hold(false);
    expect(last()).toEqual({ ctl: 'pause', paused: true });
    t.setPaused(false);
    expect(last()).toEqual({ ctl: 'pause', paused: false });
    t.hold(true);
    t.setPaused(true);
    t.setPaused(false);
    expect(last()).toEqual({ ctl: 'pause', paused: true });
  });

  it('a held start steps no tick: its orders wait for the first one, and the replay ends the same', () => {
    const out: ServerMessage[] = [];
    const host = new SimHost((raw) => out.push(decodeServerMessage(raw)!), () => 7);
    host.receive(encodeClientMessage({ t: 'mode', mode: 'quick' }));
    // Held: orders arrive, no tick runs.
    host.receive(encodeClientMessage({ t: 'cmd', cmd: { type: 'build', padId: 0, tower: 'arrow' } }));
    host.receive(encodeClientMessage({ t: 'cmd', cmd: { type: 'move', x: 12, y: 30 } }));
    const snaps = () => out.filter((m) => m.t === 'snapshot').map((m) => (m as Extract<ServerMessage, { t: 'snapshot' }>).snap);
    expect(snaps().at(-1)!.tick).toBe(0);
    for (let i = 0; i < 400; i++) host.tick();
    const match = (host as unknown as { match: Match }).match;
    const replay = matchReplay(match);
    expect(replay.log.slice(0, 2)).toEqual([
      [0, 0, 'build', 0, 'arrow'],
      [0, 0, 'move', 12, 30],
    ]);
    const again = replayMatch(replay);
    expect(again.state.tick).toBe(400);
    expect(JSON.stringify({ ...snapshot(again.state), events: [] })).toBe(JSON.stringify({ ...snapshot(match.state), events: [] }));
  });
});

describe('the first wave\'s art: the service worker', () => {
  const STRUCTURES = '/assets/structures-match-Bf8A_88E.webp';
  const SHEETS = ['/assets/grunt-match-Co320hkV.webp', '/assets/shardback-match-D9-c_Gh.webp', '/assets/ranger-match-CB7K37RF.png', '/assets/warden-match-BRXA0Qy2.png'];

  it('precaches the structures\' sheet and the map plate with the shell; the creeps\' and heroes\' sheets are not', () => {
    expect(isOnDemandSheet(STRUCTURES)).toBe(false);
    expect(isOnDemandSheet('/map/spire.webp')).toBe(false);
    for (const s of SHEETS) {
      expect(isOnDemandSheet(s), s).toBe(true);
      expect(isMediaPath(s), s).toBe(false);
    }
    expect(isOnDemandSheet('/assets/index-CeQBLyDq.js')).toBe(false);
    expect(isOnDemandSheet('/assets/ui-CDnhCoLV.webp')).toBe(false);
    const sw = swSource('v', ['/index.html', '/map/spire.webp', STRUCTURES, ...SHEETS]);
    const shell = JSON.parse(/const SHELL = (\[.*\]);/.exec(sw)![1]!) as string[];
    expect(shell).toEqual(['/index.html', '/map/spire.webp', STRUCTURES]);
  });

  it('keeps a creep\'s or hero\'s sheet the first time a match asks for it, in this version\'s cache', async () => {
    const stores = new Map<string, Map<string, string>>();
    const net: string[] = [];
    const store = (name: string) => stores.get(name) ?? stores.set(name, new Map()).get(name)!;
    const res = (url: string, body: string) => ({ ok: true, status: 200, url, body, clone: () => res(url, body) });
    const listeners: Record<string, (e: unknown) => void> = {};
    const self = {
      location: { origin: 'https://td.test' },
      addEventListener: (type: string, f: (e: unknown) => void) => (listeners[type] = f),
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    };
    const caches = {
      open: async (name: string) => ({
        addAll: async (urls: string[]) => urls.forEach((u) => store(name).set(`https://td.test${u}`, u)),
        match: async (req: { url: string } | string) => {
          const url = typeof req === 'string' ? req : req.url;
          const body = store(name).get(url);
          return body === undefined ? undefined : res(url, body);
        },
        put: async (req: { url: string } | string, r: { body: string }) => void store(name).set(typeof req === 'string' ? req : req.url, r.body),
      }),
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async (req: { url: string }) => {
        for (const s of stores.values()) if (s.has(req.url)) return res(req.url, s.get(req.url)!);
        return undefined;
      },
    };
    const fetch = async (req: { url: string } | string) => {
      const url = typeof req === 'string' ? req : req.url;
      net.push(url);
      return res(url, `net:${url}`);
    };
    new Function('self', 'caches', 'fetch', swSource('v1', ['/index.html', STRUCTURES, ...SHEETS]))(self, caches, fetch);
    let installed: Promise<unknown> | undefined;
    listeners.install!({ waitUntil: (w: Promise<unknown>) => (installed = w) });
    await installed;
    expect([...store('tdt-v1').keys()]).toEqual(['https://td.test/index.html', `https://td.test${STRUCTURES}`]);
    const get = async (path: string) => {
      let answered: Promise<{ body: string }> | undefined;
      listeners.fetch!({ request: { method: 'GET', url: `https://td.test${path}`, mode: 'cors' }, respondWith: (a: Promise<{ body: string }>) => (answered = a) });
      const r = await answered!;
      await new Promise((ok) => setTimeout(ok, 0));
      return r.body;
    };
    const grunt = SHEETS[0]!;
    expect(await get(grunt)).toBe(`net:https://td.test${grunt}`);
    expect(await get(grunt)).toBe(`net:https://td.test${grunt}`);
    expect(net).toEqual([`https://td.test${grunt}`]);
    expect(store('tdt-v1').has(`https://td.test${grunt}`)).toBe(true);
    // The structures' sheet comes from the shell: no network.
    expect(await get(STRUCTURES)).toBe(STRUCTURES);
    expect(net).toHaveLength(1);
    // A first visit's page loaded the others before the worker was its own: told which, the worker keeps them (from
    // the HTTP cache), and nothing else: not the structures (in the shell), another site's file or a script.
    net.length = 0;
    let kept: Promise<unknown> | undefined;
    listeners.message!({
      data: { type: 'KEEP_SHEETS', urls: [...SHEETS, STRUCTURES, 'https://elsewhere.test/assets/grunt-match-x.webp', '/assets/index-a.js', 7] },
      waitUntil: (w: Promise<unknown>) => (kept = w),
    });
    await kept;
    expect(net).toEqual(SHEETS.slice(1).map((sh) => `https://td.test${sh}`));
    for (const sh of SHEETS) expect(store('tdt-v1').has(`https://td.test${sh}`), sh).toBe(true);
  });
});
