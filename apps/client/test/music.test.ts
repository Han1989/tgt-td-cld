// The music's rule for recorded files (docs/ART.md §13, docs/SOUND_FILES.md): a scene's file starts streamed (an
// <audio> element played inside the first tap, then connected, fading in over 1.5 s at the loop's level), is decoded
// once the element holds the whole file, and the decoded loop takes over (at the element's loop point, or in a 0.5 s
// crossfade); without a stream, silence while the file downloads (P2-10); the code-made score, fading in, only when
// the build has no file for the scene or neither the stream nor the decode can play it. A fake engine, fake Web Audio
// nodes and a fake element stand in for the browser; `fetch` is stubbed, so every download is held until the test lets
// it arrive.

import type { Snapshot } from '@tdt/protocol';
import { createGame, snapshot } from '@tdt/sim';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayOptions } from '../src/audio/engine';
import { fitFile, MUSIC_TARGET_DB, NO_FILES, type SoundFiles } from '../src/audio/files';
import { GameAudio, type SoundSink } from '../src/audio/gameAudio';
import {
  CROSSFADE,
  DECODE_AFTER,
  FILE_FADE_IN,
  GAIN_KEY,
  LEAD,
  LOOP_WAIT,
  Music,
  SCORE_FADE_IN,
  SEAM,
  STREAM_GAIN,
  type MusicEngine,
} from '../src/audio/music';
import { lobbyTrack } from '../src/audio/score';

type ParamEvent = { type: 'set' | 'ramp' | 'target' | 'cancel'; v: number; t: number };

class FakeParam {
  readonly events: ParamEvent[] = [];
  constructor(public value: number) {}
  setValueAtTime(v: number, t: number): this {
    this.events.push({ type: 'set', v, t });
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.events.push({ type: 'ramp', v, t });
    return this;
  }
  setTargetAtTime(v: number, t: number): this {
    this.events.push({ type: 'target', v, t });
    return this;
  }
  cancelScheduledValues(t: number): this {
    this.events.push({ type: 'cancel', v: 0, t });
    return this;
  }
}

class FakeNode {
  readonly outs: unknown[] = [];
  connect<T>(n: T): T {
    this.outs.push(n);
    return n;
  }
  disconnect(): void {}
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

class FakeSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate = new FakeParam(1);
  started: { t: number; offset: number | undefined }[] = [];
  stopped: number[] = [];
  start(t: number, offset?: number): void {
    this.started.push({ t, offset });
  }
  stop(t: number): void {
    this.stopped.push(t);
  }
}

/** The <audio> element as the music uses it: `log` says what was done to it, in order. */
class FakeElement {
  src = '';
  preload = '';
  loop = false;
  currentTime = 0;
  duration = NaN;
  paused = true;
  /** The browser refuses to play it (iOS, outside a tap). */
  refuse = false;
  readonly log: string[] = [];
  private have = 0;
  private readonly listeners = new Map<string, (() => void)[]>();
  get buffered() {
    return { length: this.have > 0 ? 1 : 0, start: () => 0, end: () => this.have };
  }
  play(): Promise<void> {
    this.log.push(this.src ? 'play' : 'play (no source)');
    this.paused = false;
    return this.refuse ? Promise.reject(new DOMException('refused', 'NotAllowedError')) : Promise.resolve();
  }
  pause(): void {
    this.log.push('pause');
    this.paused = true;
  }
  load(): void {
    this.log.push('load');
  }
  removeAttribute(name: string): void {
    if (name !== 'src') return;
    this.src = '';
    this.have = 0;
    this.log.push('drop');
  }
  addEventListener(type: string, l: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), l]);
  }
  emit(type: string): void {
    for (const l of this.listeners.get(type) ?? []) l();
  }
  /** Its first bytes are in: it sounds. */
  sound(): void {
    this.emit('playing');
  }
  /** It holds the first `seconds` of a file `duration` long. */
  hold(seconds: number, duration: number): void {
    this.duration = duration;
    this.have = seconds;
    this.emit('progress');
  }
}

/** `seconds` of a soft tone at 8 kHz: what a decoded music file looks like to `fitFile`. */
function toneBuffer(seconds: number): AudioBuffer {
  const rate = 8000;
  const data = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < data.length; i++) data[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / rate);
  return { numberOfChannels: 1, sampleRate: rate, length: data.length, duration: seconds, getChannelData: () => data } as unknown as AudioBuffer;
}

