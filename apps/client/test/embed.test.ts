// The hosted build (docs/DEPLOY.md "Hosted builds"): one zip a game site serves from its own origin, under a path of
// its choosing, in a frame. Its settings and page (platform/embedHost.ts), its service worker (the site's, relative to
// the upload's folder: platform/swSource.ts), the channel it counts visits under, its sound files' addresses, the zip
// (scripts/zip.ts) and what `npm run build:embed` reports about it (scripts/embedReport.ts).

import { describe, expect, it } from 'vitest';
import { headFiles, hostedLeavesOut, initialFiles, LIMITS, reportLines, staticImports } from '../scripts/embedReport';
import { readZip, writeZip } from '../scripts/zip';
import { CHANNELS, hostedChannel } from '../src/analytics/channel';
import { rebaseSoundFiles, soundFiles } from '../src/audio/files';
import { inviteLink } from '../src/lobby/lobby';
import {
  CANONICAL_ORIGIN,
  canonicalUrl,
  embedConfigFromEnv,
  hostedHtml,
  linkless,
  markPrivacy,
  parseCanonical,
} from '../src/platform/embedHost';
import { swSource } from '../src/platform/swSource';

describe('hosted build: settings', () => {
  it('none without VITE_EMBED_HOST: the site\'s own build', () => {
    expect(embedConfigFromEnv({}, CHANNELS)).toBeNull();
    expect(embedConfigFromEnv({ VITE_EMBED_HOST: ' ', VITE_CHANNEL: 'itch' }, CHANNELS)).toBeNull();
  });

  it('a host: its own channel and the real game by default', () => {
    expect(embedConfigFromEnv({ VITE_EMBED_HOST: 'itch' }, CHANNELS)).toEqual({ host: 'itch', channel: 'itch', canonical: CANONICAL_ORIGIN });
    expect(embedConfigFromEnv({ VITE_EMBED_HOST: 'newgrounds' }, CHANNELS)?.channel).toBe('newgrounds');
    expect(embedConfigFromEnv({ VITE_EMBED_HOST: 'crazygames' }, CHANNELS)?.channel).toBe('crazygames');
    expect(
      embedConfigFromEnv({ VITE_EMBED_HOST: 'itch', VITE_CHANNEL: 'discord', VITE_CANONICAL_ORIGIN: 'https://example.com/' }, CHANNELS),
    ).toEqual({ host: 'itch', channel: 'discord', canonical: 'https://example.com' });
  });

  it('refuses a host, a channel or an origin it cannot use', () => {
    expect(() => embedConfigFromEnv({ VITE_EMBED_HOST: 'kongregate' }, CHANNELS)).toThrow(/VITE_EMBED_HOST/);
    expect(() => embedConfigFromEnv({ VITE_EMBED_HOST: 'itch', VITE_CHANNEL: 'nowhere' }, CHANNELS)).toThrow(/VITE_CHANNEL/);
    expect(() => embedConfigFromEnv({ VITE_EMBED_HOST: 'itch', VITE_CHANNEL: 'direct' }, CHANNELS)).toThrow(/VITE_CHANNEL/);
    expect(() => embedConfigFromEnv({ VITE_EMBED_HOST: 'itch', VITE_CANONICAL_ORIGIN: 'http://example.com' }, CHANNELS)).toThrow(/https/);
  });

  it('the canonical origin: https, or plain http on this machine (the harness)', () => {
    expect(parseCanonical('https://tgt-td-cld.vercel.app')).toBe('https://tgt-td-cld.vercel.app');
    expect(parseCanonical('http://localhost:4183/')).toBe('http://localhost:4183');
    expect(parseCanonical('http://127.0.0.1:4183')).toBe('http://127.0.0.1:4183');
    expect(parseCanonical('http://tgt-td-cld.vercel.app')).toBeNull();
    expect(parseCanonical('https://tgt-td-cld.vercel.app/play')).toBeNull();
    expect(parseCanonical('https://tgt-td-cld.vercel.app/?src=itch')).toBeNull();
    expect(parseCanonical('not a url')).toBeNull();
    expect(canonicalUrl('https://a.test', '/privacy.html#age')).toBe('https://a.test/privacy.html#age');
    expect(canonicalUrl('https://a.test', 'privacy.html')).toBe('https://a.test/privacy.html');
  });

  it('the page: links to the site\'s pages go to the real game, and no manifest (never installed)', () => {
    const html = [
      '<link rel="icon" href="./favicon.svg" type="image/svg+xml" />',
      '<link rel="manifest" href="./manifest.webmanifest" />',
      '<meta property="og:image" content="https://tgt-td-cld.vercel.app/og-card.png" />',
      '<a id="lobby-privacy" href="/privacy.html" target="_blank" rel="noopener">Privacy</a>',
      '<a href="/privacy.html#endless" target="_blank">Privacy</a>',
      '<p class="back"><a href="/">← Back to the game</a></p>',
      '<a href="#keep">below</a>',
    ].join('\n');
    const out = hostedHtml(html, 'https://g.test');
    expect(out).not.toContain('rel="manifest"');
    expect(out).toContain('<link rel="icon" href="./favicon.svg"');
    expect(out).toContain('<a id="lobby-privacy" href="https://g.test/privacy.html" target="_blank"');
    expect(out).toContain('href="https://g.test/privacy.html#endless"');
    expect(out).toContain('<a href="https://g.test/">← Back');
    expect(out).toContain('<a href="#keep">');
    expect(out).toContain('content="https://tgt-td-cld.vercel.app/og-card.png"');
  });

  it('a linkless host (CrazyGames, q5): only CrazyGames, and its privacy links marked so the page hides its way back', () => {
    expect(linkless('crazygames')).toBe(true);
    expect(linkless('itch')).toBe(false);
    expect(linkless('newgrounds')).toBe(false);
    expect(markPrivacy('https://g.test/privacy.html')).toBe('https://g.test/privacy.html?hosted');
    expect(markPrivacy('https://g.test/privacy.html#age')).toBe('https://g.test/privacy.html?hosted#age');
    expect(markPrivacy('/privacy.html?x=1#daily')).toBe('/privacy.html?x=1&hosted#daily');
    expect(markPrivacy('https://g.test/')).toBe('https://g.test/');
    const html = '<a id="lobby-privacy" href="/privacy.html" target="_blank">Privacy</a>\n<a href="/privacy.html#endless">P</a>';
    const out = hostedHtml(html, 'https://g.test', 'crazygames');
    expect(out).toContain('href="https://g.test/privacy.html?hosted"');
    expect(out).toContain('href="https://g.test/privacy.html?hosted#endless"');
    expect(hostedHtml(html, 'https://g.test', 'itch')).toBe(hostedHtml(html, 'https://g.test'));
  });

  it('the invite link names the real game, never the frame\'s address', () => {
    expect(inviteLink('AB12C', 'https://tgt-td-cld.vercel.app/')).toBe('https://tgt-td-cld.vercel.app/?room=AB12C');
    expect(inviteLink('AB12C', 'https://html.itch.zone/html/123/index.html?x=1#y')).toBe('https://html.itch.zone/html/123/index.html?room=AB12C');
  });
});

