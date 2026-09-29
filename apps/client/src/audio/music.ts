// Music players (the sound pass, docs/ART.md §13).
// - `SynthMusic` plays the code-made score (score.ts) with a look-ahead scheduler: every 80 ms it
//   queues the notes of the next 0.3 s on the context's clock, so timing never depends on the frame
//   rate. Each note is humanised (timing, velocity) and sustained notes are cut to their length.
//   Layers fade in and out as the scene changes (building → waves → boss wave).
// - `FileMusic` loops a recorded file (`public/music/lobby.mp3`, `match.mp3`, `boss.mp3`), from the
//   end of the encoder's silence to the start of the trailing one (a seamless loop), levelled to the
//   code-made music's loudness, and crossfades between files.
// - `Music` picks per scene: the file when there is one (docs/SOUND_FILES.md), else the code-made
//   music, which also plays while a file is still downloading and if it can't be loaded (offline).
// All of them stop every bit of work while the music is muted, silent or the context is suspended.

import type { AudioEngine } from './engine';
import { channelsOf, decodeFile } from './engine';
import { fitFile, musicFileFor, MUSIC_TARGET_DB, type FittedFile, type MusicFile } from './files';
import { humanize, NOTE_RELEASE, SCENE_LAYERS, SCENE_TRACK, TRACKS, stepSeconds, type MusicLayer, type MusicScene, type Track } from './score';
import { INSTRUMENTS, noteSample } from './sounds';

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
  loop: number;
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
      const track = TRACKS[name]();
      const gain = ctx.createGain();
      gain.gain.value = track.gain;
      gain.connect(bus);
      if (this.engine.musicSend) {
        const send = ctx.createGain();
        send.gain.value = track.wet;
        gain.connect(send);
        send.connect(this.engine.musicSend);
      }
      const layers = {} as Record<MusicLayer, GainNode>;
      for (const l of LAYERS) {
        layers[l] = ctx.createGain();
        layers[l].gain.value = 0;
        layers[l].connect(gain);
      }
      this.playing = { track, gain, layers, on: new Set(), step: 0, loop: 0, next: ctx.currentTime + 0.1 };
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
      p.track.byStep[p.step]!.forEach((n, index) => {
        if (!p.on.has(n.layer)) return;
        const h = humanize(n, p.loop, index);
        const { id, rate } = noteSample(n.inst, n.note);
        const when = Math.max(now, p.next + (n.nudge ?? 0) * dt + h.dt);
        const played = this.engine.play(id, {
          when,
          gain: h.vel * INSTRUMENTS[n.inst].level,
          rate,
          out: p.layers[n.layer],
          ...(n.len !== undefined ? { dur: n.len * dt, release: NOTE_RELEASE } : {}),
        });
        if (played) this.notes++;
      });
      p.step++;
      if (p.step === p.track.steps) {
        p.step = 0;
        p.loop++;
      }
      p.next += dt;
    }
  }
}

interface LoadedFile {
  buf: AudioBuffer;
  fit: FittedFile;
}

/** Loops recorded music files, crossfading between them. */
export class FileMusic {
  /** The file playing, if any. */
  current: { name: MusicFile; src: AudioBufferSourceNode; gain: GainNode; fit: FittedFile } | null = null;
  private readonly loads = new Map<MusicFile, Promise<LoadedFile | null>>();
  private readonly seen = new Set<MusicFile>();
  /** Files that are ready. */
  readonly ready = new Map<MusicFile, LoadedFile>();

  constructor(
    private readonly engine: AudioEngine,
    private readonly urls: Partial<Record<MusicFile, string>>,
  ) {}

  /** Starts downloading a file (once); resolves when it's decoded, or null if it can't be played. */
  load(name: MusicFile): Promise<LoadedFile | null> {
    let p = this.loads.get(name);
    const ctx = this.engine.ctx;
    const url = this.urls[name];
    if (!p && ctx && url) {
      p = decodeFile(ctx, url).then((buf) => {
        if (!buf) {
          // Try again on the next scene (back online, say).
          if (this.loads.get(name) === p) this.loads.delete(name);
          return null;
        }
        const f = { buf, fit: fitFile(channelsOf(buf), buf.sampleRate, MUSIC_TARGET_DB) };
        // Released while it decoded: don't keep it.
        if (this.loads.get(name) !== p) return f;
        this.ready.set(name, f);
        this.seen.add(name);
        return f;
      });
      this.loads.set(name, p);
    }
    return p ?? Promise.resolve(null);
  }

