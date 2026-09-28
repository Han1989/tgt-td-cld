// The code-made music (pure data, tested): a calm lobby loop and a match loop in D minor / dorian,
// built from the sound bank's instruments. The match loop has three layers that come in with the
// match: `base` (pad chords and a sparse bell line) while you build, `pulse` (bass, woodblock and
// shaker) once the waves run, and `boss` (frame drums, a driving bass and a high bell ostinato) on
// boss waves. `music.ts` plays it; real music files can replace it (`musicFiles.ts`).

import { INSTRUMENTS, type Instrument } from './sounds';

export type MusicLayer = 'base' | 'pulse' | 'boss';
export type TrackName = 'lobby' | 'match';
/** What the music plays: nothing, the lobby loop, or the match loop at one of its three intensities. */
export type MusicScene = 'none' | 'lobby' | 'build' | 'waves' | 'boss';

export interface Note {
  /** Sixteenth-note step in the loop. */
  step: number;
  inst: Instrument;
  /** MIDI note (ignored for unpitched instruments). */
  note: number;
  /** Velocity, 0–1. */
  vel: number;
  layer: MusicLayer;
}

export interface Track {
  name: TrackName;
  bpm: number;
  /** Loop length in sixteenth notes. */
  steps: number;
  /** Notes by step. */
  byStep: Note[][];
}

export const STEPS_PER_BAR = 16;

export const SCENE_TRACK: Record<MusicScene, TrackName | null> = {
  none: null,
  lobby: 'lobby',
  build: 'match',
  waves: 'match',
  boss: 'match',
};

export const SCENE_LAYERS: Record<MusicScene, readonly MusicLayer[]> = {
  none: [],
  lobby: ['base'],
  build: ['base'],
  waves: ['base', 'pulse'],
  boss: ['base', 'pulse', 'boss'],
};

/** Seconds per sixteenth note. */
export function stepSeconds(track: Track): number {
  return 60 / track.bpm / 4;
}

/** Playback rate that turns an instrument's sample into `note`. */
export function noteRate(inst: Instrument, note: number): number {
  const root = INSTRUMENTS[inst].root;
  return root === null ? 1 : Math.pow(2, (note - root) / 12);
}

function track(name: TrackName, bpm: number, bars: number, notes: Note[]): Track {
  const steps = bars * STEPS_PER_BAR;
  const byStep: Note[][] = Array.from({ length: steps }, () => []);
  for (const n of notes) byStep[n.step % steps]!.push(n);
  return { name, bpm, steps, byStep };
}

/** A chord: its bass root and the pad's voicing (MIDI). */
interface Chord {
  bass: number;
  pad: number[];
}

// ---------------------------------------------------------------------------
// Lobby: 72 bpm, 8 bars, a chord every two bars, pad, a soft bass and a slow bell tune
// ---------------------------------------------------------------------------

const LOBBY_CHORDS: Chord[] = [
  { bass: 38, pad: [57, 60, 64, 65] }, // Dm9
  { bass: 34, pad: [57, 58, 62, 65] }, // B♭maj7
  { bass: 41, pad: [57, 60, 64, 65] }, // Fmaj7
  { bass: 36, pad: [57, 60, 64, 67] }, // C6
];

/** [bar, step, note] */
const LOBBY_TUNE: [number, number, number][] = [
  [0, 0, 81], [0, 6, 84], [0, 12, 81],
  [1, 4, 79], [1, 10, 77],
  [2, 0, 77], [2, 6, 81], [2, 12, 86],
  [3, 8, 84],
  [4, 0, 81], [4, 6, 79], [4, 12, 77],
  [5, 4, 76], [5, 10, 77],
  [6, 0, 79], [6, 6, 76], [6, 12, 84],
  [7, 8, 81],
];

