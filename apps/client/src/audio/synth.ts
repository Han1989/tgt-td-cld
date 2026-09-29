// A small code synth (the sound pass, docs/ART.md §13): every sound effect and music instrument is
// described as data (`SynthDef`: layers of tone, string or noise, each with an envelope, a pitch glide
// and an optional filter) and rendered once into samples, like the art is baked into atlases.
// Pure and deterministic (seeded noise), so it runs and is tested in Node.
//
// The theme (a Three Kingdoms war epic in matches, a Japanese garden in the lobby) needs real
// instruments, so the models are physical where it matters:
// - plucked strings (koto, guzheng, bowstrings): Karplus-Strong with a fractional delay (so a
//   string can bend and shake), a pick brightness, a pluck position and a loop filter;
// - drums (taiko, war drums): a membrane's inharmonic modes whose pitch drops as the skin relaxes,
//   a shell boom and the stick's slap (`partials` with their own decay);
// - gongs: inharmonic partials in beating pairs (the shimmer) that bloom in after the strike;
// - horns, the erhu and flutes: saws and sines through a filter that opens with the envelope,
//   scooped into the note, with a vibrato that comes in late, and breath noise.
// `varyDef` makes the variants each sound is baked in (a few ms of timing, a little gain, pitch,
// decay and a new noise seed), so repeats never sound identical; `roomImpulse` is the room reverb.

export type Wave = 'sine' | 'triangle' | 'square' | 'saw' | 'noise' | 'pluck';

export interface Filter {
  type: 'lp' | 'bp' | 'hp';
  /** Cutoff (Hz) at the start of the layer. */
  from: number;
  /** Cutoff at the end of the layer (exponential sweep); default `from`. */
  to?: number;
  /** Resonance, 0.5 (none) to ~8; default 0.7. */
  q?: number;
  /** The cutoff opens with the envelope: × (1 + follow × level). Brass and bowed strings brighten as they swell. */
  follow?: number;
}

/**
 * An extra sine partial: `[ratio, gain, decay, attack]`. Its decay is the layer's divided by √ratio
 * (higher ones ring shorter, like a struck bar), times `decay` (default 1); `attack` (s, default the
 * layer's) lets a gong's upper partials bloom in after the strike.
 */
export type Partial = [ratio: number, gain: number, decay?: number, attack?: number];

/** A Karplus-Strong string (`wave: 'pluck'`). */
export interface Pluck {
  /** How hard the pick is: 0 (a soft finger) … 1 (an ivory pick); default 0.5. */
  bright?: number;
  /** Where it's plucked, as a fraction of the string (0.03–0.5): near the bridge sounds thin and nasal; default 0.2. */
  pos?: number;
  /** How much faster the upper harmonics die than the fundamental: 0 (wire) … 1 (gut); default 0.5. */
  damp?: number;
}

export interface Layer {
  wave: Wave;
  /** Frequency (Hz). For noise it only matters through the filter. */
  freq: number;
  /** Frequency at the end of the glide, as a multiple of `freq` (exponential); default 1. */
  glide?: number;
  /** Glide time (s); default the whole layer. */
  glideTime?: number;
  /** When the glide starts (s after the layer starts): a string pressed after it's plucked; default 0. */
  glideAt?: number;
  /** Start (s) after the sound starts. */
  at?: number;
  /** Attack (s), linear; default 4 ms. */
  attack?: number;
  /** Seconds at full level after the attack (bowed and blown notes); default 0. */
  hold?: number;
  /** Seconds from the end of the hold until the layer has faded to −60 dB (exponential). */
  decay: number;
  gain: number;
  /** Extra sine partials (bells, drums, gongs, reeds). */
  partials?: Partial[];
  filter?: Filter;
  /** Vibrato: rate (Hz), depth (fraction of the frequency) and how long (s) it takes to come in (default at once). */
  vibrato?: [rate: number, depth: number, delay?: number];
  /** A slow detuned copy (chorus) for pads and horn sections: its frequency ratio, e.g. 1.006. */
  detune?: number;
  /** Soft saturation (tanh) before the filter: the grit of a horn or a struck skin; 0 = none. */
  drive?: number;
  /** The string, for `wave: 'pluck'`. */
  pluck?: Pluck;
}

export interface SynthDef {
  layers: Layer[];
  /** A feedback echo: delay (s), feedback (0–0.8) and wet mix. */
  echo?: { delay: number; feedback: number; mix: number };
}