describe('hosted build: the channel', () => {
  it('a visit with no tag counts under the host, whatever the referrer or a saved channel', () => {
    expect(hostedChannel('', 'https://itch.io/games', null, 'itch')).toEqual({ channel: 'itch', save: false, clear: false });
    expect(hostedChannel('?lab', 'https://pyaythein.itch.io/tdt', 'friends', 'itch').channel).toBe('itch');
    expect(hostedChannel('?src=', '', 'cold', 'newgrounds').channel).toBe('newgrounds');
  });

  it('a tag still wins, as on the site', () => {
    expect(hostedChannel('?src=friends', '', null, 'itch')).toEqual({ channel: 'friends', save: true, clear: false });
    expect(hostedChannel('?utm_source=discord', '', null, 'itch').channel).toBe('discord');
    expect(hostedChannel('?src=whatever', '', null, 'itch').channel).toBe('other');
  });
});

describe('hosted build: sound files', () => {
  it('come from the upload\'s folder, not the host\'s root', () => {
    const files = soundFiles(
      [
        { dir: 'music', name: 'lobby', hash: 'abc', gain: 0.8 },
        { dir: 'sfx', name: 'build', hash: 'def' },
      ],
      ['build'],
    );
    expect(files.music.lobby).toBe('/music/lobby.mp3?v=abc');
    const hosted = rebaseSoundFiles(files, 'https://html.itch.zone/html/123/index.html');
    expect(hosted.music.lobby).toBe('https://html.itch.zone/html/123/music/lobby.mp3?v=abc');
    expect(hosted.sfx.build).toBe('https://html.itch.zone/html/123/sfx/build.mp3?v=def');
    expect(hosted.gains).toEqual({ lobby: 0.8 });
  });
});