class FakeContext {
  currentTime = 10;
  state: AudioContextState = 'suspended';
  /** Decoding fails (the file isn't audio). */
  badAudio = false;
  /** How long a decoded file is (s). */
  fileSeconds = 1;
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];
  /** Elements connected, and how much of the element's log there was then (iOS: play() inside the tap, then connect). */
  readonly connected: { el: FakeElement; after: number; node: FakeNode }[] = [];
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBufferSource(): FakeSource {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  createMediaElementSource(el: FakeElement): FakeNode {
    const node = new FakeNode();
    this.connected.push({ el, after: el.log.length, node });
    return node;
  }
  decodeAudioData(): Promise<AudioBuffer> {
    return this.badAudio ? Promise.reject(new Error('not audio')) : Promise.resolve(toneBuffer(this.fileSeconds));
  }
}

/** The engine as the music sees it: created on `unlock` (the first tap), running a moment later (`run`). */
class FakeEngine implements MusicEngine {
  ctx: AudioContext | null = null;
  musicBus: GainNode | null = null;
  musicSend: GainNode | null = null;
  running = false;
  muted = false;
  music = 0.5;
  /** Whether the browser makes <audio> elements (false: the decode alone, as before the streamed start). */
  streams = true;
  /** Every element asked for, in order. */
  readonly elements: FakeElement[] = [];
  readonly plays: { id: string; o: PlayOptions }[] = [];
  private readonly changes: (() => void)[] = [];
  private readonly unlocks: (() => void)[] = [];

  constructor(readonly files: SoundFiles) {}

  get fake(): FakeContext {
    return this.ctx as unknown as FakeContext;
  }
  get musicWanted(): boolean {
    return !this.muted && this.music > 0;
  }
  get musicOn(): boolean {
    return this.running && this.musicWanted;
  }
  onChange(listener: () => void): void {
    this.changes.push(listener);
  }
  onUnlock(listener: () => void): void {
    this.unlocks.push(listener);
  }
  play(id: string, o: PlayOptions = {}): boolean {
    if (!this.running) return false;
    this.plays.push({ id, o });
    return true;
  }
  /** Times the music let the recorded effects load. */
  effectFiles = 0;
  loadEffectFiles(): void {
    this.effectFiles++;
  }
  audioElement(): HTMLAudioElement | null {
    if (!this.streams) return null;
    const el = new FakeElement();
    this.elements.push(el);
    return el as unknown as HTMLAudioElement;
  }
  unlock(): void {
    const ctx = new FakeContext();
    this.ctx = ctx as unknown as AudioContext;
    this.musicBus = ctx.createGain() as unknown as GainNode;
    this.musicSend = ctx.createGain() as unknown as GainNode;
    for (const l of this.unlocks) l();
  }
  run(): void {
    this.running = true;
    this.fake.state = 'running';
    this.changed();
  }
  /** The page goes to the background: the context is suspended. */
  suspend(): void {
    this.running = false;
    this.fake.state = 'suspended';
    this.changed();
  }
  changed(): void {
    for (const l of this.changes) l();
  }
  /** The element made for `url`'s file (the order the music made them in: lobby, match, boss). */
  element(name: 'lobby' | 'match' | 'boss'): FakeElement {
    const listed = (['lobby', 'match', 'boss'] as const).filter((n) => this.files.music[n]);
    return this.elements[listed.indexOf(name)]!;
  }
}

/** The network: every request waits until the test lets it arrive (or fail); an aborted one rejects. */
class FakeNet {
  readonly requests: { url: string; signal: AbortSignal | undefined; settle: (ok: boolean) => void; done: boolean }[] = [];
  readonly fetch = (url: string, init?: RequestInit): Promise<Response> =>
    new Promise<Response>((resolve, reject) => {
      const signal = init?.signal ?? undefined;
      const req = {
        url,
        signal,
        done: false,
        settle: (ok: boolean) => {
          req.done = true;
          if (ok) resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as Response);
          else reject(new TypeError('Failed to fetch'));
        },
      };
      signal?.addEventListener('abort', () => {
        req.done = true;
        reject(new DOMException('aborted', 'AbortError'));
      });
      this.requests.push(req);
    });
  /** The files asked for, in order. */
  names(): string[] {
    return this.requests.map((r) => /\/music\/(\w+)\.mp3/.exec(r.url)![1]!);
  }
  request(name: string) {
    return [...this.requests].reverse().find((r) => r.url.includes(`/music/${name}.mp3`));
  }
  async arrive(name: string, ok = true): Promise<void> {
    const r = this.request(name);
    if (!r || r.done) throw new Error(`no open request for ${name}`);
    r.settle(ok);
    await settle();
  }
}

