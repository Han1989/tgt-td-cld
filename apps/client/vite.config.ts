import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { swSource } from './src/platform/swSource.ts';

/** The site's pages: the game, and the static privacy notice (docs/ANALYTICS.md), which loads none of the game. */
const PAGES = ['index.html', 'privacy.html'];

/**
 * Generates `sw.js` at build time (docs/MOBILE.md §7; the source is `src/platform/swSource.ts`): it
 * precaches the app shell (index.html, the hashed JS / CSS / worker chunks and the public files, but
 * not the recorded sound files, which it caches on first play) so the app starts fast and solo plays
 * offline. The cache name is a hash of the file list, so every deploy installs a new worker.
 */
function serviceWorker(): Plugin {
  let publicDir = '';
  return {
    name: 'tdt-service-worker',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const publicFiles = listFiles(publicDir).map((f) => `/${f}`);
      const built = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map') && f !== 'sw.js')
        .map((f) => `/${f}`);
      // The HTML pages are emitted after this hook, so they are listed by name.
      const pages = PAGES.map((page) => `/${page}`);
      const files = [
        ...pages,
        ...built.filter((f) => !pages.includes(f)),
        ...publicFiles.filter((f) => f !== '/sw.js'),
      ].sort();
      // Sound files change the version too (their hashes), so a new upload reaches players who have the app installed.
      const version = createHash('sha256')
        .update(files.join('\n'))
        .update(listSoundFiles(publicDir).map((f) => f.hash).join(','))
        .digest('hex')
        .slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(version, files) });
    },
  };
}

/** Size warnings (bytes): a music loop and an effect bigger than these are too big for a phone (docs/SOUND_FILES.md). */
const MUSIC_WARN = 4_500_000;
const SFX_WARN = 250_000;

interface SoundFile {
  dir: 'music' | 'sfx';
  name: string;
  hash: string;
  size: number;
}

/** The recorded sound files in public/music and public/sfx: name (without .mp3), a hash of the contents, size. */
function listSoundFiles(publicDir: string): SoundFile[] {
  const out: SoundFile[] = [];
  for (const dir of ['music', 'sfx'] as const) {
    let names: string[] = [];
    try {
      names = readdirSync(join(publicDir, dir));
    } catch {
      continue;
    }
    for (const file of names.sort()) {
      if (!/\.mp3$/i.test(file)) continue;
      const data = readFileSync(join(publicDir, dir, file));
      const hash = createHash('sha256').update(data).digest('hex').slice(0, 10);
      out.push({ dir, name: file.replace(/\.mp3$/i, ''), hash, size: data.length });
    }
  }
  return out;
}

/**
 * The file names a folder's README lists (table rows starting with `` `name.mp3` ``): the names the game
 * uses (a unit test keeps them equal to `MUSIC_FILES` and `SOUND_IDS`).
 */
function readmeNames(dir: string): Set<string> {
  let text = '';
  try {
    text = readFileSync(join(dir, 'README.md'), 'utf8');
  } catch {
    // No README: no names.
  }
  return new Set([...text.matchAll(/^\| `([^`]+)\.mp3` \|/gm)].map((m) => m[1]!));
}

/**
 * `virtual:tdt-sound-files`: the recorded sound files (docs/SOUND_FILES.md), listed when the app is
 * built or the dev server starts, so a file added to public/music or public/sfx plays with no code
 * change. A name the game doesn't know fails the build (a warning on the dev server); a file too big
 * for a phone gets a warning.
 */
function soundFiles(): Plugin {
  const ID = 'virtual:tdt-sound-files';
  const RESOLVED = `\0${ID}`;
  let publicDir = '';
  let building = false;
  return {
    name: 'tdt-sound-files',
    configResolved(config) {
      publicDir = config.publicDir;
      building = config.command === 'build';
    },
    resolveId(id) {
      return id === ID ? RESOLVED : null;
    },
    load(id) {
      if (id !== RESOLVED) return null;
      const files = listSoundFiles(publicDir);
      const known = { music: readmeNames(join(publicDir, 'music')), sfx: readmeNames(join(publicDir, 'sfx')) };
      for (const f of files) {
        if (!known[f.dir].has(f.name)) {
          // A misnamed upload fails the deploy (the pull request's check turns red) rather than go live silently.
          const msg = `public/${f.dir}/${f.name}.mp3 is not a name the game uses (see public/${f.dir}/README.md and docs/SOUND_FILES.md)`;
          if (building) this.error(msg);
          else this.warn(msg);
        }
        if (f.size > (f.dir === 'music' ? MUSIC_WARN : SFX_WARN)) {
          this.warn(`public/${f.dir}/${f.name}.mp3 is ${(f.size / 1e6).toFixed(1)} MB: too big for a phone (docs/SOUND_FILES.md)`);
        }
      }
      return `export default ${JSON.stringify(files.map(({ dir, name, hash }) => ({ dir, name, hash })))};`;
    },
    configureServer(server) {
      // The dev server: a file added or removed reloads the list.
      const changed = (path: string) => {
        if (!/[\\/]public[\\/](music|sfx)[\\/][^\\/]+\.mp3$/i.test(path)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', changed);
      server.watcher.on('unlink', changed);
      server.watcher.on('change', changed);
    },
  };
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
  try {
    walk(dir);
  } catch {
    // No public directory.
  }
  return out;
}

/**
 * The client's build, stamped into solo match reports and replays (`__BUILD__`): the commit Vercel builds
 * (VERCEL_GIT_COMMIT_SHA, set at build time), else 'dev'. Online reports carry the server's build instead.
 */
const BUILD = /^[0-9A-Za-z._-]{1,64}$/.test(process.env.VERCEL_GIT_COMMIT_SHA?.trim() ?? '')
  ? process.env.VERCEL_GIT_COMMIT_SHA!.trim()
  : 'dev';

export default defineConfig({
  plugins: [soundFiles(), serviceWorker()],
  define: { __BUILD__: JSON.stringify(BUILD) },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // PixiJS is large; keep it in its own chunk.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: Object.fromEntries(
        PAGES.map((page) => [page.replace(/\.html$/, ''), fileURLToPath(new URL(`./${page}`, import.meta.url))]),
      ),
    },
  },
});