/** A worker run against fake caches, at `href` (its script's URL). */
function runWorker(source: string, href: string) {
  const origin = new URL(href).origin;
  const stores = new Map<string, Map<string, string>>();
  const net: string[] = [];
  const store = (name: string) => stores.get(name) ?? stores.set(name, new Map()).get(name)!;
  const res = (url: string, body: string) => ({ ok: true, status: 200, url, body, clone: () => res(url, body) });
  const listeners: Record<string, (e: unknown) => void> = {};
  const self = {
    location: { origin, href },
    addEventListener: (type: string, f: (e: unknown) => void) => (listeners[type] = f),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  const caches = {
    open: async (name: string) => ({
      addAll: async (urls: string[]) => urls.forEach((u) => store(name).set(new URL(u, href).href, u)),
      match: async (req: { url: string } | string) => {
        const url = typeof req === 'string' ? req : req.url;
        const body = store(name).get(url);
        return body === undefined ? undefined : res(url, body);
      },
      put: async (req: { url: string } | string, r: { body: string }) => void store(name).set(typeof req === 'string' ? req : req.url, r.body),
    }),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async () => {
      throw new Error('a hosted worker must ask its own cache, never every cache on the host\'s origin');
    },
  };
  const fetch = async (req: { url: string } | string) => {
    const url = typeof req === 'string' ? req : req.url;
    net.push(url);
    return res(url, `net:${url}`);
  };
  new Function('self', 'caches', 'fetch', source)(self, caches, fetch);
  const wait = async (type: string, data?: unknown) => {
    let p: Promise<unknown> | undefined;
    listeners[type]!({ data, waitUntil: (w: Promise<unknown>) => (p = w) });
    await p;
  };
  /** The worker's answer to a GET, or null when it leaves the request to the browser. */
  const get = async (url: string, mode = 'cors'): Promise<string | null> => {
    let answered: Promise<{ body: string }> | undefined;
    listeners.fetch!({ request: { method: 'GET', url, mode, headers: { get: () => null } }, respondWith: (a: Promise<{ body: string }>) => (answered = a) });
    if (!answered) return null;
    const r = await answered;
    await new Promise((ok) => setTimeout(ok, 0));
    return r.body;
  };
  return { stores, store, net, wait, get };
}

describe('hosted build: the service worker', () => {
  const ROOT = 'https://html.itch.zone/html/1234567/';
  const SHEET = '/assets/grunt-match-Co320hkV.webp';
  const FILES = ['/index.html', '/assets/index-a.js', '/map/spire.webp', '/assets/structures-match-x.webp', SHEET, '/music/lobby.mp3', '/stage/ranger.mp4', '/og-card.png'];

  it('the site\'s worker is unchanged: absolute paths and its own cache names', () => {
    const site = swSource('v1', FILES);
    expect(site.startsWith("// Generated by vite.config.ts at build time. Do not edit.\nconst CACHE = 'tdt-v1';\nconst MEDIA = 'tdt-media';\n")).toBe(true);
    expect(JSON.parse(/const SHELL = (\[.*\]);/.exec(site)![1]!)).toEqual(['/index.html', '/assets/index-a.js', '/map/spire.webp']);
    expect(site).not.toContain('tdt@');
    expect(swSource('v1', FILES, false)).toBe(site);
  });

  it('its shell is relative to its folder and its caches carry that folder', async () => {
    const hosted = swSource('v1', FILES, true);
    expect(JSON.parse(/const SHELL = (\[.*\]);/.exec(hosted)![1]!)).toEqual(['index.html', 'assets/index-a.js', 'map/spire.webp']);
    const w = runWorker(hosted, `${ROOT}sw.js`);
    await w.wait('install');
    expect([...w.stores.keys()]).toEqual(['tdt@/html/1234567/:v1']);
    expect([...w.store('tdt@/html/1234567/:v1').keys()]).toEqual([
      `${ROOT}index.html`,
      `${ROOT}assets/index-a.js`,
      `${ROOT}map/spire.webp`,
    ]);
  });

  it('on activate it drops only its own folder\'s older caches: never another upload\'s, another game\'s or the media', async () => {
    const w = runWorker(swSource('v2', FILES, true), `${ROOT}sw.js`);
    for (const name of ['tdt@/html/1234567/:v1', 'tdt@/html/1234567/:media', 'tdt@/html/7654321/:v1', 'tdt-abc123', 'tdt-media', 'another-game-v3']) w.store(name);
    await w.wait('install');
    await w.wait('activate');
    expect([...w.stores.keys()].sort()).toEqual(
      ['another-game-v3', 'tdt-abc123', 'tdt-media', 'tdt@/html/1234567/:media', 'tdt@/html/1234567/:v2', 'tdt@/html/7654321/:v1'].sort(),
    );
  });

  it('answers only for its own files: not another folder, another origin or the worker itself', async () => {
    const w = runWorker(swSource('v1', FILES, true), `${ROOT}sw.js`);
    await w.wait('install');
    expect(await w.get(`${ROOT}assets/index-a.js`)).toBe('assets/index-a.js');
    expect(await w.get(`${ROOT}index.html?lab`, 'navigate')).toBe('index.html');
    expect(await w.get(`${ROOT}some/page`, 'navigate')).toBe('index.html');
    expect(await w.get('https://html.itch.zone/html/7654321/index.html', 'navigate')).toBeNull();
    expect(await w.get('https://html.itch.zone/html/7654321/assets/index-a.js')).toBeNull();
    expect(await w.get('https://tgt-td-server.example/analytics/count')).toBeNull();
    expect(await w.get(`${ROOT}sw.js`)).toBeNull();
    expect(w.net).toEqual([]);
  });

  it('keeps a creep\'s sheet in its own cache the first time, and the ones the page names under its folder only', async () => {
    const w = runWorker(swSource('v1', FILES, true), `${ROOT}sw.js`);
    await w.wait('install');
    expect(await w.get(`${ROOT}${SHEET.slice(1)}`)).toBe(`net:${ROOT}${SHEET.slice(1)}`);
    expect(w.store('tdt@/html/1234567/:v1').has(`${ROOT}${SHEET.slice(1)}`)).toBe(true);
    w.net.length = 0;
    const other = `${ROOT}assets/ranger-match-B.png`;
    await w.wait('message', {
      type: 'KEEP_SHEETS',
      urls: [other, 'https://html.itch.zone/html/7654321/assets/wisp-match-C.webp', `${ROOT}assets/index-a.js`, 3],
    });
    expect(w.net).toEqual([other]);
    // A hosted worker is never asked to skip waiting (no update banner).
    expect(swSource('v1', FILES, true)).not.toContain('SKIP_WAITING');
  });
});

describe('hosted build: the zip', () => {
  const text = (s: string) => new TextEncoder().encode(s);

  it('round-trips, index.html at its root, stored pictures and deflated text, the same bytes every time', () => {
    const files = [
      { path: 'index.html', data: text('<!doctype html>'.repeat(50)) },
      { path: 'assets/a.js', data: text('export const a = 1;\n'.repeat(100)) },
      { path: 'map/spire.webp', data: new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]) },
      { path: 'sfx/README.md', data: new Uint8Array() },
      { path: 'stage/ünïcode.txt', data: text('ok') },
    ];
    const zip = writeZip(files);
    expect(writeZip([...files].reverse()).equals(zip)).toBe(true);
    const back = readZip(zip);
    expect(back.map((e) => e.path)).toEqual(['assets/a.js', 'index.html', 'map/spire.webp', 'sfx/README.md', 'stage/ünïcode.txt']);
    for (const f of files) expect(Buffer.from(back.find((e) => e.path === f.path)!.data).equals(Buffer.from(f.data)), f.path).toBe(true);
    // The script is deflated (smaller than itself), the picture stored as it is.
    expect(zip.length).toBeLessThan(files.reduce((n, f) => n + f.data.length, 0));
    expect(zip.indexOf(Buffer.from([82, 73, 70, 70, 1, 2, 3, 4]))).toBeGreaterThan(0);
  });

  it('refuses a path twice, a leading slash or a way out', () => {
    const d = new Uint8Array([1]);
    expect(() => writeZip([{ path: 'a', data: d }, { path: 'a', data: d }])).toThrow(/Twice/);
    expect(() => writeZip([{ path: '/index.html', data: d }])).toThrow(/Bad zip path/);
    expect(() => writeZip([{ path: '../index.html', data: d }])).toThrow(/Bad zip path/);
  });

  it('a damaged entry is caught', () => {
    const zip = writeZip([{ path: 'map/x.webp', data: new Uint8Array([9, 9, 9, 9]) }]);
    zip[zip.indexOf(Buffer.from([9, 9, 9, 9]))] = 8;
    expect(() => readZip(zip)).toThrow(/CRC/);
  });
});