export function lobbyTrack(): Track {
  const notes: Note[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const chord = LOBBY_CHORDS[Math.floor(bar / 2)]!;
    const at = bar * STEPS_PER_BAR;
    for (const n of chord.pad) notes.push({ step: at, inst: 'pad', note: n, vel: 0.22, layer: 'base' });
    if (bar % 2 === 0) notes.push({ step: at, inst: 'bass', note: chord.bass, vel: 0.3, layer: 'base' });
  }
  for (const [bar, step, note] of LOBBY_TUNE) {
    notes.push({ step: bar * STEPS_PER_BAR + step, inst: 'bell', note, vel: 0.3, layer: 'base' });
    // A quiet echo an octave down, a dotted quarter later.
    notes.push({ step: bar * STEPS_PER_BAR + step + 6, inst: 'bell', note: note - 12, vel: 0.1, layer: 'base' });
  }
  return track('lobby', 72, 8, notes);
}

// ---------------------------------------------------------------------------
// Match: 96 bpm, 8 bars, a chord a bar (Dm B♭ F C Dm B♭ Gm A), three layers
// ---------------------------------------------------------------------------

const MATCH_CHORDS: Chord[] = [
  { bass: 38, pad: [57, 62, 65] }, // Dm
  { bass: 34, pad: [58, 62, 65] }, // B♭
  { bass: 41, pad: [57, 60, 65] }, // F
  { bass: 36, pad: [55, 60, 64] }, // C
  { bass: 38, pad: [57, 62, 65] }, // Dm
  { bass: 34, pad: [58, 62, 65] }, // B♭
  { bass: 43, pad: [55, 58, 62] }, // Gm
  { bass: 33, pad: [57, 61, 64] }, // A (the pull back to Dm)
];

export function matchTrack(): Track {
  const notes: Note[] = [];
  MATCH_CHORDS.forEach((chord, bar) => {
    const at = bar * STEPS_PER_BAR;
    const [low, mid, high] = chord.pad as [number, number, number];
    // Base: pad chords and a bell line on the chord an octave up.
    for (const n of chord.pad) notes.push({ step: at, inst: 'pad', note: n, vel: 0.2, layer: 'base' });
    const line = bar % 2 === 0 ? [high + 12, mid + 12, low + 24] : [mid + 12, high + 12, mid + 24];
    [0, 6, 12].forEach((s, i) => notes.push({ step: at + s, inst: 'bell', note: line[i]!, vel: i === 0 ? 0.24 : 0.17, layer: 'base' }));
    // Pulse: bass, a woodblock backbeat and a soft shaker on the eighths.
    const bass: [number, number, number][] = [
      [0, chord.bass, 0.5],
      [6, chord.bass, 0.32],
      [8, chord.bass + 12, 0.4],
      [14, chord.bass + 7, 0.3],
    ];
    for (const [s, n, v] of bass) notes.push({ step: at + s, inst: 'bass', note: n, vel: v, layer: 'pulse' });
    for (const s of [4, 12]) notes.push({ step: at + s, inst: 'wood', note: 0, vel: 0.22, layer: 'pulse' });
    for (let s = 0; s < STEPS_PER_BAR; s += 2) notes.push({ step: at + s, inst: 'shaker', note: 0, vel: s % 4 === 2 ? 0.14 : 0.08, layer: 'pulse' });
    // Boss: frame drums, a driving bass and a high ostinato on the root and fifth.
    const drums: [number, number][] = bar === 7 ? [[0, 0.9], [3, 0.5], [8, 0.8], [10, 0.6], [12, 0.7], [14, 0.8]] : [[0, 0.9], [3, 0.5], [8, 0.8], [11, 0.5]];
    for (const [s, v] of drums) notes.push({ step: at + s, inst: 'drum', note: 0, vel: v, layer: 'boss' });
    for (const s of [2, 10]) notes.push({ step: at + s, inst: 'bass', note: chord.bass, vel: 0.35, layer: 'boss' });
    for (let s = 0; s < STEPS_PER_BAR; s += 2) {
      notes.push({ step: at + s, inst: 'bell', note: chord.bass + (s % 4 === 0 ? 36 : 43), vel: 0.07, layer: 'boss' });
    }
  });
  return track('match', 96, 8, notes);
}

export const TRACKS: Record<TrackName, () => Track> = { lobby: lobbyTrack, match: matchTrack };
