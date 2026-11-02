// `npm run embed:serve -- itch`: the hosted build's zip served as a game site serves it (docs/DEPLOY.md "Hosted
// builds"), so the zip Han uploads has already run in a frame: the zip's contents on one origin under a deep path
// (http://127.0.0.1:4180/some/deep/path/), a host page on another (http://localhost:4181/) that frames it at a phone's
// size (/) or a desktop's (/desktop) with text around it that scrolls, and no `?src=` anywhere. Cross-origin, a deep
// path, a frame and no tag are all real.
//
//   npm run embed:serve -- itch                    the newest embed-itch-*.zip in apps/client
//   npm run embed:serve -- --zip <file>            that zip
//   npm run embed:serve -- e2e --server            the browser test's zip (embed-e2e.zip, `build:embed -- itch --e2e`)
//                                                  with a local game server on :4182 and the zip as the "site" on :4183
//
// /sandboxed and /desktop/sandboxed frame it with `sandbox` and no `allow-same-origin` (an opaque origin: no storage,
// no service worker): no host of the three does that, but the page says what happens if one did.
// e2e/embed.spec.ts starts the same servers (`startHarness`).

import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from './zip';

/** The harness's origins and ports. The e2e build (`build:embed -- itch --e2e`) bakes `serverUrl` and `siteOrigin`. */
export const HARNESS = {
  framePort: 4180,
  frameOrigin: 'http://127.0.0.1:4180',
  /** Where the zip's contents live on the frame's origin: not `/`, as on every host. */
  path: '/some/deep/path/',
  hostPort: 4181,
  hostOrigin: 'http://localhost:4181',
  serverPort: 4182,
  serverUrl: 'ws://127.0.0.1:4182',
  /** The stand-in for the real game (the canonical origin of the e2e build): the same files at the root. */
  sitePort: 4183,
  siteOrigin: 'http://localhost:4183',
} as const;

/** The frame's sizes on the host page. */
export const FRAME_SIZES = { phone: { width: 412, height: 839 }, desktop: { width: 1280, height: 720 } } as const;

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  webmanifest: 'application/manifest+json',
  svg: 'image/svg+xml',
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
};

function typeOf(path: string): string {
  return TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';
}

/** A file of `dir` by its path, or undefined (never outside `dir`). */
function fromDir(dir: string, path: string): Uint8Array | undefined {
  if (path.split('/').includes('..')) return undefined;
  try {
    return readFileSync(join(dir, path));
  } catch {
    return undefined;
  }
}

/**
 * Serves `files` under `base` (index.html for the folder itself), with byte ranges as a CDN answers video. A path not
 * in `files` comes from `fallback` (a folder), when there is one.
 */
function serveFiles(
  files: ReadonlyMap<string, Uint8Array>,
  base: string,
  req: IncomingMessage,
  res: ServerResponse,
  fallback?: string,
  cors = false,
): void {
  const url = new URL(req.url ?? '/', 'http://x');
  let path = decodeURIComponent(url.pathname);
  if (!path.startsWith(base)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found\n');
    return;
  }
  path = path.slice(base.length) || 'index.html';
  if (path.endsWith('/')) path += 'index.html';
  const data = files.get(path) ?? (fallback ? fromDir(fallback, path) : undefined);
  if (!data || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found\n');
    return;
  }
  const headers: Record<string, string> = { 'Content-Type': typeOf(path), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  if (cors) headers['Access-Control-Allow-Origin'] = '*';
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range && (range[1] || range[2])) {
    const size = data.byteLength;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || end < start) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) });
    res.end(req.method === 'HEAD' ? undefined : Buffer.from(data.buffer, data.byteOffset + start, end - start + 1));
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': String(data.byteLength) });
  res.end(req.method === 'HEAD' ? undefined : Buffer.from(data.buffer, data.byteOffset, data.byteLength));
}

const FILLER = Array.from(
  { length: 6 },
  (_, i) => `<p>Comments, devlogs and more games (${i + 1}): the host's page goes on under the game, so it scrolls.</p>`,
).join('');

