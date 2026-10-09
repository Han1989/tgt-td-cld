// The battle-sound measurement (docs/ART.md §13, `battleSound.test.ts`): a solo match stepped headless and fed to
// GameAudio the way the client feeds it, with a sink that records every play, then the plays rendered from the
// bank and mixed as engine.ts mixes them (pan, the Effects slider). Pure Node: no browser, no AudioContext.
//
// The feed, as gameView.ts and the renderer do it: `frame()` then `events()` for each snapshot, `towerShot()` for
// each new projectile whose style is a tower kind (the nearest tower of that kind within 1.6 tiles, the renderer's
// rule), `meleeHit()` 200 ms after a melee hero's `heroAttack`, the whole map on screen, time = tick × 50 ms.

import { TOWER_KINDS, type GameMode, type HeroKind, type TowerKind } from '@tdt/protocol';
import { applyCommand, createBalanceBot, createGame, getMap, snapshot, step, TICK_RATE, TUNING } from '@tdt/sim';
import { GameAudio, type SoundPlay } from '../src/audio/gameAudio';
import { allSynthDefs, SOUNDS, variantId, type SoundId } from '../src/audio/sounds';
import { BAKE_RATE, renderSound } from '../src/audio/synth';

export interface RecordedPlay extends SoundPlay {
  id: SoundId;
  /** When GameAudio played it (ms of game time). */
  t: number;
  /** The wave on when it played. */
  wave: number;
}

export interface RecordedMatch {
  plays: RecordedPlay[];
  /** Game time (ms) of each wave's start, by wave number. */
  waveStart: Map<number, number>;
  /** Game time (ms) the match ended. */
  end: number;
}

/** How long after a melee `heroAttack` the blade lands (the rigs' wind-up, about what the renderer waits). */
export const MELEE_LAND_MS = 200;

const TOWER_STYLES = new Set<string>(TOWER_KINDS);

/** Plays a solo match with the casual bot and records every sound GameAudio plays. */
export function recordMatch(o: { hero: HeroKind; seed: number; mode: GameMode }): RecordedMatch {
  const me = 'p1';
  const state = createGame({ players: [{ id: me, name: 'Bot', hero: o.hero }], mode: o.mode }, o.seed);
  const bot = createBalanceBot(me, TUNING, 0, 'casual');
  const plays: RecordedPlay[] = [];
  let wave = 0;
  const audio = new GameAudio(
    {
      sfxOn: true,
      play: (id, p) => {
        plays.push({ id: id as SoundId, t: now, wave, ...p });
        return true;
      },
    },
    { setScene: () => {} },
  );
  const map = getMap();
  const view = { left: 0, top: 0, right: map.width, bottom: map.height };
  const every = TICK_RATE / 4;
  const waveStart = new Map<number, number>();
  let now = 0;
  let snap = snapshot(state);
  let seen = new Set<number>();
  let melee: { at: number; heroId: number; x: number; y: number }[] = [];
  while (state.phase !== 'victory' && state.phase !== 'defeat' && state.tick < 60 * 60 * TICK_RATE) {
    if (state.tick % every === 0) for (const cmd of bot.decide(snap)) applyCommand(state, me, cmd);
    step(state);
    snap = snapshot(state);
    now = (state.tick * 1000) / TICK_RATE;
    for (const e of snap.events) {
      if (e.type === 'waveStart') waveStart.set(e.wave, now);
    }
    wave = snap.wave;
    audio.frame(snap, me, view, now);
    audio.events(snap.events, now);
    for (const e of snap.events) {
      if (e.type !== 'heroAttack') continue;
      const h = snap.heroes.find((x) => x.id === e.heroId);
      if (h && !TUNING.hero[h.kind].ranged) melee.push({ at: now + MELEE_LAND_MS, heroId: e.heroId, x: e.x, y: e.y });
    }
    const next = new Set<number>();
    for (const p of snap.projectiles) {
      next.add(p.id);
      if (seen.has(p.id) || !TOWER_STYLES.has(p.style)) continue;
      let best = 1.6;
      let tower = null;
      for (const t of snap.towers) {
        if (t.kind !== (p.style as TowerKind)) continue;
        const d = Math.hypot(t.x - p.x, t.y - p.y);
        if (d < best) [best, tower] = [d, t];
      }
      if (tower) audio.towerShot(tower, now);
    }
    seen = next;
    for (const m of melee) if (m.at <= now) audio.meleeHit(m.heroId, m.x, m.y, now);
    melee = melee.filter((m) => m.at > now);
  }
  return { plays, waveStart, end: now };
}

