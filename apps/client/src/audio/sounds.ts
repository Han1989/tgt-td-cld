// The sound bank (docs/ART.md §13): every sound effect and music instrument as synth data
// (`synth.ts`), with its loudness, how often it may play and how many variants it is baked in.
//
// The theme: matches are a Three Kingdoms war epic (war drums, gongs, war horns, the erhu and dizi,
// the guzheng, bowstrings and clashing steel); the lobby is a Japanese garden (koto, shakuhachi, soft
// taiko). Nothing harsh: saws always go through a filter, noise is always filtered, and a unit test
// checks every sound's brightness. Pitched effects use the match music's scale, D yu (D F G A C, the
// Chinese minor pentatonic), so they never clash with it. Any effect can be replaced by a recorded
// file, `public/sfx/<id>.mp3` (docs/SOUND_FILES.md).

import { midiHz, soundSeconds, varyDef, type Layer, type SynthDef } from './synth';

/** Voice priority: 0 = frequent and skippable (shots, deaths), 1 = normal, 2 = must be heard (the Heart, waves, the end). */
export type Priority = 0 | 1 | 2;

export interface SoundSpec {
  def: SynthDef;
  /** Loudness, 0–1, before the Effects volume and the mix (yours / others', on / off screen). */
  volume: number;
  /** Least time (ms) between two plays of this sound (yours and others' count separately). */
  cooldown: number;
  /** Most voices of this sound at once. */
  max: number;
  priority: Priority;
  /** How many versions are baked (`varyDef`); each play picks one other than the last. */
  variants: number;
  /** Room reverb send, 0–1. */
  wet: number;
  /** Pitch spread of a play (fraction of the rate, ±): small for tunes, larger for hits. */
  pitch: number;
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const hz = midiHz;
// D yu pentatonic (D F G A C), the match music's scale (MIDI).
const D2 = 38;
const A2 = 45;
const C3 = 48;
const D3 = 50;
const F3 = 53;
const G3 = 55;
const A3 = 57;
const D4 = 62;
const F4 = 65;
const G4 = 67;
const A4 = 69;
const C5 = 72;
const D5 = 74;
const F5 = 77;
const G5 = 79;
const A5 = 81;
const C6 = 84;
const D6 = 86;
const A6 = 93;
const D7 = 98;

interface ZitherOpts {
  bright?: number;
  pos?: number;
  damp?: number;
  /** Press the string after the pluck: the pitch bends by this ratio. */
  bend?: number;
  bendAt?: number;
  /** Left-hand vibrato depth once the note rings. */
  vib?: number;
}

/**
 * A plucked zither string (guzheng, koto): a Karplus-Strong string, the pick's click and the wooden
 * body answering it. Guzheng: steel strings, hard picks near the bridge (bright, long); koto: silk-like,
 * a little softer and shorter.
 */
function zither(note: number, decay: number, gain = 1, at = 0, o: ZitherOpts = {}): Layer[] {
  const f = hz(note);
  const top = Math.min(7000, f * 12);
  const string: Layer = {
    wave: 'pluck',
    freq: f,
    decay,
    gain,
    at,
    attack: 0.0015,
    pluck: { bright: o.bright ?? 0.7, pos: o.pos ?? 0.1, damp: o.damp ?? 0.25 },
    filter: { type: 'lp', from: top, to: top * 0.45 },
  };
  if (o.bend) Object.assign(string, { glide: o.bend, glideTime: 0.12, glideAt: o.bendAt ?? 0.18 });
  if (o.vib) string.vibrato = [5.2, o.vib, 0.3];
  return [
    string,
    { wave: 'noise', freq: 0, decay: 0.02, gain: gain * 0.1, at, attack: 0.0005, filter: { type: 'bp', from: 2400, q: 1.2 } },
    { wave: 'sine', freq: 210, glide: 0.9, decay: 0.09, gain: gain * 0.12, at, attack: 0.002 },
  ];
}

const guzheng = (note: number, decay: number, gain = 1, at = 0, o: ZitherOpts = {}) =>
  zither(note, decay, gain, at, { bright: 0.78, pos: 0.09, damp: 0.2, ...o });
const koto = (note: number, decay: number, gain = 1, at = 0, o: ZitherOpts = {}) =>
  zither(note, decay, gain, at, { bright: 0.6, pos: 0.13, damp: 0.34, ...o });

/** A glissando up (or down) a run of notes on the guzheng: the instrument's signature sweep. */
function gliss(notes: number[], every: number, decay: number, gain = 1, at = 0): Layer[] {
  return notes.flatMap((n, i) => guzheng(n, decay, gain * (0.7 + (0.3 * i) / Math.max(1, notes.length - 1)), at + i * every));
}

interface DrumOpts {
  /** The stick's slap on the skin, 0–1. */
  skin?: number;
  /** How far the pitch starts above its resting pitch (a hard hit stretches the skin). */
  tension?: number;
  /** The shell's low boom, 0–1. */
  shell?: number;
}

/**
 * A drum with a body and a skin: the head's inharmonic membrane modes (pitch falling as the skin
 * relaxes), the shell's low boom, the stick's slap and the air pushed out. Taiko, war drums, tanggu.
 */
function drum(freq: number, decay: number, gain = 1, at = 0, o: DrumOpts = {}): Layer[] {
  const t = o.tension ?? 1.3;
  return [
    {
      wave: 'sine',
      freq: freq * t,
      glide: 1 / t,
      glideTime: 0.08,
      decay,
      gain,
      at,
      attack: 0.0012,
      partials: [
        [1.59, 0.42, 0.6],
        [2.14, 0.26, 0.55],
        [2.3, 0.2, 0.5],
        [2.65, 0.13, 0.45],
        [2.92, 0.09, 0.45],
        [3.16, 0.06, 0.4],
      ],
      drive: 0.7,
    },
    { wave: 'sine', freq: freq * 0.62, glide: 0.92, decay: decay * 1.2, gain: gain * (o.shell ?? 0.45), at, attack: 0.006 },
    {
      wave: 'noise',
      freq: 0,
      decay: 0.028,
      gain: gain * (o.skin ?? 0.45),
      at,
      attack: 0.0005,
      filter: { type: 'bp', from: Math.min(3800, freq * 16), to: freq * 5, q: 0.9 },
    },
    { wave: 'noise', freq: 0, decay: 0.14, gain: gain * 0.3, at, attack: 0.002, filter: { type: 'lp', from: 480, to: 110 } },
  ];
}

/** A drum roll: `hits` strokes over `seconds`, growing from `from` to full, a little uneven. */
function roll(freq: number, hits: number, seconds: number, gain = 1, at = 0, from = 0.25): Layer[] {
  const out: Layer[] = [];
  for (let i = 0; i < hits; i++) {
    const p = i / Math.max(1, hits - 1);
    // Strokes speed up a little as the roll builds; the hands alternate (every other one a touch softer).
    const t = at + seconds * (p * 0.85 + p * p * 0.15);
    const v = gain * (from + (1 - from) * p * p) * (i % 2 ? 0.85 : 1);
    out.push(...drum(freq * (1 + 0.04 * (i % 3)), 0.3, v, t, { skin: 0.55, tension: 1.2, shell: 0.3 }));
  }
  return out;
}

/**
 * A gong: inharmonic partials in close pairs that beat against each other (the shimmer), the upper
 * ones blooming in after the strike, a felt mallet's thud and a wash of air. Big gongs sag in pitch
 * as they ring (`pitch` < 1); the small opera gong rises (> 1).
 */
function gong(freq: number, decay: number, gain = 1, at = 0, pitch = 0.985, attack = 0.004): Layer[] {
  return [
    {
      wave: 'sine',
      freq,
      glide: pitch,
      glideTime: Math.min(1.2, decay * 0.35),
      decay,
      gain,
      at,
      attack,
      partials: [
        [1.004, 0.55, 1.1],
        [1.49, 0.42, 1.2],
        [1.497, 0.3, 1.2],
        [2.02, 0.36, 1.5, 0.12],
        [2.46, 0.26, 1.7, 0.25],
        [2.97, 0.22, 1.9, 0.35],
        [3.005, 0.16, 1.9, 0.35],
        [3.62, 0.13, 2.1, 0.5],
        [4.27, 0.09, 2.2, 0.6],
        [5.13, 0.05, 2.3, 0.7],
      ],
    },
    { wave: 'noise', freq: 0, decay: 0.09, gain: gain * 0.28, at, attack: 0.001, filter: { type: 'lp', from: 900, to: 200 } },
    {
      wave: 'noise',
      freq: 0,
      decay: decay * 0.5,
      gain: gain * 0.05,
      at,
      attack: Math.max(0.35, attack),
      filter: { type: 'bp', from: Math.min(4500, freq * 7), to: Math.min(4500, freq * 4), q: 4 },
    },
  ];
}

/** Steel on steel: the clash of the strike, two blades' inharmonic rings, one a little higher. */
function steel(freq: number, decay: number, gain = 1, at = 0): Layer[] {
  return [
    { wave: 'noise', freq: 0, decay: 0.022, gain, at, attack: 0.0005, filter: { type: 'bp', from: 3400, to: 1900, q: 1.1 } },
    {
      wave: 'sine',
      freq,
      decay,
      gain: gain * 0.5,
      at,
      attack: 0.001,
      partials: [
        [1.34, 0.65],
        [1.87, 0.5, 1.2],
        [2.41, 0.36, 1.3],
        [2.93, 0.22, 1.3],
        [3.62, 0.12, 1.4],
      ],
    },
    { wave: 'sine', freq: freq * 1.068, decay: decay * 0.7, gain: gain * 0.32, at: at + 0.002, attack: 0.001, partials: [[1.52, 0.5], [2.23, 0.28]] },
  ];
}

/** A bowstring's twang: a taut string that drops in pitch and wobbles as it slaps home, and the limbs' knock. */
function twang(note: number, gain = 1, at = 0, decay = 0.28): Layer[] {
  return [
    {
      wave: 'pluck',
      freq: hz(note),
      glide: 0.93,
      glideTime: 0.05,
      decay,
      gain,
      at,
      attack: 0.001,
      pluck: { bright: 0.85, pos: 0.06, damp: 0.55 },
      vibrato: [24, 0.014],
      filter: { type: 'lp', from: 3400, to: 1100 },
    },
    knock(230, 0.05, gain * 0.45, at),
  ];
}

/**
 * A war horn: a brassy saw pair scooped up into the note, its filter opening as it swells, a late
 * vibrato and breath in the bore. `hold` is how long it's blown.
 */
function horn(note: number, hold: number, gain = 1, at = 0): Layer[] {
  const f = hz(note);
  return [
    {
      wave: 'saw',
      freq: f * 0.92,
      glide: 1 / 0.92,
      glideTime: 0.22,
      at,
      attack: 0.16,
      hold,
      decay: 0.55,
      gain,
      detune: 1.004,
      vibrato: [4.8, 0.006, hold * 0.6 + 0.2],
      drive: 1.6,
      filter: { type: 'lp', from: 240, follow: 5, q: 1.3 },
    },
    { wave: 'noise', freq: 0, at, attack: 0.1, hold: hold * 0.7, decay: 0.4, gain: gain * 0.05, filter: { type: 'bp', from: f * 4, q: 2.5 } },
  ];
}

/** The erhu: a bowed string, scooped into the note, nasal (its python-skin body), with a late vibrato. */
function erhu(note: number, hold: number, gain = 1, at = 0, decay = 0.3): Layer[] {
  const f = hz(note);
  const bow: Layer = {
    wave: 'saw',
    freq: f * 0.965,
    glide: 1 / 0.965,
    glideTime: 0.09,
    at,
    attack: 0.07,
    hold,
    decay,
    gain,
    vibrato: [5.6, 0.011, 0.35],
    filter: { type: 'lp', from: 850, follow: 2.2, q: 0.9 },
  };
  return [
    bow,
    { ...bow, gain: gain * 0.55, filter: { type: 'bp', from: 1150, q: 2.2 } },
    { wave: 'noise', freq: 0, at, attack: 0.05, hold, decay: decay * 0.8, gain: gain * 0.035, filter: { type: 'bp', from: 2600, q: 1.5 } },
  ];
}

/** The dizi: a bamboo flute, bright and a little buzzy (its membrane), breath and a tongued start. */
function dizi(note: number, hold: number, gain = 1, at = 0): Layer[] {
  const f = hz(note);
  return [
    {
      wave: 'sine',
      freq: f * 0.985,
      glide: 1 / 0.985,
      glideTime: 0.05,
      at,
      attack: 0.04,
      hold,
      decay: 0.22,
      gain,
      vibrato: [6, 0.007, 0.3],
      partials: [
        [2, 0.3],
        [3, 0.18],
        [4, 0.09],
        [5, 0.05],
        [6, 0.03],
      ],
      drive: 0.9,
    },
    { wave: 'noise', freq: 0, at, attack: 0.03, hold, decay: 0.2, gain: gain * 0.09, filter: { type: 'bp', from: f * 2, q: 3 } },
    { wave: 'noise', freq: 0, at, attack: 0.004, decay: 0.05, gain: gain * 0.16, filter: { type: 'bp', from: Math.min(5000, f * 3), q: 1.5 } },
  ];
}

/** The shakuhachi: a breathy bamboo flute, bending up into the note, the breath pitched with it. */
function shakuhachi(note: number, hold: number, gain = 1, at = 0): Layer[] {
  const f = hz(note);
  return [
    {
      wave: 'sine',
      freq: f * 0.95,
      glide: 1 / 0.95,
      glideTime: 0.28,
      at,
      attack: 0.18,
      hold,
      decay: 0.5,
      gain,
      vibrato: [4.6, 0.009, hold * 0.5 + 0.3],
      partials: [
        [2, 0.14],
        [3, 0.07],
      ],
    },
    { wave: 'noise', freq: 0, at, attack: 0.12, hold, decay: 0.45, gain: gain * 0.22, filter: { type: 'bp', from: f, q: 5 } },
    { wave: 'noise', freq: 0, at, attack: 0.1, hold: hold * 0.3, decay: 0.4, gain: gain * 0.1, filter: { type: 'bp', from: f * 3, q: 1.2 } },
  ];
}

/** A soft low thud: a sine that drops in pitch, and a muffled click. */
function thud(freq: number, decay: number, gain = 1, at = 0): Layer[] {
  return [
    { wave: 'sine', freq, glide: 0.55, glideTime: 0.09, decay, gain, at, attack: 0.002 },
    { wave: 'noise', freq: 0, decay: Math.min(0.05, decay / 3), gain: gain * 0.35, at, attack: 0.001, filter: { type: 'lp', from: 900, to: 250 } },
  ];
}

/** A wooden knock (clappers, a mallet on timber): a short triangle with a hollow partial, softened. */
function knock(freq: number, decay: number, gain = 1, at = 0): Layer {
  return {
    wave: 'triangle',
    freq,
    glide: 0.92,
    decay,
    gain,
    at,
    attack: 0.001,
    partials: [[2.41, 0.45]],
    filter: { type: 'lp', from: Math.min(5000, freq * 5) },
  };
}

/** Filtered noise sweeping from one pitch to another: whooshes, swings, wind, flames. */
function whoosh(from: number, to: number, decay: number, gain = 1, at = 0, attack = 0.02, q = 1.4): Layer {
  return { wave: 'noise', freq: 0, decay, gain, at, attack, filter: { type: 'bp', from, to, q } };
}

/** A small bronze bell (temple bells, harness bells): inharmonic partials that ring shorter the higher they are. */
function bell(note: number, decay: number, gain = 1, at = 0): Layer {
  return { wave: 'sine', freq: hz(note), decay, gain, at, attack: 0.003, partials: [[1.006, 0.4], [2.76, 0.32], [5.4, 0.12], [8.93, 0.04]] };
}

/** A copper coin's clink. */
function clink(freq: number, gain = 1, at = 0): Layer {
  return { wave: 'sine', freq, decay: 0.09, gain, at, attack: 0.001, partials: [[1.47, 0.45], [2.09, 0.2]] };
}

/** A soft glittering hiss (frost). */
function sparkle(decay: number, gain = 1, at = 0): Layer {
  return { wave: 'noise', freq: 0, decay, gain, at, attack: 0.01, filter: { type: 'hp', from: 5000, to: 7200 } };
}

interface SfxOpts {
  variants?: number;
  wet?: number;
  pitch?: number;
}

/** A sound: volume, cooldown (ms), most voices at once, priority, then its synth definition. */
function sfx(volume: number, cooldown: number, max: number, priority: Priority, def: SynthDef, o: SfxOpts = {}): SoundSpec {
  return {
    def,
    volume,
    cooldown,
    max,
    priority,
    // Frequent short sounds get the most versions; long, rare ones fewer (they cost the most to bake).
    variants: o.variants ?? (priority === 0 ? 4 : soundSeconds(def) > 1.2 ? 2 : 3),
    wet: o.wet ?? 0.2,
    pitch: o.pitch ?? 0.03,
  };
}

/** Tunes (in the music's scale): varied, but never out of tune. */
const TUNE: SfxOpts = { pitch: 0.006 };

// ---------------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------------

export const SOUNDS = {
  // UI --------------------------------------------------------------------
  /** A button tap: a tiny bamboo tick. */
  tap: sfx(0.3, 40, 2, 2, { layers: [knock(1250, 0.035, 1), { wave: 'sine', freq: 2200, decay: 0.02, gain: 0.2 }] }, { wet: 0.04, pitch: 0.04 }),
  /** Not enough gold: two dull clapper knocks, falling. */
  noGold: sfx(0.55, 250, 1, 2, { layers: [knock(330, 0.09, 1), knock(247, 0.13, 1, 0.1)] }, { wet: 0.1 }),
  /** Not enough mana, nothing in range: a muted string. */
  deny: sfx(0.45, 200, 1, 2, { layers: [...koto(D3, 0.14, 1, 0, { damp: 0.9, bright: 0.3 }), knock(294, 0.08, 0.6)] }, { wet: 0.1 }),

  // Tower shots (branches play the same sound at another pitch: `BRANCH_RATE`) ---
  /** Arrow: a bowstring's twang and the arrow's hiss. */
  'shot.arrow': sfx(0.22, 70, 3, 0, { layers: [...twang(D3, 1), whoosh(2600, 900, 0.08, 0.35, 0.01, 0.004)] }),
  /** Cannon: a black-powder bombard: a boom with a body and a burst of smoke. */
  'shot.cannon': sfx(0.36, 110, 3, 0, {
    layers: [
      ...drum(58, 0.45, 1, 0, { skin: 0.15, tension: 1.7, shell: 0.6 }),
      { wave: 'noise', freq: 0, decay: 0.32, gain: 0.55, attack: 0.003, filter: { type: 'lp', from: 1300, to: 140 } },
    ],
  }),
  /** Frost: a string's high harmonic and a little bronze bell. */
  'shot.frost': sfx(0.16, 90, 3, 0, {
    layers: [...zither(A5, 0.4, 1, 0, { bright: 0.9, pos: 0.5, damp: 0.1 }), bell(D7 - 12, 0.25, 0.35, 0.02), sparkle(0.06, 0.15)],
  }, TUNE),
  /** Arcane: a struck bronze bowl that hums and rings. */
  'shot.arcane': sfx(0.17, 90, 3, 0, {
    layers: [
      { wave: 'sine', freq: hz(A4), glide: 1.5, glideTime: 0.1, decay: 0.18, gain: 0.5, attack: 0.01, vibrato: [18, 0.01] },
      { wave: 'sine', freq: hz(D5), decay: 0.45, gain: 1, at: 0.03, attack: 0.002, partials: [[1.007, 0.6], [2.71, 0.3], [5.1, 0.08]] },
    ],
  }, TUNE),
  /** Flak: two quick tanggu pops. */
  'shot.flak': sfx(0.24, 90, 3, 0, {
    layers: [
      ...drum(190, 0.12, 1, 0, { skin: 0.7, tension: 1.2, shell: 0.2 }),
      whoosh(1300, 700, 0.05, 0.4, 0, 0.002),
      ...drum(175, 0.12, 0.85, 0.07, { skin: 0.7, tension: 1.2, shell: 0.2 }),
      whoosh(1200, 600, 0.05, 0.35, 0.07, 0.002),
    ],
  }),
  /** The Blizzard pulse: a gust with harness bells in it. */
  blizzard: sfx(0.3, 250, 2, 0, {
    layers: [whoosh(2800, 650, 0.6, 1, 0, 0.05, 1.1), bell(A5, 0.35, 0.35, 0.05), bell(D6, 0.35, 0.3, 0.12), bell(G5, 0.3, 0.25, 0.2)],
  }),

  // Creeps -------------------------------------------------------------------
  /** A creep falls: a body hitting the ground and a rattle of gear (bigger creeps play it lower). */
  death: sfx(0.24, 45, 4, 0, {
    layers: [
      ...thud(120, 0.16, 1),
      { wave: 'noise', freq: 0, decay: 0.1, gain: 0.45, at: 0.01, attack: 0.003, filter: { type: 'bp', from: 900, to: 400, q: 1 } },
      knock(610, 0.04, 0.25, 0.035),
      knock(470, 0.04, 0.2, 0.07),
    ],
  }),
  /** A boss falls: a great gong, a deep boom and a horn sinking. */
  bossDeath: sfx(0.8, 400, 1, 2, {
    layers: [
      ...drum(42, 1.2, 1, 0, { skin: 0.3, tension: 1.5, shell: 0.7 }),
      ...gong(hz(D2) * 1.5, 3.2, 0.8, 0.05),
      { ...horn(A2, 0.6, 0.5, 0.2)[0]!, glide: 0.8, glideTime: 1.2 },
    ],
  }, { variants: 2, wet: 0.3 }),
  /** Your bounty: two copper coins. */
  coin: sfx(0.13, 70, 2, 0, { layers: [clink(1900, 0.8), clink(2250, 0.6, 0.05)] }, { wet: 0.12 }),
  /** Ironhorn's Stomp: the ground itself is a drum. */
  stomp: sfx(0.6, 300, 1, 1, {
    layers: [
      ...drum(38, 0.8, 1, 0, { skin: 0.2, tension: 1.5, shell: 0.8 }),
      { wave: 'noise', freq: 0, decay: 0.5, gain: 0.5, attack: 0.01, filter: { type: 'lp', from: 380, to: 90 } },
      knock(200, 0.07, 0.3, 0.12),
      knock(160, 0.07, 0.25, 0.2),
    ],
  }),
  /** Shardback shifts its hide: plates of armour scraping, a metallic shimmer. */
  hideShift: sfx(0.42, 400, 1, 1, {
    layers: [
      whoosh(700, 2600, 0.45, 0.6, 0, 0.12, 3),
      ...steel(880, 0.6, 0.35, 0.05),
      ...gong(hz(A4), 0.9, 0.35, 0.1, 1.04),
    ],
  }),

  // The Heart and waves ---------------------------------------------------------
  /** A creep reached the Heart: a low alarm gong struck hard, twice, over a war drum. */
  heartHit: sfx(0.65, 400, 1, 2, {
    layers: [...gong(hz(A2), 1.2, 1, 0, 0.96), ...gong(hz(F3 - 12), 1.3, 0.8, 0.17, 0.96), ...drum(62, 0.5, 0.7, 0, { skin: 0.4 })],
  }, { variants: 2, wet: 0.25 }),
  /** A wave starts: a war drum, and a war horn's call a fifth apart. */
  waveStart: sfx(0.5, 1000, 1, 2, {
    layers: [
      ...drum(64, 0.6, 1, 0, { skin: 0.45, shell: 0.55 }),
      ...horn(D3, 0.7, 0.9, 0.08),
      ...horn(A2, 0.55, 0.6, 0.12),
      ...drum(64, 0.6, 0.8, 1.05, { skin: 0.45, shell: 0.55 }),
    ],
  }, { variants: 2, wet: 0.3 }),
  /** A boss wave: a drum roll building up, a great gong, a war drum and the low horns. */
  bossWave: sfx(0.8, 1000, 1, 2, {
    layers: [
      ...roll(70, 14, 1.0, 0.8),
      ...gong(hz(D2) * 1.5, 3.2, 1, 1.05),
      ...drum(46, 1.2, 1, 1.05, { skin: 0.4, tension: 1.5, shell: 0.7 }),
      ...horn(D2, 1.3, 0.7, 1.1),
      ...horn(A2, 1.1, 0.4, 1.15),
    ],
  }, { variants: 2, wet: 0.3 }),

  // Hero attacks --------------------------------------------------------------------
  /** The Ranger's bow: a heavier twang and the arrow's hiss. */
  'attack.ranger': sfx(0.32, 80, 2, 1, { layers: [...twang(A2, 1, 0, 0.32), whoosh(2400, 1100, 0.07, 0.35, 0.012, 0.004)] }),
  /** The Warden's blade landing: steel on steel, a thunk behind it. */
  'attack.warden': sfx(0.36, 80, 2, 1, {
    layers: [...steel(1180, 0.32, 1), knock(190, 0.1, 0.8, 0.004), whoosh(2200, 800, 0.06, 0.4, 0, 0.004, 2)],
  }),
  /** The Arcanist's staff: a string struck with a rod, falling, and a spark. */
  'attack.arcanist': sfx(0.28, 80, 2, 1, {
    layers: [...zither(A4, 0.4, 1, 0, { bright: 0.9, damp: 0.15, bend: 0.94, bendAt: 0.02 }), whoosh(3000, 1500, 0.08, 0.25, 0, 0.003, 2)],
  }),

  // Hero skills (Q / W / R; E is passive) ---------------------------------------------
  /** Multishot: three strings loosed at once, ragged. */
  'ranger.Q': sfx(0.45, 150, 2, 1, {
    layers: [...twang(A2, 1), ...twang(C3, 0.9, 0.03), ...twang(D3, 0.8, 0.065), whoosh(2600, 1000, 0.16, 0.45, 0.02)],
  }),
  /** Snare Trap: a wooden clack and a creaking rope pulled tight. */
  'ranger.W': sfx(0.45, 150, 2, 1, {
    layers: [knock(420, 0.08, 1), knock(300, 0.1, 0.9, 0.08), { wave: 'pluck', freq: 105, glide: 1.25, glideTime: 0.25, decay: 0.35, gain: 0.5, at: 0.1, pluck: { bright: 0.4, damp: 0.7 } }],
  }),
  /** Arrow Storm: a volley loosed by a line of archers, then the sky full of arrows. */
  'ranger.R': sfx(0.55, 300, 1, 1, {
    layers: [
      ...[0, 0.03, 0.07, 0.1, 0.15, 0.19, 0.24].flatMap((t, i) => twang([A2, C3, D3, A2, G3 - 12, D3, C3][i]!, 0.75 - i * 0.05, t)),
      whoosh(700, 2800, 0.9, 1, 0.2, 0.3, 1.1),
      whoosh(2600, 900, 0.6, 0.5, 0.7, 0.2, 1.3),
    ],
  }),
  /** Cleave: a heavy swing, steel biting and a thud. */
  'warden.Q': sfx(0.5, 150, 2, 1, {
    layers: [whoosh(1500, 420, 0.28, 1, 0, 0.05, 1.8), ...steel(940, 0.45, 0.8, 0.12), ...thud(100, 0.25, 0.8, 0.12)],
  }),
  /** Taunt: a sword beaten on the shield, and a horn's blast. */
  'warden.W': sfx(0.5, 150, 2, 1, {
    layers: [...drum(130, 0.25, 0.9, 0, { skin: 0.8 }), ...steel(760, 0.3, 0.5, 0), ...drum(130, 0.25, 0.8, 0.14, { skin: 0.8 }), ...horn(A2, 0.3, 0.6, 0.2)],
  }),
  /** Last Stand: a great gong and a war drum. */
  'warden.R': sfx(0.62, 300, 1, 1, {
    layers: [...gong(hz(D3) * 0.75, 3, 1, 0), ...drum(50, 0.9, 0.9, 0, { skin: 0.35, shell: 0.7 }), ...guzheng(D5, 1.6, 0.35, 0.12, { vib: 0.006 })],
  }, { wet: 0.3 }),
  /** Fireball: a rushing fwoom and the crackle of flame. */
  'arcanist.Q': sfx(0.45, 150, 2, 1, {
    layers: [
      whoosh(360, 1700, 0.35, 1, 0, 0.04, 1.2),
      { wave: 'sine', freq: 180, glide: 2, decay: 0.28, gain: 0.5, attack: 0.02 },
      ...[0.05, 0.11, 0.16, 0.24].map((t, i) => knock(900 + i * 170, 0.02, 0.18, t)),
    ],
  }),
  /** Frost Nova: a spray of small bells and a glittering hiss. */
  'arcanist.W': sfx(0.5, 150, 2, 1, {
    layers: [bell(A5, 0.6, 1), bell(D6, 0.5, 0.7, 0.03), bell(A6, 0.45, 0.5, 0.06), bell(G5, 0.5, 0.5, 0.09), sparkle(0.45, 0.45)],
  }, TUNE),
  /** Meteor: a roar climbing to the sky over a gong swelling in. */
  'arcanist.R': sfx(0.58, 300, 1, 1, {
    layers: [
      whoosh(250, 1600, 1.0, 1, 0, 0.5, 1.4),
      ...gong(hz(A2) * 1.5, 1.6, 0.8, 0, 1.03, 0.7),
      { wave: 'sine', freq: 90, glide: 2.5, glideTime: 0.8, decay: 0.9, gain: 0.5, attack: 0.4 },
    ],
  }),

  // Skill impacts --------------------------------------------------------------------
  /** Fireball lands: a boom and flames. */
  fireballHit: sfx(0.42, 150, 2, 1, {
    layers: [
      ...drum(80, 0.35, 1, 0, { skin: 0.25, tension: 1.6, shell: 0.6 }),
      { wave: 'noise', freq: 0, decay: 0.45, gain: 0.7, attack: 0.005, filter: { type: 'lp', from: 1400, to: 200 } },
    ],
  }),
  /** Meteor lands: a huge boom, falling debris and the ground ringing. */
  meteorHit: sfx(0.68, 300, 1, 2, {
    layers: [
      ...drum(40, 1.1, 1, 0, { skin: 0.3, tension: 1.8, shell: 0.8 }),
      { wave: 'noise', freq: 0, decay: 0.9, gain: 0.8, attack: 0.006, filter: { type: 'lp', from: 900, to: 110 } },
      knock(240, 0.08, 0.3, 0.25),
      knock(180, 0.08, 0.25, 0.38),
      knock(210, 0.07, 0.2, 0.5),
    ],
  }, { wet: 0.3 }),
  /** A Snare Trap springs: a snap and the rope's twang. */
  trap: sfx(0.36, 120, 2, 0, { layers: [knock(620, 0.05, 1), knock(900, 0.05, 0.6, 0.02), ...twang(G3, 0.5, 0.02, 0.2)] }),

  // Heroes ---------------------------------------------------------------------------
  /** Level up: a guzheng sweep up the scale and a ringing top note. */
  levelUp: sfx(0.48, 300, 1, 1, {
    layers: [...gliss([D4, F4, G4, A4, C5, D5, F5, G5], 0.035, 0.9, 0.8), ...guzheng(A5, 1.6, 1, 0.3, { vib: 0.007 })],
  }, { ...TUNE, wet: 0.3 }),
  /** Your hero falls: a low gong and a zither falling, each note bent down. */
  heroDown: sfx(0.48, 500, 1, 1, {
    layers: [
      ...gong(hz(D3), 2, 0.6, 0, 0.97),
      ...koto(A4, 0.9, 1, 0.05, { bend: 0.94 }),
      ...koto(F4, 0.9, 0.9, 0.35, { bend: 0.95 }),
      ...koto(D4, 1.4, 0.9, 0.65, { bend: 0.95, bendAt: 0.3 }),
    ],
  }, { ...TUNE, wet: 0.3 }),
  /** Your hero is back: a short guzheng rise and a bell. */
  respawn: sfx(0.38, 500, 1, 1, { layers: [...gliss([D5, F5, A5], 0.06, 0.8, 0.9), bell(D6, 0.8, 0.4, 0.2)] }, { ...TUNE, wet: 0.3 }),

  // Towers ---------------------------------------------------------------------------
  /** Build: a mallet on timber and a string plucked as it's done. */
  build: sfx(0.5, 120, 2, 1, {
    layers: [...thud(130, 0.16, 1), knock(520, 0.07, 0.8), knock(390, 0.08, 0.8, 0.09), ...guzheng(D5, 0.6, 0.35, 0.16)],
  }, TUNE),
  /** Upgrade: a thud and two strings rising. */
  upgrade: sfx(0.5, 120, 2, 1, { layers: [...thud(140, 0.14, 0.8), ...guzheng(A4, 0.8, 0.8, 0.05), ...guzheng(D5, 1, 0.8, 0.13)] }, TUNE),
  /** Branch (tier 4): a gong and a sweep up a chord. */
  branch: sfx(0.56, 200, 1, 1, {
    layers: [...thud(120, 0.2, 0.8), ...gong(hz(D4) * 0.5, 2.2, 0.5, 0.02), ...gliss([D4, A4, D5, F5, A5, D6], 0.04, 1.3, 0.8, 0.05)],
  }, { ...TUNE, wet: 0.3 }),
  /** Sell: a little fall of copper coins on wood. */
  sell: sfx(0.4, 120, 2, 1, {
    layers: [knock(400, 0.06, 0.6), clink(2300, 0.7, 0.02), clink(2050, 0.7, 0.07), clink(1850, 0.7, 0.12), clink(2150, 0.6, 0.17)],
  }),
  /** A tower is destroyed: timber cracking and falling. */
  towerBreak: sfx(0.5, 200, 2, 1, {
    layers: [
      { wave: 'noise', freq: 0, decay: 0.35, gain: 0.8, attack: 0.003, filter: { type: 'lp', from: 2000, to: 300 } },
      knock(200, 0.1, 0.7, 0.03),
      knock(150, 0.12, 0.6, 0.11),
      knock(240, 0.08, 0.4, 0.2),
      ...thud(80, 0.3, 0.8),
    ],
  }),

  // The end ---------------------------------------------------------------------------
  /** Victory: war drums, horns rising to the octave, a great gong and a guzheng sweep. */
  victory: sfx(0.72, 2000, 1, 2, {
    layers: [
      ...drum(64, 0.5, 1, 0),
      ...drum(64, 0.5, 0.9, 0.25),
      ...horn(A2, 0.3, 0.7, 0),
      ...horn(D3, 0.3, 0.8, 0.25),
      ...drum(52, 1, 1, 0.55, { shell: 0.7 }),
      ...gong(hz(D2) * 1.5, 3.2, 0.8, 0.55),
      ...horn(D3, 1.5, 0.9, 0.55),
      ...horn(A3, 1.4, 0.6, 0.6),
      ...gliss([D4, F4, G4, A4, C5, D5, F5, G5, A5, C6, D6], 0.03, 1.6, 0.6, 0.6),
    ],
  }, { variants: 1, wet: 0.3, pitch: 0.004 }),
  /** Defeat: a slow low gong, and the erhu's lament falling. */
  defeat: sfx(0.72, 2000, 1, 2, {
    layers: [
      ...gong(hz(D2) * 1.5, 3.5, 0.8, 0, 0.97),
      ...drum(46, 1, 0.8, 0, { shell: 0.7 }),
      ...erhu(A4, 0.6, 0.8, 0.3),
      ...erhu(G4, 0.3, 0.7, 1.2),
      ...erhu(F4, 0.5, 0.7, 1.6),
      ...erhu(D4, 1.2, 0.8, 2.3, 0.6),
    ],
  }, { variants: 1, wet: 0.35, pitch: 0.004 }),
} satisfies Record<string, SoundSpec>;

export type SoundId = keyof typeof SOUNDS;
export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];

