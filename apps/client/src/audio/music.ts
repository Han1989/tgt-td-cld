// Music players (the sound pass, docs/ART.md §13). `SynthMusic` plays the code-made score (score.ts)
// with a look-ahead scheduler: every 80 ms it queues the notes of the next 0.3 s on the context's
// clock, so timing never depends on the frame rate. Layers fade in and out as the scene changes
// (building → waves → boss wave). `FileMusic` loops recorded files instead, when `MUSIC_DIR` is set.
// Both stop all work while the music is muted, silent or the context is suspended.

import type { AudioEngine } from './engine';
import { MUSIC_DIR } from './musicFiles';
import { SCENE_LAYERS, SCENE_TRACK, TRACKS, noteRate, stepSeconds, type MusicLayer, type MusicScene, type Track } from './score';
import { instrumentId } from './sounds';

export interface MusicPlayer {
  readonly scene: MusicScene;
  /** Notes queued so far (the code-made music; browser tests). */
  readonly notes: number;
  setScene(scene: MusicScene): void;
}

/** Seconds of notes queued ahead, and how often the queue is topped up (ms). */
const LOOKAHEAD = 0.3;
const TICK_MS = 80;
/** Fade times (time constants, s): a track or layer coming in, and going out. */
const FADE_IN = 0.5;
const FADE_OUT = 0.25;
const LAYERS: MusicLayer[] = ['base', 'pulse', 'boss'];

interface Playing {
  track: Track;
  gain: GainNode;
  layers: Record<MusicLayer, GainNode>;
  on: Set<MusicLayer>;
  step: number;
  next: number;
}

export class SynthMusic implements MusicPlayer {
  scene: MusicScene = 'none';
  private playing: Playing | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Notes queued so far (browser tests). */
  notes = 0;

  constructor(private readonly engine: AudioEngine) {
    engine.onChange(() => this.sync());
  }

  setScene(scene: MusicScene): void {
    if (scene === this.scene) return;
    this.scene = scene;
    this.sync();
  }

  private sync(): void {
    const ctx = this.engine.ctx;
    const bus = this.engine.musicBus;
    const name = SCENE_TRACK[this.scene];
    if (!ctx || !bus || !this.engine.musicOn || !name) {
      this.stop();
      return;
    }
    if (this.playing?.track.name !== name) {
      this.stop();
      const gain = ctx.createGain();
      gain.connect(bus);
      const layers = {} as Record<MusicLayer, GainNode>;
      for (const l of LAYERS) {
        layers[l] = ctx.createGain();
        layers[l].gain.value = 0;
        layers[l].connect(gain);
      }
      this.playing = { track: TRACKS[name](), gain, layers, on: new Set(), step: 0, next: ctx.currentTime + 0.1 };
    }
    const p = this.playing!;
    const want = SCENE_LAYERS[this.scene];
    for (const l of LAYERS) {
      const on = want.includes(l);
      if (on === p.on.has(l)) continue;
      if (on) p.on.add(l);
      else p.on.delete(l);
      p.layers[l].gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, on ? FADE_IN : FADE_OUT);
    }
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  /** Fades the playing track out and stops scheduling. */
  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const p = this.playing;
    const ctx = this.engine.ctx;
    this.playing = null;
    if (!p || !ctx) return;
    p.gain.gain.setTargetAtTime(0, ctx.currentTime, FADE_OUT);
    setTimeout(() => p.gain.disconnect(), 2000);
  }

  private tick(): void {
    const p = this.playing;
    const ctx = this.engine.ctx;
    if (!p || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    // Fell behind (a long frame, a throttled timer): start again from now rather than rush.
    if (p.next < now - 0.1) p.next = now + 0.05;
    const dt = stepSeconds(p.track);
    while (p.next < now + LOOKAHEAD) {
      for (const n of p.track.byStep[p.step]!) {
        if (!p.on.has(n.layer)) continue;
        if (this.engine.play(instrumentId(n.inst), { when: p.next, gain: n.vel, rate: noteRate(n.inst, n.note), out: p.layers[n.layer] })) {
          this.notes++;
        }
      }
      p.step = (p.step + 1) % p.track.steps;
      p.next += dt;
    }
  }
}

/** Which file plays in a scene (`boss` falls back to `match` when there is no boss file). */
const SCENE_FILE: Record<MusicScene, 'lobby' | 'match' | 'boss' | null> = {
  none: null,
  lobby: 'lobby',
  build: 'match',
  waves: 'match',
  boss: 'boss',
};

/** Loops recorded music files from `dir` (`<dir>lobby.mp3`…), crossfading between them. */
export class FileMusic implements MusicPlayer {
  scene: MusicScene = 'none';
  readonly notes = 0;
  private current: { name: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private readonly loads = new Map<string, Promise<AudioBuffer | null>>();

  constructor(
    private readonly engine: AudioEngine,
    private readonly dir: string,
  ) {
    engine.onChange(() => void this.sync());
  }

  setScene(scene: MusicScene): void {
    if (scene === this.scene) return;
    this.scene = scene;
    void this.sync();
  }

  private load(name: string): Promise<AudioBuffer | null> {
    let p = this.loads.get(name);
    if (!p) {
      const ctx = this.engine.ctx!;
      p = fetch(`${this.dir}${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => null);
      this.loads.set(name, p);
    }
    return p;
  }

  private async sync(): Promise<void> {
    const ctx = this.engine.ctx;
    const bus = this.engine.musicBus;
    let name = SCENE_FILE[this.scene];
    if (!ctx || !bus || !this.engine.musicOn || !name) return this.fadeOut();
    if (name === 'boss' && !(await this.load('boss'))) name = 'match';
    if (this.current?.name === name) return;
    const buf = await this.load(name);
    // The scene may have moved on while the file loaded.
    if (!buf || SCENE_FILE[this.scene] === null || !this.engine.musicOn) return;
    if (this.current?.name === name) return;
    this.fadeOut();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, ctx.currentTime, FADE_IN * 2);
    gain.connect(bus);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(gain);
    src.start();
    this.current = { name, src, gain };
  }

  private fadeOut(): void {
    const c = this.current;
    const ctx = this.engine.ctx;
    this.current = null;
    if (!c || !ctx) return;
    c.gain.gain.setTargetAtTime(0, ctx.currentTime, FADE_OUT * 2);
    c.src.stop(ctx.currentTime + 2);
  }
}

/** The code-made music, or the files in `MUSIC_DIR` once there are some. */
export function createMusic(engine: AudioEngine): MusicPlayer {
  return MUSIC_DIR ? new FileMusic(engine, MUSIC_DIR) : new SynthMusic(engine);
}