/** localStorage, for the last decode's level. */
class FakeStorage {
  private readonly m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
}

/** Lets the download → decode → pick chain run (promises only; the timers are fake). */
async function settle(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

const LOBBY_URL = '/music/lobby.mp3?v=1';
const LOBBY: SoundFiles = { music: { lobby: LOBBY_URL }, sfx: {}, gains: { lobby: 0.9 } };
const UNMEASURED: SoundFiles = { music: { lobby: LOBBY_URL }, sfx: {}, gains: {} };
const ALL: SoundFiles = {
  music: { lobby: LOBBY_URL, match: '/music/match.mp3?v=2', boss: '/music/boss.mp3?v=3' },
  sfx: {},
  gains: { lobby: 0.9, match: 0.8, boss: 1.1 },
};

/** What `fitFile` makes of the fake decode (`toneBuffer`). */
function fitted(seconds: number) {
  const b = toneBuffer(seconds);
  return fitFile([b.getChannelData(0)], b.sampleRate, MUSIC_TARGET_DB);
}

let net: FakeNet;
let storage: FakeStorage;

beforeEach(() => {
  vi.useFakeTimers();
  net = new FakeNet();
  storage = new FakeStorage();
  vi.stubGlobal('fetch', net.fetch);
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A page with `files` on its first screen: the music set to the lobby, then the first tap (the context not running yet). */
function firstTap(files: SoundFiles, setup: (e: FakeEngine) => void = () => {}): { engine: FakeEngine; music: Music } {
  const engine = new FakeEngine(files);
  setup(engine);
  const music = new Music(engine);
  music.setScene('lobby');
  engine.unlock();
  return { engine, music };
}

/** The gain a stream plays through: the one its element's node connects to. */
function streamGain(engine: FakeEngine, el: FakeElement): FakeGain {
  return engine.fake.connected.find((c) => c.el === el)!.node.outs[0] as FakeGain;
}

/** The first tap, the context running and the lobby's element sounding at context time `at`. */
function sounding(files: SoundFiles, at = 10, setup?: (e: FakeEngine) => void) {
  const { engine, music } = firstTap(files, setup);
  engine.run();
  engine.fake.currentTime = at;
  const el = engine.element('lobby');
  el.sound();
  return { engine, music, el, gain: streamGain(engine, el) };
}

describe('the streamed start', () => {
  it('plays the scene’s element inside the first tap, then connects it, before the context runs; nothing is downloaded for a decode yet', () => {
    const { engine, music } = firstTap(LOBBY);
    expect(engine.running).toBe(false);
    const el = engine.element('lobby');
    expect(el).toMatchObject({ src: LOBBY_URL, preload: 'auto', loop: true, paused: false });
    expect(el.log).toEqual(['play']);
    // iOS: play() inside the tap, then the connection to the music bus.
    expect(engine.fake.connected).toEqual([expect.objectContaining({ el, after: 1 })]);
    expect(music.source).toBe('lobby');
    expect(music.files.describe()).toEqual({ name: 'lobby', kind: 'stream', gain: 0.9, from: 'measured', heard: false });
    expect(music.files.streamed).toEqual(['lobby']);
    expect(net.requests).toHaveLength(0);
    // The recorded effects wait for the music's first bytes: their requests would hold the stream up.
    expect(engine.effectFiles).toBe(0);
    engine.run();
    el.sound();
    expect(engine.effectFiles).toBe(1);
  });

  it('lets the recorded effects load at once when the scene isn’t streaming or the music is off', () => {
    expect(firstTap(LOBBY, (e) => (e.streams = false)).engine.effectFiles).toBe(1);
    expect(firstTap(LOBBY, (e) => (e.muted = true)).engine.effectFiles).toBe(1);
  });

  it('gives the other files’ elements a play inside the tap with no source, then a pause, so iOS lets them play later', () => {
    const { engine } = firstTap(ALL);
    expect(engine.elements).toHaveLength(3);
    for (const name of ['match', 'boss'] as const) {
      const el = engine.element(name);
      expect(el.log).toEqual(['play (no source)', 'pause']);
      expect(el.src).toBe('');
    }
    expect(engine.fake.connected.map((c) => c.el)).toEqual([engine.element('lobby')]);
  });

  it('fades in over 1.5 s from the moment it sounds, at the file’s measured level; no score, no cue', async () => {
    const { engine, music, gain } = sounding(LOBBY, 12);
    expect(FILE_FADE_IN).toBe(1.5);
    expect(gain.gain.events).toEqual([
      { type: 'cancel', v: 0, t: 12 },
      { type: 'set', v: 0, t: 12 },
      { type: 'ramp', v: 0.9, t: 13.5 },
    ]);
    // Silent until then: the gain starts at 0.
    expect(gain.gain.value).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(music.notes).toBe(0);
    expect(engine.plays).toHaveLength(0);
    // A stall and its 'playing' again carry on at its level.
    engine.element('lobby').sound();
    expect(gain.gain.events).toHaveLength(3);
  });

  it('without a measure, at the last decode’s level (kept per file URL), else at a default a little under the loops', async () => {
    let page = sounding(UNMEASURED);
    expect(page.music.files.describe()).toMatchObject({ gain: STREAM_GAIN, from: 'default' });
    page.el.hold(1, 1);
    await net.arrive('lobby');
    const level = fitted(1).gain;
    expect(JSON.parse(storage.getItem(GAIN_KEY)!)).toEqual({ [LOBBY_URL]: level });
    // The next visit's stream starts at that level.
    page = sounding(UNMEASURED);
    expect(page.music.files.describe()).toMatchObject({ gain: level, from: 'remembered' });
    expect(page.gain.gain.events.at(-1)).toEqual({ type: 'ramp', v: level, t: 10 + FILE_FADE_IN });
    // A new upload (another URL) starts from the default again, and the old file's level is dropped once it decodes.
    const next: SoundFiles = { music: { lobby: '/music/lobby.mp3?v=2' }, sfx: {}, gains: {} };
    page = sounding(next);
    expect(page.music.files.describe()).toMatchObject({ from: 'default' });
    page.el.hold(1, 1);
    await net.arrive('lobby');
    expect(Object.keys(JSON.parse(storage.getItem(GAIN_KEY)!))).toEqual(['/music/lobby.mp3?v=2']);
  });

  it('decodes once the element holds the whole file (the browser then answers from its cache), not before', async () => {
    const { music, el } = sounding(LOBBY);
    el.hold(60, 170);
    expect(net.requests).toHaveLength(0);
    el.hold(170, 170);
    expect(net.names()).toEqual(['lobby']);
    expect(music.files.fetched).toEqual(['lobby']);
    // Once.
    el.hold(170, 170);
    el.emit('canplaythrough');
    expect(net.requests).toHaveLength(1);
  });

  it('not when the browser pauses the element’s download short of the end (an unfinished download can’t answer it)', () => {
    const { el } = sounding(LOBBY);
    el.hold(40, 170);
    el.emit('suspend');
    expect(net.requests).toHaveLength(0);
  });

  it(`decodes after ${DECODE_AFTER} s of streaming when the element says neither`, async () => {
    sounding(LOBBY);
    await vi.advanceTimersByTimeAsync((DECODE_AFTER - 1) * 1000);
    expect(net.requests).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(net.names()).toEqual(['lobby']);
  });

  it(`takes over at the element’s loop point when it is under ${LOOP_WAIT} s away: the loop from the top, the element cut, then let go`, async () => {
    const { engine, music, el, gain } = sounding(LOBBY, 10);
    el.hold(1, 1);
    engine.fake.currentTime = 20;
    el.currentTime = 0.4;
    await net.arrive('lobby');
    const fit = fitted(1);
    const at = 20 + (fit.end - 0.4);
    const loop = engine.fake.sources.at(-1)!;
    expect(loop).toMatchObject({ loop: true, loopStart: fit.start, loopEnd: fit.end });
    expect(loop.started).toHaveLength(1);
    expect(loop.started[0]!.t).toBeCloseTo(at, 9);
    expect(loop.started[0]!.offset).toBe(fit.start);
    // Straight on at full level (the fade-in long done), no fade of its own.
    const loopGain = loop.outs[0] as FakeGain;
    expect(loopGain.gain.events).toEqual([{ type: 'set', v: fit.gain, t: at }]);
    // The element plays to the end of the music and is cut in the encoder's silence.
    expect(gain.gain.events.slice(3)).toEqual([
      { type: 'cancel', v: 0, t: 20 },
      { type: 'set', v: 0.9, t: 20 },
      { type: 'ramp', v: 0.9, t: at },
      { type: 'ramp', v: 0, t: at + SEAM },
    ]);
    expect(music.files.describe()).toMatchObject({ name: 'lobby', kind: 'loop' });
    expect(el.log).toEqual(['play']);
    // Then it lets go of its file (the download and the memory).
    await vi.advanceTimersByTimeAsync((at + SEAM - 20 + 0.2) * 1000);
    expect(el.log).toEqual(['play', 'pause', 'drop', 'load']);
  });

  it(`takes over in a ${CROSSFADE} s crossfade at the element’s position when the loop point is far`, async () => {
    const { engine, el, gain } = sounding(LOBBY, 10);
    engine.fake.fileSeconds = 60;
    el.hold(60, 60);
    engine.fake.currentTime = 25;
    el.currentTime = 5;
    await net.arrive('lobby');
    const fit = fitted(60);
    const at = 25 + LEAD;
    const loop = engine.fake.sources.at(-1)!;
    expect(loop.started[0]!.t).toBeCloseTo(at, 9);
    expect(loop.started[0]!.offset).toBeCloseTo(5 + LEAD, 9);
    expect((loop.outs[0] as FakeGain).gain.events).toEqual([
      { type: 'set', v: 0, t: at },
      { type: 'ramp', v: fit.gain, t: at + CROSSFADE },
    ]);
    expect(gain.gain.events.slice(3)).toEqual([
      { type: 'cancel', v: 0, t: 25 },
      { type: 'set', v: 0.9, t: 25 },
      { type: 'ramp', v: 0.9, t: at },
      { type: 'ramp', v: 0, t: at + CROSSFADE },
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(el.log).toEqual(['play', 'pause', 'drop', 'load']);
  });

  it('a takeover during the stream’s fade-in finishes it: both ramps end where the fade-in would have', async () => {
    const { engine, el, gain } = sounding(LOBBY, 20);
    engine.fake.fileSeconds = 60;
    el.hold(60, 60);
    engine.fake.currentTime = 20.5;
    el.currentTime = 0.5;
    await net.arrive('lobby');
    const fit = fitted(60);
    const at = 20.5 + LEAD;
    const fadeEnd = 20 + FILE_FADE_IN;
    expect(gain.gain.events.slice(3)).toEqual([
      { type: 'cancel', v: 0, t: 20.5 },
      { type: 'set', v: expect.closeTo((0.9 * 0.5) / FILE_FADE_IN, 9), t: 20.5 },
      { type: 'ramp', v: expect.closeTo((0.9 * (0.5 + LEAD)) / FILE_FADE_IN, 9), t: at },
      { type: 'ramp', v: 0, t: fadeEnd },
    ]);
    expect((engine.fake.sources.at(-1)!.outs[0] as FakeGain).gain.events).toEqual([
      { type: 'set', v: 0, t: at },
      { type: 'ramp', v: fit.gain, t: fadeEnd },
    ]);
  });

  it('a file decoded before its element sounded (in the cache): the element goes, the loop fades in from the top', async () => {
    const { engine, music } = firstTap(LOBBY);
    engine.run();
    engine.fake.currentTime = 11;
    const el = engine.element('lobby');
    el.hold(1, 1);
    await net.arrive('lobby');
    const fit = fitted(1);
    const loop = engine.fake.sources.at(-1)!;
    expect(loop.started).toEqual([{ t: 11, offset: fit.start }]);
    expect((loop.outs[0] as FakeGain).gain.events).toEqual([
      { type: 'set', v: 0, t: 11 },
      { type: 'ramp', v: fit.gain, t: 11 + FILE_FADE_IN },
    ]);
    expect(music.files.describe()).toMatchObject({ kind: 'loop' });
    await vi.advanceTimersByTimeAsync(1100);
    expect(el.log).toEqual(['play', 'pause', 'drop', 'load']);
  });

  it('a decode that fails leaves the stream looping; it is tried again on the next scene', async () => {
    const { music, el } = sounding(LOBBY, 10);
    el.hold(1, 1);
    await net.arrive('lobby', false);
    expect(music.files.describe()).toMatchObject({ name: 'lobby', kind: 'stream' });
    expect(music.notes).toBe(0);
    music.setScene('none');
    music.setScene('lobby');
    // Its element let go of the file between the scenes, and holds it again.
    el.hold(1, 1);
    expect(net.names()).toEqual(['lobby', 'lobby']);
    await net.arrive('lobby');
    expect(music.files.describe()).toMatchObject({ name: 'lobby', kind: 'loop' });
  });

  it('pauses the element with the context (the page in the background) and plays it on with it, fading in again', () => {
    const { engine, el, gain } = sounding(LOBBY, 10);
    engine.fake.currentTime = 15;
    engine.suspend();
    // At once: a suspended context can't play a fade.
    expect(el.log).toEqual(['play', 'pause']);
    engine.fake.currentTime = 16;
    engine.run();
    expect(el.log).toEqual(['play', 'pause', 'play']);
    gain.gain.value = 0;
    el.sound();
    expect(gain.gain.events.slice(-2)).toEqual([
      { type: 'set', v: 0, t: 16 },
      { type: 'ramp', v: 0.9, t: 16 + FILE_FADE_IN },
    ]);
  });

  it('muted or at 0%: no element is made, nothing is downloaded, nothing plays', async () => {
    for (const setup of [(e: FakeEngine) => (e.muted = true), (e: FakeEngine) => (e.music = 0)]) {
      net = new FakeNet();
      vi.stubGlobal('fetch', net.fetch);
      const { engine, music } = firstTap(ALL, setup);
      engine.run();
      await vi.advanceTimersByTimeAsync(DECODE_AFTER * 1000 + 1000);
      expect(engine.elements).toHaveLength(0);
      expect(net.requests).toHaveLength(0);
      expect(music.source).toBe('none');
      expect(engine.plays).toHaveLength(0);
    }
  });

  it('muted while it streams: it fades out and pauses', async () => {
    const { engine, el, gain } = sounding(LOBBY, 10);
    engine.fake.currentTime = 14;
    engine.muted = true;
    engine.changed();
    expect(gain.gain.events.slice(-1)).toEqual([{ type: 'target', v: 0, t: 14 }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(el.log).toEqual(['play', 'pause']);
  });
});

describe('the fallbacks', () => {
  /** The score's track gain: the one that ramps up to the track's level. */
  const scoreGain = (engine: FakeEngine, level: number) =>
    engine.fake.gains.find((g) => g.gain.events.some((e) => e.type === 'ramp' && e.v === level))!;

  it('no file listed: the score plays from the first tap, fading in over 1.5 s; no element, no download', async () => {
    const { engine, music } = firstTap(NO_FILES);
    engine.fake.currentTime = 12;
    engine.run();
    expect(music.notes).toBeGreaterThan(0);
    expect(music.source).toBe('code');
    expect(SCORE_FADE_IN).toBe(1.5);
    expect(scoreGain(engine, lobbyTrack().gain).gain.events).toEqual([
      { type: 'set', v: 0, t: 12 },
      { type: 'ramp', v: lobbyTrack().gain, t: 12 + SCORE_FADE_IN },
    ]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(engine.elements).toHaveLength(0);
    expect(net.requests).toHaveLength(0);
  });

  it('the element errors: its decode starts at once and there is silence until the decoded loop fades in', async () => {
    const { engine, music, el } = sounding(LOBBY, 10);
    el.emit('error');
    await settle();
    expect(net.names()).toEqual(['lobby']);
    expect(music.source).toBe('none');
    expect(music.notes).toBe(0);
    engine.fake.currentTime = 13;
    await net.arrive('lobby');
    const fit = fitted(1);
    expect(music.files.describe()).toMatchObject({ kind: 'loop' });
    expect((engine.fake.sources.at(-1)!.outs[0] as FakeGain).gain.events).toEqual([
      { type: 'set', v: 0, t: 13 },
      { type: 'ramp', v: fit.gain, t: 13 + FILE_FADE_IN },
    ]);
    expect(music.notes).toBe(0);
  });

  it('the browser refuses to play the element: the same, from the decode', async () => {
    const { engine, music } = firstTap(LOBBY, (e) => (e.audioElement = () => Object.assign(new FakeElement(), { refuse: true }) as unknown as HTMLAudioElement));
    engine.run();
    await settle();
    expect(music.source).toBe('none');
    expect(net.names()).toEqual(['lobby']);
    await net.arrive('lobby');
    expect(music.files.describe()).toMatchObject({ kind: 'loop' });
  });

  it('the element errors and the decode fails too: the code-made score, fading in', async () => {
    const { engine, music, el } = sounding(LOBBY, 10);
    el.emit('error');
    await settle();
    engine.fake.currentTime = 14;
    await net.arrive('lobby', false);
    expect(music.source).toBe('code');
    expect(music.notes).toBeGreaterThan(0);
    expect(scoreGain(engine, lobbyTrack().gain).gain.events).toEqual([
      { type: 'set', v: 0, t: 14 },
      { type: 'ramp', v: lobbyTrack().gain, t: 14 + SCORE_FADE_IN },
    ]);
  });

  describe('a browser with no <audio> element: silence while the file downloads (P2-10)', () => {
    const noStreams = (e: FakeEngine) => (e.streams = false);

    it('fetches the scene’s file inside the first tap, before the context runs', () => {
      const { engine } = firstTap(LOBBY, noStreams);
      expect(engine.running).toBe(false);
      expect(net.names()).toEqual(['lobby']);
    });

    it('schedules no score notes while it downloads; the file fades in when it arrives', async () => {
      const { engine, music } = firstTap(LOBBY, noStreams);
      engine.run();
      await vi.advanceTimersByTimeAsync(5000);
      expect(music.notes).toBe(0);
      expect(music.source).toBe('none');
      engine.changed();
      expect(net.names()).toEqual(['lobby']);
      await net.arrive('lobby');
      expect(music.source).toBe('lobby');
      await vi.advanceTimersByTimeAsync(5000);
      expect(music.notes).toBe(0);
    });

    it('a failed download or decode starts the score; it tries again on the next scene, the score playing meanwhile', async () => {
      const { engine, music } = firstTap(LOBBY, noStreams);
      engine.run();
      await net.arrive('lobby', false);
      expect(music.source).toBe('code');
      expect(music.notes).toBeGreaterThan(0);
      // Not again on every change (offline, that would be a loop of failing requests).
      engine.changed();
      engine.changed();
      expect(net.requests).toHaveLength(1);
      music.setScene('none');
      music.setScene('lobby');
      expect(net.requests).toHaveLength(2);
      expect(music.source).toBe('code');
      engine.fake.badAudio = true;
      await net.arrive('lobby');
      expect(music.source).toBe('code');
      engine.fake.badAudio = false;
      music.setScene('none');
      music.setScene('lobby');
      await net.arrive('lobby');
      expect(music.source).toBe('lobby');
    });

    it('leaving mid-fade fades out from where it is, not from full level', async () => {
      const { engine, music } = firstTap(LOBBY, noStreams);
      engine.run();
      engine.fake.currentTime = 12;
      await net.arrive('lobby');
      const gain = music.files.current!.gain as unknown as FakeGain;
      gain.gain.value = 0.3;
      music.setScene('none');
      expect(gain.gain.events.slice(2)).toEqual([
        { type: 'cancel', v: 0, t: 12 },
        { type: 'set', v: 0.3, t: 12 },
        { type: 'target', v: 0, t: 12 },
      ]);
    });
  });
});

describe('music files across scenes', () => {
  /** The game's audio over the real music, as `gameView.ts` wires it. */
  function game(files: SoundFiles, setup: (e: FakeEngine) => void = () => {}) {
    const engine = new FakeEngine(files);
    setup(engine);
    const music = new Music(engine);
    const sink: SoundSink = { sfxOn: false, play: () => false };
    const audio = new GameAudio(sink, music);
    const view = { left: 0, top: 0, right: 26, bottom: 50 };
    audio.frame(undefined, null, view, 0);
    engine.unlock();
    engine.run();
    return { engine, music, audio, view };
  }

  function buildSnapshot(): Snapshot {
    return snapshot(createGame({ players: [{ id: 'me', name: 'Me', hero: 'ranger' }] }, 1));
  }

  it('Play solo while the lobby streams: the lobby’s element fades out and lets go, the match’s streams at once', async () => {
    const { engine, music, audio, view } = game(ALL);
    const lobby = engine.element('lobby');
    lobby.sound();
    audio.matchStarting();
    expect(music.scene).toBe('build');
    const match = engine.element('match');
    expect(match.log).toEqual(['play (no source)', 'pause', 'play']);
    expect(match.src).toBe('/music/match.mp3?v=2');
    expect(music.files.describe()).toEqual({ name: 'match', kind: 'stream', gain: 0.8, from: 'measured', heard: false });
    expect(music.files.streamed).toEqual(['lobby', 'match']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(lobby.log).toEqual(['play', 'pause', 'drop', 'load']);
    // Frames before the first snapshot keep the match's scene.
    audio.frame(undefined, null, view, 16);
    audio.frame(buildSnapshot(), 'me', view, 32);
    expect(music.scene).toBe('build');
    expect(music.notes).toBe(0);
    // The match's decode once its element holds the file; the boss's only after that, one download at a time.
    expect(net.requests).toHaveLength(0);
    match.hold(1, 1);
    expect(net.names()).toEqual(['match']);
    await net.arrive('match');
    expect(music.files.describe()).toMatchObject({ name: 'match', kind: 'loop' });
    expect(net.names()).toEqual(['match', 'boss']);
  });

  it('a boss wave: the boss’s decoded loop when it is in, else its stream; its stream failing keeps the match’s on', async () => {
    const { engine, music } = firstTap(ALL);
    engine.run();
    music.setScene('build');
    engine.element('match').hold(1, 1);
    await net.arrive('match');
    expect(music.source).toBe('match');
    // Not decoded yet: the boss's element streams (it was blessed in the first tap, so it may play now).
    music.setScene('boss');
    expect(music.files.describe()).toMatchObject({ name: 'boss', kind: 'stream' });
    expect(engine.element('boss').log).toEqual(['play (no source)', 'pause', 'play']);
    await net.arrive('boss');
    expect(music.files.describe()).toMatchObject({ name: 'boss', kind: 'loop' });
    // Back to waves, then a boss wave whose file is in: straight to its loop.
    music.setScene('waves');
    expect(music.files.describe()).toMatchObject({ name: 'match', kind: 'loop' });
    music.setScene('boss');
    expect(music.files.describe()).toMatchObject({ name: 'boss', kind: 'loop' });
  });

  it('a boss wave whose stream can’t play and whose file isn’t in: the match’s carries on, then the boss’s', async () => {
    const { engine, music } = firstTap(ALL);
    engine.run();
    music.setScene('build');
    engine.element('match').hold(1, 1);
    await net.arrive('match');
    engine.element('boss').refuse = true;
    music.setScene('boss');
    await settle();
    expect(music.files.describe()).toMatchObject({ name: 'match', kind: 'loop' });
    expect(music.notes).toBe(0);
    await net.arrive('boss');
    expect(music.files.describe()).toMatchObject({ name: 'boss', kind: 'loop' });
  });

  it('back to the lobby: its element streams again (its decode was let go to save memory)', async () => {
    const { engine, music } = firstTap(ALL);
    engine.run();
    const lobby = engine.element('lobby');
    lobby.hold(1, 1);
    await net.arrive('lobby');
    expect(music.files.describe()).toMatchObject({ name: 'lobby', kind: 'loop' });
    music.setScene('build');
    expect(music.files.ready.has('lobby')).toBe(false);
    music.setScene('lobby');
    expect(music.files.describe()).toMatchObject({ name: 'lobby', kind: 'stream' });
    expect(lobby.src).toBe(LOBBY_URL);
  });

  it('a match that never starts (the room closed, left before its snapshot): back to the lobby', () => {
    const { music, audio, view } = game(ALL);
    audio.matchStarting();
    expect(music.scene).toBe('build');
    audio.reset();
    audio.frame(undefined, null, view, 16);
    expect(music.scene).toBe('lobby');
  });

  it('without streams: Play solo before the lobby’s file came stops its download; the match’s starts at once, the boss’s after it', async () => {
    const { music, audio, view } = game(ALL, (e) => (e.streams = false));
    expect(net.names()).toEqual(['lobby']);
    audio.matchStarting();
    expect(net.names()).toEqual(['lobby', 'match']);
    expect(net.request('lobby')!.signal!.aborted).toBe(true);
    audio.frame(buildSnapshot(), 'me', view, 32);
    expect(music.source).toBe('none');
    expect(music.notes).toBe(0);
    await net.arrive('match');
    expect(music.source).toBe('match');
    expect(music.files.ready.has('lobby')).toBe(false);
    expect(net.names()).toEqual(['lobby', 'match', 'boss']);
  });
});
