// The code-made music (pure data, tested), played when there is no recorded file for a scene
// (docs/SOUND_FILES.md). Built from the sound bank's instruments:
// - the lobby: a Japanese garden in the D "in" scale (D E♭ G A B♭): koto patterns and a shakuhachi
//   over a slow, soft taiko, 66 bpm;
// - the match: a Three Kingdoms war march in D yu (D F G A C, the Chinese minor pentatonic), 104 bpm,
//   with three layers that come in with the match: `base` (guzheng patterns, a low erhu drone and a
//   distant war drum) while you build, `pulse` (the war drums, the erhu's tune and its bass line)
//   during waves, and `boss` (gongs, a faster drum pattern and the dizi above it all) on boss waves.
// Every note is humanised (`humanize`): a little early or late (drums tight, flutes free), a little
// louder or softer, differently on every pass of the loop; chords are strummed.

import { INSTRUMENTS, noteSample, type Instrument } from './sounds';

export type MusicLayer = 'base' | 'pulse' | 'boss';
export type TrackName = 'lobby' | 'match';
/** What the music plays: nothing, the lobby loop, or the match loop at one of its three intensities. */
export type MusicScene = 'none' | 'lobby' | 'build' | 'waves' | 'boss';

export interface Note {
  /** Sixteenth-note step in the loop. */
  step: number;
  /** A fraction of a step later (0–1): grace notes, strums, glissandos. */
  nudge?: number;
  inst: Instrument;
  /** MIDI note (ignored for unpitched instruments). */
  note: number;
  /** Velocity, 0–1. */
  vel: number;
  layer: MusicLayer;
  /** Length in steps, for sustained instruments (the voice is faded out after it); absent: rings out. */
  len?: number;
}

