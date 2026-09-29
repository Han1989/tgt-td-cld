// The Web Audio engine (the sound pass, docs/ART.md §13): one AudioContext, created on the first tap
// or key press (browsers, iOS above all, only start audio from a user gesture), buses for effects and
// music into a master with a soft compressor, a room reverb (a code-made impulse in a ConvolverNode)
// that every effect and the code-made music send a little into, and every synth sound baked once into
// an AudioBuffer. Baking runs in a Web Worker (bake.worker.ts) right after the first tap, so it never
// costs a frame; a sound asked for before its samples arrive is skipped (the lobby's instruments and
// the UI come first).
//
// Recorded effects (`public/sfx/<id>.mp3`, docs/SOUND_FILES.md) are fetched and decoded after the
// first tap too; once one is ready it plays instead of its synth sound, trimmed and levelled to it.
//
// Mobile:
// - iPhone: the audio session is set to "ambient" where Safari has `navigator.audioSession`
//   (16.4+), so the silent switch mutes the game and other apps' music keeps playing.
// - The context is suspended when the page is hidden (another app, the screen locks) and resumed
//   when it comes back; if the browser refuses to resume without a gesture (iOS), the next tap does it.

import { fitFile, levelGain, loudness, NO_FILES, peakOf, type FittedFile, type SoundFiles } from './files';
import type { BakeJob } from './sounds';
import { BAKE_RATE, roomImpulse } from './synth';

export type AudioState = 'unsupported' | 'locked' | 'running' | 'suspended' | 'interrupted' | 'closed';

export interface Mix {
  /** Music and effects volume, 0–1 (the sliders). */
  music: number;
  sfx: number;
  muted: boolean;
}

export interface PlayOptions {
  gain?: number;
  /** Stereo position, −1 (left) … 1 (right). */
  pan?: number;
  /** Playback rate (pitch and speed). */
  rate?: number;
  /** Start time on the context's clock (music); default now. */
  when?: number;
  /** Seconds after now (effects' humanised timing), when `when` isn't given. */
  delay?: number;
  /** Where the voice goes; default the effects bus. */
  out?: AudioNode;
  /** Room reverb send (effects only; the music sends from its bus), 0–1. */
  wet?: number;
  /** Which baked variant (`id#k`); falls back to the first while the others bake. */
  variant?: number;
  /** Fade the voice out after this many seconds (sustained music notes). */
  dur?: number;
  /** Fade time (s) after `dur`. */
  release?: number;
}

/** A volume slider (0–1) as a gain: squared, so the slider feels even (half way ≈ −12 dB). */
export function volumeGain(v: number): number {
  const c = Math.max(0, Math.min(1, v));
  return c * c;
}

/** Sounds baked first: the lobby's instruments (the music starts at once), the UI, then the match's and frequent effects. */
const BAKE_FIRST = [
  'm.koto.45',
  'm.koto.57',
  'm.koto.69',
  'm.taiko',
  'm.koto.81',
  'm.shaku.67',
  'm.shaku.79',
  'm.shime',
  'tap',
  'noGold',
  'deny',
  'build',
  'waveStart',
  'm.wardrum',
  'm.guzheng.50',
  'm.guzheng.62',
  'm.guzheng.74',
  'm.erhu.50',
  'm.tanggu',
  'm.rim',
  'shot.arrow',
  'death',
  'heartHit',
];

/** The room: a wooden hall, about a second of tail. */
const ROOM_SECONDS = 1.1;
/** How loud the reverb returns. */
const ROOM_RETURN = 0.9;

interface FileSfx {
  buf: AudioBuffer;
  fit: FittedFile;
  peak: number;
  /** Levelled against its synth sound (false: against a typical level, until that sound is baked). */
  matched: boolean;
}

