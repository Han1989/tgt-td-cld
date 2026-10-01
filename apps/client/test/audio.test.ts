import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { HERO_KINDS, TOWER_KINDS, type GameEvent, type Snapshot } from '@tdt/protocol';
import { applyCommand, createGame, snapshot, TUNING } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import { END_QUIET_MS, GameAudio, isBossWave, musicScene, type SoundPlay, type SoundSink } from '../src/audio/gameAudio';
import {
  fitFile,
  levelGain,
  loudness,
  MAX_ADJUST_DB,
  MUSIC_FILES,
  MUSIC_TARGET_DB,
  musicFileFor,
  soundFiles,
  trimSilence,
} from '../src/audio/files';
import { HEAR_MARGIN, OTHERS_GAIN, placement, TAKE_DELAY, TAKE_GAIN_DB, Takes, VOICE_CAPS, VoiceGate, type ViewBox } from '../src/audio/mix';
import {
  humanize,
  lobbyTrack,
  matchTrack,
  mixdown,
  SCENE_LAYERS,
  SCENE_TRACK,
  stepSeconds,
  STEPS_PER_BAR,
  type MusicScene,
  type Note,
  type Track,
} from '../src/audio/score';
import { allSynthDefs, INSTRUMENTS, noteSample, SOUND_IDS, SOUNDS, variantId, type Instrument } from '../src/audio/sounds';
import { BAKE_RATE, MAX_SECONDS, midiHz, PEAK, renderSound, rms, roomImpulse, soundSeconds, varyDef } from '../src/audio/synth';
import { isMediaPath, MEDIA_CACHE, swSource } from '../src/platform/swSource';

/** How bright a sound is: RMS of its first difference over its RMS (a sine at f Hz gives 2·sin(π·f / rate)). */
function brightness(s: Float32Array): number {
  let d = 0;
  for (let i = 1; i < s.length; i++) d += (s[i]! - s[i - 1]!) ** 2;
  return Math.sqrt(d / s.length) / Math.max(1e-9, rms(s));
}

