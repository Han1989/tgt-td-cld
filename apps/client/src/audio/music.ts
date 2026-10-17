// Music players (the sound pass, docs/ART.md §13).
// - `SynthMusic` plays the code-made score (score.ts) with a look-ahead scheduler: every 80 ms it
//   queues the notes of the next 0.3 s on the context's clock, so timing never depends on the frame
//   rate. Each note is humanised (timing, velocity) and sustained notes are cut to their length.
//   Layers fade in and out as the scene changes (building → waves → boss wave).
// - `FileMusic` loops a recorded file (`public/music/lobby.mp3`, `match.mp3`, `boss.mp3`), from the
//   end of the encoder's silence to the start of the trailing one (a seamless loop), levelled to the
//   code-made music's loudness, fading in over a second, and crossfades between files.
// - `Music` picks per scene: the file when the build has one (docs/SOUND_FILES.md), else the code-made
//   music. While a listed file downloads it plays nothing (Han, 17 Oct 2026: on a first visit the
//   score played for the 3–5 s lobby.mp3 took to arrive, harsh and loud, then the file cut in); the
//   code-made music only once the file can't be loaded (offline and not cached, not audio). The scene's
//   file is fetched as early as the page knows it: the lobby's on the first tap (with one koto pluck
//   to answer it), the match's as a match is created, the boss's once the match's is in.
// All of them stop every bit of work while the music is muted, silent or the context is suspended.

import { channelsOf, decodeFile, type PlayOptions } from './engine';
import { fitFile, musicFileFor, MUSIC_TARGET_DB, type FittedFile, type MusicFile, type SoundFiles } from './files';
import { humanize, NOTE_RELEASE, SCENE_LAYERS, SCENE_TRACK, TRACKS, stepSeconds, type MusicLayer, type MusicScene, type Track } from './score';
import { INSTRUMENTS, noteSample } from './sounds';

/** What the music needs from the engine (`AudioEngine`; a fake in the tests). */
export interface MusicEngine {
  readonly ctx: AudioContext | null;
  readonly musicBus: GainNode | null;
  readonly musicSend: GainNode | null;
  /** Music can be heard: the context runs, not muted, the Music volume above 0. */
  readonly musicOn: boolean;
  /** The player wants music (not muted, the volume above 0), whether or not the context runs yet. */
  readonly musicWanted: boolean;
  readonly files: SoundFiles;
  onChange(listener: () => void): void;
  /** Called once, inside the first tap, right after the context is created. */
  onUnlock(listener: () => void): void;
  play(id: string, o?: PlayOptions): boolean;
}

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
/** A recorded file fades in over this long (s, a linear ramp) when it starts, rather than cutting in. */
export const FILE_FADE_IN = 1;
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

  constructor(private readonly engine: MusicEngine) {
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
  private readonly aborts = new Map<MusicFile, AbortController>();
  /** Files that are ready. */
  readonly ready = new Map<MusicFile, LoadedFile>();
  /** Files whose last download or decode failed: their scene plays the code-made music until one works. */
  readonly failed = new Set<MusicFile>();
  /** Downloads started, in order (the tests and the sound check). */
  readonly fetched: MusicFile[] = [];

  constructor(
    private readonly engine: MusicEngine,
    private readonly urls: Partial<Record<MusicFile, string>>,
  ) {}

  /** Whether `name` is ready or on its way. */
  has(name: MusicFile): boolean {
    return this.loads.has(name);
  }

  /**
   * Starts downloading a file (once); resolves when it's decoded, or null if it can't be played (then it's `failed`)
   * or was released on the way (then it isn't).
   */
  load(name: MusicFile): Promise<LoadedFile | null> {
    let p = this.loads.get(name);
    const ctx = this.engine.ctx;
    const url = this.urls[name];
    if (!p && ctx && url) {
      const abort = new AbortController();
      this.fetched.push(name);
      p = decodeFile(ctx, url, abort.signal).then((buf) => {
        // Released on the way (its download stopped, or it decoded after the scene left): forget it.
        if (this.loads.get(name) !== p) return null;
        this.aborts.delete(name);
        if (!buf) {
          // Try again on the next scene (back online, say).
          this.loads.delete(name);
          this.failed.add(name);
          return null;
        }
        const f = { buf, fit: fitFile(channelsOf(buf), buf.sampleRate, MUSIC_TARGET_DB) };
        this.ready.set(name, f);
        this.failed.delete(name);
        return f;
      });
      this.loads.set(name, p);
      this.aborts.set(name, abort);
    }
    return p ?? Promise.resolve(null);
  }

  /** Plays `name` (already loaded) from the top, looping, fading in over a second; the file that was playing fades out. */
  play(name: MusicFile): void {
    const ctx = this.engine.ctx;
    const bus = this.engine.musicBus;
    const f = this.ready.get(name);
    if (!ctx || !bus || !f || this.current?.name === name) return;
    this.fadeOut();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(f.fit.gain, now + FILE_FADE_IN);
    gain.connect(bus);
    const src = ctx.createBufferSource();
    src.buffer = f.buf;
    src.loop = true;
    // Loop only the music: the encoder's silence at either end would be a gap on every pass.
    src.loopStart = f.fit.start;
    src.loopEnd = f.fit.end;
    src.connect(gain);
    src.start(now, f.fit.start);
    this.current = { name, src, gain, fit: f.fit };
  }

  /**
   * Frees the decoded files not in `keep`: a decoded two-minute loop takes ~45 MB, so a phone holds
   * only the lobby's, or the match's and the boss's. The service worker keeps the files themselves,
   * so decoding one again is quick. A download not in `keep` stops, so the one the scene needs gets
   * the whole connection (Play solo tapped before the lobby's file came: the match's comes sooner).
   */
  release(keep: readonly MusicFile[]): void {
    for (const name of [...this.loads.keys()]) {
      if (keep.includes(name) || this.current?.name === name) continue;
      this.loads.delete(name);
      this.ready.delete(name);
      this.aborts.get(name)?.abort();
      this.aborts.delete(name);
    }
  }

  fadeOut(): void {
    const c = this.current;
    const ctx = this.engine.ctx;
    this.current = null;
    if (!c || !ctx) return;
    // From where it is (still fading in, perhaps): hold that level, then fade it out.
    const g = c.gain.gain;
    const level = g.value;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(level, ctx.currentTime);
    g.setTargetAtTime(0, ctx.currentTime, FADE_OUT * 2);
    c.src.stop(ctx.currentTime + 2);
  }
}