/** A typical effect's loudness (dB), for a recorded effect that arrives before its synth sound is baked. */
const TYPICAL_SFX_DB = -16;

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  /** Effects' reverb sends meet here (at the Effects volume) on their way to the room. */
  private sfxSend: GainNode | null = null;
  /** The music bus (music.ts plays recorded files into it). */
  musicBus: GainNode | null = null;
  /** The music's reverb send (at the Music volume): the code-made score sends into it. */
  musicSend: GainNode | null = null;
  private unsupported = false;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly fileSfx = new Map<string, FileSfx>();
  private mix: Mix = { music: 0.5, sfx: 0.8, muted: false };
  private readonly listeners: (() => void)[] = [];
  /** For the browser tests and the sound check. */
  readonly stats = { played: 0, baked: 0, bakeMs: 0, total: 0, files: 0, filePlays: 0 };

  constructor(
    private readonly defs: ReadonlyMap<string, BakeJob>,
    readonly files: SoundFiles = NO_FILES,
  ) {
    this.stats.total = defs.size;
    const kick = () => this.unlock();
    for (const type of ['pointerdown', 'touchend', 'click', 'keydown'] as const) {
      window.addEventListener(type, kick, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => this.visibility());
    window.addEventListener('pagehide', () => this.suspend());
    window.addEventListener('pageshow', () => this.visibility());
  }

  get state(): AudioState {
    if (this.unsupported) return 'unsupported';
    return this.ctx ? (this.ctx.state as AudioState) : 'locked';
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Effects can be heard: worth deciding what to play. */
  get sfxOn(): boolean {
    return this.running && !this.mix.muted && this.mix.sfx > 0;
  }

  get musicOn(): boolean {
    return this.running && !this.mix.muted && this.mix.music > 0;
  }

  get muted(): boolean {
    return this.mix.muted;
  }

  /** Called when the context starts, stops or the mix changes. */
  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  /**
   * Creates or resumes the context. Must run inside a user gesture the first time (the window
   * listeners do that); later calls are cheap.
   */
  unlock(): void {
    if (this.unsupported || document.visibilityState !== 'visible') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        this.unsupported = true;
        return;
      }
      // iPhone: mix with other apps' audio and follow the silent switch.
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      try {
        if (session) session.type = 'ambient';
      } catch {
        // Older Safari: the default session.
      }
      let ctx: AudioContext;
      try {
        ctx = new Ctor({ latencyHint: 'interactive' });
      } catch {
        this.unsupported = true;
        return;
      }
      this.ctx = ctx;
      this.build(ctx);
      this.applyMix(true);
      ctx.addEventListener('statechange', () => this.changed());
      this.startBake();
      this.loadFileSfx();
    }
    const ctx = this.ctx;
    if (ctx.state !== 'running') {
      // Older iOS only unlocks on a sound started inside the gesture: a silent one.
      try {
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22_050);
        src.connect(ctx.destination);
        src.start(0);
      } catch {
        // Not needed elsewhere.
      }
      ctx.resume().then(
        () => this.changed(),
        () => {},
      );
    }
  }

  /** The buses: effects and music into the master, both sending into one room. */
  private build(ctx: AudioContext): void {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 12;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.2;
    compressor.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(compressor);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxSend = ctx.createGain();
    this.musicSend = ctx.createGain();
    try {
      const room = ctx.createConvolver();
      const [l, r] = roomImpulse(ctx.sampleRate, ROOM_SECONDS);
      const ir = ctx.createBuffer(2, l.length, ctx.sampleRate);
      ir.getChannelData(0).set(l);
      ir.getChannelData(1).set(r);
      room.normalize = false;
      room.buffer = ir;
      const back = ctx.createGain();
      back.gain.value = ROOM_RETURN;
      this.sfxSend.connect(room);
      this.musicSend.connect(room);
      room.connect(back);
      back.connect(this.master);
    } catch {
      // No convolver: everything plays dry.
    }
  }

  setMix(mix: Mix): void {
    this.mix = { ...mix };
    this.applyMix(false);
    this.changed();
  }

  /** The context's clock (s). */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** A baked sound, or null while it is still baking. */
  buffer(id: string): AudioBuffer | null {
    return this.buffers.get(id) ?? null;
  }

  /**
   * Every sound, baked in a worker. Module workers are what solo play runs on too, so there is no
   * main-thread fallback: without one the game is silent.
   */
  private startBake(): void {
    const ids = [...new Set([...BAKE_FIRST.filter((id) => this.defs.has(id)), ...this.firstVariants(), ...this.defs.keys()])];
    const started = performance.now();
    try {
      const worker = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: string; samples: Float32Array }>) => {
        this.store(e.data.id, e.data.samples);
        this.stats.bakeMs = performance.now() - started;
        if (this.buffers.size === this.defs.size) worker.terminate();
      };
      worker.onerror = () => worker.terminate();
      worker.postMessage({ ids });
    } catch {
      // No workers: no sound.
    }
  }

  /** Every sound's first version, before anyone's second: the whole game is heard sooner. */
  private firstVariants(): string[] {
    return [...this.defs.keys()].filter((id) => !id.includes('#'));
  }

  private store(id: string, samples: Float32Array): void {
    const ctx = this.ctx;
    if (!ctx || this.buffers.has(id)) return;
    const buf = ctx.createBuffer(1, samples.length, BAKE_RATE);
    buf.getChannelData(0).set(samples);
    this.buffers.set(id, buf);
    this.stats.baked++;
  }

  /** Fetches and decodes the recorded effects (small files; the service worker caches each on first fetch). */
  private loadFileSfx(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [id, url] of Object.entries(this.files.sfx)) {
      void decodeFile(ctx, url).then((buf) => {
        if (!buf) return;
        const fit = fitFile(channelsOf(buf), buf.sampleRate, TYPICAL_SFX_DB);
        const peak = peakOf(channelsOf(buf), Math.round(fit.start * buf.sampleRate), Math.round(fit.end * buf.sampleRate));
        this.fileSfx.set(id, { buf, fit, peak, matched: false });
        this.stats.files++;
      });
    }
  }

  /** Starts a voice of sound `id` (a recorded file if there is one). Returns false when nothing could play. */
  play(id: string, o: PlayOptions = {}): boolean {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.sfxBus) return false;
    const file = this.fileSfx.get(id);
    if (file && !file.matched) this.match(id, file);
    const buf = file?.buf ?? (o.variant ? this.buffer(`${id}#${o.variant}`) : null) ?? this.buffer(id);
    if (!buf) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (o.rate !== undefined && o.rate !== 1) src.playbackRate.value = o.rate;
    const g = ctx.createGain();
    const gain = (o.gain ?? 1) * (file?.fit.gain ?? 1);
    g.gain.value = gain;
    src.connect(g);
    let tail: AudioNode = g;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan;
      g.connect(p);
      tail = p;
    }
    const out = o.out ?? this.sfxBus;
    tail.connect(out);
    // Recorded effects usually have their own room: they send less.
    const wet = (o.wet ?? 0) * (file ? 0.35 : 1);
    if (wet > 0 && out === this.sfxBus && this.sfxSend) {
      const w = ctx.createGain();
      w.gain.value = wet;
      tail.connect(w);
      w.connect(this.sfxSend);
    }
    const when = o.when ?? ctx.currentTime + (o.delay ?? 0);
    try {
      if (file) src.start(when, file.fit.start, Math.max(0.01, file.fit.end - file.fit.start));
      else src.start(when);
      if (o.dur !== undefined) {
        // A sustained note: held to its length, then faded out.
        const release = o.release ?? 0.12;
        g.gain.setValueAtTime(gain, when + o.dur);
        g.gain.linearRampToValueAtTime(0, when + o.dur + release);
        src.stop(when + o.dur + release + 0.02);
      }
    } catch {
      // A sound must never break the game.
      return false;
    }
    this.stats.played++;
    if (file) this.stats.filePlays++;
    return true;
  }

  /** Levels a recorded effect to the synth sound it replaces, once that is baked: the mix stays as designed. */
  private match(id: string, file: FileSfx): void {
    const synth = this.buffers.get(id);
    if (!synth) return;
    file.fit.gain = levelGain(file.fit.db, loudness([synth.getChannelData(0)], synth.sampleRate), file.peak);
    file.matched = true;
  }

  private applyMix(instant: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.sfxBus || !this.musicBus || !this.sfxSend || !this.musicSend) return;
    const set = (p: AudioParam, v: number) => {
      if (instant) p.value = v;
      else p.setTargetAtTime(v, ctx.currentTime, 0.03);
    };
    set(this.master.gain, this.mix.muted ? 0 : 1);
    set(this.sfxBus.gain, volumeGain(this.mix.sfx));
    set(this.sfxSend.gain, volumeGain(this.mix.sfx));
    set(this.musicBus.gain, volumeGain(this.mix.music));
    set(this.musicSend.gain, volumeGain(this.mix.music));
  }

  private visibility(): void {
    if (document.visibilityState === 'hidden') this.suspend();
    else if (this.ctx && this.ctx.state !== 'running') this.unlock();
  }

  private suspend(): void {
    const ctx = this.ctx;
    if (ctx && ctx.state === 'running') {
      ctx.suspend().then(
        () => this.changed(),
        () => {},
      );
    }
  }

  private changed(): void {
    for (const l of this.listeners) l();
  }
}

/** The channels of a decoded buffer. */
export function channelsOf(buf: AudioBuffer): Float32Array[] {
  return Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
}

/** Fetches and decodes a sound file, or null if it can't (missing, offline and not cached, not audio). */
export function decodeFile(ctx: BaseAudioContext, url: string): Promise<AudioBuffer | null> {
  return fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
    .then((data) => ctx.decodeAudioData(data))
    .catch(() => null);
}
