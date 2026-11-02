// `npm run build:embed -- itch` (or `newgrounds`, `crazygames`): the hosted build (docs/DEPLOY.md "Hosted builds"),
// one zip that runs inside the host's frame, with index.html at its root.
//
//   VITE_SERVER_URL=wss://… npm run build:embed -- itch      dist-embed-itch/ and embed-itch-<commit>.zip
//   npm run build:embed -- itch --e2e                         the browser test's build (e2e/embed.spec.ts)
//
// A Vite build in `--mode embed` with `VITE_EMBED_HOST` set (vite.config.ts): `base: './'`, so everything resolves
// from wherever the host puts the zip; the game server from VITE_SERVER_URL (the production one, as Vercel's build
// has it: read from the environment, never written in the repo); the channel baked in (VITE_CHANNEL, the host's own
// by default); the real game's origin (VITE_CANONICAL_ORIGIN, https://tgt-td-cld.vercel.app by default) for the
// invite link, the share card's link and the privacy page; `__BUILD__` the commit (with `-dirty` when the checkout
// has changes). Then the zip, and its size, file count and initial download against the hosts' limits.
//
// `--e2e` builds the same hosted build in the e2e mode (the `window.__tdt` hook) for the harness's local origins: the
// game server at ws://127.0.0.1:4182 and the canonical origin http://localhost:4183 (scripts/embedServe.ts `HARNESS`),
// into dist-embed-e2e/ and embed-e2e.zip.

import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL_ORIGIN, EMBED_HOSTS, isEmbedHost } from '../src/platform/embedHost';
import { reportLines } from './embedReport';
import { HARNESS } from './embedServe';
import { writeZip } from './zip';

const root = fileURLToPath(new URL('..', import.meta.url));

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

const args = process.argv.slice(2);
const e2e = args.includes('--e2e');
const host = args.find((a) => !a.startsWith('--')) ?? '';
if (!isEmbedHost(host)) die(`Usage: npm run build:embed -- <${EMBED_HOSTS.join('|')}> [--e2e]`);

let serverUrl = (process.env.VITE_SERVER_URL ?? '').trim();
if (e2e) serverUrl = HARNESS.serverUrl;
else if (!serverUrl) {
  die(
    'Set VITE_SERVER_URL to the production game server, as Vercel builds it (wss://…, Render), for example:\n' +
      '  VITE_SERVER_URL=wss://<the server> npm run build:embed -- itch\n' +
      'It is read from the environment and never written in the repo (docs/DEPLOY.md "Hosted builds").',
  );
} else if (!/^wss?:\/\/[^/\s]+/.test(serverUrl)) die(`VITE_SERVER_URL must be a ws:// or wss:// URL, got "${serverUrl}"`);
if (!e2e && serverUrl.startsWith('ws://')) console.warn(`Warning: ${serverUrl} is not wss://; a host's https page can't reach it.`);

const sha = git(['rev-parse', 'HEAD']) || 'dev';
const dirty = sha !== 'dev' && git(['status', '--porcelain']) !== '';
const build = dirty ? `${sha}-dirty` : sha;
const outDir = e2e ? 'dist-embed-e2e' : `dist-embed-${host}`;
const zipName = e2e ? 'embed-e2e.zip' : `embed-${host}-${sha.slice(0, 12)}${dirty ? '-dirty' : ''}.zip`;
const env = {
  ...process.env,
  VITE_EMBED_HOST: host,
  VITE_SERVER_URL: serverUrl,
  VITE_CHANNEL: (process.env.VITE_CHANNEL ?? '').trim() || host,
  VITE_CANONICAL_ORIGIN: e2e ? HARNESS.siteOrigin : (process.env.VITE_CANONICAL_ORIGIN ?? '').trim() || CANONICAL_ORIGIN,
  TDT_BUILD_COMMIT: build,
};

console.log(
  `Hosted build for ${host}${e2e ? ' (browser test)' : ''}: channel ${env.VITE_CHANNEL}, canonical ${env.VITE_CANONICAL_ORIGIN}, ` +
    `game server ${new URL(serverUrl.replace(/^ws/, 'http')).host}, build ${build}`,
);
const vite = spawnSync('npx', ['vite', 'build', '--mode', e2e ? 'e2e' : 'embed', '--outDir', outDir, '--emptyOutDir'], {
  cwd: root,
  env,
  stdio: 'inherit',
});
if (vite.status !== 0) die('The build failed.');

const dist = join(root, outDir);
const files = new Map(listFiles(dist).map((p) => [p, readFileSync(join(dist, p))] as const));
if (!files.has('index.html')) die(`${outDir} has no index.html`);
const zip = writeZip([...files].map(([path, data]) => ({ path, data })));
writeFileSync(join(root, zipName), zip);
console.log('');
for (const line of reportLines({ zipPath: `apps/client/${zipName}`, zipBytes: zip.length, files })) console.log(line);
