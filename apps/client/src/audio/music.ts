// Music players (the sound pass, docs/ART.md §13).
// - `SynthMusic` plays the code-made score (score.ts) with a look-ahead scheduler: every 80 ms it
//   queues the notes of the next 0.3 s on the context's clock, so timing never depends on the frame
//   rate. Each note is humanised (timing, velocity) and sustained notes are cut to their length.
//   A track fades in over 1.5 s when it starts; its layers fade in and out as the scene changes
//   (building → waves → boss wave).
// - `FileMusic` plays a recorded file (`public/music/lobby.mp3`, `match.mp3`, `boss.mp3`) in two steps
//   (Han, 17 Oct 2026: the lobby's real music within about a second of the first tap, fading in):
//   1. Streamed: an <audio> element looping into the music bus (a MediaElementAudioSourceNode), so it
//      sounds as soon as its first bytes are in, fading in over 1.5 s at the level its decoded loop
//      will have (`streamLevel`: measured at build time, else the last decode's, else `STREAM_GAIN`).
//      Only once it sounds do the recorded effects load (`loadEffectFiles`): their requests held it up.
//   2. Decoded: once the element holds the whole file, the file is decoded (the browser answers that
//      request from its own cache, so it's one download; started together, Chromium held the element
//      back until the decode's download had finished), and the decoded loop takes over: at the
//      element's loop point when that's at most `LOOP_WAIT` away, else in a 0.5 s crossfade at the
//      element's position (Chromium lines the two up within 3 ms). The element is freed then, and the
//      loop runs seamlessly from the end of the encoder's silence to the start of the trailing one,
//      levelled to the code-made music's loudness.
//   A file already decoded plays at once, fading in; one file fades out as the next comes in.
// - `Music` picks per scene: the file when the build has one (docs/SOUND_FILES.md), else the code-made
//   music. The scene's stream starts as early as the page knows the scene: the lobby's inside the
//   first tap (iOS plays an element only from a tap: it is played there, then connected; the other
//   files' elements are played and paused there with no source, so they may play later without a tap),
//   the match's as a match is created, the boss's at a boss wave. Without a stream (the element failed
//   or was refused) nothing plays while the file downloads (P2-10), and the code-made music only once
//   the file can't be loaded either.
// All of them stop every bit of work while the music is muted, silent or the context is suspended
// (the elements pause with the context); muted, no element is even made.

import { channelsOf, decodeFile, type PlayOptions } from './engine';
import { fitFile, musicFileFor, MUSIC_FILES, MUSIC_TARGET_DB, type FittedFile, type MusicFile, type SoundFiles } from './files';
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
  /** A new <audio> element for a streamed start, or null if there can't be one. */
  audioElement(): HTMLAudioElement | null;
  /** The recorded effects may load now: the music's first bytes are in (or it isn't streaming). Once; later calls do nothing. */
  loadEffectFiles(): void;
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
/** A recorded file fades in over this long (s, a linear ramp) when it starts, streamed or decoded, rather than cutting in. */
export const FILE_FADE_IN = 1.5;
/** The code-made score fades in over this long (s, a linear ramp) when a track starts, rather than cutting in. */
export const SCORE_FADE_IN = 1.5;
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
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(track.gain, ctx.currentTime + SCORE_FADE_IN);
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

/** The decoded loop takes over from its stream at the element's loop point when that is at most this far (s)… */
export const LOOP_WAIT = 20;
/** …else in a crossfade this long (s) at the element's position. */
export const CROSSFADE = 0.5;
/** At the loop point the element is cut over this long (s): it is in the encoder's silence by then. */
export const SEAM = 0.02;
/** A crossfade starts this far ahead (s), so both sides are scheduled on the context's clock. */
export const LEAD = 0.05;
/**
 * A last resort (a browser that never buffers the whole file): the decode starts this long (s) after the stream did.
 * Not sooner: on Slow 4G with the map's art loading, the lobby's element took 37 s to hold its file, and a decode
 * started before that is a second download beside it.
 */
export const DECODE_AFTER = 120;
/**
 * The streamed start's level for a file with no measure and no earlier decode (a new upload not yet measured, on a
 * first visit): a little under the shipped files' measured 0.98–1.13, so it's never much louder than its loop.
 */
