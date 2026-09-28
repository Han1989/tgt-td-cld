// A tiny code synth (the sound pass, docs/ART.md §13): every sound effect and music instrument is
// described as data (`SynthDef`: a few layers of tone or noise, each with an envelope, a pitch glide
// and an optional filter) and rendered once into samples, like the art is baked into atlases.
// No sound files. Pure and deterministic (seeded noise), so it runs and is tested in Node.
//
// Runelight sounds are soft: sine / triangle tones, bell partials, plucked strings (Karplus-Strong)
// and filtered noise; `square` and `saw` are rounded off and meant to go through a low-pass filter.

export type Wave = 'sine' | 'triangle' | 'square' | 'saw' | 'noise' | 'pluck';

export interface Filter {
  type: 'lp' | 'bp' | 'hp';
  /** Cutoff (Hz) at the start of the layer. */
  from: number;
  /** Cutoff at the end of the layer (exponential sweep); default `from`. */
  to?: number;
  /** Resonance, 0.5 (none) to ~8; default 0.7. */
  q?: number;
}

export interface Layer {
  wave: Wave;
  /** Frequency (Hz). For noise it only matters through the filter. */
  freq: number;
  /** Frequency at the end of the glide, as a multiple of `freq` (exponential); default 1. */
  glide?: number;
  /** Glide time (s); default the whole layer. */
  glideTime?: number;
  /** Start (s) after the sound starts. */
  at?: number;
  /** Attack (s), linear; default 4 ms. */
  attack?: number;
  /** Seconds from the end of the attack until the layer has faded to −60 dB (exponential). */
  decay: number;
  gain: number;
  /** Extra sine partials `[ratio, gain]` (bells, chimes); higher ones fade faster. */
  partials?: [number, number][];
  filter?: Filter;
  /** Vibrato: rate (Hz) and depth (fraction of the frequency). */
  vibrato?: [number, number];
  /** A slow detuned copy (chorus) for pads: its frequency ratio, e.g. 1.006. */
  detune?: number;
}

export interface SynthDef {
  layers: Layer[];
  /** A feedback echo: delay (s), feedback (0–0.8) and wet mix. */
  echo?: { delay: number; feedback: number; mix: number };
}

/**
 * Sample rate of baked sounds (Hz). Soft sounds have little above 10 kHz, so half the usual rate halves
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

function layerEnd(l: Layer): number {
  return (l.at ?? 0) + (l.attack ?? DEFAULT_ATTACK) + l.decay;
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
function noise(seed: number): () => number {
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

function osc(wave: Wave, phase: number): number {
  const p = phase - Math.floor(phase);
  switch (wave) {
    case 'sine':
      return Math.sin(p * 2 * Math.PI);
    case 'triangle':
      return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
    case 'square':
      // Rounded square: soft corners, fewer harsh harmonics.
      return Math.tanh(3 * Math.sin(p * 2 * Math.PI));
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
    const g = Math.tan((Math.PI * Math.min(fc, this.rate * 0.45)) / this.rate);
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
/** Partials quieter than this (relative) are no longer computed. */
const SILENT = 1e-5;

