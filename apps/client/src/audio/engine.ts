// The Web Audio engine (the sound pass, docs/ART.md §13): one AudioContext, created on the first tap
// or key press (browsers, iOS above all, only start audio from a user gesture), three buses
// (effects and music into a master with a soft compressor), and every synth sound baked once into
// an AudioBuffer. Baking runs in a Web Worker (bake.worker.ts) right after the first tap, so it never
// costs a frame; a sound asked for before its samples arrive is skipped (the UI and music come first).
//
// Mobile:
// - iPhone: the audio session is set to "ambient" where Safari has `navigator.audioSession`
//   (16.4+), so the silent switch mutes the game and other apps' music keeps playing.
// - The context is suspended when the page is hidden (another app, the screen locks) and resumed
//   when it comes back; if the browser refuses to resume without a gesture (iOS), the next tap does it.

import { BAKE_RATE, type SynthDef } from './synth';

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
  /** Where the voice goes; default the effects bus. */
  out?: AudioNode;
}

/** A volume slider (0–1) as a gain: squared, so the slider feels even (half way ≈ −12 dB). */
export function volumeGain(v: number): number {
  const c = Math.max(0, Math.min(1, v));
  return c * c;
}

/** Sounds baked first: the UI, the music's instruments, then the most frequent effects. */
const BAKE_FIRST = ['tap', 'm.pad', 'm.bell', 'm.bass', 'noGold', 'deny', 'build', 'shot.arrow', 'death', 'heartHit', 'waveStart'];

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  /** The music bus (music.ts plays into it). */
  musicBus: GainNode | null = null;
  private unsupported = false;
  private readonly buffers = new Map<string, AudioBuffer>();
  private mix: Mix = { music: 0.5, sfx: 0.8, muted: false };
  private readonly listeners: (() => void)[] = [];
  /** For the browser tests and the sound check. */
  readonly stats = { played: 0, baked: 0, bakeMs: 0 };

  constructor(private readonly defs: ReadonlyMap<string, SynthDef>) {
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
      this.applyMix(true);
      ctx.addEventListener('statechange', () => this.changed());
      this.startBake();
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
    const ids = [...new Set([...BAKE_FIRST.filter((id) => this.defs.has(id)), ...this.defs.keys()])];
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

  private store(id: string, samples: Float32Array): void {
    const ctx = this.ctx;
    if (!ctx || this.buffers.has(id)) return;
    const buf = ctx.createBuffer(1, samples.length, BAKE_RATE);
    buf.getChannelData(0).set(samples);
    this.buffers.set(id, buf);
    this.stats.baked++;
  }


  /** Starts a voice of sound `id`. Returns false when nothing could play. */
  play(id: string, o: PlayOptions = {}): boolean {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.sfxBus) return false;
    const buf = this.buffer(id);
    if (!buf) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (o.rate !== undefined && o.rate !== 1) src.playbackRate.value = o.rate;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    src.connect(g);
    let tail: AudioNode = g;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan;
      g.connect(p);
      tail = p;
    }
    tail.connect(o.out ?? this.sfxBus);
    src.start(o.when ?? 0);
    this.stats.played++;
    return true;
  }

  private applyMix(instant: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const set = (p: AudioParam, v: number) => {
      if (instant) p.value = v;
      else p.setTargetAtTime(v, ctx.currentTime, 0.03);
    };
    set(this.master.gain, this.mix.muted ? 0 : 1);
    set(this.sfxBus.gain, volumeGain(this.mix.sfx));
    set(this.musicBus.gain, volumeGain(this.mix.music));
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
