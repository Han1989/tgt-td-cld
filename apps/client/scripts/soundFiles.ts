// The recorded sound files on disk (docs/SOUND_FILES.md), for the build (vite.config.ts) and `npm run music-levels`:
// the same list and the same hash in both, so a level measured by the one is found by the other.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SoundFile {
  dir: 'music' | 'sfx';
  name: string;
  /** The first 10 hex digits of the contents' SHA-256: the `?v=` of its URL. */
  hash: string;
  size: number;
}

/** The recorded sound files in public/music and public/sfx: name (without .mp3), a hash of the contents, size. */
export function listSoundFiles(publicDir: string): SoundFile[] {
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
      out.push({ dir, name: file.replace(/\.mp3$/i, ''), hash: soundHash(data), size: data.length });
    }
  }
  return out;
}

export function soundHash(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 10);
}

/** One music file's level, measured by `npm run music-levels` the way the game measures a decoded file (`fitFile`). */
export interface MusicLevel {
  /** The file it was measured on (`soundHash`): a new upload has another, and its old level is ignored. */
  hash: string;
  /** The levelling gain (`FittedFile.gain`). */
  gain: number;
  /** Its loudness before the gain (dB). */
  db: number;
}

/** Where the measured levels live (relative to apps/client). */
export const MUSIC_LEVELS = 'src/audio/musicLevels.json';

/** The measured levels, by music file name; none when the file is missing or unreadable. */
export function readMusicLevels(path: string): Record<string, MusicLevel> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, MusicLevel>;
  } catch {
    return {};
  }
}
