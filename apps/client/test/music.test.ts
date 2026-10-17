// The music's rule for recorded files (docs/ART.md §13, docs/SOUND_FILES.md): silence while a listed file downloads,
// the code-made score only when the build has no file for the scene or the file can't be loaded, the files fetched as
// early as the page knows them, faded in, and the first tap answered by one koto pluck. A fake engine and fake Web
// Audio nodes stand in for the browser; `fetch` is stubbed, so every download is held until the test lets it arrive.

import type { Snapshot } from '@tdt/protocol';
import { createGame, snapshot } from '@tdt/sim';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayOptions } from '../src/audio/engine';
import { NO_FILES, type SoundFiles } from '../src/audio/files';
import { GameAudio, type SoundSink } from '../src/audio/gameAudio';
import { CUE, FILE_FADE_IN, Music, type MusicEngine } from '../src/audio/music';
import { lobbyTrack } from '../src/audio/score';
import { noteSample } from '../src/audio/sounds';

class FakeParam {
  readonly events: { type: 'set' | 'ramp' | 'target' | 'cancel'; v: number; t: number }[] = [];
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
  connect<T>(n: T): T {
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
  started: number[] = [];
  stopped: number[] = [];
  start(t: number): void {
    this.started.push(t);
  }
  stop(t: number): void {
    this.stopped.push(t);
  }
}

/** A second of a soft tone at 8 kHz: what a decoded music file looks like to `fitFile`. */
function toneBuffer(): AudioBuffer {
  const rate = 8000;
  const data = new Float32Array(rate);
  for (let i = 0; i < data.length; i++) data[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / rate);
  return { numberOfChannels: 1, sampleRate: rate, length: data.length, duration: 1, getChannelData: () => data } as unknown as AudioBuffer;
}

class FakeContext {
  currentTime = 10;
  state: AudioContextState = 'suspended';
  /** Decoding fails (the file isn't audio). */
  badAudio = false;
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];
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
  decodeAudioData(): Promise<AudioBuffer> {
    return this.badAudio ? Promise.reject(new Error('not audio')) : Promise.resolve(toneBuffer());
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
  /** Whether the bank's samples are baked yet (a sound asked for before is skipped). */
  baked = true;
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
    if (!this.running || !this.baked) return false;
    this.plays.push({ id, o });
    return true;
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
  changed(): void {
    for (const l of this.changes) l();
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

/** Lets the download → decode → pick chain run (promises only; the timers are fake). */
async function settle(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

const LOBBY: SoundFiles = { music: { lobby: '/music/lobby.mp3?v=1' }, sfx: {} };
const ALL: SoundFiles = { music: { lobby: '/music/lobby.mp3?v=1', match: '/music/match.mp3?v=2', boss: '/music/boss.mp3?v=3' }, sfx: {} };

let net: FakeNet;

beforeEach(() => {
  vi.useFakeTimers();
  net = new FakeNet();
  vi.stubGlobal('fetch', net.fetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A page with `files` on its first screen: the music set to the lobby, then the first tap, then the context running. */
function firstTap(files: SoundFiles, setup: (e: FakeEngine) => void = () => {}): { engine: FakeEngine; music: Music } {
  const engine = new FakeEngine(files);
  setup(engine);
  const music = new Music(engine);
  music.setScene('lobby');
  engine.unlock();
  return { engine, music };
}

describe('music while a recorded file downloads', () => {
  it('fetches the scene’s file inside the first tap, before the context runs', () => {
    const { engine } = firstTap(LOBBY);
    expect(engine.running).toBe(false);
    expect(net.names()).toEqual(['lobby']);
  });

  it('with a file listed and not loaded, schedules no score notes: silence until it arrives', async () => {
    const { engine, music } = firstTap(LOBBY);
    engine.run();
    await vi.advanceTimersByTimeAsync(5000);
    expect(music.notes).toBe(0);
    expect(music.source).toBe('none');
    // The context changing, the mix changing: still nothing, and no second download.
    engine.changed();
    expect(music.notes).toBe(0);
    expect(net.names()).toEqual(['lobby']);
    await net.arrive('lobby');
    expect(music.source).toBe('lobby');
    await vi.advanceTimersByTimeAsync(5000);
    expect(music.notes).toBe(0);
  });

  it('with no file listed, the score plays as before, from the first tap, with no download and no cue', async () => {
    const { engine, music } = firstTap(NO_FILES);
    engine.run();
    expect(music.notes).toBeGreaterThan(0);
    expect(music.source).toBe('code');
    await vi.advanceTimersByTimeAsync(3000);
    expect(net.requests).toHaveLength(0);
    expect(music.cues).toBe(0);
  });

  it('a failed download or decode starts the score; it tries again on the next scene, the score playing meanwhile', async () => {
    const { engine, music } = firstTap(LOBBY);
    engine.run();
    await net.arrive('lobby', false);
    expect(music.source).toBe('code');
    expect(music.notes).toBeGreaterThan(0);
    // Not again on every change (offline, that would be a loop of failing requests).
    engine.changed();
    engine.changed();
    expect(net.requests).toHaveLength(1);
    // The next scene: once more, the score carrying on while it comes; not audio this time.
    music.setScene('none');
    music.setScene('lobby');
    expect(net.requests).toHaveLength(2);
    expect(music.source).toBe('code');
    engine.fake.badAudio = true;
    await net.arrive('lobby');
    expect(music.source).toBe('code');
    // Back online and audio: the file takes over.
    engine.fake.badAudio = false;
    music.setScene('none');
    music.setScene('lobby');
    await net.arrive('lobby');
    expect(music.source).toBe('lobby');
  });

  it('fades the file in over about a second rather than cutting in', async () => {
    const { engine, music } = firstTap(LOBBY);
    engine.run();
    engine.fake.currentTime = 12;
    await net.arrive('lobby');
    const gain = music.files.current!.gain as unknown as FakeGain;
    expect(FILE_FADE_IN).toBe(1);
    expect(gain.gain.events).toEqual([
      { type: 'set', v: 0, t: 12 },
      { type: 'ramp', v: music.files.current!.fit.gain, t: 13 },
    ]);
    // Leaving mid-fade fades out from where it is, not from full level.
    gain.gain.value = 0.3;
    music.setScene('none');
    expect(gain.gain.events.slice(2)).toEqual([
      { type: 'cancel', v: 0, t: 12 },
      { type: 'set', v: 0.3, t: 12 },
      { type: 'target', v: 0, t: 12 },
    ]);
  });

  it('answers the first tap with one soft koto pluck once it’s baked, and nothing more until the file plays', async () => {
    const { engine, music } = firstTap(LOBBY, (e) => (e.baked = false));
    engine.run();
    await vi.advanceTimersByTimeAsync(120);
    expect(engine.plays).toHaveLength(0);
    engine.baked = true;
    await vi.advanceTimersByTimeAsync(60);
    const { id, rate } = noteSample('koto', CUE.note);
    expect(engine.plays.map((p) => p.id)).toEqual([id]);
    expect(engine.plays[0]!.o.rate).toBeCloseTo(rate, 6);
    expect(music.cues).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(engine.plays).toHaveLength(1);
    expect(music.notes).toBe(0);
    // At the lobby's level and room, so it sounds like the garden that follows.
    expect(CUE.gain).toBe(lobbyTrack().gain);
    expect(CUE.wet).toBe(lobbyTrack().wet);
  });

  it('muted or at 0%: no download on the first tap and no cue', async () => {
    for (const setup of [(e: FakeEngine) => (e.muted = true), (e: FakeEngine) => (e.music = 0)]) {
      net = new FakeNet();
      vi.stubGlobal('fetch', net.fetch);
      const { engine, music } = firstTap(LOBBY, setup);
      engine.run();
      await vi.advanceTimersByTimeAsync(3000);
      expect(net.requests).toHaveLength(0);
      expect(music.cues).toBe(0);
      expect(engine.plays).toHaveLength(0);
    }
  });
});

describe('music files across scenes', () => {
  /** The game's audio over the real music, as `gameView.ts` wires it. */
  function game(files: SoundFiles) {
    const engine = new FakeEngine(files);
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

  it('Play solo before the lobby’s file came: its download stops, the match’s starts at once, the boss’s after it', async () => {
    const { music, audio, view } = game(ALL);
    expect(net.names()).toEqual(['lobby']);
    // Play solo: the match is created; no snapshot yet.
    audio.matchStarting();
    expect(music.scene).toBe('build');
    expect(net.names()).toEqual(['lobby', 'match']);
    expect(net.request('lobby')!.signal!.aborted).toBe(true);
    // Frames before the first snapshot keep the match's scene.
    audio.frame(undefined, null, view, 16);
    expect(music.scene).toBe('build');
    audio.frame(buildSnapshot(), 'me', view, 32);
    expect(music.scene).toBe('build');
    expect(music.source).toBe('none');
    expect(music.notes).toBe(0);
    await net.arrive('match');
    // The scene that is current plays: the match's file, never the lobby's.
    expect(music.source).toBe('match');
    expect(music.files.ready.has('lobby')).toBe(false);
    // The boss's file is fetched only now, so it never shares the connection with the match's.
    expect(net.names()).toEqual(['lobby', 'match', 'boss']);
  });

  it('a file that arrives after the scene changed plays the scene that is current', async () => {
    const { engine, music } = firstTap(ALL);
    engine.run();
    music.setScene('build');
    await net.arrive('match');
    expect(music.source).toBe('match');
    // A boss wave before the boss's file is in: the match's carries on (no silence, no score), then the boss's.
    music.setScene('boss');
    expect(music.source).toBe('match');
    await net.arrive('boss');
    expect(music.source).toBe('boss');
    // Back to the lobby before its file is in: the boss's fades out, silence, then the lobby's.
    music.setScene('lobby');
    expect(music.source).toBe('none');
    expect(music.notes).toBe(0);
    await net.arrive('lobby');
    expect(music.source).toBe('lobby');
  });

  it('a match that never starts (the room closed, left before its snapshot): back to the lobby', () => {
    const { music, audio, view } = game(ALL);
    audio.matchStarting();
    expect(music.scene).toBe('build');
    audio.reset();
    audio.frame(undefined, null, view, 16);
    expect(music.scene).toBe('lobby');
  });
});