/**
 * Sample rate of baked sounds (Hz). Our sounds have little above 10 kHz, so half the usual rate halves
 * the bake time and the memory; the browser resamples on playback.
 */
export const BAKE_RATE = 24_000;
/** Longest sound (s), echo tail included. */
export const MAX_SECONDS = 4.5;
/** Peak level every baked sound is normalised to; the sound bank sets loudness per sound. */
export const PEAK = 0.9;
const LN1000 = Math.log(1000);
const DEFAULT_ATTACK = 0.004;
const FADE_OUT = 0.006;

/** How long a layer rings (s), from its start: its tone, or a partial that rings longer (a gong's). */
function layerSpan(l: Layer): number {
  const attack = l.attack ?? DEFAULT_ATTACK;
  const hold = l.hold ?? 0;
  let span = attack + hold + l.decay;
  for (const [ratio, , d, a] of l.partials ?? []) span = Math.max(span, Math.max(attack, a ?? 0) + hold + (l.decay * (d ?? 1)) / Math.sqrt(ratio));
  return span;
}

function layerEnd(l: Layer): number {
  return (l.at ?? 0) + layerSpan(l);
}

/** Length of a sound in seconds, echo tail included (capped at MAX_SECONDS). */
export function soundSeconds(def: SynthDef): number {
  let end = 0;
  for (const l of def.layers) end = Math.max(end, layerEnd(l));
  if (def.echo && def.echo.feedback > 0) {
    // Repeats until the echo is 50 dB down.
    const repeats = Math.min(12, Math.ceil(Math.log(0.003) / Math.log(def.echo.feedback)));
    end += def.echo.delay * repeats;
  }
  return Math.min(MAX_SECONDS, end + FADE_OUT);
}

