// What the game sounds like (the sound pass, docs/ART.md §13): turns the events the client already
// gets (and a few the renderer derives: tower shots, melee blows landing) into sound effects, and
// picks the music scene from the snapshot. DOM-free, so it's tested with a fake sink.
//
// Mixing (mix.ts): your own hero, towers and kills are louder than a teammate's; off-screen sounds
// are quieter or skipped; every sound has a cooldown and a voice cap, so 300 creeps and a map full of
// towers stay music, not noise, and cost next to nothing when nothing can be heard (muted: no work).
// Every play is a new take (`Takes`): another baked variant, a slightly different pitch and level,
// a few ms of timing and more or less room, so repeats never sound identical.

import type { CreepKind, GameEvent, HeroSnap, PlayerId, Snapshot, TowerBranch, TowerSnap } from '@tdt/protocol';
import { TUNING, tuningForMode, type Tuning } from '@tdt/sim';
import { placement, OTHERS_GAIN, Takes, VoiceGate, type ViewBox } from './mix';
import type { MusicScene } from './score';
import { SOUNDS, type Priority, type SoundId } from './sounds';
import { soundSeconds } from './synth';

/** How one sound plays: level, stereo position, rate, variant, timing and reverb send. */
export interface SoundPlay {
  gain: number;
  pan: number;
  rate: number;
  variant: number;
  /** Seconds after now. */
  delay: number;
  wet: number;
}

/** Where sounds go: the engine, or a fake in the tests. */
export interface SoundSink {
  readonly sfxOn: boolean;
  play(id: string, o: SoundPlay): boolean;
}

/** Branch shots play their tower's sound at another pitch: heavier (< 1) or lighter (> 1). */
export const BRANCH_RATE: Record<TowerBranch, number> = {
  sniper: 0.8,
  volley: 1.12,
  mortar: 0.78,
  shrapnel: 1.1,
  glacier: 0.85,
  blizzard: 1,
  prism: 1.2,
  void: 0.72,
  skyguard: 0.9,
  hailstorm: 1.15,
};

/** Creep deaths by size: small creeps pop higher, big ones lower. */
const CREEP_RATE: Partial<Record<CreepKind, number>> = { runner: 1.25, hatchling: 1.4, wisp: 1.5, archer: 1.05, brute: 0.75 };

/** Quiet (ms) after a victory or defeat before the lobby music, so the fanfare rings out. */
export const END_QUIET_MS = 4500;

/** Messages (toasts) that get a sound. */
const NOTICES: Record<string, SoundId> = {
  'Not enough gold': 'noGold',
  'Not enough mana': 'deny',
  'Nothing in range': 'deny',
  'Slow down': 'deny',
};

const lengthMs = new Map<SoundId, number>();
function soundMs(id: SoundId): number {
  let ms = lengthMs.get(id);
  if (ms === undefined) lengthMs.set(id, (ms = soundSeconds(SOUNDS[id].def) * 1000));
  return ms;
}

const modeTuning = new Map<string, Tuning>();
function wavesFor(mode: Snapshot['mode']): Tuning['waves']['list'] {
  let t = modeTuning.get(mode);
  if (!t) modeTuning.set(mode, (t = tuningForMode(TUNING, mode)));
  return t.waves.list;
}

/** Whether wave `wave` (1-based) of this match brings a boss. */
export function isBossWave(mode: Snapshot['mode'], wave: number): boolean {
  return wave > 0 && (wavesFor(mode)[wave - 1]?.some((g) => TUNING.creeps[g.kind].boss) ?? false);
}

/**
 * The music for a moment of the game: the lobby loop outside a match; in a match the match loop,
 * calm while building, with its pulse during waves and everything on a boss wave (or while a boss
 * lives); after the end a pause for the fanfare, then the lobby loop.
 */
export function musicScene(snap: Snapshot | undefined, now: number, endedAt: number): MusicScene {
  if (!snap) return 'lobby';
  if (snap.phase === 'build') return 'build';
  if (snap.phase === 'waves') {
    return isBossWave(snap.mode, snap.wave) || snap.creeps.some((c) => TUNING.creeps[c.kind].boss) ? 'boss' : 'waves';
  }
  return now - endedAt < END_QUIET_MS ? 'none' : 'lobby';
}