// ---------------------------------------------------------------------------
// Music instruments (music.ts plays them at other pitches with the playback rate)
// ---------------------------------------------------------------------------

export interface InstrumentSpec {
  /** The notes (MIDI) its samples are baked at, played from the nearest; null: unpitched, played as is. */
  roots: number[] | null;
  /** The sound at `root` (ignored when unpitched). */
  make: (root: number) => SynthDef;
  /** Its level in the mix. */
  level: number;
  /** How loose a player's timing is (ms, ±): drums tight, flutes free. */
  loose: number;
}

function instrument(roots: number[] | null, level: number, loose: number, make: (root: number) => SynthDef): InstrumentSpec {
  return { roots, make, level, loose };
}

export const INSTRUMENTS = {
  // The lobby: a Japanese garden --------------------------------------------------
  /** Koto. */
  koto: instrument([45, 57, 69, 81], 1, 12, (n) => ({ layers: koto(n, n < 60 ? 2.6 : n < 70 ? 2.1 : 1.6, 1) })),
  /** Shakuhachi (sustained: notes are cut to their length). */
  shaku: instrument([67, 79], 0.36, 30, (n) => ({ layers: shakuhachi(n, 2.4, 1) })),
  /** Odaiko: the big taiko, played soft. */
  taiko: instrument(null, 1, 6, () => ({ layers: drum(50, 1.5, 1, 0, { skin: 0.3, tension: 1.3, shell: 0.6 }) })),
  /** Shime-daiko: the small, tight taiko. */
  shime: instrument(null, 0.35, 5, () => ({ layers: drum(320, 0.22, 1, 0, { skin: 0.6, tension: 1.1, shell: 0.12 }) })),

  // The match: a war epic ------------------------------------------------------------
  /** Guzheng. */
  guzheng: instrument([50, 62, 74], 1, 9, (n) => ({ layers: guzheng(n, n < 60 ? 3 : n < 70 ? 2.4 : 1.8, 1) })),
  /** Erhu (sustained). */
  erhu: instrument([50, 62, 74, 86], 0.4, 16, (n) => ({ layers: erhu(n, 2.6, 1) })),
  /** Dizi (sustained). */
  dizi: instrument([81, 93], 0.24, 12, (n) => ({ layers: dizi(n, 2.2, 1) })),
  /** The great war drum. */
  wardrum: instrument(null, 0.55, 5, () => ({ layers: drum(62, 1.1, 1, 0, { skin: 0.5, tension: 1.35, shell: 0.55 }) })),
  /** Tanggu: the smaller, higher drum. */
  tanggu: instrument(null, 0.45, 5, () => ({ layers: drum(150, 0.35, 1, 0, { skin: 0.7, tension: 1.2, shell: 0.3 }) })),
  /** A stick on the drum's rim. */
  rim: instrument(null, 0.3, 4, () => ({ layers: [knock(880, 0.05, 1), knock(1320, 0.03, 0.4)] })),
  /** The great gong. */
  gong: instrument(null, 0.4, 0, () => ({ layers: gong(hz(D2) * 1.5, 4.2, 1) })),
  /** The small opera gong: its pitch rises. */
  luo: instrument(null, 0.22, 6, () => ({ layers: gong(560, 1.1, 1, 0, 1.08) })),
} satisfies Record<string, InstrumentSpec>;