export interface Track {
  name: TrackName;
  bpm: number;
  /** Loop length in sixteenth notes. */
  steps: number;
  /** Notes by step. */
  byStep: Note[][];
  /** The track's level (the lobby is quieter music, so it plays louder). */
  gain: number;
  /** Room reverb send: the garden is wetter than the battlefield. */
  wet: number;
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

/** A small deterministic hash → 0..1. */
function hash01(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

/**
 * How a player plays this note on this pass of the loop: `dt` seconds early or late (within the
 * instrument's looseness) and its velocity a little up or down. The downbeat of a bar is played
 * tighter than the notes between.
 */
export function humanize(n: Note, loop: number, index: number): { dt: number; vel: number } {
  const loose = INSTRUMENTS[n.inst].loose / 1000;
  const tight = n.step % 4 === 0 && !n.nudge ? 0.6 : 1;
  const dt = (hash01(n.step, loop, index) * 2 - 1) * loose * tight;
  const vel = Math.min(1, n.vel * (0.9 + 0.2 * hash01(loop, n.step + 101, index)));
  return { dt, vel };
}

function track(name: TrackName, bpm: number, bars: number, gain: number, wet: number, notes: Note[]): Track {
  const steps = bars * STEPS_PER_BAR;
  const byStep: Note[][] = Array.from({ length: steps }, () => []);
  for (const n of notes) byStep[n.step % steps]!.push(n);
  return { name, bpm, steps, byStep, gain, wet };
}

/** A chord strummed low to high, `spread` steps between strings. */
function strum(out: Note[], step: number, inst: Instrument, notes: number[], vel: number, layer: MusicLayer, spread = 0.12): void {
  notes.forEach((note, i) => {
    const at = i * spread;
    out.push({ step: step + Math.floor(at), nudge: at % 1, inst, note, vel: vel * (1 - i * 0.08), layer });
  });
}

/** [step in bar, note, length in steps] */
type Phrase = [number, number, number][];

// ---------------------------------------------------------------------------
// Lobby: 66 bpm, 16 bars, D in scale (D E♭ G A B♭)
// ---------------------------------------------------------------------------

/** The koto's low string each bar (MIDI): D, B♭, A, E♭ and G colour the in scale. */
const LOBBY_ROOTS = [50, 50, 46, 45, 50, 50, 51, 50, 43, 43, 46, 45, 51, 51, 45, 50];

/** The koto's second string over each root, within the scale (a fifth, or the D above B♭ and A). */
const LOBBY_FIFTH: Record<number, number> = { 50: 7, 51: 7, 43: 7, 46: 4, 45: 5 };

/** The shakuhachi's tune, by bar (rests in bars 0–1 and 8–9, where the koto speaks alone). */
const SHAKU: Record<number, Phrase> = {
  2: [[0, 69, 11], [12, 70, 4]],
  3: [[0, 69, 7], [8, 67, 8]],
  4: [[0, 74, 11], [12, 75, 4]],
  5: [[0, 74, 5], [6, 70, 4], [10, 69, 6]],
  6: [[0, 67, 7], [8, 69, 8]],
  7: [[0, 62, 15]],
  10: [[0, 74, 7], [8, 79, 8]],
  11: [[0, 81, 11], [12, 79, 4]],
  12: [[0, 75, 7], [8, 74, 8]],
  13: [[0, 70, 5], [6, 69, 10]],
  14: [[0, 67, 5], [6, 69, 4], [10, 70, 6]],
  15: [[0, 69, 15]],
};

/** The koto's answers in the second half (above the pattern, where the flute rests or holds). */
const KOTO_ANSWER: Record<number, Phrase> = {
  8: [[8, 81, 0], [10, 79, 0], [12, 75, 0], [14, 74, 0]],
  9: [[0, 70, 0], [4, 69, 0], [8, 67, 0], [12, 62, 0]],
  11: [[12, 86, 0], [14, 82, 0]],
  15: [[8, 74, 0], [10, 75, 0], [12, 79, 0], [14, 81, 0]],
};

export function lobbyTrack(): Track {
  const notes: Note[] = [];
  LOBBY_ROOTS.forEach((root, bar) => {
    const at = bar * STEPS_PER_BAR;
    // The koto: the low string and its fifth strummed, then a pattern on the upper strings.
    strum(notes, at, 'koto', [root, root + LOBBY_FIFTH[root]!, root + 12], 0.62, 'base');
    const upper = bar % 2 === 0 ? [62, 63, 69, 67, 74, 69] : [62, 67, 70, 69, 63, 62];
    [4, 6, 8, 10, 12, 14].forEach((s, i) => {
      // Space in the second bar of each pair: the koto breathes.
      if (bar % 4 === 3 && s > 10) return;
      notes.push({ step: at + s, inst: 'koto', note: upper[i]!, vel: s === 8 ? 0.5 : 0.36, layer: 'base' });
    });
    // The taiko: one deep, soft stroke a bar, a double stroke leading into each four-bar phrase.
    notes.push({ step: at, inst: 'taiko', note: 0, vel: bar % 4 === 0 ? 0.62 : 0.42, layer: 'base' });
    if (bar % 4 === 3) {
      notes.push({ step: at + 10, inst: 'taiko', note: 0, vel: 0.32, layer: 'base' });
      notes.push({ step: at + 12, inst: 'taiko', note: 0, vel: 0.46, layer: 'base' });
    }
    // The shime: a quiet tick on the off-beat in the second half.
    if (bar >= 8) notes.push({ step: at + 8, inst: 'shime', note: 0, vel: 0.3, layer: 'base' });
    for (const [s, note, len] of SHAKU[bar] ?? []) notes.push({ step: at + s, inst: 'shaku', note, vel: 0.62, layer: 'base', len });
    for (const [s, note] of KOTO_ANSWER[bar] ?? []) notes.push({ step: at + s, inst: 'koto', note, vel: 0.44, layer: 'base' });
  });
  return track('lobby', 66, 16, 1.25, 0.42, notes);
}

// ---------------------------------------------------------------------------
// Match: 104 bpm, 16 bars, D yu (D F G A C)
// ---------------------------------------------------------------------------

/** D yu's pitch classes: D F G A C. */
const YU = [2, 5, 7, 9, 0];

/** Each bar's root (MIDI, the low erhu) and the guzheng's pattern notes over it. */
const MATCH_BARS: { root: number; tones: number[] }[] = [
  { root: 50, tones: [50, 57, 62, 65, 69] }, // D
  { root: 50, tones: [50, 57, 62, 65, 69] },
  { root: 48, tones: [48, 55, 60, 62, 67] }, // C
  { root: 50, tones: [50, 57, 62, 65, 69] },
  { root: 53, tones: [53, 60, 65, 69, 72] }, // F
  { root: 48, tones: [48, 55, 60, 62, 67] },
  { root: 55, tones: [55, 62, 67, 69, 74] }, // G
  { root: 45, tones: [45, 57, 60, 62, 69] }, // A
  { root: 50, tones: [50, 57, 62, 65, 69] },
  { root: 50, tones: [50, 57, 62, 65, 69] },
  { root: 48, tones: [48, 55, 60, 62, 67] },
  { root: 50, tones: [50, 57, 62, 65, 69] },
  { root: 53, tones: [53, 60, 65, 69, 72] },
  { root: 55, tones: [55, 62, 67, 69, 74] },
  { root: 45, tones: [45, 57, 60, 62, 69] },
  { root: 45, tones: [45, 57, 60, 62, 69] },
];

/** The erhu's tune (pulse), by bar. */
const ERHU: Phrase[] = [
  [[0, 69, 6], [6, 72, 2], [8, 74, 8]],
  [[0, 72, 4], [4, 69, 4], [8, 67, 6], [14, 69, 2]],
  [[0, 72, 8], [8, 74, 4], [12, 77, 4]],
  [[0, 74, 12], [12, 72, 2], [14, 69, 2]],
  [[0, 77, 6], [6, 79, 2], [8, 81, 8]],
  [[0, 79, 4], [4, 77, 4], [8, 74, 8]],
  [[0, 72, 4], [4, 74, 4], [8, 77, 4], [12, 79, 4]],
  [[0, 81, 16]],
  [[0, 86, 6], [6, 84, 2], [8, 81, 8]],
  [[0, 79, 4], [4, 81, 4], [8, 84, 4], [12, 81, 4]],
  [[0, 79, 8], [8, 77, 4], [12, 74, 4]],
  [[0, 77, 6], [6, 79, 2], [8, 74, 8]],
  [[0, 72, 6], [6, 74, 2], [8, 77, 6], [14, 79, 2]],
  [[0, 81, 6], [6, 79, 2], [8, 77, 4], [12, 74, 4]],
  [[0, 72, 8], [8, 69, 4], [12, 72, 4]],
  [[0, 74, 16]],
];

/** The dizi (boss), high above: answers in the erhu's long notes, and runs into each phrase. */
const DIZI: Phrase[] = [
  [[12, 81, 1], [13, 84, 1], [14, 86, 2]],
  [[0, 89, 8], [8, 86, 4], [12, 84, 4]],
  [[8, 81, 2], [10, 84, 2], [12, 86, 4]],
  [[0, 84, 4], [4, 81, 4], [8, 79, 8]],
  [[12, 86, 1], [13, 89, 1], [14, 91, 2]],
  [[0, 93, 8], [8, 91, 4], [12, 89, 4]],
  [[0, 86, 8], [8, 84, 8]],
  [[0, 86, 2], [2, 84, 2], [4, 81, 2], [6, 79, 2], [8, 81, 8]],
  [[8, 93, 8]],
  [[0, 91, 4], [4, 89, 4], [8, 86, 8]],
  [[8, 84, 2], [10, 86, 2], [12, 89, 4]],
  [[0, 86, 16]],
  [[8, 89, 4], [12, 91, 4]],
  [[0, 93, 6], [6, 91, 2], [8, 89, 8]],
  [[0, 84, 4], [4, 86, 4], [8, 89, 4], [12, 91, 4]],
  [[0, 93, 4], [4, 91, 2], [6, 89, 2], [8, 86, 8]],
];

export function matchTrack(): Track {
  const notes: Note[] = [];
  MATCH_BARS.forEach(({ root, tones }, bar) => {
    const at = bar * STEPS_PER_BAR;
    const [t0, t1, t2, t3, t4] = tones as [number, number, number, number, number];
    const end = bar % 4 === 3;
    // The bass line's upper note: the fifth, or the octave where the fifth isn't in the scale (over A).
    const above = YU.includes((root + 7) % 12) ? root + 7 : root + 12;

    // Base: the guzheng's rolling pattern, a low erhu drone, a distant war drum.
    const pattern = bar % 2 === 0 ? [t0, t1, t2, t3, t4, t3, t2, t1] : [t0, t2, t1, t3, t2, t4, t3, t2];
    pattern.forEach((note, i) => {
      if (end && i >= 6) return;
      notes.push({ step: at + i * 2, inst: 'guzheng', note, vel: i === 0 ? 0.7 : 0.46, layer: 'base' });
    });
    if (end) {
      // The guzheng sweeps up the scale into the next phrase.
      [62, 65, 67, 69, 72, 74, 77, 79].forEach((note, i) =>
        notes.push({ step: at + 12 + Math.floor(i / 2), nudge: (i % 2) * 0.5, inst: 'guzheng', note, vel: 0.26 + i * 0.03, layer: 'base' }),
      );
    }
    if (bar % 2 === 0) notes.push({ step: at, inst: 'erhu', note: root, vel: 0.5, layer: 'base', len: 30 });
    notes.push({ step: at, inst: 'wardrum', note: 0, vel: 0.6, layer: 'base' });
    notes.push({ step: at + 8, inst: 'wardrum', note: 0, vel: 0.36, layer: 'base' });

    // Pulse: the war drums, the tune, the bass line.
    for (const [s, v] of [[0, 0.95], [3, 0.5], [6, 0.62], [8, 0.85], [11, 0.5], [14, 0.6]] as const) {
      notes.push({ step: at + s, inst: 'wardrum', note: 0, vel: v, layer: 'pulse' });
    }
    for (const s of [4, 12]) notes.push({ step: at + s, inst: 'tanggu', note: 0, vel: 0.62, layer: 'pulse' });
    for (const s of [2, 7, 10, 15]) notes.push({ step: at + s, inst: 'rim', note: 0, vel: 0.5, layer: 'pulse' });
    if (end) for (const [s, v] of [[13, 0.45], [14, 0.6], [15, 0.8]] as const) notes.push({ step: at + s, inst: 'tanggu', note: 0, vel: v, layer: 'pulse' });
    for (const [s, note, len] of ERHU[bar]!) notes.push({ step: at + s, inst: 'erhu', note, vel: 0.62, layer: 'pulse', len });
    for (const [s, len] of [[0, 3], [3, 3], [8, 3], [11, 3]] as const) {
      notes.push({ step: at + s, inst: 'erhu', note: s === 11 ? above : root, vel: s === 0 ? 0.5 : 0.36, layer: 'pulse', len });
    }

    // Boss: gongs, a faster drum pattern (the tanggu's sixteenths), the dizi.
    if (bar % 4 === 0) notes.push({ step: at, inst: 'gong', note: 0, vel: 0.85, layer: 'boss' });
    if (bar % 2 === 1) notes.push({ step: at + 8, inst: 'luo', note: 0, vel: 0.7, layer: 'boss' });
    for (let s = 1; s < STEPS_PER_BAR; s += 2) {
      notes.push({ step: at + s, inst: 'tanggu', note: 0, vel: s % 4 === 3 ? 0.42 : 0.28, layer: 'boss' });
    }
    for (const [s, v] of [[5, 0.55], [10, 0.6], [13, 0.5]] as const) notes.push({ step: at + s, inst: 'wardrum', note: 0, vel: v, layer: 'boss' });
    for (const [s, note, len] of DIZI[bar]!) notes.push({ step: at + s, inst: 'dizi', note, vel: 0.58, layer: 'boss', len });
  });
  return track('match', 104, 16, 1, 0.24, notes);
}

export const TRACKS: Record<TrackName, () => Track> = { lobby: lobbyTrack, match: matchTrack };

// ---------------------------------------------------------------------------
// Offline mixdown (tests and the loudness check): the scheduler's work, done in one go
// ---------------------------------------------------------------------------

/** How long (s) a sustained note takes to fade once its length is over (music.ts uses the same). */
export const NOTE_RELEASE = 0.12;

/**
 * Mixes `seconds` of a track's `layers` from baked samples (`samples(id)` at `rate`), humanised like
 * the scheduler plays it, before the Music volume. Mono, no reverb.
 */
export function mixdown(t: Track, layers: readonly MusicLayer[], samples: (id: string) => Float32Array, rate: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.ceil(seconds * rate));
  const dt = stepSeconds(t);
  let loop = 0;
  for (let t0 = 0; t0 < seconds; t0 += t.steps * dt, loop++) {
    t.byStep.forEach((notes, step) => {
      notes.forEach((n, index) => {
        if (!layers.includes(n.layer)) return;
        const h = humanize(n, loop, index);
        const { id, rate: r } = noteSample(n.inst, n.note);
        const buf = samples(id);
        const gain = h.vel * INSTRUMENTS[n.inst].level * t.gain;
        const start = Math.round((t0 + (step + (n.nudge ?? 0)) * dt + Math.max(0, h.dt)) * rate);
        const len = n.len !== undefined ? n.len * dt : Infinity;
        for (let i = 0; start + i < out.length; i++) {
          const p = i * r;
          const j = Math.floor(p);
          if (j + 1 >= buf.length) break;
          const time = i / rate;
          if (time > len + NOTE_RELEASE) break;
          const fade = time > len ? 1 - (time - len) / NOTE_RELEASE : 1;
          out[start + i]! += (buf[j]! + (buf[j + 1]! - buf[j]!) * (p - j)) * gain * fade;
        }
      });
    });
  }
  return out;
}