/** The first tap's cue: one soft koto pluck (D, the tonic of the lobby's and the match's scales), the lobby's level and room. */
export const CUE = { note: 62, vel: 0.45, gain: 1.25, wet: 0.42 } as const;
/** The cue waits for its sample to bake (the lobby's instruments bake first) and the context to run: every 50 ms, up to 2 s. */
const CUE_TRY_MS = 50;
const CUE_TRIES = 40;

/**
 * The music: a recorded file for a scene when the build has one and it has loaded, nothing while it
 * downloads, the code-made music when the build has none or it can't be loaded.
 */
export class Music implements MusicPlayer {
  scene: MusicScene = 'none';
  private readonly synth: SynthMusic;
  readonly files: FileMusic;
  /** First-tap cues played (the sound check). */
  cues = 0;

  constructor(private readonly engine: MusicEngine) {
    this.synth = new SynthMusic(engine);
    this.files = new FileMusic(engine, engine.files.music);
    engine.onChange(() => this.sync(false));
    engine.onUnlock(() => this.unlocked());
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
    this.sync(true);
  }

  private sync(newScene: boolean): void {
    this.pick(newScene);
    this.files.release(this.scene === 'lobby' || this.scene === 'none' ? ['lobby'] : ['match', 'boss']);
  }

  private pick(newScene: boolean): void {
    const name = musicFileFor(this.scene, this.engine.files.music);
    if (!name || !this.engine.musicOn) {
      this.files.fadeOut();
      // The score is set only for a scene the build has no file for, also while the music is off (it waits by
      // itself): set for a scene with a file, it would start for a moment when the context runs, before this.
      this.synth.setScene(name ? 'none' : this.scene);
      return;
    }
    if (this.files.ready.has(name)) {
      this.synth.setScene('none');
      this.files.play(name);
      // The boss's file comes once the match's is in (the first boss wave is minutes away): one at a time, the scene's first.
      if (name === 'match' && !this.files.failed.has('boss')) this.load('boss');
      return;
    }
    // Not in yet. A match's file carries on into a boss wave until the boss's arrives; any other is the wrong scene's.
    const playing = this.files.current;
    if (playing && !(playing.name === 'match' && name === 'boss')) this.files.fadeOut();
    // Silence while it downloads: the code-made music only once it couldn't be loaded, and nothing else plays.
    const failed = this.files.failed.has(name);
    this.synth.setScene(failed && !this.files.current ? this.scene : 'none');
    // A file that failed is tried again on the next scene (back online, say), not on every change (offline, a loop).
    if (!failed || newScene) this.load(name);
  }

  /** Starts downloading `name` unless it's in or on its way; the music is picked again once it arrives or fails. */
  private load(name: MusicFile): void {
    if (!this.engine.ctx || !this.engine.files.music[name] || this.files.has(name)) return;
    void this.files.load(name).then(() => this.sync(false));
  }

  /**
   * The first tap (inside it, the context just created): the scene's file starts downloading now, before the context
   * even runs, and one koto pluck answers the tap so it isn't silent while the file comes. Nothing more until it plays.
   */
  private unlocked(): void {
    const name = this.engine.musicWanted ? musicFileFor(this.scene, this.engine.files.music) : null;
    if (!name) return;
    this.load(name);
    this.cue();
  }

  private cue(): void {
    let tries = 0;
    let out: GainNode | null = null;
    const nodes: AudioNode[] = [];
    // True when done: played, the music already in, or too late.
    const attempt = (): boolean => {
      if (this.files.current || tries++ >= CUE_TRIES) return true;
      const ctx = this.engine.ctx;
      const bus = this.engine.musicBus;
      if (!ctx || !bus || !this.engine.musicOn) return false;
      if (!out) {
        out = ctx.createGain();
        out.gain.value = CUE.gain;
        out.connect(bus);
        nodes.push(out);
        if (this.engine.musicSend) {
          const send = ctx.createGain();
          send.gain.value = CUE.wet;
          out.connect(send);
          send.connect(this.engine.musicSend);
          nodes.push(send);
        }
      }
      const { id, rate } = noteSample('koto', CUE.note);
      if (!this.engine.play(id, { gain: CUE.vel * INSTRUMENTS.koto.level, rate, out })) return false;
      this.cues++;
      return true;
    };
    // Once the pluck has rung out, its nodes go.
    const done = () => {
      if (nodes.length) setTimeout(() => nodes.forEach((n) => n.disconnect()), 5000);
    };
    if (attempt()) return done();
    const timer = setInterval(() => {
      if (!attempt()) return;
      clearInterval(timer);
      done();
    }, CUE_TRY_MS);
  }
}