/** Seeded noise (xorshift32), −1..1. */
export function noise(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

/** A sine table (one cycle), read with linear interpolation: ~5× cheaper than Math.sin, error below −120 dB. */
const SIN_N = 4096;
const SIN = new Float64Array(SIN_N + 1);
for (let i = 0; i <= SIN_N; i++) SIN[i] = Math.sin((2 * Math.PI * i) / SIN_N);

/** sin(2π · phase), phase in cycles. */
function sin1(phase: number): number {
  const x = (phase - Math.floor(phase)) * SIN_N;
  const i = x | 0;
  const a = SIN[i]!;
  return a + (SIN[i + 1]! - a) * (x - i);
}

/** tanh, near enough for soft saturation (a rational fit, exact at 0 and ±∞). */
function softClip(x: number): number {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

function osc(wave: Wave, phase: number): number {
  const p = phase - Math.floor(phase);
  switch (wave) {
    case 'sine':
      return sin1(p);
    case 'triangle':
      return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
    case 'square':
      // Rounded square: soft corners, fewer harsh harmonics.
      return softClip(3 * sin1(p));
    case 'saw':
      return 2 * p - 1;
    default:
      return 0;
  }
}

/** State-variable filter (topology-preserving transform), stable under fast cutoff sweeps. */
class Svf {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  constructor(
    private readonly type: Filter['type'],
    private readonly k: number,
    private readonly rate: number,
  ) {}

  cutoff(fc: number): void {
    const g = Math.tan((Math.PI * Math.max(10, Math.min(fc, this.rate * 0.45))) / this.rate);
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }

  run(x: number): number {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    if (this.type === 'lp') return v2;
    if (this.type === 'bp') return v1;
    return x - this.k * v1 - v2;
  }
}

/** Samples between cutoff updates of a sweeping filter. */
const SWEEP_EVERY = 8;
/** Partials quieter than this (relative, −80 dB) are no longer computed. */
const SILENT = 1e-4;
/** A moving pitch re-aims its rotation oscillators every 16 samples (a mask). */
const ROT_BLOCK = 15;

const TWO_PI = 2 * Math.PI;

/**
 * A Karplus-Strong string: a shaped noise burst circulating in a delay line one period long, through
 * a loop filter that dulls it a little each pass. The delay is read with linear interpolation, so the
 * pitch can glide (a bend) or shake (vibrato) while it rings.
 */
class KsString {
  private readonly buf: Float32Array;
  private readonly mask: number;
  private w = 0;
  private readonly burst: Float32Array;
  private readonly s: number;
  private readonly g: number;

  constructor(freq: number, minFreq: number, decay: number, rate: number, p: Pluck, rnd: () => number) {
    let size = 4;
    while (size < rate / minFreq + 4) size *= 2;
    this.buf = new Float32Array(size);
    this.mask = size - 1;
    const period = rate / freq;
    const n = Math.max(2, Math.round(period));
    // The pick: noise, low-passed by how soft the pick is, then combed by where it plucks.
    const a = 0.08 + 0.9 * Math.max(0, Math.min(1, p.bright ?? 0.5));
    const raw = new Float32Array(n);
    let y = 0;
    for (let i = 0; i < n; i++) {
      y += a * (rnd() - y);
      raw[i] = y;
    }
    const off = Math.max(1, Math.round(n * Math.max(0.03, Math.min(0.5, p.pos ?? 0.2))));
    this.burst = new Float32Array(n);
    let mean = 0;
    for (let i = 0; i < n; i++) {
      this.burst[i] = raw[i]! - (i >= off ? raw[i - off]! : 0);
      mean += this.burst[i]!;
    }
    mean /= n;
    for (let i = 0; i < n; i++) this.burst[i]! -= mean;
    // The loop filter y = (1 − s)·x[n] + s·x[n − 1]: s = 0.5 dulls the most.
    this.s = 0.03 + 0.47 * Math.max(0, Math.min(1, p.damp ?? 0.5));
    // Loop gain for a fundamental that is 60 dB down after `decay`, less what the filter already takes.
    const w = (2 * Math.PI * freq) / rate;
    const s = this.s;
    const h = Math.sqrt((1 - s) * (1 - s) + s * s + 2 * s * (1 - s) * Math.cos(w));
    this.g = Math.min(0.99995, Math.exp(-LN1000 / Math.max(0.02, decay * freq)) / Math.max(0.5, h));
  }

  /** The next sample at frequency `f`; sample `i` of the layer (the burst plays in first). */
  next(f: number, i: number, rate: number): number {
    // The filter delays by s samples; the rest of the period is the line.
    const d = Math.max(1, rate / f - this.s);
    const r = this.w - d;
    const i0 = Math.floor(r);
    const fr = r - i0;
    const m = this.mask;
    const b = this.buf;
    const x0 = b[i0 & m]! + (b[(i0 + 1) & m]! - b[i0 & m]!) * fr;
    const x1 = b[(i0 - 1) & m]! + (b[i0 & m]! - b[(i0 - 1) & m]!) * fr;
    const v = (i < this.burst.length ? this.burst[i]! : 0) + this.g * ((1 - this.s) * x0 + this.s * x1);
    b[this.w & m] = v;
    this.w++;
    return v;
  }
}

function renderLayer(out: Float32Array, l: Layer, index: number, rate: number, seed: number): void {
  const start = Math.round((l.at ?? 0) * rate);
  const attack = Math.max(1, Math.round((l.attack ?? DEFAULT_ATTACK) * rate));
  const hold = Math.round((l.hold ?? 0) * rate);
  const decay = Math.max(1, Math.round(l.decay * rate));
  const n = Math.min(out.length - start, Math.round(layerSpan(l) * rate));
  if (n <= 0) return;
  const sustainEnd = attack + hold;
  const glide = l.glide ?? 1;
  const vib = l.vibrato;
  const steady = glide === 1 && !vib;
  // The pitch, sample by sample, when it moves (glides and vibrato): shared by the tone and its partials.
  let freqs: Float64Array | null = null;
  if (!steady) {
    freqs = new Float64Array(n);
    const glideAt = Math.round((l.glideAt ?? 0) * rate);
    const glideN = Math.max(1, Math.round((l.glideTime ?? n / rate) * rate));
    const glideMul = Math.pow(glide, 1 / glideN);
    const vibIn = vib ? Math.max(1, Math.round((vib[2] ?? 0) * rate)) : 1;
    let g = 1;
    for (let i = 0; i < n; i++) {
      if (i >= glideAt && i < glideAt + glideN) g *= glideMul;
      let f = l.freq * g;
      if (vib) f *= 1 + vib[1] * Math.min(1, i / vibIn) * sin1((vib[0] * i) / rate);
      freqs[i] = f;
    }
  }
  const buf = new Float64Array(n);
  const rnd = noise(index + 1 + seed * 7919);

  // The tone (or string, or noise) under its envelope. Envelopes run multiplicatively: no exp per sample.
  const envMul = Math.exp(-LN1000 / decay);
  if (l.wave === 'pluck') {
    // A string rings on its own loop: its envelope is only the attack and a short release at the end.
    const lowest = l.freq * Math.min(1, glide) * (1 - (vib?.[1] ?? 0) * 1.5);
    const ks = new KsString(l.freq, lowest, l.decay, rate, l.pluck ?? {}, rnd);
    const release = Math.min(n, Math.round(0.03 * rate));
    for (let i = 0; i < n; i++) {
      const env = i < attack ? i / attack : n - i < release ? (n - i) / release : 1;
      buf[i] = ks.next(freqs ? freqs[i]! : l.freq, i, rate) * env;
    }
  } else {
    const sineRot = steady && l.wave === 'sine' && !l.detune;
    let stepC = Math.cos((2 * Math.PI * l.freq) / rate);
    let stepS = Math.sin((2 * Math.PI * l.freq) / rate);
    let rc = 1;
    let rs = 0;
    let phase = 0;
    let phase2 = 0;
    let env = 0;
    for (let i = 0; i < n; i++) {
      if (i < attack) env = i / attack;
      else if (i <= sustainEnd) env = 1;
      else env *= envMul;
      let v: number;
      if (l.wave === 'noise') {
        v = rnd();
      } else if (sineRot || (l.wave === 'sine' && !l.detune)) {
        // A sine runs as a rotation: two multiply-adds a sample (a moving pitch re-aims it every block).
        if (freqs !== null && (i & ROT_BLOCK) === 0) {
          const th = (TWO_PI * freqs[i]!) / rate;
          stepC = Math.cos(th);
          stepS = Math.sin(th);
          const m = 1.5 - 0.5 * (rc * rc + rs * rs);
          rc *= m;
          rs *= m;
        }
        v = rs;
        const c = rc * stepC - rs * stepS;
        rs = rs * stepC + rc * stepS;
        rc = c;
      } else {
        const f = freqs ? freqs[i]! : l.freq;
        v = osc(l.wave, phase);
        phase += f / rate;
        if (l.detune) {
          v = (v + osc(l.wave, phase2)) * 0.5;
          phase2 += (f * l.detune) / rate;
        }
      }
      buf[i] = v * env;
    }
  }

  // Partials, one at a time, each stopping once it is silent.
  for (const [ratio, pg, pd, pa] of l.partials ?? []) {
    const pAtt = Math.max(attack, Math.round((pa ?? 0) * rate));
    const pMul = Math.exp((-LN1000 * Math.sqrt(ratio)) / (decay * (pd ?? 1)));
    const pHold = pAtt + hold;
    let pe = 0;
    let sc = Math.cos((2 * Math.PI * l.freq * ratio) / rate);
    let ss = Math.sin((2 * Math.PI * l.freq * ratio) / rate);
    let c = 1;
    let sn = 0;
    for (let i = 0; i < n; i++) {
      if (i < pAtt) pe = i / pAtt;
      else if (i <= pHold) pe = 1;
      else if ((pe *= pMul) < SILENT) break;
      if (freqs !== null && (i & ROT_BLOCK) === 0) {
        // Re-aim at the moving pitch, and renormalise (rounding slowly grows or shrinks the rotation).
        const th = (TWO_PI * freqs[i]! * ratio) / rate;
        sc = Math.cos(th);
        ss = Math.sin(th);
        const m = 1.5 - 0.5 * (c * c + sn * sn);
        c *= m;
        sn *= m;
      }
      buf[i]! += sn * pg * pe;
      const c2 = c * sc - sn * ss;
      sn = sn * sc + c * ss;
      c = c2;
    }
  }

  // Saturation, the filter, then into the mix.
  const drive = l.drive ?? 0;
  if (drive > 0) {
    const norm = 1 / softClip(drive);
    for (let i = 0; i < n; i++) buf[i] = softClip(drive * buf[i]!) * norm;
  }
  if (l.filter) {
    const filter = new Svf(l.filter.type, 1 / (l.filter.q ?? 0.7), rate);
    const fFrom = l.filter.from;
    const fTo = l.filter.to ?? fFrom;
    const follow = l.filter.follow ?? 0;
    const sweepMul = fTo === fFrom ? 1 : Math.pow(fTo / Math.max(1, fFrom), SWEEP_EVERY / n);
    let fc = fFrom;
    filter.cutoff(fc);
    // The envelope again, for a filter that follows it.
    let env = 0;
    for (let i = 0; i < n; i++) {
      if (follow) {
        if (i < attack) env = i / attack;
        else if (i <= sustainEnd) env = 1;
        else env *= envMul;
      }
      if (i % SWEEP_EVERY === 0 && i > 0 && (sweepMul !== 1 || follow)) {
        fc *= sweepMul;
        filter.cutoff(follow ? fc * (1 + follow * env) : fc);
      }
      buf[i] = filter.run(buf[i]!);
    }
  }
  const gain = l.gain;
  for (let i = 0; i < n; i++) out[start + i]! += buf[i]! * gain;
}

/**
 * Renders a sound into mono samples at `rate`, normalised to PEAK, with a short fade at the end.
 * `seed` picks the noise (bursts, breath, skin): variants use their own.
 */
export function renderSound(def: SynthDef, rate = BAKE_RATE, seed = 0): Float32Array {
  const out = new Float32Array(Math.max(1, Math.ceil(soundSeconds(def) * rate)));
  def.layers.forEach((l, i) => renderLayer(out, l, i, rate, seed));
  if (def.echo && def.echo.feedback > 0) {
    const d = Math.max(1, Math.round(def.echo.delay * rate));
    const { feedback, mix } = def.echo;
    const line = new Float32Array(d);
    for (let i = 0; i < out.length; i++) {
      const j = i % d;
      const delayed = line[j]!;
      line[j] = out[i]! + delayed * feedback;
      out[i]! += delayed * mix;
    }
  }
  // No DC: a low boom's glide can leave an offset, which would thump when the sound starts.
  let dc = 0;
  for (let i = 0; i < out.length; i++) {
    dc += 0.0015 * (out[i]! - dc);
    out[i]! -= dc;
  }
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]!));
  const scale = peak > 0 ? PEAK / peak : 0;
  const fade = Math.min(out.length, Math.round(FADE_OUT * rate));
  for (let i = 0; i < out.length; i++) {
    const tail = out.length - i;
    out[i]! *= scale * (tail < fade ? tail / fade : 1);
  }
  return out;
}

