// Recorded sound files (docs/SOUND_FILES.md), pure and tested: which files there are, and how a
// decoded file is made to fit the game.
//
// - Music: `public/music/lobby.mp3`, `match.mp3` and `boss.mp3` play instead of the code-made music
//   whenever they exist; any one missing keeps its code-made scene.
// - Effects: `public/sfx/<sound id>.mp3` replaces that effect (`SOUND_IDS`).
// The build lists the files (the `tdt-sound-files` plugin in vite.config.ts), so adding one needs no
// code change. When a file is decoded, the encoder's silence is trimmed at both ends (MP3 encoders
// pad a few dozen ms, which would put a gap in every loop) and its loudness is measured, so every
// music file plays at the same level and a recorded effect as loud as the synth sound it replaces.

import type { MusicScene } from './score';

export type MusicFile = 'lobby' | 'match' | 'boss';
export const MUSIC_FILES: readonly MusicFile[] = ['lobby', 'match', 'boss'];

/** One file the build found: its folder, name (without `.mp3`) and a hash of its contents. */
export interface FoundFile {
  dir: 'music' | 'sfx';
  name: string;
  hash: string;
}

/** The files the game can use, by name: each one's URL (with its hash, so a new upload is fetched fresh). */
export interface SoundFiles {
  music: Partial<Record<MusicFile, string>>;
  sfx: Record<string, string>;
}

export const NO_FILES: SoundFiles = { music: {}, sfx: {} };

/** The usable files among those found: known music names and known effect ids; the rest is ignored. */
export function soundFiles(found: readonly FoundFile[], soundIds: readonly string[]): SoundFiles {
  const out: SoundFiles = { music: {}, sfx: {} };
  const ids = new Set(soundIds);
  for (const f of found) {
    const url = `/${f.dir}/${encodeURIComponent(f.name)}.mp3?v=${f.hash}`;
    if (f.dir === 'music' && (MUSIC_FILES as readonly string[]).includes(f.name)) out.music[f.name as MusicFile] = url;
    else if (f.dir === 'sfx' && ids.has(f.name)) out.sfx[f.name] = url;
  }
  return out;
}

/**
 * Which music file a scene plays, if there is one: `lobby` in the lobby; `match` while building and
 * in waves; `boss` on boss waves, else `match` (a match file keeps playing through boss waves rather
 * than switching back to code-made music). Null: the code-made music plays that scene.
 */
export function musicFileFor(scene: MusicScene, files: SoundFiles['music']): MusicFile | null {
  switch (scene) {
    case 'lobby':
      return files.lobby ? 'lobby' : null;
    case 'build':
    case 'waves':
      return files.match ? 'match' : null;
    case 'boss':
      return files.boss ? 'boss' : files.match ? 'match' : null;
    default:
      return null;
  }
}

/** Below this (−66 dBFS) a sample is the encoder's silence. */
export const SILENCE = 0.0005;
/** Trim at most this much (s) at each end: a quiet intro or a long fade is music, not padding. */
export const MAX_TRIM = 1;

/** The part of a decoded file that isn't encoder silence: [start, end) in samples, over every channel. */
export function trimSilence(channels: readonly Float32Array[], rate: number, threshold = SILENCE): { start: number; end: number } {
  const n = channels[0]?.length ?? 0;
  const max = Math.min(n, Math.round(MAX_TRIM * rate));
  const loud = (i: number) => channels.some((c) => Math.abs(c[i]!) > threshold);
  let start = 0;
  while (start < max && !loud(start)) start++;
  let end = n;
  while (end > n - max && end > start + 1 && !loud(end - 1)) end--;
  return { start, end };
}

/**
 * Loudness (dB, relative to full scale) of a file or sound: the mean power of its 50 ms blocks, gated
 * like broadcast loudness meters: blocks below −60 dB are silence, and blocks more than 10 dB under the
 * rest don't count (so a quiet tail doesn't make a sound seem soft). Reads every other sample.
 */
export function loudness(channels: readonly Float32Array[], rate: number, start = 0, end = channels[0]?.length ?? 0): number {
  const block = Math.max(2, Math.round(rate * 0.05));
  const powers: number[] = [];
  for (let b = start; b < end; b += block) {
    let s = 0;
    let k = 0;
    const e = Math.min(end, b + block);
    for (const c of channels) {
      for (let i = b; i < e; i += 2) {
        s += c[i]! * c[i]!;
        k++;
      }
    }
    if (k > 0) powers.push(s / k);
  }
  const gate = (ps: number[], floor: number) => ps.filter((p) => p > floor);
  let on = gate(powers, 1e-6);
  if (on.length === 0) return -Infinity;
  const mean = (ps: number[]) => ps.reduce((a, b) => a + b, 0) / ps.length;
  on = gate(on, mean(on) * 0.1);
  return 10 * Math.log10(mean(on.length ? on : powers));
}

/** Most a file is turned up or down (dB) to even it out. */
export const MAX_ADJUST_DB = 12;

/** The gain that brings a file of loudness `db` (peak `peak`) to `target` dB, within ±12 dB, never clipping. */
export function levelGain(db: number, target: number, peak: number): number {
  if (!Number.isFinite(db)) return 1;
  const adjust = Math.max(-MAX_ADJUST_DB, Math.min(MAX_ADJUST_DB, target - db));
  return Math.min(Math.pow(10, adjust / 20), peak > 0 ? 1 / peak : Infinity);
}

/** Peak level over [start, end). */
export function peakOf(channels: readonly Float32Array[], start = 0, end = channels[0]?.length ?? 0): number {
  let p = 0;
  for (const c of channels) for (let i = start; i < end; i++) p = Math.max(p, Math.abs(c[i]!));
  return p;
}

/** How a decoded file plays: from `start` to `end` (s; the loop points of music) at `gain`. */
export interface FittedFile {
  start: number;
  end: number;
  gain: number;
  /** Its loudness before the gain (dB). */
  db: number;
}

/** Trims a decoded file and levels it to `target` dB. */
export function fitFile(channels: readonly Float32Array[], rate: number, target: number): FittedFile {
  const { start, end } = trimSilence(channels, rate);
  const db = loudness(channels, rate, start, end);
  return { start: start / rate, end: end / rate, gain: levelGain(db, target, peakOf(channels, start, end)), db };
}

/**
 * Loudness every music file is levelled to (dB): about what the code-made match music measures in
 * waves (`npm test` checks the two stay close), so switching between a file and code-made music
 * doesn't jump.
 */
export const MUSIC_TARGET_DB = -15;