export class GameAudio {
  private readonly gate = new VoiceGate();
  private view: ViewBox = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
  private latest: Snapshot | undefined;
  private me: PlayerId | null = null;
  private endedAt = -Infinity;
  private sceneTick = -1;
  private scene: MusicScene = 'none';
  private readonly takes = new Takes();
  /** Effects played and skipped (by the mix or the gate), and plays by id (browser tests). */
  readonly stats = { played: 0, skipped: 0, byId: {} as Record<string, number> };

  constructor(
    private readonly sink: SoundSink,
    private readonly music: { setScene(scene: MusicScene): void },
  ) {}

  /** Once a frame: what's on screen and the match state (for the music and the mix). */
  frame(latest: Snapshot | undefined, me: PlayerId | null, view: ViewBox, now: number): void {
    this.latest = latest;
    this.me = me;
    this.view = view;
    if (latest && (latest.phase === 'victory' || latest.phase === 'defeat') && this.endedAt === -Infinity) this.endedAt = now;
    // The scene only changes with a new snapshot, or while the end's quiet runs out.
    const tick = latest?.tick ?? -1;
    if (tick !== this.sceneTick || this.scene === 'none' || !latest) {
      this.sceneTick = tick;
      this.scene = musicScene(latest, now, this.endedAt);
      this.music.setScene(this.scene);
    }
  }

  /** A new match or back to the lobby. */
  reset(): void {
    this.endedAt = -Infinity;
    this.sceneTick = -1;
    this.gate.reset();
  }

  events(events: GameEvent[], now: number): void {
    if (!this.sink.sfxOn || events.length === 0) return;
    const me = this.me;
    const snap = this.latest;
    for (const e of events) {
      switch (e.type) {
        case 'kill': {
          const mine = e.by !== null && e.by === me;
          if (TUNING.creeps[e.kind].boss) this.play('bossDeath', now);
          else this.play('death', now, e, mine, CREEP_RATE[e.kind] ?? 1);
          if (mine && e.bounty > 0) this.play('coin', now, e);
          break;
        }
        case 'leak':
          this.play('heartHit', now);
          break;
        case 'waveStart':
          this.play(snap && isBossWave(snap.mode, e.wave) ? 'bossWave' : 'waveStart', now);
          break;
        case 'heroAttack': {
          // Ranged attacks sound on release; melee ones when the blade lands (`meleeHit`, from the renderer).
          const h = this.hero(e.heroId);
          if (h && TUNING.hero[h.kind].ranged) this.play(`attack.${h.kind}`, now, h, h.owner === me);
          break;
        }
        case 'cast': {
          const h = this.hero(e.heroId);
          if (!h || e.slot === 'E') break;
          // An ultimate is heard everywhere, whoever casts it and wherever they stand: nobody should miss one.
          this.play(`${h.kind}.${e.slot}`, now, e.slot === 'R' ? null : h, h.owner === me);
          break;
        }
        case 'aoe':
          if (e.effect === 'fireball') this.play('fireballHit', now, e, this.myHeroIs('arcanist'));
          else if (e.effect === 'meteor') this.play('meteorHit', now, e, this.myHeroIs('arcanist'));
          else if (e.effect === 'blizzard') {
            const t = snap?.towers.find((d) => Math.abs(d.x - e.x) < 0.01 && Math.abs(d.y - e.y) < 0.01);
            this.play('blizzard', now, e, t?.owner === me);
          }
          break;
        case 'trapTriggered':
          this.play('trap', now, e, this.myHeroIs('ranger'));
          break;
        case 'stomp':
          this.play('stomp', now, e);
          break;
        case 'hideShift':
          this.play('hideShift', now, e);
          break;
        case 'levelUp': {
          const h = this.hero(e.heroId);
          if (!h) break;
          if (h.owner === me) this.play('levelUp', now);
          else this.play('levelUp', now, h, false);
          break;
        }
        case 'heroDied': {
          const h = this.hero(e.heroId);
          if (!h) break;
          if (h.owner === me) this.play('heroDown', now);
          else this.play('heroDown', now, h, false);
          break;
        }
        case 'heroRespawned':
          if (this.hero(e.heroId)?.owner === me) this.play('respawn', now);
          break;
        case 'towerBuilt':
          this.play('build', now, this.tower(e.towerId), e.owner === me);
          break;
        case 'towerUpgraded':
          this.play(e.branch ? 'branch' : 'upgrade', now, this.tower(e.towerId), e.owner === me);
          break;
        case 'towerSold':
          this.play('sell', now, null, e.owner === me);
          break;
        case 'towerDestroyed':
          this.play('towerBreak', now);
          break;
        case 'gift':
          if (e.to === me || e.from === me) this.play('coin', now);
          break;
        case 'ping':
          // Heard even when the point is off screen (the edge marker is the picture).
          this.play('ping', now, null, e.by === me);
          break;
        case 'emote':
          this.play('emote', now, null, e.by === me);
          break;
        case 'gameOver':
          this.endedAt = now;
          this.play(e.result === 'victory' ? 'victory' : 'defeat', now);
          break;
        default:
          break;
      }
    }
  }