function renderLayer(out: Float32Array, l: Layer, index: number, rate: number): void {
  const start = Math.round((l.at ?? 0) * rate);
  const attack = Math.max(1, Math.round((l.attack ?? DEFAULT_ATTACK) * rate));
  const decay = Math.max(1, Math.round(l.decay * rate));
  const n = Math.min(out.length - start, attack + decay);
  if (n <= 0) return;
  // Envelopes, glides and sweeps run multiplicatively: no exp / pow per sample.
  const envMul = Math.exp(-LN1000 / decay);
  const glide = l.glide ?? 1;
  const glideN = Math.max(1, Math.round((l.glideTime ?? (attack + decay) / rate) * rate));
  const glideMul = Math.pow(glide, 1 / glideN);
  const vib = l.vibrato;
  // A steady pitch lets sines run as rotations (two multiply-adds a sample instead of a Math.sin).
  const steady = glide === 1 && !vib;
  const rnd = noise(index + 1);
  const filter = l.filter ? new Svf(l.filter.type, 1 / (l.filter.q ?? 0.7), rate) : null;
  const fFrom = l.filter?.from ?? 0;
  const fTo = l.filter?.to ?? fFrom;
  const sweepMul = fTo === fFrom ? 1 : Math.pow(fTo / Math.max(1, fFrom), SWEEP_EVERY / n);
  let fc = fFrom;
  filter?.cutoff(fc);
  const partials = l.partials ?? [];
  const pn = partials.length;
  const pRatio = partials.map((p) => p[0]);
  const pGain = partials.map((p) => p[1]);
  // Higher partials ring shorter, like a struck bar or bell.
  const pMul = pRatio.map((r) => Math.exp((-LN1000 * Math.sqrt(r)) / decay));
  const pEnv = partials.map(() => 1);
  const pPhase = partials.map(() => 0);
  // Rotation oscillators (steady pitch): [cos, sin] of each partial, and of the step.
  const pCos = partials.map(() => 1);
  const pSin = partials.map(() => 0);
  const pStepC = pRatio.map((r) => Math.cos((2 * Math.PI * l.freq * r) / rate));
  const pStepS = pRatio.map((r) => Math.sin((2 * Math.PI * l.freq * r) / rate));
  let partialsOn = pn;
  // Karplus-Strong string: a noise burst circulating in a delay line one period long, averaged each pass.
  let ks: Float32Array | null = null;
  let ksPos = 0;
  if (l.wave === 'pluck') {
    ks = new Float32Array(Math.max(2, Math.round(rate / l.freq)));
    // A softened burst (two-point average) for a rounder attack.
    let prev = 0;
    for (let i = 0; i < ks.length; i++) {
      const v = rnd();
      ks[i] = (v + prev) / 2;
      prev = v;
    }
  }
  const sineRot = steady && l.wave === 'sine' && !l.detune;
  const stepC = Math.cos((2 * Math.PI * l.freq) / rate);
  const stepS = Math.sin((2 * Math.PI * l.freq) / rate);
  let rc = 1;
  let rs = 0;
  let phase = 0;
  let phase2 = 0;
  let g = 1;
  let env = 0;
  for (let i = 0; i < n; i++) {
    if (i < attack) env = i / attack;
    else if (i === attack) env = 1;
    else env *= envMul;
    let f = l.freq;
    if (!steady) {
      if (i < glideN) g *= glideMul;
      f *= g;
      if (vib) f *= 1 + vib[1] * Math.sin((2 * Math.PI * vib[0] * i) / rate);
    }
    let v: number;
    if (ks) {
      const next = ksPos + 1 === ks.length ? 0 : ksPos + 1;
      v = ks[ksPos]!;
      ks[ksPos] = 0.498 * (ks[ksPos]! + ks[next]!);
      ksPos = next;
    } else if (l.wave === 'noise') {
      v = rnd();
    } else if (sineRot) {
      v = rs;
      const c = rc * stepC - rs * stepS;
      rs = rs * stepC + rc * stepS;
      rc = c;
    } else {
      v = osc(l.wave, phase);
      phase += f / rate;
      if (l.detune) {
        v = (v + osc(l.wave, phase2)) * 0.5;
        phase2 += (f * l.detune) / rate;
      }
    }
    v *= env;
    if (partialsOn > 0) {
      for (let p = 0; p < pn; p++) {
        let pe = pEnv[p]!;
        if (i < attack) pe = env;
        else if (i === attack) pe = 1;
        else if (pe < SILENT) continue;
        else pe *= pMul[p]!;
        pEnv[p] = pe;
        if (i > attack && pe < SILENT) partialsOn--;
        if (steady) {
          v += pSin[p]! * pGain[p]! * pe;
          const c = pCos[p]! * pStepC[p]! - pSin[p]! * pStepS[p]!;
          pSin[p] = pSin[p]! * pStepC[p]! + pCos[p]! * pStepS[p]!;
          pCos[p] = c;
        } else {
          v += Math.sin(pPhase[p]! * 2 * Math.PI) * pGain[p]! * pe;
          pPhase[p]! += (f * pRatio[p]!) / rate;
        }
      }
    }
    if (filter) {
      if (sweepMul !== 1 && i % SWEEP_EVERY === 0 && i > 0) {
        fc *= sweepMul;
        filter.cutoff(fc);
      }
      v = filter.run(v);
    }
    out[start + i]! += v * l.gain;
  }
}

/** Renders a sound into mono samples at `rate`, normalised to PEAK, with a short fade at the end. */
export function renderSound(def: SynthDef, rate = BAKE_RATE): Float32Array {
  const out = new Float32Array(Math.max(1, Math.ceil(soundSeconds(def) * rate)));
  def.layers.forEach((l, i) => renderLayer(out, l, i, rate));
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