export const STREAM_GAIN = 0.7;
/** The last decode's levelling gain per file URL (the URL carries the file's hash), in localStorage. */
export const GAIN_KEY = 'tdt.musicGain';

/** Where a stream's level came from: measured at build time (`musicLevels.json`), the last decode's, or `STREAM_GAIN`. */
export type LevelFrom = 'measured' | 'remembered' | 'default';

function rememberedGain(url: string): number | null {
  try {
    const v = (JSON.parse(localStorage.getItem(GAIN_KEY) ?? '{}') as Record<string, unknown>)[url];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Keeps `gain` for `url`, and only the build's files (`urls`): an old upload's level goes. */
function rememberGain(url: string, gain: number, urls: readonly string[]): void {
  try {
    const all = JSON.parse(localStorage.getItem(GAIN_KEY) ?? '{}') as Record<string, unknown>;
    const keep: Record<string, unknown> = {};
    for (const u of urls) if (u in all) keep[u] = all[u];
    keep[url] = gain;
    localStorage.setItem(GAIN_KEY, JSON.stringify(keep));
  } catch {
    // No storage (private mode, blocked): the next first visit uses the measure or the default.
  }
}

/** `x` (s, the element's position) on the loop [start, end): past the end it has come round again. */
function onLoop(x: number, start: number, end: number): number {
  if (x < start) return start;
  return x < end ? x : start + ((x - end) % (end - start));
}

interface StreamEvents {
  /** It sounds: its first bytes are in. */
  heard(name: MusicFile): void;
  /** The element holds the whole file (or `DECODE_AFTER` passed): decode it now. */
  decode(name: MusicFile): void;
  /** It can't play (an error, or the browser refused to play it): pick again. */
  failed(name: MusicFile): void;
}

/** A file's streamed start: an <audio> element looping into the music bus through its own gain. */
class Stream {
  readonly gain: GainNode;
  private node: AudioNode | null = null;
  /** It was asked to play and hasn't been stopped. */
  live = false;
  /** When its fade-in started (context time; the 'playing' event): its level follows that line. */
  heardAt: number | null = null;
  /** It can't play: for the rest of the page's life its file plays only decoded. */
  failed = false;
  private sourced = false;
  private whole = false;
  private dropAfter = false;
  private decodeTimer: ReturnType<typeof setTimeout> | null = null;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly name: MusicFile,
    readonly el: HTMLAudioElement,
    private readonly ctx: AudioContext,
    bus: AudioNode,
    private readonly url: string,
    readonly level: number,
    readonly from: LevelFrom,
    private readonly events: StreamEvents,
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(bus);
    el.preload = 'auto';
    el.loop = true;
    el.addEventListener('playing', () => this.playing());
    el.addEventListener('error', () => {
      if (this.sourced) this.fail();
    });
    // Not on 'suspend' alone: Chromium pauses a media download once it is far enough ahead, and a decode started then
    // is a second download (the cache can't answer from an unfinished one).
    for (const type of ['progress', 'canplaythrough', 'loadeddata', 'suspend']) el.addEventListener(type, () => this.check());
  }

  /** Its level at context time `t`: on its fade-in's line, full after it. */
  levelAt(t: number): number {
    if (this.heardAt === null) return 0;
    return this.level * Math.max(0, Math.min(1, (t - this.heardAt) / FILE_FADE_IN));
  }

  /** Inside the first tap: played with no source and paused, so iOS lets it play later outside a tap. */
  bless(): void {
    try {
      void this.el.play()?.catch(() => {});
      this.el.pause();
    } catch {
      // Nothing to bless: it will be tried when needed.
    }
  }

  /**
   * Plays it (on from where it was paused, else from the top), fading in once it sounds. The first time, on iOS, this
   * must run inside a tap: `play()` there, then the connection.
   */
  start(): void {
    if (this.failed) return;
    this.clearPause();
    this.dropAfter = false;
    if (!this.sourced) {
      this.el.src = this.url;
      this.sourced = true;
      this.whole = false;
    }
    const sounding = this.live || !this.el.paused;
    this.live = true;
    let p: Promise<void> | undefined;
    try {
      p = this.el.play();
    } catch {
      this.fail();
      return;
    }
    // Stopped before it began (AbortError) is not a failure.
    p?.catch?.((e: unknown) => {
      if (this.live && (e as { name?: string } | null)?.name !== 'AbortError') this.fail();
    });
    this.connect();
    // Still sounding (stopped a moment ago, fading out): no 'playing' event comes, it fades back in from there.
    if (sounding) this.fadeIn();
    if (!this.whole && !this.decodeTimer) {
      this.decodeTimer = setTimeout(() => {
        this.decodeTimer = null;
        if (this.live) this.events.decode(this.name);
      }, DECODE_AFTER * 1000);
    }
    this.check();
  }

  /**
   * Fades it out from where it is, then pauses it (at once while the context isn't running: nothing is heard then).
   * `drop`: it also lets go of its file (another scene), after the fade.
   */
  stop(drop = false): void {
    if (drop) this.dropAfter = true;
    if (!this.live) {
      if (drop && !this.pauseTimer) this.drop();
      return;
    }
    this.live = false;
    this.heardAt = null;
    this.clearDecode();
    const now = this.ctx.currentTime;
    const g = this.gain.gain;
    const level = g.value;
    g.cancelScheduledValues(now);
    g.setValueAtTime(level, now);
    g.setTargetAtTime(0, now, FADE_OUT * 2);
    if (this.ctx.state !== 'running') this.paused();
    else this.pauseTimer = setTimeout(() => this.paused(), 1000);
  }

  /** The decoded loop took over: its gain is scheduled out; it lets go of its file `after` seconds from now. */
  retire(after: number): void {
    this.live = false;
    this.heardAt = null;
    this.dropAfter = true;
    this.clearDecode();
    this.clearPause();
    this.pauseTimer = setTimeout(() => this.paused(), Math.max(0, after) * 1000);
  }

  private paused(): void {
    this.pauseTimer = null;
    if (this.dropAfter) this.drop();
    else this.el.pause();
  }

  /** Lets go of its file: the download stops and the memory goes. The element stays, to play again. */
  private drop(): void {
    this.dropAfter = false;
    if (!this.sourced) return;
    this.sourced = false;
    this.whole = false;
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
  }

  private connect(): void {
    if (this.node) return;
    try {
      this.node = this.ctx.createMediaElementSource(this.el);
      this.node.connect(this.gain);
    } catch {
      this.fail();
    }
  }

  private playing(): void {
    // A stall's 'playing' again carries on at its level.
    if (!this.live || this.heardAt !== null) return;
    this.fadeIn();
    this.events.heard(this.name);
  }

  /** From its level now up to its full level, at the fade-in's pace. */
  private fadeIn(): void {
    const now = this.ctx.currentTime;
    const g = this.gain.gain;
    const done = this.level > 0 ? Math.max(0, Math.min(1, g.value / this.level)) : 1;
    g.cancelScheduledValues(now);
    g.setValueAtTime(done * this.level, now);
    g.linearRampToValueAtTime(this.level, now + FILE_FADE_IN * (1 - done));
    this.heardAt = now - FILE_FADE_IN * done;
  }

  /** Starts the decode once the element holds the whole file: its request is then answered from the browser's cache. */
  private check(): void {
    if (!this.live || this.whole) return;
    const b = this.el.buffered;
    const d = this.el.duration;
    if (!b || b.length !== 1 || !Number.isFinite(d) || d <= 0) return;
    if (b.start(0) > 0.25 || b.end(0) < d - 0.25) return;
    this.whole = true;
    this.clearDecode();
    this.events.decode(this.name);
  }

  private fail(): void {
    if (this.failed) return;
    this.failed = true;
    this.live = false;
    this.heardAt = null;
    this.clearDecode();
    this.clearPause();
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(0, now);
    try {
      this.drop();
    } catch {
      // Already gone.
    }
    this.events.failed(this.name);
  }

  private clearDecode(): void {
    if (this.decodeTimer) clearTimeout(this.decodeTimer);
    this.decodeTimer = null;
  }

  private clearPause(): void {
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
  }
}

/** What's playing: a file's stream, or its decoded loop. */
type FilePlaying =
  | { name: MusicFile; kind: 'stream'; stream: Stream; gain: GainNode }
  | { name: MusicFile; kind: 'loop'; src: AudioBufferSourceNode; gain: GainNode; fit: FittedFile };

/** Plays recorded music files: streamed first, then the decoded loop; one file fades out as the next comes in. */
export class FileMusic {
  /** The file playing, if any. */
  current: FilePlaying | null = null;
  private readonly streams = new Map<MusicFile, Stream | null>();
  private readonly loads = new Map<MusicFile, Promise<LoadedFile | null>>();
  private readonly aborts = new Map<MusicFile, AbortController>();
  /** Files that are decoded. */
  readonly ready = new Map<MusicFile, LoadedFile>();
  /** Files whose last download or decode failed: their scene plays the code-made music until one works (no stream). */
  readonly failed = new Set<MusicFile>();
  /** Decodes' downloads started, in order (the tests and the sound check). */
  readonly fetched: MusicFile[] = [];
  /** Streams started, in order. */
  readonly streamed: MusicFile[] = [];

  constructor(
    private readonly engine: MusicEngine,
    private readonly events: StreamEvents,
  ) {}

  private get urls(): SoundFiles['music'] {
    return this.engine.files.music;
  }

  /** Whether `name` is decoded or on its way. */
  has(name: MusicFile): boolean {
    return this.loads.has(name);
  }

  /** The level a stream of `name` plays at, and where it came from. */
  streamLevel(name: MusicFile): { gain: number; from: LevelFrom } {
    const measured = this.engine.files.gains[name];
    if (measured !== undefined) return { gain: measured, from: 'measured' };
    const url = this.urls[name];
    const last = url ? rememberedGain(url) : null;
    return last !== null ? { gain: last, from: 'remembered' } : { gain: STREAM_GAIN, from: 'default' };
  }

  /** `name`'s stream (made once), or null when it can't have one (no file, no context, no element). */
  private stream(name: MusicFile): Stream | null {
    const known = this.streams.get(name);
    if (known !== undefined) return known;
    const ctx = this.engine.ctx;
    const bus = this.engine.musicBus;
    const url = this.urls[name];
    if (!ctx || !bus || !url) return null;
    const el = this.engine.audioElement();
    const { gain, from } = this.streamLevel(name);
    const s = el ? new Stream(name, el, ctx, bus, url, gain, from, this.events) : null;
    this.streams.set(name, s);
    return s;
  }

  /**
   * Inside the first tap (the context just made): every listed file gets its element now. The scene's (`play`) plays
   * at once; the others are played and paused with no source, so iOS lets them play later without a tap (a room's
   * match starts on a message from the server). Returns whether `play` streams.
   */
  prime(play: MusicFile | null): boolean {
    let streaming = false;
    for (const name of MUSIC_FILES) {
      const s = this.urls[name] ? this.stream(name) : null;
      if (!s) continue;
      if (name === play) streaming = this.play(name) === 'stream';
      else s.bless();
    }
    return streaming;
  }

  /**
   * Starts downloading and decoding a file (once); resolves when it's decoded, or null if it can't be played (then
   * it's `failed`) or was released on the way (then it isn't).
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
        // The next first visit's stream of this file starts at this level (no measure of it in the build).
        rememberGain(url, f.fit.gain, Object.values(this.urls));
        return f;
      });
      this.loads.set(name, p);
      this.aborts.set(name, abort);
    }
    return p ?? Promise.resolve(null);
  }

  /**
   * Plays `name`: its decoded loop if it's in (taking over from its stream when that is playing), else its stream.
   * Returns which, or null when neither can play yet (no stream: none in this browser, or it failed); the file that
   * was playing then plays on.
   */
  play(name: MusicFile): 'stream' | 'loop' | null {
    const ctx = this.engine.ctx;
    const bus = this.engine.musicBus;
    if (!ctx || !bus) return null;
    const c = this.current;
    const f = this.ready.get(name);
    if (f) {
      if (c?.name === name && c.kind === 'loop') return 'loop';
      if (c?.name === name && c.kind === 'stream') {
        this.takeover(c.stream, f);
        return 'loop';
      }
      this.fadeOut();
      const now = ctx.currentTime;
      const gain = this.loop(name, f, now, f.fit.start);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(f.fit.gain, now + FILE_FADE_IN);
      return 'loop';
    }
    const s = this.stream(name);
    if (!s || s.failed) return null;
    if (c?.name === name && c.kind === 'stream') return 'stream';
    s.start();
    if (s.failed) return null;
    this.fadeOut();
    this.current = { name, kind: 'stream', stream: s, gain: s.gain };
    this.streamed.push(name);
    return 'stream';
  }

  /** Starts `f` looping at context time `at` from `offset` (s) into a new gain, the caller's to set; it's `current`. */
  private loop(name: MusicFile, f: LoadedFile, at: number, offset: number): GainNode {
    const ctx = this.engine.ctx!;
    const gain = ctx.createGain();
    gain.connect(this.engine.musicBus!);
    const src = ctx.createBufferSource();
    src.buffer = f.buf;
    src.loop = true;
    // Loop only the music: the encoder's silence at either end would be a gap on every pass.
    src.loopStart = f.fit.start;
    src.loopEnd = f.fit.end;
    src.connect(gain);
    src.start(at, offset);
    this.current = { name, kind: 'loop', src, gain, fit: f.fit };
    return gain;
  }

  /**
   * The decoded loop takes over from the stream: at the element's loop point when that's at most `LOOP_WAIT` away
   * (the loop starts from the top as the element reaches the end of the music, which is then cut in the encoder's
   * silence), else in a `CROSSFADE` at the element's position, finishing the stream's fade-in if it's still running.
   * A stream not heard yet (the file was in the cache) just goes, and the loop fades in from the top.
   */
  private takeover(s: Stream, f: LoadedFile): void {
    const ctx = this.engine.ctx!;
    const now = ctx.currentTime;
    const heard = s.heardAt;
    if (heard === null) {
      s.stop(true);
      const gain = this.loop(s.name, f, now, f.fit.start);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(f.fit.gain, now + FILE_FADE_IN);
      return;
    }
    const { start, end: loopEnd, gain: target } = f.fit;
    const pos = s.el.currentTime;
    const toEnd = loopEnd - pos;
    const fadeEnd = heard + FILE_FADE_IN;
    const seam = toEnd > LEAD && toEnd <= LOOP_WAIT;
    const at = now + (seam ? toEnd : LEAD);
    const end = seam ? at + SEAM : Math.max(at + CROSSFADE, fadeEnd);
    // The stream: on along its fade-in's line until `at`, then out by `end`.
    const g = s.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(s.levelAt(now), now);
    g.linearRampToValueAtTime(s.levelAt(at), at);
    g.linearRampToValueAtTime(0, end);
    s.retire(end - now + 0.1);
    const lg = this.loop(s.name, f, at, seam ? start : onLoop(pos + LEAD, start, loopEnd)).gain;
    if (seam) {
      // Straight on at the stream's level (its fade-in finishing if it hasn't).
      const u = Math.max(0, Math.min(1, (at - heard) / FILE_FADE_IN));
      lg.setValueAtTime(target * u, at);
      if (u < 1) lg.linearRampToValueAtTime(target, fadeEnd);
    } else {
      lg.setValueAtTime(0, at);
      lg.linearRampToValueAtTime(target, end);
    }
  }

  /**
   * Frees the files not in `keep`: a decoded two-minute loop takes ~45 MB, so a phone holds only the lobby's, or the
   * match's and the boss's; a stream not in `keep` lets go of its file after its fade. The service worker keeps the
   * files themselves, so decoding one again is quick. A download not in `keep` stops, so the one the scene needs gets
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
    for (const [name, s] of this.streams) {
      if (s && !keep.includes(name) && this.current?.name !== name) s.stop(true);
    }
  }

  fadeOut(): void {
    const c = this.current;
    const ctx = this.engine.ctx;
    this.current = null;
    if (!c || !ctx) return;
    if (c.kind === 'stream') {
      c.stream.stop();
      return;
    }
    // From where it is (still fading in, perhaps): hold that level, then fade it out.
    const g = c.gain.gain;
    const level = g.value;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(level, ctx.currentTime);
    g.setTargetAtTime(0, ctx.currentTime, FADE_OUT * 2);
    c.src.stop(ctx.currentTime + 2);
  }

  /**
   * What's playing, for the sound check: the file, streamed (its level, where that came from, whether it has sounded)
   * or decoded (its loop's points and level).
   */
  describe():
    | { name: MusicFile; kind: 'stream'; gain: number; from: LevelFrom; heard: boolean }
    | ({ name: MusicFile; kind: 'loop' } & FittedFile)
    | null {
    const c = this.current;
    if (!c) return null;
    if (c.kind === 'stream') {
      return { name: c.name, kind: 'stream', gain: c.stream.level, from: c.stream.from, heard: c.stream.heardAt !== null };
    }
    return { name: c.name, kind: 'loop', ...c.fit };
  }
}

/**
 * The music: a recorded file for a scene when the build has one (streamed, then decoded), nothing while it downloads
 * when it can't stream, the code-made music when the build has none or it can't be loaded.
 */
export class Music implements MusicPlayer {
  scene: MusicScene = 'none';
  private readonly synth: SynthMusic;
  readonly files: FileMusic;

  constructor(private readonly engine: MusicEngine) {
    this.synth = new SynthMusic(engine);
    this.files = new FileMusic(engine, {
      // The music's first bytes are in: the recorded effects' requests no longer hold it up.
      heard: () => engine.loadEffectFiles(),
      decode: (name) => this.load(name),
      // After the call that found it (a play() inside `pick`, say) has returned.
      failed: () => void Promise.resolve().then(() => this.sync(false)),
    });
    engine.onChange(() => this.sync(false));
    engine.onUnlock(() => this.unlocked());
  }

  get notes(): number {
    return this.synth.notes;
  }

  /** What is playing now: a file's name (streamed or decoded), the code-made music, or nothing. */
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
      // A stream pauses (with the context, while it doesn't run); a decoded loop fades out and plays again from the top.
      this.files.fadeOut();
      // The score is set only for a scene the build has no file for, also while the music is off (it waits by
      // itself): set for a scene with a file, it would start for a moment when the context runs, before this.
      this.synth.setScene(name ? 'none' : this.scene);
      return;
    }
    let playing = this.files.play(name);
    // A boss wave whose file can't play yet (no stream, not decoded): the match's plays on, or again, until it can.
    if (!playing && name === 'boss') {
      playing = this.files.play('match');
      if (playing && !this.files.failed.has('boss')) this.load('boss');
    }
    if (playing) {
      this.synth.setScene('none');
      // The boss's file is decoded once the match's is (the first boss wave is minutes away): one download at a time.
      if (playing === 'loop' && name === 'match' && !this.files.failed.has('boss')) this.load('boss');
      // A stream whose decode failed loops on (with the element's small gap); the decode is tried again next scene.
      if (playing === 'stream' && newScene && this.files.failed.has(name)) this.load(name);
      return;
    }
    // No stream (none in this browser, or it failed) and not decoded yet: what plays is the wrong scene's.
    this.files.fadeOut();
    // Silence while it downloads: the code-made music only once it couldn't be loaded, and nothing else plays.
    const failed = this.files.failed.has(name);
    this.synth.setScene(failed ? this.scene : 'none');
    // A file that failed is tried again on the next scene (back online, say), not on every change (offline, a loop).
    if (!failed || newScene) this.load(name);
  }

  /** Starts decoding `name` unless it's in or on its way; the music is picked again once it arrives or fails. */
  private load(name: MusicFile): void {
    if (!this.engine.ctx || !this.engine.files.music[name] || this.files.has(name)) return;
    void this.files.load(name).then(() => this.sync(false));
  }

  /**
   * The first tap (inside it, the context just created, before it runs): the scene's file starts streaming now, its
   * element played inside the tap as iOS needs; without a stream its decode's download starts. Muted or at 0%,
   * nothing: no element, no download.
   */
  private unlocked(): void {
    if (!this.engine.musicWanted) {
      this.engine.loadEffectFiles();
      return;
    }
    const name = musicFileFor(this.scene, this.engine.files.music);
    if (this.files.prime(name)) return;
    // Not streaming: nothing to wait for before the recorded effects (the decode's download goes first all the same).
    if (name) this.load(name);
    this.engine.loadEffectFiles();
  }
}