/**
 * Variant `k` of a sound (k = 0 is the sound itself): each layer a few ms earlier or later (the first
 * stays on the beat), a little louder or softer, a hair sharper or flatter, ringing a little shorter
 * or longer, its filter a touch brighter or darker. Baked with its own noise seed, so a string's pick,
 * a drum's skin and a breath differ too. Deterministic.
 */
export function varyDef(def: SynthDef, k: number): SynthDef {
  if (k === 0) return def;
  const r = noise(1000 + k * 131);
  const j = (amount: number) => 1 + r() * amount;
  return {
    ...def,
    layers: def.layers.map((l, i) => {
      const at = l.at ?? 0;
      const v: Layer = {
        ...l,
        at: i === 0 ? at : Math.max(0, at + r() * 0.008),
        gain: l.gain * j(0.12),
        freq: l.wave === 'noise' ? l.freq : l.freq * j(0.012),
        decay: l.decay * j(0.08),
      };
      if (l.filter) v.filter = { ...l.filter, from: l.filter.from * j(0.06), ...(l.filter.to ? { to: l.filter.to * j(0.06) } : {}) };
      return v;
    }),
  };
}

/**
 * The room reverb's impulse response (stereo): a few early reflections, then a diffuse tail that
 * dies to −60 dB over `seconds` and gets darker as it goes (a wooden hall, not a cave). No direct
 * sound: the dry signal plays alongside it. Deterministic.
 */