  /** Plays `name` (already loaded) from the top, looping, fading in; the file that was playing fades out. */
  play(name: MusicFile): void {
    const ctx = this.engine.ctx;
    const bus = this.engine.musicBus;
    const f = this.ready.get(name);
    if (!ctx || !bus || !f || this.current?.name === name) return;
    this.fadeOut();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(f.fit.gain, ctx.currentTime, FADE_IN * 2);
    gain.connect(bus);
    const src = ctx.createBufferSource();
    src.buffer = f.buf;
    src.loop = true;
    // Loop only the music: the encoder's silence at either end would be a gap on every pass.
    src.loopStart = f.fit.start;
    src.loopEnd = f.fit.end;
    src.connect(gain);
    src.start(ctx.currentTime, f.fit.start);
    this.current = { name, src, gain, fit: f.fit };
  }

  /**
   * Frees the decoded files not in `keep`: a decoded two-minute loop takes ~45 MB, so a phone holds
   * only the lobby's, or the match's and the boss's. The service worker keeps the files themselves,
   * so decoding one again is quick.
   */
  release(keep: readonly MusicFile[]): void {
    for (const name of [...this.loads.keys()]) {
      if (keep.includes(name) || this.current?.name === name) continue;
      this.loads.delete(name);
      this.ready.delete(name);
    }
  }

  /** Whether `name` was downloaded before in this session (so it comes from the cache, quickly). */
  loadedBefore(name: MusicFile): boolean {
    return this.seen.has(name);
  }

  fadeOut(): void {
    const c = this.current;
    const ctx = this.engine.ctx;
    this.current = null;
    if (!c || !ctx) return;
    c.gain.gain.setTargetAtTime(0, ctx.currentTime, FADE_OUT * 2);
    c.src.stop(ctx.currentTime + 2);
  }
}

/**
 * The music: a recorded file for a scene when the build has one and it has loaded, the code-made
 * music otherwise (also while the file downloads, or if it never can).
 */
export class Music implements MusicPlayer {
  scene: MusicScene = 'none';
  private readonly synth: SynthMusic;
  readonly files: FileMusic;

  constructor(private readonly engine: AudioEngine) {
    this.synth = new SynthMusic(engine);
    this.files = new FileMusic(engine, engine.files.music);
    engine.onChange(() => this.sync());
  }

  get notes(): number {
    return this.synth.notes;
  }

  /** What is playing now: a file's name, the code-made music, or nothing. */
  get source(): MusicFile | 'code' | 'none' {
    if (this.files.current) return this.files.current.name;
    return this.synth.scene === 'none' ? 'none' : 'code';
  }

  setScene(scene: MusicScene): void {
    if (scene === this.scene) return;
    this.scene = scene;
    this.sync();
  }

  private sync(): void {
    this.pick();
    this.files.release(this.scene === 'lobby' || this.scene === 'none' ? ['lobby'] : ['match', 'boss']);
  }

  private pick(): void {
    const name = this.engine.musicOn ? musicFileFor(this.scene, this.engine.files.music) : null;
    if (!name) {
      this.files.fadeOut();
      this.synth.setScene(this.scene);
      return;
    }
    if (this.files.ready.has(name)) {
      this.synth.setScene('none');
      this.files.play(name);
      return;
    }
    // Not decoded yet: a file already playing (the match's, before the boss's) carries on; one heard
    // before in this session comes back from the cache in a moment (a short quiet); else the code-made
    // music keeps the scene until it arrives.
    if (!this.files.current) this.synth.setScene(this.files.loadedBefore(name) ? 'none' : this.scene);
    void this.files.load(name).then((f) => {
      if (f) this.sync();
      else if (musicFileFor(this.scene, this.engine.files.music) === name) {
        // It can't be played (offline and not cached, not audio): the code-made music.
        this.files.fadeOut();
        this.synth.setScene(this.scene);
      }
    });
    // A match's boss music is fetched while the match starts, so it's ready by the first boss wave.
    if (name === 'match' && this.engine.files.music.boss) void this.files.load('boss');
  }
}
