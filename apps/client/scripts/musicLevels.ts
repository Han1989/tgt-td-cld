// `npm run music-levels -w @tdt/client`: measures each recorded music file (public/music/*.mp3) the way the game
// measures one it has decoded (`fitFile` in src/audio/files.ts: the encoder's silence trimmed, the gated loudness, the
// gain to MUSIC_TARGET_DB that never clips) and writes src/audio/musicLevels.json, by file name with the file's hash.
// The build hands each level to the game with its file (vite.config.ts), so the streamed start, which plays before
// any decode, is as loud as the decoded loop that takes over (docs/ART.md §13, docs/SOUND_FILES.md). A file whose
// hash has changed (a new upload) keeps playing, with a build warning, until this is run again.
//
// Decodes with ffmpeg (as `npm run art:3d` needs) at 48 kHz, a phone's usual rate: the gain differs from a 44.1 kHz
// decode by under 0.05 dB.
//
//   npm run music-levels -w @tdt/client          measure and write
//   npm run music-levels -w @tdt/client -- --check   print what would change, exit 1 if anything would

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitFile, MUSIC_FILES, MUSIC_TARGET_DB } from '../src/audio/files';
import { listSoundFiles, MUSIC_LEVELS, readMusicLevels, type MusicLevel } from './soundFiles';

const RATE = 48_000;
const root = fileURLToPath(new URL('..', import.meta.url));
const publicDir = join(root, 'public');
const out = join(root, MUSIC_LEVELS);
const check = process.argv.includes('--check');

const old = readMusicLevels(out);
const levels: Record<string, MusicLevel> = {};
for (const f of listSoundFiles(publicDir)) {
  if (f.dir !== 'music' || !(MUSIC_FILES as readonly string[]).includes(f.name)) continue;
  const known = old[f.name];
  if (known && known.hash === f.hash) {
    levels[f.name] = known;
    continue;
  }
  const path = join(publicDir, 'music', `${f.name}.mp3`);
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', String(RATE), '-'], {
    maxBuffer: 1 << 30,
  });
  const all = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  const n = all.length / 2;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = all[2 * i]!;
    r[i] = all[2 * i + 1]!;
  }
  const fit = fitFile([l, r], RATE, MUSIC_TARGET_DB);
  levels[f.name] = { hash: f.hash, gain: round(fit.gain, 4), db: round(fit.db, 2) };
  console.log(`${f.name}.mp3: ${(n / RATE).toFixed(1)} s, ${levels[f.name]!.db} dB, gain ${levels[f.name]!.gain}`);
}

const text = `${JSON.stringify(levels, null, 2)}\n`;
let before = '';
try {
  before = readFileSync(out, 'utf8');
} catch {
  // None yet.
}
if (text === before) {
  console.log(`${MUSIC_LEVELS} is up to date`);
} else if (check) {
  console.log(`${MUSIC_LEVELS} is out of date: run npm run music-levels -w @tdt/client`);
  process.exit(1);
} else {
  writeFileSync(out, text);
  console.log(`wrote ${MUSIC_LEVELS}`);
}

function round(v: number, digits: number): number {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}