export function roomImpulse(rate: number, seconds: number, seed = 7): [Float32Array, Float32Array] {
  const n = Math.max(1, Math.round(seconds * rate));
  const chans: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  const early = [0.011, 0.017, 0.023, 0.031, 0.041, 0.053];
  chans.forEach((c, ch) => {
    const rnd = noise(seed + ch * 101);
    const decay = Math.exp(-LN1000 / n);
    let env = 1;
    let lp = 0;
    for (let i = 0; i < n; i++) {
      // The tail fades in over 15 ms and loses its highs over time.
      const a = 0.75 - 0.6 * (i / n);
      lp += a * (rnd() - lp);
      c[i] = lp * env * Math.min(1, i / (0.015 * rate)) * 0.35;
      env *= decay;
    }
    early.forEach((t, e) => {
      const at = Math.round((t + ch * 0.0023 * ((e % 3) - 1)) * rate);
      if (at < n) c[at]! += (e % 2 === ch ? 0.5 : -0.4) * Math.pow(0.8, e);
    });
  });
  return chans;
}

/** Root-mean-square level of a rendered sound (tests: nothing silent, nothing a wall of noise). */
export function rms(samples: Float32Array): number {
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i]! * samples[i]!;
  return Math.sqrt(s / Math.max(1, samples.length));
}

/** Frequency (Hz) of a MIDI note number (69 = A4 = 440 Hz). */
export function midiHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}