describe('hosted build: what build:embed reports', () => {
  const html = `<!doctype html><html><head>
    <link rel="icon" href="./favicon.svg" type="image/svg+xml" />
    <script type="module" crossorigin src="./assets/index-A.js"></script>
    <link rel="modulepreload" crossorigin href="./assets/pixi-B.js">
    <link rel="stylesheet" crossorigin href="./assets/index-C.css">
    <meta property="og:image" content="https://tgt-td-cld.vercel.app/og-card.png" />
  </head></html>`;

  it('reads what index.html loads before its code runs', () => {
    expect(headFiles(html)).toEqual(['assets/index-A.js', 'favicon.svg', 'assets/pixi-B.js', 'assets/index-C.css']);
  });

  it('follows static imports, never dynamic ones', () => {
    const code = 'import{a as b}from"./pixi-B.js";import"./side-D.js";const m=()=>import("./showcase-E.js");export{x}from"../assets/re-F.js";';
    expect(staticImports(code, 'assets/index-A.js')).toEqual(['assets/pixi-B.js', 'assets/side-D.js', 'assets/re-F.js']);
  });

  it('the initial download: the page, its head, their static imports and the first screen\'s pictures', () => {
    const files = new Map<string, Uint8Array>([
      ['index.html', new Uint8Array(100)],
      ['favicon.svg', new Uint8Array(10)],
      ['assets/index-A.js', new TextEncoder().encode('import"./side-D.js";import("./showcase-E.js")')],
      ['assets/pixi-B.js', new Uint8Array(1000)],
      ['assets/index-C.css', new Uint8Array(50)],
      ['assets/side-D.js', new Uint8Array(5)],
      ['assets/showcase-E.js', new Uint8Array(9999)],
      ['stage/clearing.webp', new Uint8Array(300)],
      ['stage/ranger-poster.webp', new Uint8Array(200)],
      ['music/lobby.mp3', new Uint8Array(5000)],
    ]);
    files.set('index.html', new TextEncoder().encode(html));
    expect(initialFiles(files)).toEqual([
      'assets/index-A.js',
      'assets/index-C.css',
      'assets/pixi-B.js',
      'assets/side-D.js',
      'favicon.svg',
      'index.html',
      'stage/clearing.webp',
      'stage/ranger-poster.webp',
    ]);
    const lines = reportLines({ zipPath: 'embed-itch-x.zip', zipBytes: 12_000, files });
    expect(lines.join('\n')).toContain(`files 10 / ${LIMITS.crazygames.files} ok`);
    expect(lines.join('\n')).not.toContain('OVER');
    expect(lines.join('\n')).not.toContain('phone homepage (no SDK');
  });

  it('a CrazyGames zip gets the whole build against its phone homepage\'s 20 MB on a line of its own (q4)', () => {
    const files = new Map([['index.html', new Uint8Array(10)]]);
    const ok = reportLines({ zipPath: 'embed-crazygames-x.zip', zipBytes: 18_900_000, files, host: 'crazygames' });
    expect(ok.at(-1)).toBe('CrazyGames phone homepage (no SDK, the whole build counts): zip 18.90 MB / 20.00 MB ok');
    const over = reportLines({ zipPath: 'embed-crazygames-x.zip', zipBytes: 27_700_000, files, host: 'crazygames' });
    expect(over.at(-1)).toContain('27.70 MB / 20.00 MB OVER');
    expect(reportLines({ zipPath: 'embed-itch-x.zip', zipBytes: 1, files, host: 'itch' }).join('\n')).not.toContain('phone homepage (no SDK');
  });

  it('a hosted zip carries one stage video a hero: the MP4s, never the WebMs (q4)', () => {
    expect(['stage/ranger.webm', 'stage/warden.webm', 'stage/arcanist.webm'].every(hostedLeavesOut)).toBe(true);
    for (const keep of ['stage/ranger.mp4', 'stage/ranger-poster.webp', 'stage/clearing.webp', 'music/lobby.mp3', 'assets/x.webm', 'index.html'])
      expect(hostedLeavesOut(keep), keep).toBe(false);
  });
});