  /** A tower fired (the renderer saw its projectile appear). */
  towerShot(t: TowerSnap, now: number): void {
    if (!this.sink.sfxOn) return;
    // Upgraded towers sound a touch heavier.
    const rate = (t.branch ? BRANCH_RATE[t.branch] : 1) * (1 - 0.03 * (t.tier - 1));
    this.play(`shot.${t.kind}`, now, t, t.owner === this.me, rate);
  }

  /** A melee blow landed (the renderer's impact, when the blade visibly hits). */
  meleeHit(heroId: number, x: number, y: number, now: number): void {
    if (!this.sink.sfxOn) return;
    const h = this.hero(heroId);
    if (h) this.play(`attack.${h.kind}`, now, { x, y }, h.owner === this.me);
  }

  /** A message was shown ("Not enough gold"…). */
  notice(text: string, now: number): void {
    const id = NOTICES[text];
    if (id && this.sink.sfxOn) this.play(id, now);
  }

  /** A button was pressed. */
  tap(now: number): void {
    if (this.sink.sfxOn) this.play('tap', now);
  }

  /** A shared co-op flourish (mirrored ping, mirrored emote, twin ultimates, together-kill). Heard everywhere. */
  flourish(id: 'pingBurst' | 'emoteBurst' | 'twinCast' | 'togetherKill', now: number): void {
    if (!this.sink.sfxOn) return;
    this.play(id, now);
  }

  private hero(id: number): HeroSnap | undefined {
    return this.latest?.heroes.find((h) => h.id === id);
  }

  private tower(id: number): TowerSnap | null {
    return this.latest?.towers.find((t) => t.id === id) ?? null;
  }

  private myHeroIs(kind: HeroSnap['kind']): boolean {
    return this.latest?.heroes.some((h) => h.owner === this.me && h.kind === kind) ?? false;
  }

  /**
   * Plays `id` if the mix lets it: `at` places it on the map (null / absent: heard everywhere, like
   * the Heart or the UI), `mine` says whether it's yours.
   */
  private play(id: string, now: number, at: { x: number; y: number } | null = null, mine = true, rate = 1): void {
    if (!(id in SOUNDS)) return;
    const sid = id as SoundId;
    const spec = SOUNDS[sid];
    let gain = spec.volume * (mine ? 1 : OTHERS_GAIN);
    let pan = 0;
    if (at) {
      const p = placement(at.x, at.y, this.view, mine);
      if (!p) {
        this.stats.skipped++;
        return;
      }
      gain *= p.gain;
      pan = p.pan;
    }
    const priority = (mine ? Math.min(2, spec.priority + 1) : spec.priority) as Priority;
    if (!this.gate.admit(sid, mine ? `${sid}!` : sid, spec, priority, soundMs(sid) / rate, now)) {
      this.stats.skipped++;
      return;
    }
    const take = this.takes.next(sid, spec);
    if (!this.sink.play(sid, { gain: gain * take.gain, pan, rate: rate * take.rate, variant: take.variant, delay: take.delay, wet: take.wet })) return;
    this.stats.played++;
    this.stats.byId[sid] = (this.stats.byId[sid] ?? 0) + 1;
  }
}