export type Instrument = keyof typeof INSTRUMENTS;

/** Buffer id of an instrument's sample at `root` (unpitched: the one sample). */
export const instrumentId = (i: Instrument, root: number | null = null): string => (root === null ? `m.${i}` : `m.${i}.${root}`);

/** The sample that plays `note` on `inst`, and its playback rate. */
export function noteSample(inst: Instrument, note: number): { id: string; rate: number } {
  const roots = INSTRUMENTS[inst].roots;
  if (!roots) return { id: instrumentId(inst), rate: 1 };
  let root = roots[0]!;
  for (const r of roots) if (Math.abs(r - note) < Math.abs(root - note)) root = r;
  return { id: instrumentId(inst, root), rate: Math.pow(2, (note - root) / 12) };
}

/** Buffer id of variant `k` of a sound (0 is the sound itself). */
export const variantId = (id: string, k: number): string => (k === 0 ? id : `${id}#${k}`);

/** What the bake worker renders for one buffer: the sound and its noise seed. */
export interface BakeJob {
  def: SynthDef;
  seed: number;
}

/** Every synth sound by buffer id (effects with their variants, instrument samples), for baking. */
export function allSynthDefs(): Map<string, BakeJob> {
  const m = new Map<string, BakeJob>();
  for (const [id, s] of Object.entries(SOUNDS) as [SoundId, SoundSpec][]) {
    for (let k = 0; k < s.variants; k++) m.set(variantId(id, k), { def: varyDef(s.def, k), seed: k });
  }
  for (const [name, s] of Object.entries(INSTRUMENTS) as [Instrument, InstrumentSpec][]) {
    if (s.roots) for (const r of s.roots) m.set(instrumentId(name, r), { def: s.make(r), seed: 0 });
    else m.set(instrumentId(name), { def: s.make(0), seed: 0 });
  }
  return m;
}
