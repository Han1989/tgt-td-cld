// `npm run art:3d -- <hero>|heroes [stage|match|all|plate] [--draft] [--frames 0,120] [--out DIR] [--work DIR]`
// (docs/ART.md §15): imports the heroes from the KayKit packs in Blender and renders every output the game uses. Finds a Python that has Blender's module
// (bpy) and scipy, checks ffmpeg, and runs tools/blender/build.py with it.
//
// Python, in this order: $TDT_BLENDER_PYTHON; .venv-blender/bin/python at the repo root (see
// tools/blender/requirements.txt); python3.11 or python3 on the PATH if it can import bpy.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith('-')) {
  console.error('Usage: npm run art:3d -- <hero>|heroes [stage|match|all|plate] [--draft] [--frames 0,120] [--out DIR] [--work DIR]');
  process.exit(2);
}

function works(python) {
  try {
    execFileSync(python, ['-c', 'import bpy, scipy, numpy'], { stdio: 'ignore', timeout: 120000 });
    return true;
  } catch {
    return false;
  }
}

const candidates = [
  process.env.TDT_BLENDER_PYTHON,
  join(root, '.venv-blender', 'bin', 'python'),
  join(root, '.venv-blender', 'Scripts', 'python.exe'),
  'python3.11',
  'python3',
].filter(Boolean);
const python = candidates.find((p) => (!p.includes('/') && !p.includes('\\')) || existsSync(p) ? works(p) : false);
if (!python) {
  console.error(`No Python with Blender's module found. Make one (docs/ART.md §15):
  python3.11 -m venv .venv-blender && .venv-blender/bin/pip install -r tools/blender/requirements.txt
or point TDT_BLENDER_PYTHON at one.`);
  process.exit(1);
}
const ffmpeg = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
if (ffmpeg.status !== 0 || !/libx264/.test(ffmpeg.stdout) || !/libvpx-vp9/.test(ffmpeg.stdout) || !/libwebp/.test(ffmpeg.stdout)) {
  console.error('ffmpeg with libx264, libvpx-vp9 and libwebp is needed on the PATH (docs/ART.md §15).');
  process.exit(1);
}
const run = spawnSync(python, [join(here, 'build.py'), ...args], { stdio: 'inherit', cwd: root });
process.exit(run.status ?? 1);