/** The host page: the game in a frame, with text above and below it, as itch.io's project page has. */
export function hostPage(size: keyof typeof FRAME_SIZES, sandboxed: boolean): string {
  const { width, height } = FRAME_SIZES[size];
  // itch.io's frame allows these (and no sandbox); a sandbox without allow-same-origin gives the frame an opaque origin.
  const sandbox = sandboxed ? ' sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock"' : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="data:," />
<title>Host page (${size}${sandboxed ? ', sandboxed' : ''})</title>
<style>
  body { margin: 0; background: #22262b; color: #ccd; font: 14px system-ui, sans-serif; }
  header { height: 24px; line-height: 24px; padding: 0 8px; background: #fa5c5c; color: #fff; }
  .wrap { display: flex; justify-content: center; }
  iframe { display: block; border: 0; width: ${width}px; height: ${height}px; max-width: 100vw; background: #000; }
  main { padding: 8px 12px 600px; }
</style></head>
<body>
<header>A game site's page around the frame</header>
<div class="wrap"><iframe id="game" src="${HARNESS.frameOrigin}${HARNESS.path}index.html"
  allow="autoplay; fullscreen *; gamepad; gyroscope; accelerometer; web-share; screen-wake-lock" allowfullscreen scrolling="no"${sandbox}></iframe></div>
<main>${FILLER}</main>
</body></html>`;
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });
}

export interface Harness {
  close(): Promise<void>;
}

/**
 * Starts the frame's origin (the zip under `HARNESS.path`; with `cors`, every file says `Access-Control-Allow-Origin:
 * *`, which an opaque-origin frame needs for its own scripts), the host page and, with `site`, the zip again at the
 * root of the canonical stand-in, with what the zip doesn't hold (the site's privacy page) from `siteFallback`, a site
 * build (dist-e2e). Resolves once all listen.
 */
export async function startHarness(
  zipPath: string,
  opts: { site?: boolean; siteFallback?: string; cors?: boolean } = {},
): Promise<Harness> {
  const files = new Map(readZip(readFileSync(zipPath)).map((e) => [e.path, e.data] as const));
  const frame = createServer((req, res) => serveFiles(files, HARNESS.path, req, res, undefined, opts.cors));
  const host = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname.replace(/\/+$/, '') || '/';
    const pages: Record<string, [keyof typeof FRAME_SIZES, boolean]> = {
      '/': ['phone', false],
      '/sandboxed': ['phone', true],
      '/desktop': ['desktop', false],
      '/desktop/sandboxed': ['desktop', true],
    };
    const page = pages[path];
    if (!page) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found\n');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(hostPage(...page));
  });
  const servers = [frame, host];
  await listen(frame, HARNESS.framePort, '127.0.0.1');
  await listen(host, HARNESS.hostPort, 'localhost');
  if (opts.site) {
    const site = createServer((req, res) => serveFiles(files, '/', req, res, opts.siteFallback));
    servers.push(site);
    await listen(site, HARNESS.sitePort, 'localhost');
  }
  return {
    close: () =>
      Promise.all(
        servers.map(
          (s) =>
            new Promise<void>((resolve) => {
              s.closeAllConnections();
              s.close(() => resolve());
            }),
        ),
      ).then(() => undefined),
  };
}

export interface GameServer {
  process: ChildProcess;
  close(): Promise<void>;
}

/**
 * A local game server on `HARNESS.serverPort` (apps/server, from source), allowing the harness's frame and site
 * origins, with analytics in memory. Resolves once /health answers.
 */
export async function startGameServer(): Promise<GameServer> {
  const serverDir = fileURLToPath(new URL('../../server/', import.meta.url));
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(HARNESS.serverPort),
      ALLOWED_ORIGINS: `${HARNESS.frameOrigin},${HARNESS.siteOrigin}`,
      ANALYTICS_DIR: 'memory',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout?.on('data', (d) => (log += String(d)));
  child.stderr?.on('data', (d) => (log += String(d)));
  const health = `http://127.0.0.1:${HARNESS.serverPort}/health`;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(`The game server stopped:\n${log}`);
    try {
      if ((await fetch(health)).ok) break;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 200));
    if (i === 149) throw new Error(`The game server did not answer ${health}:\n${log}`);
  }
  return {
    process: child,
    close: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        child.kill('SIGKILL');
      }),
  };
}

/** The newest `embed-<name>-*.zip` (or `embed-e2e.zip`) in apps/client. */
export function newestZip(name: string): string | null {
  const dir = fileURLToPath(new URL('..', import.meta.url));
  if (name === 'e2e') return join(dir, 'embed-e2e.zip');
  const zips = readdirSync(dir)
    .filter((f) => f.startsWith(`embed-${name}-`) && f.endsWith('.zip'))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return zips[0] ? join(dir, zips[0].f) : null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const zipAt = args.indexOf('--zip');
  const name = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--zip') ?? 'itch';
  const zip = zipAt >= 0 ? args[zipAt + 1] : newestZip(name);
  if (!zip) {
    console.error(`No embed-${name}-*.zip in apps/client: run npm run build:embed -- ${name} first.`);
    process.exit(1);
  }
  const withServer = args.includes('--server');
  const harness = await startHarness(zip, { site: withServer, cors: args.includes('--cors') });
  const server = withServer ? await startGameServer() : null;
  // Ctrl-C (or the terminal closing) stops the game server too, never leaving it on its port.
  const stop = () => void Promise.all([harness.close(), server?.close()]).finally(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.once('SIGHUP', stop);
  console.log(`Serving ${zip}`);
  console.log(`  the zip, as the host serves it:  ${HARNESS.frameOrigin}${HARNESS.path}`);
  console.log(`  the host page, phone size:       ${HARNESS.hostOrigin}/`);
  console.log(`  the host page, desktop size:     ${HARNESS.hostOrigin}/desktop`);
  console.log(`  sandboxed, no allow-same-origin: ${HARNESS.hostOrigin}/sandboxed`);
  if (withServer) console.log(`  the game server ${HARNESS.serverUrl} and the "site" ${HARNESS.siteOrigin}/`);
  else console.log(`  online play reaches the zip's game server only if its ALLOWED_ORIGINS lists ${HARNESS.frameOrigin}`);
  console.log('Ctrl-C stops.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
