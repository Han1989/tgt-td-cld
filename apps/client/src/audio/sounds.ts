// The sound bank (docs/ART.md §13): every sound effect and music instrument as synth data
// (`synth.ts`), with its loudness and how often it may play. Runelight sounds: soft magical
// chimes and bells for magic, gold and good news, wooden knocks and thuds for towers, bows and
// building, filtered noise for whooshes. Nothing harsh: no raw square or saw, no bright noise
// without a filter. Chimes use the music's key (D: D E F♯ A B for good news, D F G A C for bad),
// so effects never clash with the music.

import { midiHz, type Layer, type SynthDef } from './synth';

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
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const hz = midiHz;
// Notes (MIDI) in the music's key.
const D4 = 62;
const E4 = 64;
const Fs4 = 66;
const A4 = 69;
const D5 = 74;
const F5 = 77;
const Fs5 = 78;
const A5 = 81;
const C6 = 84;
const D6 = 86;
const E6 = 88;
const A6 = 93;
const B6 = 95;
const D7 = 98;
const E7 = 100;

/** A glassy chime: a sine with soft harmonic partials. */
function chime(note: number, decay: number, gain = 1, at = 0): Layer {
  return { wave: 'sine', freq: hz(note), decay, gain, at, attack: 0.003, partials: [[2, 0.3], [3, 0.1], [4.2, 0.06]] };
}

/** A struck bell: inharmonic partials that ring shorter the higher they are. */
function bell(note: number, decay: number, gain = 1, at = 0): Layer {
  return { wave: 'sine', freq: hz(note), decay, gain, at, attack: 0.004, partials: [[2.76, 0.4], [5.4, 0.18], [8.93, 0.07]] };
}

/** A soft low thud: a sine that drops in pitch, and a muffled click. */
function thud(freq: number, decay: number, gain = 1, at = 0): Layer[] {
  return [
    { wave: 'sine', freq, glide: 0.55, glideTime: 0.09, decay, gain, at, attack: 0.002 },
    { wave: 'noise', freq: 0, decay: Math.min(0.05, decay / 3), gain: gain * 0.35, at, attack: 0.001, filter: { type: 'lp', from: 900, to: 250 } },
  ];
}

/** A wooden knock (a woodblock or a plank): a short triangle with a hollow partial, softened. */
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

/** Filtered noise sweeping from one pitch to another: whooshes, swishes, wind. */
function whoosh(from: number, to: number, decay: number, gain = 1, at = 0, attack = 0.02, q = 1.4): Layer {
  return { wave: 'noise', freq: 0, decay, gain, at, attack, filter: { type: 'bp', from, to, q } };
}

/** A plucked string (bows, the bass). */
function pluck(freq: number, decay: number, gain = 1, at = 0): Layer {
  return { wave: 'pluck', freq, decay, gain, at, attack: 0.001, filter: { type: 'lp', from: 3200 } };
}

/** A soft glittering hiss (frost, magic). */
function sparkle(decay: number, gain = 1, at = 0): Layer {
  return { wave: 'noise', freq: 0, decay, gain, at, attack: 0.01, filter: { type: 'hp', from: 5200, to: 7500 } };
}

/** A sound: volume, cooldown (ms), most voices at once, priority, then its synth definition. */
function sfx(volume: number, cooldown: number, max: number, priority: Priority, def: SynthDef): SoundSpec {
  return { def, volume, cooldown, max, priority };
}

// ---------------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------------

