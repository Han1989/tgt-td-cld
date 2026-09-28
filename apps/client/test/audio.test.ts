import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { HERO_KINDS, TOWER_KINDS, type GameEvent, type Snapshot } from '@tdt/protocol';
import { applyCommand, createGame, snapshot, TUNING } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import { END_QUIET_MS, GameAudio, isBossWave, musicScene, type SoundSink } from '../src/audio/gameAudio';
import { HEAR_MARGIN, OTHERS_GAIN, placement, VOICE_CAPS, VoiceGate, type ViewBox } from '../src/audio/mix';
import { MUSIC_DIR } from '../src/audio/musicFiles';
import { lobbyTrack, matchTrack, noteRate, SCENE_LAYERS, SCENE_TRACK, stepSeconds, STEPS_PER_BAR, type MusicScene } from '../src/audio/score';
import { allSynthDefs, INSTRUMENTS, SOUNDS } from '../src/audio/sounds';
import { BAKE_RATE, MAX_SECONDS, PEAK, renderSound, rms, soundSeconds } from '../src/audio/synth';

/** How bright a sound is: RMS of its first difference over its RMS (a sine at f Hz gives 2·sin(π·f / rate)). */
function brightness(s: Float32Array): number {
  let d = 0;
  for (let i = 1; i < s.length; i++) d += (s[i]! - s[i - 1]!) ** 2;
  return Math.sqrt(d / s.length) / Math.max(1e-9, rms(s));
}

describe('synth and sound bank', () => {
  const defs = allSynthDefs();

  it('renders every sound and instrument: finite, normalised, audible, short, deterministic', () => {
    const t0 = performance.now();
    const baked = [...defs].map(([id, def]) => [id, def, renderSound(def)] as const);
    const ms = performance.now() - t0;
    console.log(`Baked ${defs.size} sounds in ${ms.toFixed(0)} ms (Node, ${BAKE_RATE} Hz)`);
    // The whole bank bakes in a fraction of a second (in a worker in the browser).
    expect(ms).toBeLessThan(2000);
    for (const [id, def, s] of baked) {
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
    expect(renderSound(SOUNDS.death.def)).toEqual(renderSound(SOUNDS.death.def));
  });

  it('nothing is harsh: every sound is soft (little energy up high)', () => {
    for (const [id, def] of defs) {
      // 0.9 ≈ a pure sine at 3.5 kHz: chimes and whooshes sit below it, raw noise or a square wave far above.
      expect(brightness(renderSound(def)), id).toBeLessThan(0.9);
    }
    const harsh = renderSound({ layers: [{ wave: 'noise', freq: 0, decay: 0.2, gain: 1 }] });
    expect(brightness(harsh)).toBeGreaterThan(1);
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
    }
  });

  it('uses no sound files: all audio is made in code (until music files are switched on)', () => {
    const root = new URL('..', import.meta.url).pathname;
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('dist') || name === 'test-results') continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(mp3|ogg|wav|m4a|aac|flac|opus|webm)$/i.test(name)) found.push(p);
      }
    };
    walk(root);
    // Recorded music may only come in through public/music/, switched on by MUSIC_DIR (musicFiles.ts).
    if (MUSIC_DIR === null) expect(found).toEqual([]);
    else expect(found.filter((f) => !f.includes('/public/music/'))).toEqual([]);
    // The synth itself never reaches for randomness or the clock: it bakes the same every time.
    const src = readFileSync(new URL('../src/audio/synth.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
});

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

describe('music', () => {
  it('loops in bars and plays every note within the instruments’ range', () => {
    for (const t of [lobbyTrack(), matchTrack()]) {
      expect(t.steps % STEPS_PER_BAR).toBe(0);
      const seconds = t.steps * stepSeconds(t);
      expect(seconds).toBeGreaterThan(15);
      for (const notes of t.byStep) {
        for (const n of notes) {
          expect(INSTRUMENTS[n.inst]).toBeDefined();
          const r = noteRate(n.inst, n.note);
          expect(r).toBeGreaterThanOrEqual(0.25);
          expect(r).toBeLessThanOrEqual(4);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('builds with the match: calm while building, a pulse in waves, drums on boss waves', () => {
    const layers = (scene: MusicScene) => new Set(matchTrack().byStep.flat().filter((n) => SCENE_LAYERS[scene].includes(n.layer)).map((n) => n.inst));
    expect([...layers('build')].sort()).toEqual(['bell', 'pad']);
    expect(layers('waves').has('bass')).toBe(true);
    expect(layers('waves').has('drum')).toBe(false);
    expect(layers('boss').has('drum')).toBe(true);
    expect(SCENE_TRACK.lobby).toBe('lobby');
    expect(SCENE_TRACK.boss).toBe('match');
    expect(SCENE_TRACK.none).toBeNull();
    expect(new Set(lobbyTrack().byStep.flat().map((n) => n.layer))).toEqual(new Set(['base']));
  });
});

// ---------------------------------------------------------------------------
// Game events → sounds
// ---------------------------------------------------------------------------

class FakeSink implements SoundSink {
  sfxOn = true;
  plays: { id: string; gain: number; pan: number; rate: number }[] = [];
  play(id: string, o: { gain: number; pan: number; rate: number }): boolean {
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
      { type: 'leak', creepId: 1, damage: 1 },
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
    expect(mateQ! / SOUNDS['warden.Q'].volume).toBeCloseTo((mineQ! / SOUNDS['ranger.Q'].volume) * OTHERS_GAIN);
    audio.meleeHit(mate.id, mate.x, mate.y - 1, 1100);
    expect(sink.ids().at(-1)).toBe('attack.warden');
  });

  it('plays tower shots at their branch’s pitch, and "Not enough gold"', () => {
    const { snap, sink, audio } = match();
    const t = snap.towers[0]!;
    audio.towerShot(t, 0);
    audio.towerShot({ ...t, tier: 4, branch: 'sniper' }, 500);
    expect(sink.ids()).toEqual(['shot.arrow', 'shot.arrow']);
    expect(sink.plays[1]!.rate).toBeLessThan(sink.plays[0]!.rate);
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
    audio.events([{ type: 'leak', creepId: 1, damage: 1 }], 0);
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