/** The combat background: tower shots, the Blizzard pulse, creep deaths and coins. */
export function isBackground(id: SoundId): boolean {
  return id.startsWith('shot.') || id === 'blizzard' || id === 'death' || id === 'coin';
}

/** Tower shots and the Blizzard pulse. */
export function isTowerShot(id: SoundId): boolean {
  return id.startsWith('shot.') || id === 'blizzard';
}

/** Plays per second in [from, to) ms: the mean, and the most in any one second (a sliding window). */
export function playRate(plays: readonly RecordedPlay[], from: number, to: number): { mean: number; most: number } {
  const ts = plays.filter((p) => p.t >= from && p.t < to).map((p) => p.t);
  let most = 0;
  for (let i = 0, j = 0; i < ts.length; i++) {
    while (ts[i]! - ts[j]! >= 1000) j++;
    most = Math.max(most, i - j + 1);
  }
  return { mean: ts.length / ((to - from) / 1000), most };
}

const baked = new Map<string, Float32Array>();
const jobs = allSynthDefs();
/** A sound's baked samples (variant `k`), at BAKE_RATE, as the bake worker renders them. */
export function bakedSound(id: SoundId, k = 0): Float32Array {
  const key = variantId(id, Math.min(k, SOUNDS[id].variants - 1));
  let s = baked.get(key);
  if (!s) {
    const job = jobs.get(key)!;
    baked.set(key, (s = renderSound(job.def, BAKE_RATE, job.seed)));
  }
  return s;
}

/**
 * The effects bus over [from, to) ms (stereo, at `rate`): each play's baked variant at its rate, gain and delay,
 * times `sfx` (the Effects slider's gain), panned like a StereoPannerNode (equal power; a play with no pan skips the
 * panner, so a mono voice reaches both sides in full). `wet` instead gives what each play sends into the room.
 */
export function mixPlays(plays: readonly RecordedPlay[], from: number, to: number, sfx: number, rate = BAKE_RATE, wet = false): [Float32Array, Float32Array] {
  const n = Math.ceil(((to - from) / 1000) * rate);
  const out: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  for (const p of plays) {
    if (p.t < from || p.t >= to) continue;
    const buf = bakedSound(p.id, p.variant);
    const g = p.gain * sfx * (wet ? p.wet : 1);
    if (g <= 0) continue;
    const x = (p.pan + 1) / 2;
    const gl = p.pan ? Math.cos((x * Math.PI) / 2) : 1;
    const gr = p.pan ? Math.sin((x * Math.PI) / 2) : 1;
    const start = Math.round(((p.t - from) / 1000 + p.delay) * rate);
    const stepIn = (p.rate * BAKE_RATE) / rate;
    for (let i = 0; start + i < n; i++) {
      const q = i * stepIn;
      const j = Math.floor(q);
      if (j + 1 >= buf.length) break;
      const v = (buf[j]! + (buf[j + 1]! - buf[j]!) * (q - j)) * g;
      out[0][start + i]! += v * gl;
      out[1][start + i]! += v * gr;
    }
  }
  return out;
}

/**
 * The level (dB) of each whole second of a stereo mix: its mean power over both sides, ungated (a one-second
 * short-term level; `loudness()`'s gate is for whole pieces and would drop the quiet blocks between hits).
 */
export function secondLevels(ch: readonly [Float32Array, Float32Array], rate = BAKE_RATE): number[] {
  const out: number[] = [];
  for (let s = 0; (s + 1) * rate <= ch[0].length; s++) {
    let e = 0;
    for (let i = s * rate; i < (s + 1) * rate; i++) e += ch[0][i]! * ch[0][i]! + ch[1][i]! * ch[1][i]!;
    out.push(10 * Math.log10(e / (2 * rate)));
  }
  return out;
}

/** The middle value. */
export function median(values: readonly number[]): number {
  const v = [...values].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)]!;
}