export const SOUNDS = {
  // UI --------------------------------------------------------------------
  /** A button tap: a tiny wooden tick. */
  tap: sfx(0.3, 40, 2, 2, { layers: [knock(1250, 0.035, 1), { wave: 'sine', freq: 2200, decay: 0.02, gain: 0.2 }] }),
  /** Not enough gold: two dull knocks, falling. */
  noGold: sfx(0.55, 250, 1, 2, { layers: [knock(330, 0.09, 1), knock(247, 0.13, 1, 0.1)] }),
  /** Not enough mana, nothing in range: one soft low knock. */
  deny: sfx(0.4, 200, 1, 2, { layers: [knock(294, 0.1, 1)] }),

  // Tower shots (branches play the same sound at another pitch: `BRANCH_RATE`) ---
  /** Arrow: a bowstring thrum and a short swish. */
  'shot.arrow': sfx(0.2, 70, 3, 0, { layers: [pluck(hz(D4), 0.16, 1), whoosh(2400, 900, 0.07, 0.5, 0.005, 0.004)] }),
  /** Cannon: a muffled wooden boom. */
  'shot.cannon': sfx(0.34, 110, 3, 0, {
    layers: [
      ...thud(92, 0.3, 1),
      { wave: 'noise', freq: 0, decay: 0.2, gain: 0.5, attack: 0.004, filter: { type: 'lp', from: 700, to: 140 } },
    ],
  }),
  /** Frost: a crystal tinkle. */
  'shot.frost': sfx(0.14, 90, 3, 0, { layers: [chime(A6, 0.22, 1), chime(E7, 0.18, 0.5, 0.025), sparkle(0.08, 0.25)] }),
  /** Arcane: a rising hum that rings. */
  'shot.arcane': sfx(0.15, 90, 3, 0, {
    layers: [
      { wave: 'sine', freq: hz(A5), glide: 1.5, glideTime: 0.1, decay: 0.2, gain: 1, attack: 0.01, vibrato: [18, 0.01] },
      chime(E6, 0.18, 0.3, 0.04),
    ],
    echo: { delay: 0.07, feedback: 0.3, mix: 0.4 },
  }),
  /** Flak: two soft pops. */
  'shot.flak': sfx(0.22, 90, 3, 0, {
    layers: [
      knock(190, 0.06, 1),
      whoosh(1300, 700, 0.05, 0.6, 0, 0.002),
      knock(170, 0.06, 0.8, 0.07),
      whoosh(1200, 600, 0.05, 0.5, 0.07, 0.002),
    ],
  }),
  /** The Blizzard pulse: a gust with ice in it. */
  blizzard: sfx(0.3, 250, 2, 0, {
    layers: [
      whoosh(3000, 700, 0.6, 1, 0, 0.04, 1.1),
      chime(B6, 0.3, 0.4, 0.05),
      chime(E7, 0.3, 0.3, 0.12),
    ],
  }),

  // Creeps -------------------------------------------------------------------
  /** A creep dies: a soft poof (bigger creeps play it lower). */
  death: sfx(0.22, 45, 4, 0, {
    layers: [
      { wave: 'sine', freq: 520, glide: 0.45, decay: 0.13, gain: 1, attack: 0.003 },
      whoosh(1500, 500, 0.08, 0.6, 0, 0.003),
    ],
  }),
  /** A boss falls: a deep boom and a falling bell. */
  bossDeath: sfx(0.75, 400, 1, 2, {
    layers: [
      ...thud(58, 1.2, 1),
      bell(D4, 1.6, 0.5, 0.05),
      bell(A4 - 12, 1.8, 0.4, 0.3),
      whoosh(900, 200, 0.9, 0.5),
    ],
  }),
  /** Your bounty: a tiny coin chime. */
  coin: sfx(0.12, 70, 2, 0, { layers: [chime(B6, 0.1, 0.8), chime(E7, 0.16, 0.7, 0.045)] }),
  /** Ironhorn's Stomp. */
  stomp: sfx(0.55, 300, 1, 1, {
    layers: [
      ...thud(46, 0.6, 1),
      { wave: 'noise', freq: 0, decay: 0.35, gain: 0.5, filter: { type: 'lp', from: 420 } },
    ],
  }),
  /** Shardback shifts its hide: a shimmer. */
  hideShift: sfx(0.4, 400, 1, 1, {
    layers: [
      chime(D6, 0.4, 0.7),
      chime(A5, 0.4, 0.6, 0.06),
      sparkle(0.3, 0.3),
    ],
    echo: { delay: 0.09, feedback: 0.3, mix: 0.35 },
  }),

  // The Heart and waves ---------------------------------------------------------
  /** A creep reached the Heart: a clear warning, two falling bell strikes over a low thud. */
  heartHit: sfx(0.6, 400, 1, 2, { layers: [bell(A5, 0.7, 1), bell(F5, 0.9, 0.9, 0.15), ...thud(70, 0.35, 0.7)] }),
  /** A wave starts: a soft wooden horn call and a chime. */
  waveStart: sfx(0.45, 1000, 1, 2, {
    layers: [
      { wave: 'triangle', freq: hz(D4), decay: 0.9, gain: 1, attack: 0.07, filter: { type: 'lp', from: 1300 }, vibrato: [5, 0.004] },
      { wave: 'triangle', freq: hz(A4), decay: 1.0, gain: 0.8, at: 0.14, attack: 0.07, filter: { type: 'lp', from: 1500 }, vibrato: [5, 0.004] },
      chime(D6, 0.9, 0.4, 0.28),
    ],
  }),
  /** A boss wave: two deep drums, a low horn and an uneasy bell. */
  bossWave: sfx(0.75, 1000, 1, 2, {
    layers: [
      ...thud(55, 0.7, 1),
      ...thud(55, 0.9, 1, 0.34),
      { wave: 'saw', freq: hz(D4 - 12), decay: 1.5, gain: 0.7, at: 0.1, attack: 0.18, detune: 1.006, filter: { type: 'lp', from: 520, to: 900 } },
      bell(D5, 1.3, 0.35, 0.34),
      bell(D5 + 1, 1.3, 0.25, 0.36),
    ],
  }),

  // Hero attacks --------------------------------------------------------------------
  /** The Ranger's bow: a string twang and the arrow's swish. */
  'attack.ranger': sfx(0.3, 80, 2, 1, {
    layers: [
      pluck(hz(E4 - 12), 0.22, 1),
      whoosh(2200, 1200, 0.06, 0.35, 0.01, 0.004),
    ],
  }),
  /** The Warden's blade landing: a steel swish, a thunk and a faint ring. */
  'attack.warden': sfx(0.38, 80, 2, 1, {
    layers: [
      whoosh(2600, 900, 0.07, 0.7, 0, 0.004, 2),
      knock(210, 0.1, 1, 0.01),
      { wave: 'sine', freq: 1180, decay: 0.2, gain: 0.12, at: 0.01, partials: [[2.7, 0.4]] },
    ],
  }),
  /** The Arcanist's staff: a falling zap and a ring. */
  'attack.arcanist': sfx(0.26, 80, 2, 1, {
    layers: [
      { wave: 'sine', freq: hz(A5), glide: 0.6, glideTime: 0.1, decay: 0.16, gain: 1, attack: 0.004 },
      chime(E6, 0.2, 0.35, 0.02),
    ],
  }),

  // Hero skills (Q / W / R; E is passive) ---------------------------------------------
  /** Multishot: three quick strings. */
  'ranger.Q': sfx(0.45, 150, 2, 1, {
    layers: [
      pluck(hz(A4 - 12), 0.2, 1),
      pluck(hz(D4), 0.2, 0.9, 0.035),
      pluck(hz(Fs4), 0.2, 0.8, 0.07),
      whoosh(2600, 1000, 0.14, 0.45, 0.02),
    ],
  }),
  /** Snare Trap: a wooden clack and a creaking rope. */
  'ranger.W': sfx(0.45, 150, 2, 1, {
    layers: [
      knock(420, 0.08, 1),
      knock(300, 0.1, 0.9, 0.08),
      pluck(110, 0.3, 0.5, 0.1),
    ],
  }),
  /** Arrow Storm: rising wind and a cascade of chimes. */
  'ranger.R': sfx(0.55, 300, 1, 1, {
    layers: [
      whoosh(600, 3000, 0.9, 1, 0, 0.25, 1.2),
      chime(D6, 0.5, 0.4, 0.2),
      chime(A5, 0.5, 0.35, 0.28),
      chime(Fs5, 0.5, 0.3, 0.36),
      chime(D5, 0.6, 0.3, 0.44),
    ],
  }),
  /** Cleave: a wide swing and a thud. */
  'warden.Q': sfx(0.5, 150, 2, 1, { layers: [whoosh(1600, 450, 0.3, 1, 0, 0.05, 1.8), ...thud(110, 0.25, 0.9, 0.1)] }),
  /** Taunt: a low horn and a knock on the shield. */
  'warden.W': sfx(0.5, 150, 2, 1, {
    layers: [
      { wave: 'triangle', freq: hz(A4 - 24), decay: 0.7, gain: 1, attack: 0.05, filter: { type: 'lp', from: 900 }, vibrato: [6, 0.006] },
      knock(260, 0.14, 0.8),
      knock(260, 0.12, 0.6, 0.12),
    ],
  }),
  /** Last Stand: a deep holy gong with a bright ring. */
  'warden.R': sfx(0.6, 300, 1, 1, {
    layers: [
      bell(D4 - 12, 2.0, 1),
      chime(D5, 1.2, 0.35, 0.08),
      chime(A5, 1.2, 0.3, 0.16),
      ...thud(80, 0.3, 0.6),
    ],
  }),
  /** Fireball: a rushing fwoom. */
  'arcanist.Q': sfx(0.45, 150, 2, 1, {
    layers: [
      whoosh(380, 1700, 0.35, 1, 0, 0.04, 1.2),
      { wave: 'sine', freq: 220, glide: 2, decay: 0.28, gain: 0.5, attack: 0.02 },
    ],
  }),
  /** Frost Nova: an icy chime cluster and a glittering hiss. */
  'arcanist.W': sfx(0.5, 150, 2, 1, {
    layers: [
      chime(E6, 0.6, 1),
      chime(B6, 0.5, 0.7, 0.03),
      chime(E7, 0.4, 0.5, 0.06),
      sparkle(0.45, 0.5),
    ],
    echo: { delay: 0.08, feedback: 0.3, mix: 0.35 },
  }),
  /** Meteor: a rising call to the sky. */
  'arcanist.R': sfx(0.55, 300, 1, 1, {
    layers: [
      { wave: 'sine', freq: 180, glide: 3, glideTime: 0.6, decay: 0.9, gain: 1, attack: 0.08, vibrato: [7, 0.01] },
      bell(D5, 1.0, 0.35, 0.35),
      bell(A5, 1.0, 0.3, 0.45),
    ],
  }),

  // Skill impacts --------------------------------------------------------------------
  /** Fireball lands: a soft boom. */
  fireballHit: sfx(0.4, 150, 2, 1, {
    layers: [
      ...thud(90, 0.35, 1),
      { wave: 'noise', freq: 0, decay: 0.4, gain: 0.7, attack: 0.005, filter: { type: 'lp', from: 1300, to: 200 } },
    ],
  }),
  /** Meteor lands: a deep boom and falling debris. */
  meteorHit: sfx(0.65, 300, 1, 2, {
    layers: [
      ...thud(50, 1.0, 1),
      { wave: 'noise', freq: 0, decay: 0.9, gain: 0.8, attack: 0.006, filter: { type: 'lp', from: 900, to: 120 } },
      knock(240, 0.08, 0.3, 0.25),
      knock(180, 0.08, 0.25, 0.38),
    ],
  }),
  /** A Snare Trap springs. */
  trap: sfx(0.35, 120, 2, 0, {
    layers: [
      knock(620, 0.05, 1),
      knock(900, 0.05, 0.6, 0.02),
      pluck(196, 0.2, 0.5, 0.02),
    ],
  }),

  // Heroes ---------------------------------------------------------------------------
  /** Level up: a rising major arpeggio. */
  levelUp: sfx(0.45, 300, 1, 1, {
    layers: [
      chime(D5, 0.8, 1),
      chime(Fs5, 0.8, 0.9, 0.07),
      chime(A5, 0.8, 0.85, 0.14),
      chime(D6, 1.0, 0.8, 0.21),
    ],
    echo: { delay: 0.12, feedback: 0.25, mix: 0.3 },
  }),
  /** Your hero falls: three falling bells. */
  heroDown: sfx(0.45, 500, 1, 1, {
    layers: [
      bell(A4, 0.9, 1),
      bell(F5 - 12, 0.9, 0.9, 0.22),
      bell(D4, 1.3, 0.9, 0.44),
    ],
  }),
  /** Your hero is back: a shimmer. */
  respawn: sfx(0.35, 500, 1, 1, { layers: [chime(A5, 0.5, 0.8), chime(D6, 0.6, 0.8, 0.06), sparkle(0.3, 0.3)] }),

  // Towers ---------------------------------------------------------------------------
  /** Build: planks knocked into place and a rune lighting up. */
  build: sfx(0.5, 120, 2, 1, {
    layers: [
      ...thud(130, 0.16, 1),
      knock(520, 0.07, 0.8),
      knock(390, 0.08, 0.8, 0.09),
      chime(D6, 0.35, 0.35, 0.15),
    ],
  }),
  /** Upgrade: a thud and two rising chimes. */
  upgrade: sfx(0.5, 120, 2, 1, {
    layers: [
      ...thud(140, 0.14, 0.8),
      chime(A5, 0.5, 0.8, 0.05),
      chime(D6, 0.7, 0.8, 0.13),
    ],
  }),
  /** Branch (tier 4): a bell chord and a bright top note. */
  branch: sfx(0.55, 200, 1, 1, {
    layers: [
      ...thud(120, 0.2, 0.8),
      bell(D5, 1.2, 0.6, 0.04),
      bell(Fs5, 1.2, 0.5, 0.04),
      bell(A5, 1.2, 0.5, 0.04),
      chime(D6, 1.0, 0.6, 0.16),
    ],
    echo: { delay: 0.11, feedback: 0.25, mix: 0.3 },
  }),
  /** Sell: a little fall of coins on wood. */
  sell: sfx(0.4, 120, 2, 1, {
    layers: [
      knock(400, 0.06, 0.6),
      chime(D7, 0.2, 0.7, 0.02),
      chime(A6, 0.2, 0.7, 0.07),
      chime(Fs5 + 12, 0.25, 0.7, 0.12),
      chime(D6, 0.3, 0.6, 0.17),
    ],
  }),
  /** A tower is destroyed: a crunch of timber. */
  towerBreak: sfx(0.5, 200, 2, 1, {
    layers: [
      { wave: 'noise', freq: 0, decay: 0.35, gain: 0.8, attack: 0.003, filter: { type: 'lp', from: 2000, to: 300 } },
      knock(200, 0.1, 0.7, 0.03),
      knock(150, 0.12, 0.6, 0.11),
      ...thud(80, 0.3, 0.8),
    ],
  }),

  // The end ---------------------------------------------------------------------------
  /** Victory: a bell fanfare resolving to a bright chord. */
  victory: sfx(0.7, 2000, 1, 2, {
    layers: [
      bell(D5, 0.8, 0.8),
      bell(Fs5, 0.8, 0.8, 0.14),
      bell(A5, 0.8, 0.8, 0.28),
      chime(D6, 2.4, 0.9, 0.5),
      chime(A5, 2.4, 0.6, 0.5),
      chime(Fs5, 2.4, 0.6, 0.5),
      { wave: 'triangle', freq: hz(D4), decay: 2.2, gain: 0.5, at: 0.5, attack: 0.12, filter: { type: 'lp', from: 1200 } },
    ],
    echo: { delay: 0.14, feedback: 0.3, mix: 0.3 },
  }),
  /** Defeat: slow falling bells over a low drone. */
  defeat: sfx(0.7, 2000, 1, 2, {
    layers: [
      bell(D5 - 12, 1.4, 1),
      bell(C6 - 24, 1.4, 0.9, 0.4),
      bell(A4 - 12, 2.2, 0.9, 0.8),
      ...thud(55, 0.8, 0.8),
      { wave: 'triangle', freq: hz(D4 - 24), decay: 2.4, gain: 0.5, at: 0.8, attack: 0.3, filter: { type: 'lp', from: 500 } },
    ],
  }),
} satisfies Record<string, SoundSpec>;