describe('synth and sound bank', () => {
  const defs = allSynthDefs();
  const baked = new Map<string, Float32Array>();
  const bake = (id: string) => {
    let s = baked.get(id);
    if (!s) {
      const job = defs.get(id)!;
      baked.set(id, (s = renderSound(job.def, BAKE_RATE, job.seed)));
    }
    return s;
  };

  it('renders every sound, variant and instrument: finite, normalised, audible, short, deterministic', () => {
    const t0 = performance.now();
    for (const id of defs.keys()) bake(id);
    const ms = performance.now() - t0;
    console.log(`Baked ${defs.size} sounds in ${ms.toFixed(0)} ms (Node, ${BAKE_RATE} Hz)`);
    // The whole bank bakes in about a second (in a worker in the browser, the lobby's instruments first).
    expect(ms).toBeLessThan(2500);
    for (const [id, { def }] of defs) {
      const s = bake(id);
      expect(s.length, id).toBe(Math.ceil(soundSeconds(def) * BAKE_RATE));
      expect(soundSeconds(def), id).toBeLessThanOrEqual(MAX_SECONDS);
      let peak = 0;
      let finite = true;
      for (const v of s) {
        finite &&= Number.isFinite(v);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(finite, id).toBe(true);
      expect(peak, id).toBeCloseTo(PEAK, 2);
      expect(rms(s), id).toBeGreaterThan(0.01);
      // Ends without a click.
      expect(Math.abs(s[s.length - 1]!), id).toBeLessThan(0.01);
    }
    const job = defs.get('death')!;
    expect(renderSound(job.def, BAKE_RATE, job.seed)).toEqual(bake('death'));
  });

  it('nothing is harsh: every sound is soft (little energy up high)', () => {
    for (const id of defs.keys()) {
      // 0.9 ≈ a pure sine at 3.5 kHz: strings, drums, gongs and steel sit below it, raw noise or a square wave far above.
      expect(brightness(bake(id)), id).toBeLessThan(0.9);
    }
    const harsh = renderSound({ layers: [{ wave: 'noise', freq: 0, decay: 0.2, gain: 1 }] });
    expect(brightness(harsh)).toBeGreaterThan(1);
  });

  it('bakes each effect in several variants, all different, so repeats never sound identical', () => {
    for (const id of SOUND_IDS) {
      const n = SOUNDS[id].variants;
      expect(n, id).toBeGreaterThanOrEqual(1);
      for (let k = 0; k < n; k++) expect(defs.has(variantId(id, k)), id).toBe(true);
      expect(defs.has(variantId(id, n)), id).toBe(false);
    }
    // Frequent sounds get the most.
    expect(SOUNDS.death.variants).toBeGreaterThanOrEqual(4);
    expect(SOUNDS['shot.arrow'].variants).toBeGreaterThanOrEqual(4);
    const a = bake('death');
    const b = bake(variantId('death', 1));
    const c = bake(variantId('death', 2));
    expect(b).not.toEqual(a);
    expect(c).not.toEqual(b);
    // …but still the same sound: about as long and as loud.
    expect(Math.abs(b.length - a.length) / a.length).toBeLessThan(0.15);
    expect(Math.abs(20 * Math.log10(rms(b) / rms(a)))).toBeLessThan(3);
    // Variants move each layer a few ms, never the first one.
    const v = varyDef(SOUNDS.victory.def, 3);
    expect(v.layers[0]!.at ?? 0).toBe(SOUNDS.victory.def.layers[0]!.at ?? 0);
    expect(v.layers.some((l, i) => Math.abs((l.at ?? 0) - (SOUNDS.victory.def.layers[i]!.at ?? 0)) > 0.001)).toBe(true);
    expect(varyDef(SOUNDS.victory.def, 0)).toBe(SOUNDS.victory.def);
  });

  it('plucks strings in tune (Karplus-Strong with a fractional delay), and bends them', () => {
    for (const note of [45, 57, 69, 81]) {
      const f = midiHz(note);
      const s = renderSound({ layers: [{ wave: 'pluck', freq: f, decay: 1.5, gain: 1, pluck: { bright: 0.6, damp: 0.3 } }] });
      expect(pitchOf(s.subarray(2400, 14_400), BAKE_RATE) / f, `note ${note}`).toBeCloseTo(1, 2);
    }
    const bent = renderSound({ layers: [{ wave: 'pluck', freq: 220, glide: 1.12, glideTime: 0.1, glideAt: 0.2, decay: 1.2, gain: 1 }] });
    expect(pitchOf(bent.subarray(0, 4000), BAKE_RATE)).toBeCloseTo(220, -1);
    expect(pitchOf(bent.subarray(9000, 16_000), BAKE_RATE)).toBeGreaterThan(240);
  });

  it('drums drop in pitch as the skin relaxes; gongs bloom: their upper partials swell after the strike', () => {
    const drum = bake('m.wardrum');
    expect(pitchOf(drum.subarray(0, 1200), BAKE_RATE)).toBeGreaterThan(pitchOf(drum.subarray(4800, 12_000), BAKE_RATE));
    const gong = renderSound({ layers: [{ wave: 'sine', freq: 200, decay: 0.05, gain: 1, partials: [[4, 1, 100, 0.5]] }] });
    expect(rms(gong.subarray(12_000, 14_400))).toBeGreaterThan(rms(gong.subarray(0, 2400)) * 2);
  });

  it('has a room reverb: stereo, no direct sound, dying away and darker as it goes', () => {
    const [l, r] = roomImpulse(48_000, 1.1);
    expect(l.length).toBe(52_800);
    expect(l).not.toEqual(r);
    expect(Math.abs(l[0]!)).toBeLessThan(0.01);
    const tenth = l.length / 10;
    expect(rms(l.subarray(l.length - tenth))).toBeLessThan(rms(l.subarray(0, tenth)) * 0.01);
    for (const v of [...l, ...r]) expect(Number.isFinite(v)).toBe(true);
    expect(brightness(l.subarray(l.length / 2))).toBeLessThan(brightness(l.subarray(0, l.length / 4)));
  });

  it('has a sound for each tower kind, hero attack, Q / W / R cast and every listed event', () => {
    const ids = Object.keys(SOUNDS);
    for (const t of TOWER_KINDS) expect(ids).toContain(`shot.${t}`);
    for (const h of HERO_KINDS) {
      expect(ids).toContain(`attack.${h}`);
      for (const slot of ['Q', 'W', 'R']) expect(ids).toContain(`${h}.${slot}`);
    }
    for (const id of ['death', 'bossDeath', 'heartHit', 'waveStart', 'bossWave', 'levelUp', 'build', 'upgrade', 'branch', 'sell', 'noGold', 'victory', 'defeat', 'tap']) {
      expect(ids).toContain(id);
    }
    for (const [id, s] of Object.entries(SOUNDS)) {
      expect(s.volume, id).toBeGreaterThan(0);
      expect(s.volume, id).toBeLessThanOrEqual(1);
      expect(s.max, id).toBeGreaterThanOrEqual(1);
      expect(s.cooldown, id).toBeGreaterThanOrEqual(0);
      expect(s.wet, id).toBeGreaterThanOrEqual(0);
      expect(s.wet, id).toBeLessThanOrEqual(0.5);
      expect(s.pitch, id).toBeLessThanOrEqual(0.05);
    }
  });

  it('uses no sound files except recorded ones under their names in public/music and public/sfx', () => {
    const root = new URL('..', import.meta.url).pathname;
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('dist') || name === 'test-results') continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(mp3|ogg|wav|m4a|aac|flac|opus|webm)$/i.test(name)) found.push(p.slice(root.length));
      }
    };
    walk(root);
    const allowed = [...MUSIC_FILES.map((m) => `public/music/${m}.mp3`), ...SOUND_IDS.map((id) => `public/sfx/${id}.mp3`)];
    expect(found.filter((f) => !allowed.includes(f))).toEqual([]);
    // The synth itself never reaches for randomness or the clock: it bakes the same every time.
    const src = readFileSync(new URL('../src/audio/synth.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });

  it('lists every replaceable effect in public/sfx/README.md and the music files in public/music/README.md', () => {
    // The build takes the allowed names from these tables (vite.config.ts), so they must list exactly the game's.
    const names = (dir: string) => {
      const text = readFileSync(new URL(`../public/${dir}/README.md`, import.meta.url), 'utf8');
      return [...text.matchAll(/^\| `([^`]+)\.mp3` \|/gm)].map((m) => m[1]!).sort();
    };
    expect(names('sfx')).toEqual([...SOUND_IDS].sort());
    expect(names('music')).toEqual([...MUSIC_FILES].sort());
  });
});

/** The fundamental (Hz) of a stretch of samples, by autocorrelation (50 Hz – 2 kHz). */
function pitchOf(s: Float32Array, rate: number): number {
  let best = 0;
  let bestLag = 1;
  const corr = (lag: number) => {
    let c = 0;
    for (let i = 0; i + lag < s.length; i++) c += s[i]! * s[i + lag]!;
    return c / (s.length - lag);
  };
  for (let lag = Math.floor(rate / 2000); lag < rate / 50; lag++) {
    const c = corr(lag);
    if (c > best * 1.0001) {
      best = c;
      bestLag = lag;
    }
  }
  // Refine between samples (a parabola through the peak).
  const a = corr(bestLag - 1);
  const b = corr(bestLag);
  const c = corr(bestLag + 1);
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return rate / (bestLag + shift);
}

describe('mix', () => {
  const view: ViewBox = { left: 0, top: 0, right: 20, bottom: 40 };

  it('plays on-screen sounds in full, panned to their side; off screen quieter, then skipped (never yours)', () => {
    expect(placement(10, 20, view, false)).toEqual({ gain: 1, pan: 0 });
    expect(placement(0, 20, view, false)!.pan).toBeLessThan(0);
    expect(placement(20, 20, view, false)!.pan).toBeGreaterThan(0);
    const near = placement(10, 42, view, false)!;
    const far = placement(10, 46, view, false)!;
    expect(near.gain).toBeLessThan(1);
    expect(far.gain).toBeLessThan(near.gain);
    expect(placement(10, 40 + HEAR_MARGIN + 1, view, false)).toBeNull();
    expect(placement(10, 40 + HEAR_MARGIN + 1, view, true)!.gain).toBeGreaterThan(0);
  });

  it('gates voices: cooldowns, a most-at-once per sound and caps by priority', () => {
    const g = new VoiceGate();
    const spec = { cooldown: 50, max: 2 };
    expect(g.admit('a', 'a', spec, 0, 1000, 0)).toBe(true);
    expect(g.admit('a', 'a', spec, 0, 1000, 20)).toBe(false); // cooldown
    expect(g.admit('a', 'a!', spec, 0, 1000, 20)).toBe(true); // yours count separately
    expect(g.admit('a', 'a', spec, 0, 1000, 100)).toBe(false); // two already ringing
    expect(g.admit('a', 'a', spec, 0, 1000, 1100)).toBe(true); // they ended
    g.reset();
    let low = 0;
    for (let i = 0; i < 100; i++) if (g.admit(`s${i}`, `s${i}`, { cooldown: 0, max: 9 }, 0, 5000, i)) low++;
    expect(low).toBe(VOICE_CAPS[0]);
    // Warnings still get through when the low-priority voices are full.
    expect(g.admit('heart', 'heart', { cooldown: 0, max: 1 }, 2, 500, 200)).toBe(true);
    expect(g.active(200)).toBe(VOICE_CAPS[0] + 1);
    expect(g.active(10_000)).toBe(0);
  });
});

describe('takes', () => {
  it('never plays the same variant twice in a row, and varies pitch, level, timing and room a little', () => {
    const takes = new Takes(3);
    const spec = SOUNDS.death;
    let last = -1;
    const rates = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const t = takes.next('death', spec);
      expect(t.variant).not.toBe(last);
      expect(t.variant).toBeGreaterThanOrEqual(0);
      expect(t.variant).toBeLessThan(spec.variants);
      last = t.variant;
      expect(Math.abs(t.rate - 1)).toBeLessThanOrEqual(spec.pitch);
      expect(Math.abs(20 * Math.log10(t.gain))).toBeLessThanOrEqual(TAKE_GAIN_DB + 1e-9);
      expect(t.delay).toBeGreaterThanOrEqual(0);
      expect(t.delay).toBeLessThanOrEqual(TAKE_DELAY);
      expect(t.wet).toBeGreaterThanOrEqual(spec.wet * 0.8 - 1e-9);
      expect(t.wet).toBeLessThanOrEqual(spec.wet * 1.2 + 1e-9);
      rates.add(t.rate);
    }
    expect(rates.size).toBeGreaterThan(150);
    // Tunes stay in tune; warnings and the UI are barely late.
    expect(Math.abs(takes.next('levelUp', SOUNDS.levelUp).rate - 1)).toBeLessThanOrEqual(0.006);
    for (let i = 0; i < 50; i++) expect(takes.next('tap', SOUNDS.tap).delay).toBeLessThanOrEqual(TAKE_DELAY / 3);
    const one = takes.next('victory', SOUNDS.victory);
    expect(one.variant).toBe(0);
  });
});

describe('music', () => {
  const tracks = [lobbyTrack(), matchTrack()];
  const jobs = allSynthDefs();
  const cache = new Map<string, Float32Array>();
  const samples = (id: string) => {
    let s = cache.get(id);
    if (!s) cache.set(id, (s = renderSound(jobs.get(id)!.def, BAKE_RATE, 0)));
    return s;
  };
  const notes = (t: Track) => t.byStep.flat();

  it('loops in bars and plays every note from a sample baked near it (±6 semitones)', () => {
    for (const t of tracks) {
      expect(t.steps % STEPS_PER_BAR).toBe(0);
      const seconds = t.steps * stepSeconds(t);
      expect(seconds).toBeGreaterThan(30);
      for (const n of notes(t)) {
        expect(INSTRUMENTS[n.inst]).toBeDefined();
        const { id, rate } = noteSample(n.inst, n.note);
        expect(jobs.has(id), id).toBe(true);
        expect(rate, `${n.inst} ${n.note}`).toBeGreaterThanOrEqual(Math.pow(2, -6 / 12) - 1e-9);
        expect(rate, `${n.inst} ${n.note}`).toBeLessThanOrEqual(Math.pow(2, 6 / 12) + 1e-9);
        expect(n.vel).toBeGreaterThan(0);
        expect(n.vel).toBeLessThanOrEqual(1);
        if (n.len !== undefined) expect(n.len).toBeGreaterThan(0);
        expect(n.nudge ?? 0).toBeGreaterThanOrEqual(0);
        expect(n.nudge ?? 0).toBeLessThan(1);
      }
    }
  });

  it('the lobby is Japanese (koto, shakuhachi, taiko in the in scale), the match Chinese (D yu pentatonic)', () => {
    const pitched = (t: Track) => notes(t).filter((n) => INSTRUMENTS[n.inst].roots);
    const classes = (t: Track) => new Set(pitched(t).map((n) => n.note % 12));
    // D E♭ G A B♭
    expect([...classes(lobbyTrack())].every((c) => [2, 3, 7, 9, 10].includes(c))).toBe(true);
    expect(new Set(notes(lobbyTrack()).map((n) => n.inst))).toEqual(new Set<Instrument>(['koto', 'shaku', 'taiko', 'shime']));
    // D F G A C
    expect([...classes(matchTrack())].every((c) => [2, 5, 7, 9, 0].includes(c))).toBe(true);
    // Sustained instruments always say how long.
    for (const t of tracks) for (const n of notes(t)) if (['shaku', 'erhu', 'dizi'].includes(n.inst)) expect(n.len, n.inst).toBeDefined();
  });

  it('builds with the match: calm while building, war drums and the erhu in waves, gongs and faster drums on boss waves', () => {
    const inLayer = (layer: string) => notes(matchTrack()).filter((n) => n.layer === layer);
    const insts = (scene: MusicScene) => new Set(notes(matchTrack()).filter((n) => SCENE_LAYERS[scene].includes(n.layer)).map((n) => n.inst));
    expect([...insts('build')].sort()).toEqual(['erhu', 'guzheng', 'wardrum']);
    expect(insts('waves').has('tanggu')).toBe(true);
    expect(insts('waves').has('gong')).toBe(false);
    expect(insts('boss').has('gong')).toBe(true);
    expect(insts('boss').has('dizi')).toBe(true);
    const drums = (ns: Note[]) => ns.filter((n) => ['wardrum', 'tanggu', 'rim'].includes(n.inst)).length;
    // Boss waves drum half as fast again.
    expect(drums([...inLayer('pulse'), ...inLayer('boss')])).toBeGreaterThan(drums(inLayer('pulse')) * 1.5);
    expect(SCENE_TRACK.lobby).toBe('lobby');
    expect(SCENE_TRACK.boss).toBe('match');
    expect(SCENE_TRACK.none).toBeNull();
    expect(new Set(notes(lobbyTrack()).map((n) => n.layer))).toEqual(new Set(['base']));
  });

  it('humanises: every note a little early or late within its player’s looseness, differently each pass', () => {
    for (const t of tracks) {
      for (const [index, n] of notes(t).entries()) {
        const h = humanize(n, 0, index);
        expect(Math.abs(h.dt)).toBeLessThanOrEqual(INSTRUMENTS[n.inst].loose / 1000 + 1e-9);
        expect(h.vel).toBeLessThanOrEqual(1);
        expect(h.vel).toBeGreaterThanOrEqual(n.vel * 0.9 - 1e-9);
      }
    }
    const n = lobbyTrack().byStep[0]![0]!;
    const dts = new Set([0, 1, 2, 3, 4].map((loop) => humanize(n, loop, 0).dt));
    expect(dts.size).toBe(5);
    expect(humanize(n, 2, 0)).toEqual(humanize(n, 2, 0));
  });

  it('the lobby plays louder than it used to (−21.6 dB), level with the match; recorded music is levelled to the match', () => {
    const level = (t: Track, scene: MusicScene) => loudness([mixdown(t, SCENE_LAYERS[scene], samples, BAKE_RATE, 40)], BAKE_RATE);
    const lobby = level(lobbyTrack(), 'lobby');
    const build = level(matchTrack(), 'build');
    const waves = level(matchTrack(), 'waves');
    const boss = level(matchTrack(), 'boss');
    console.log(`Music loudness (dB): lobby ${lobby.toFixed(1)}, build ${build.toFixed(1)}, waves ${waves.toFixed(1)}, boss ${boss.toFixed(1)}`);
    expect(lobby).toBeGreaterThan(-21.6 + 4);
    expect(Math.abs(lobby - waves)).toBeLessThan(3);
    expect(build).toBeLessThan(waves);
    expect(waves).toBeLessThan(boss);
    expect(Math.abs(MUSIC_TARGET_DB - waves)).toBeLessThan(2);
  });
});

describe('recorded files', () => {
  it('uses music and effect files under the names the game knows, with a hash in the URL', () => {
    const f = soundFiles(
      [
        { dir: 'music', name: 'lobby', hash: 'a1' },
        { dir: 'music', name: 'intro', hash: 'b2' },
        { dir: 'sfx', name: 'shot.arrow', hash: 'c3' },
        { dir: 'sfx', name: 'boom', hash: 'd4' },
      ],
      SOUND_IDS,
    );
    expect(f).toEqual({ music: { lobby: '/music/lobby.mp3?v=a1' }, sfx: { 'shot.arrow': '/sfx/shot.arrow.mp3?v=c3' } });
  });

  it('plays a file for a scene when there is one; boss waves fall back to the match file, then to code', () => {
    const all = { lobby: 'l', match: 'm', boss: 'b' };
    expect(musicFileFor('lobby', all)).toBe('lobby');
    expect(musicFileFor('build', all)).toBe('match');
    expect(musicFileFor('waves', all)).toBe('match');
    expect(musicFileFor('boss', all)).toBe('boss');
    expect(musicFileFor('boss', { match: 'm' })).toBe('match');
    expect(musicFileFor('boss', { lobby: 'l' })).toBeNull();
    expect(musicFileFor('lobby', { match: 'm' })).toBeNull();
    expect(musicFileFor('none', all)).toBeNull();
  });

  const rate = 44_100;
  /** A decoded file: `pad` s of encoder silence, `seconds` of a tone at `db`, `pad` s of silence again. */
  const file = (pad: number, seconds: number, db: number): Float32Array[] => {
    const n = Math.round((pad * 2 + seconds) * rate);
    const a = Math.pow(10, db / 20) * Math.SQRT2;
    const l = new Float32Array(n);
    const p = Math.round(pad * rate);
    for (let i = p; i < n - p; i++) l[i] = a * Math.sin((2 * Math.PI * 440 * i) / rate) + (i % 7) * 1e-6;
    return [l, l.slice()];
  };

  it('trims the encoder’s silence at both ends, so a loop has no gap (but never more than a second)', () => {
    const f = file(0.026, 3, -12);
    const { start, end } = trimSilence(f, rate);
    expect(start / rate).toBeCloseTo(0.026, 3);
    expect((f[0]!.length - end) / rate).toBeCloseTo(0.026, 3);
    const quiet = file(2.5, 1, -12);
    expect(trimSilence(quiet, rate).start / rate).toBeCloseTo(1, 3);
    expect(trimSilence([new Float32Array(1000)], rate).end).toBeGreaterThan(0);
  });

  it('measures loudness like a meter (silence and quiet tails don’t count) and levels files within ±12 dB', () => {
    // A sine at −12 dB RMS.
    expect(loudness(file(0, 2, -12), rate)).toBeCloseTo(-12, 0);
    // Padding doesn't make it quieter, and a long quiet tail barely does.
    expect(loudness(file(1, 2, -12), rate)).toBeCloseTo(-12, 0);
    const tail = file(0, 2, -12)[0]!;
    const withTail = new Float32Array(tail.length * 2);
    withTail.set(tail);
    for (let i = tail.length; i < withTail.length; i++) withTail[i] = 0.003 * Math.sin(i / 10);
    expect(loudness([withTail], rate)).toBeCloseTo(-12, 0);
    expect(loudness([new Float32Array(100)], rate)).toBe(-Infinity);
    expect(levelGain(-20, -15, 0.3)).toBeCloseTo(Math.pow(10, 5 / 20));
    expect(levelGain(-40, -15, 0.01)).toBeCloseTo(Math.pow(10, MAX_ADJUST_DB / 20));
    expect(levelGain(0, -15, 1)).toBeCloseTo(Math.pow(10, -MAX_ADJUST_DB / 20));
    // Never turned up into clipping.
    expect(levelGain(-25, -15, 0.8)).toBeCloseTo(1 / 0.8);
    const fit = fitFile(file(0.05, 3, -9), rate, MUSIC_TARGET_DB);
    expect(fit.start).toBeCloseTo(0.05, 3);
    expect(fit.end).toBeCloseTo(3.05, 3);
    expect(20 * Math.log10(fit.gain)).toBeCloseTo(MUSIC_TARGET_DB + 9, 0);
  });
});

describe('service worker', () => {
  /** Runs the generated worker against fake caches and a fake network. */
  function worker(shell: string[]) {
    const stores = new Map<string, Map<string, { url: string; body: string }>>();
    const net: string[] = [];
    const store = (name: string) => {
      let s = stores.get(name);
      if (!s) stores.set(name, (s = new Map()));
      return s;
    };
    const res = (url: string, body: string) => ({ ok: true, status: 200, url, body, clone: () => res(url, body) });
    const cacheApi = (name: string) => ({
      addAll: async (urls: string[]) => urls.forEach((u) => store(name).set(u, { url: `https://td.test${u}`, body: u })),
      match: async (req: { url: string }) => {
        const hit = store(name).get(req.url);
        return hit ? res(hit.url, hit.body) : undefined;
      },
      keys: async () => [...store(name).keys()].map((url) => ({ url })),
      delete: async (req: { url: string }) => store(name).delete(req.url),
      put: async (req: { url: string }, r: { body: string }) => void store(name).set(req.url, { url: req.url, body: r.body }),
    });
    const listeners: Record<string, (e: unknown) => void> = {};
    const self = {
      location: { origin: 'https://td.test' },
      addEventListener: (type: string, f: (e: unknown) => void) => (listeners[type] = f),
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    };
    const caches = {
      open: async (name: string) => cacheApi(name),
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async (req: { url: string }) => {
        for (const s of stores.values()) {
          const hit = [...s.values()].find((h) => h.url.split('?')[0] === req.url.split('?')[0]);
          if (hit) return res(hit.url, hit.body);
        }
        return undefined;
      },
    };
    const fetch = async (req: { url: string }) => {
      net.push(req.url);
      return res(req.url, `net:${req.url}`);
    };
    new Function('self', 'caches', 'fetch', swSource('v1', shell))(self, caches, fetch);
    const get = async (path: string) => {
      let responded: Promise<{ body: string }> | undefined;
      listeners.fetch!({ request: { method: 'GET', url: `https://td.test${path}`, mode: 'cors' }, respondWith: (p: Promise<{ body: string }>) => (responded = p) });
      const r = await responded!;
      await new Promise((ok) => setTimeout(ok, 0));
      return r.body;
    };
    return { stores, net, get, listeners };
  }

  it('precaches the shell but not recorded sound files, which it caches on first play and replaces on a new upload', async () => {
    expect(isMediaPath('/music/lobby.mp3')).toBe(true);
    expect(isMediaPath('/sfx/tap.mp3')).toBe(true);
    expect(isMediaPath('/assets/index.js')).toBe(false);
    const w = worker(['/index.html', '/assets/a.js', '/music/README.md', '/music/lobby.mp3', '/sfx/tap.mp3']);
    let installed: Promise<unknown> | undefined;
    w.listeners.install!({ waitUntil: (p: Promise<unknown>) => (installed = p) });
    await installed;
    expect([...w.stores.get('tdt-v1')!.keys()]).toEqual(['/index.html', '/assets/a.js']);
    expect(w.stores.has(MEDIA_CACHE)).toBe(false);
    // First play: from the network, then kept.
    expect(await w.get('/music/lobby.mp3?v=aa')).toBe('net:https://td.test/music/lobby.mp3?v=aa');
    expect(await w.get('/music/lobby.mp3?v=aa')).toBe('net:https://td.test/music/lobby.mp3?v=aa');
    expect(w.net).toEqual(['https://td.test/music/lobby.mp3?v=aa']);
    // A new upload (another hash) is fetched and replaces the old copy.
    await w.get('/music/lobby.mp3?v=bb');
    expect([...w.stores.get(MEDIA_CACHE)!.keys()]).toEqual(['https://td.test/music/lobby.mp3?v=bb']);
    // A new version of the app keeps the media cache.
    w.stores.set('tdt-old', new Map());
    let activated: Promise<unknown> | undefined;
    w.listeners.activate!({ waitUntil: (p: Promise<unknown>) => (activated = p) });
    await activated;
    expect([...w.stores.keys()].sort()).toEqual([MEDIA_CACHE, 'tdt-v1']);
  });
});

// ---------------------------------------------------------------------------
// Game events → sounds
// ---------------------------------------------------------------------------

class FakeSink implements SoundSink {
  sfxOn = true;
  plays: ({ id: string } & SoundPlay)[] = [];
  play(id: string, o: SoundPlay): boolean {
    this.plays.push({ id, ...o });
    return true;
  }
  ids(): string[] {
    return this.plays.map((p) => p.id);
  }
}

function match(): { snap: Snapshot; sink: FakeSink; audio: GameAudio; scenes: MusicScene[] } {
  const state = createGame(
    {
      players: [
        { id: 'me', name: 'Me', hero: 'ranger' },
        { id: 'mate', name: 'Mate', hero: 'warden' },
      ],
    },
    1,
  );
  const mine = state.pads.find((p) => p.owner === 'me')!;
  const theirs = state.pads.find((p) => p.owner === 'mate')!;
  applyCommand(state, 'me', { type: 'build', padId: mine.id, tower: 'arrow' });
  applyCommand(state, 'mate', { type: 'build', padId: theirs.id, tower: 'cannon' });
  const snap = snapshot(state);
  const sink = new FakeSink();
  const scenes: MusicScene[] = [];
  const audio = new GameAudio(sink, { setScene: (s) => scenes.push(s) });
  audio.frame(snap, 'me', { left: -100, top: -100, right: 100, bottom: 100 }, 0);
  return { snap, sink, audio, scenes };
}

describe('game audio', () => {
  it('turns events into sounds, yours louder than a teammate’s', () => {
    const { snap, sink, audio } = match();
    const me = snap.heroes.find((h) => h.owner === 'me')!;
    const mate = snap.heroes.find((h) => h.owner === 'mate')!;
    const events: GameEvent[] = [
      { type: 'waveStart', wave: 1, income: 0 },
      { type: 'leak', creepId: 1, damage: 1, lane: 1 },
      { type: 'cast', heroId: me.id, slot: 'Q', x: 0, y: 0 },
      { type: 'cast', heroId: mate.id, slot: 'Q', x: 0, y: 0 },
      { type: 'cast', heroId: mate.id, slot: 'E', x: 0, y: 0 },
      { type: 'heroAttack', heroId: me.id, x: me.x, y: me.y - 2 },
      // Melee attacks sound when the blade lands (meleeHit), not on the event.
      { type: 'heroAttack', heroId: mate.id, x: mate.x, y: mate.y - 1 },
      { type: 'levelUp', heroId: me.id, level: 2 },
      { type: 'towerBuilt', towerId: snap.towers[0]!.id, owner: 'me' },
      { type: 'towerUpgraded', towerId: snap.towers[0]!.id, owner: 'me', tier: 2, branch: null },
      { type: 'towerUpgraded', towerId: snap.towers[0]!.id, owner: 'me', tier: 4, branch: 'sniper' },
      { type: 'towerSold', towerId: snap.towers[1]!.id, owner: 'mate', refund: 10 },
      { type: 'kill', creepId: 5, kind: 'grunt', x: 10, y: 10, by: 'me', bounty: 3 },
      { type: 'gameOver', result: 'victory' },
    ];
    audio.events(events, 1000);
    expect(sink.ids()).toEqual([
      'waveStart',
      'heartHit',
      'ranger.Q',
      'warden.Q',
      'attack.ranger',
      'levelUp',
      'build',
      'upgrade',
      'branch',
      'sell',
      'death',
      'coin',
      'victory',
    ]);
    const gain = (id: string) => sink.plays.filter((p) => p.id === id).map((p) => p.gain);
    const [mineQ] = gain('ranger.Q');
    const [mateQ] = gain('warden.Q');
    // Each play's take moves its level by at most ±1.5 dB.
    const ratio = mateQ! / SOUNDS['warden.Q'].volume / ((mineQ! / SOUNDS['ranger.Q'].volume) * OTHERS_GAIN);
    expect(Math.abs(20 * Math.log10(ratio))).toBeLessThanOrEqual(2 * TAKE_GAIN_DB);
    audio.meleeHit(mate.id, mate.x, mate.y - 1, 1100);
    expect(sink.ids().at(-1)).toBe('attack.warden');
  });

  it('plays a coin for gold you send or receive, and the co-op flourishes', () => {
    const { sink, audio } = match();
    audio.events([{ type: 'gift', from: 'me', to: 'mate', amount: 25 }], 0);
    audio.events([{ type: 'gift', from: 'mate', to: 'me', amount: 100 }], 300);
    audio.events([{ type: 'gift', from: 'mate', to: 'other', amount: 10 }], 600);
    audio.flourish('pingBurst', 900);
    audio.flourish('emoteBurst', 1700);
    audio.flourish('twinCast', 2700);
    audio.flourish('togetherKill', 3700);
    expect(sink.ids()).toEqual(['coin', 'coin', 'pingBurst', 'emoteBurst', 'twinCast', 'togetherKill']);
    const seconds = soundSeconds(SOUNDS.togetherKill.def);
    expect(seconds).toBeGreaterThanOrEqual(0.4);
    expect(seconds).toBeLessThanOrEqual(0.8);
  });

  it('plays tower shots at their branch’s pitch, and "Not enough gold"', () => {
    const { snap, sink, audio } = match();
    const t = snap.towers[0]!;
    audio.towerShot(t, 0);
    audio.towerShot({ ...t, tier: 4, branch: 'sniper' }, 500);
    expect(sink.ids()).toEqual(['shot.arrow', 'shot.arrow']);
    expect(sink.plays[1]!.rate).toBeLessThan(sink.plays[0]!.rate);
    // Two takes: other variants, both with some room.
    expect(sink.plays[1]!.variant).not.toBe(sink.plays[0]!.variant);
    expect(sink.plays[0]!.wet).toBeGreaterThan(0);
    audio.notice('Not enough gold', 600);
    audio.notice('Wave 3', 700);
    expect(sink.ids().at(-1)).toBe('noGold');
    expect(sink.plays).toHaveLength(3);
  });

  it('a boss wave sounds different', () => {
    const { sink, audio } = match();
    const boss = TUNING.waves.list.findIndex((w) => w.some((g) => TUNING.creeps[g.kind].boss)) + 1;
    expect(boss).toBeGreaterThan(0);
    expect(isBossWave('full', boss)).toBe(true);
    expect(isBossWave('full', 1)).toBe(false);
    audio.events([{ type: 'waveStart', wave: boss, income: 0 }], 0);
    expect(sink.ids()).toEqual(['bossWave']);
  });

  it('skips off-screen sounds of others and never turns 300 creeps into noise', () => {
    const { snap, sink, audio } = match();
    audio.frame(snap, 'me', { left: 0, top: 0, right: 10, bottom: 10 }, 0);
    audio.events([{ type: 'kill', creepId: 1, kind: 'grunt', x: 5, y: 40, by: 'mate', bounty: 3 }], 0);
    expect(sink.plays).toHaveLength(0);
    // A second of a 300-creep fight: kills, shots and splashes every frame.
    const tower = snap.towers[0]!;
    for (let f = 0; f < 60; f++) {
      const now = f * 16.7;
      const kills: GameEvent[] = [];
      for (let k = 0; k < 10; k++) kills.push({ type: 'kill', creepId: f * 10 + k, kind: 'grunt', x: 5, y: 5, by: 'me', bounty: 1 });
      audio.events(kills, now);
      for (let s = 0; s < 20; s++) audio.towerShot(tower, now);
    }
    const deaths = sink.ids().filter((id) => id === 'death').length;
    const shots = sink.ids().filter((id) => id === 'shot.arrow').length;
    expect(deaths).toBeLessThanOrEqual(Math.ceil(1000 / SOUNDS.death.cooldown));
    expect(shots).toBeLessThanOrEqual(Math.ceil(1000 / SOUNDS['shot.arrow'].cooldown));
    expect(audio.stats.skipped).toBeGreaterThan(1000);
  });

  it('does no work while nothing can be heard (muted)', () => {
    const { snap, sink, audio } = match();
    sink.sfxOn = false;
    audio.events([{ type: 'leak', creepId: 1, damage: 1, lane: 1 }], 0);
    audio.towerShot(snap.towers[0]!, 0);
    audio.tap(0);
    expect(sink.plays).toHaveLength(0);
    expect(audio.stats.skipped).toBe(0);
  });

  it('picks the music: lobby, building, waves, boss waves, a pause after the end, then the lobby', () => {
    const { snap, audio, scenes } = match();
    expect(scenes).toEqual(['build']);
    expect(musicScene(undefined, 0, -Infinity)).toBe('lobby');
    expect(musicScene({ ...snap, phase: 'waves', wave: 1 }, 0, -Infinity)).toBe('waves');
    const boss = TUNING.waves.list.findIndex((w) => w.some((g) => TUNING.creeps[g.kind].boss)) + 1;
    expect(musicScene({ ...snap, phase: 'waves', wave: boss }, 0, -Infinity)).toBe('boss');
    expect(musicScene({ ...snap, phase: 'waves', wave: 1, creeps: [{ ...fakeCreep(), kind: 'ironhorn' }] }, 0, -Infinity)).toBe('boss');
    expect(musicScene({ ...snap, phase: 'victory' }, 1000, 0)).toBe('none');
    expect(musicScene({ ...snap, phase: 'defeat' }, END_QUIET_MS + 1, 0)).toBe('lobby');
    audio.frame({ ...snap, phase: 'victory', tick: 99 }, 'me', { left: 0, top: 0, right: 1, bottom: 1 }, 10_000);
    audio.frame({ ...snap, phase: 'victory', tick: 99 }, 'me', { left: 0, top: 0, right: 1, bottom: 1 }, 10_000 + END_QUIET_MS + 1);
    expect(scenes).toEqual(['build', 'none', 'lobby']);
  });
});

function fakeCreep(): Snapshot['creeps'][number] {
  return { id: 1, kind: 'grunt', x: 1, y: 1, hp: 10, maxHp: 10, slowed: false, rooted: false, armor: 0, magicResist: 0, stunned: false };
}