export type SoundId = keyof typeof SOUNDS;

// ---------------------------------------------------------------------------
// Music instruments (music.ts plays them at other pitches with the playback rate)
// ---------------------------------------------------------------------------

/** An instrument: the MIDI note its sample is baked at (`null`: unpitched, always played as is) and its sound. */
function instrument(root: number | null, def: SynthDef): { root: number | null; def: SynthDef } {
  return { root, def };
}

export const INSTRUMENTS = {
  /** A soft glass bell for melodies. */
  bell: instrument(72, {
    layers: [{ wave: 'sine', freq: hz(72), decay: 2.2, gain: 1, attack: 0.006, partials: [[2, 0.22], [3, 0.06], [4.2, 0.03]] }],
  }),
  /** A warm pad for chords: detuned triangles, slow attack, gentle vibrato. */
  pad: instrument(60, {
    layers: [
      {
        wave: 'triangle',
        freq: hz(60),
        decay: 3.4,
        gain: 1,
        attack: 0.7,
        detune: 1.005,
        vibrato: [4.5, 0.002],
        filter: { type: 'lp', from: 1300, to: 800 },
      },
      { wave: 'sine', freq: hz(48), decay: 3.2, gain: 0.3, attack: 0.8 },
    ],
  }),
  /** A plucked bass. */
  bass: instrument(38, { layers: [pluck(hz(38), 1.3, 1), { wave: 'sine', freq: hz(38), decay: 0.8, gain: 0.5, attack: 0.004 }] }),
  /** A low frame drum. */
  drum: instrument(null, {
    layers: [
      { wave: 'sine', freq: 88, glide: 0.55, glideTime: 0.14, decay: 0.7, gain: 1, attack: 0.002 },
      { wave: 'noise', freq: 0, decay: 0.12, gain: 0.3, attack: 0.001, filter: { type: 'lp', from: 600 } },
    ],
  }),
  /** A woodblock. */
  wood: instrument(null, { layers: [knock(760, 0.07, 1)] }),
  /** A soft shaker. */
  shaker: instrument(null, { layers: [{ wave: 'noise', freq: 0, decay: 0.06, gain: 1, attack: 0.012, filter: { type: 'bp', from: 2400, q: 2 } }] }),
};

export type Instrument = keyof typeof INSTRUMENTS;

/** Buffer id of an instrument's sample. */
export const instrumentId = (i: Instrument): string => `m.${i}`;

/** Every synth sound by buffer id (effects and instruments), for baking. */
export function allSynthDefs(): Map<string, SynthDef> {
  const m = new Map<string, SynthDef>();
  for (const [id, s] of Object.entries(SOUNDS)) m.set(id, s.def);
  for (const [id, s] of Object.entries(INSTRUMENTS)) m.set(instrumentId(id as Instrument), s.def);
  return m;
}
