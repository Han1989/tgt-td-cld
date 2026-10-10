// Shared rigs (docs/ART.md §7): styled entities are atlas sprites animated by moving parts only
// (position, rotation, scale, tint, alpha). Nothing is redrawn per frame and nothing toggles
// `visible` per frame (in Pixi v8 that rebuilds the draw list); flashes and hidden parts use alpha.

import type { CreepSnap, SkillSlot, TowerBranch } from '@tdt/protocol';
import { TUNING } from '@tdt/sim';
import { Container, Graphics, type ColorSource, type Sprite } from 'pixi.js';
import type { ArtKit } from './kit';
import type { CreepArt, Gait, HeroPose, HeroRig, TowerArt } from './registry';

/** Walk cycles for creeps (CreepArt.gait). */
export const GAITS = {
  /** Small, light creeps: quick steps, big rock and hop. */
  waddle: { stepMs: 105, rock: 0.15, hop: 2.2, squash: 0 },
  /** Fast, light creeps: very quick steps, a small rock, a long hop. */
  scurry: { stepMs: 62, rock: 0.08, hop: 2.6, squash: 0 },
  /** Heavy creeps: slow steps, little rock, a squash on each step. */
  stomp: { stepMs: 190, rock: 0.07, hop: 1.2, squash: 0.05 },
  /** Many-legged creeps: quick short steps, almost no rock, a squash on each step. */
  crawl: { stepMs: 120, rock: 0.03, hop: 0.7, squash: 0.06 },
  /** Flyers: a slow, smooth bob over their shadow and a gentle sway. */
  hover: { stepMs: 260, rock: 0.06, hop: 2.4, squash: 0, smooth: true },
} as const satisfies Record<string, Gait>;

// ---------------------------------------------------------------------------
// Hit and death reactions (docs/ART.md §7), shared by every rig.
// ---------------------------------------------------------------------------

/**
 * Hit flash: the white silhouette shows this long, at most this often, and at most this strong (a
 * partial whitening), so a creep under steady fire keeps its colours and silhouette almost always.
 */
export const HIT_FLASH = { ms: 60, everyMs: 300, alpha: 0.6 } as const;
/** How much a hit squashes the body (fraction of its size at full flash); bosses flinch half as much. */
const FLINCH = 0.09;

/** Death reactions: how long they last (ms) and how the body falls. */
export const DEATH = {
  /** Creeps collapse: a pop, a small tip backwards, flattened into the ground, faded. */
  creep: { ms: 340, tip: 0.35, squash: 0.72, widen: 0.2, sink: 0, shudder: 0 },
  /** Bosses sink slowly, shuddering, and fade. */
  boss: { ms: 800, tip: 0.12, squash: 0.5, widen: 0.12, sink: 6, shudder: 1.6 },
  /** Heroes fall over backwards (their shadow is a separate sprite, so it stays put). */
  hero: { ms: 560, tip: 1.45, squash: 0.12, widen: 0, sink: 0, shudder: 0 },
} as const;
export type DeathStyle = (typeof DEATH)[keyof typeof DEATH];

export interface DeathPose {
  rot: number;
  sx: number;
  sy: number;
  dx: number;
  dy: number;
  alpha: number;
  flash: number;
}

/**
 * Knockback wobble of a creep hit by a melee blow (Warden): pushed away from the blow and back, with
 * a tilt that rings out. `px` / `tilt` are the peaks for a creep (bosses take half).
 */
export const KNOCK = { ms: 260, px: 4, tilt: 0.2 } as const;

/** Knockback at progress t (0..1): push (0..1 of KNOCK.px, away from the blow) and tilt (radians, away). Pure (tested). */
export function knockPose(t: number): { push: number; tilt: number } {
  if (t < 0 || t >= 1) return { push: 0, tilt: 0 };
  const push = t < 0.18 ? smooth(t / 0.18) : 1 - smooth((t - 0.18) / 0.82);
  return { push, tilt: KNOCK.tilt * Math.sin(t * Math.PI * 2.5) * (1 - t) };
}

export const smooth = (t: number) => t * t * (3 - 2 * t);
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/**
 * The death reaction at progress t (0..1) for a body facing +x (mirror `rot` and `dx` when it faces
 * left): a white flash and a small pop, then it tips backwards around its feet, squashes into the
 * ground and fades. Pure (tested).
 */
export function deathPose(t: number, d: DeathStyle): DeathPose {
  const pop = t < 0.15 ? Math.sin((t / 0.15) * Math.PI) * 0.12 : 0;
  const fall = smooth(clamp01((t - 0.08) / 0.62));
  return {
    rot: -d.tip * fall,
    sx: 1 + pop + d.widen * fall,
    sy: 1 + pop - d.squash * fall,
    dx: d.shudder * Math.sin(t * 90) * (1 - t),
    dy: d.sink * fall,
    alpha: 1 - smooth(clamp01((t - 0.45) / 0.55)),
    flash: HIT_FLASH.alpha * (1 - clamp01(t / 0.25)),
  };
}

// ---------------------------------------------------------------------------
// Creeps: one sprite (shadow and weapon baked in) that rocks around its feet, hops each step and
// flips to its walking direction, plus a white silhouette on top for hit flashes. Flyers keep their
// shadow as a second sprite on the ground, so the body can bob over it.
// ---------------------------------------------------------------------------

export class CreepRig {
  readonly body: Sprite;
  /** Hit flash: copies the body's transform while it shows; alpha only. */
  readonly flash: Sprite;
  /** A flyer's shadow on the ground (walkers have theirs baked into `body`). */
  readonly shadow: Sprite | null;
  private lastX = NaN;
  private flip = 1;
  private frame = 'body';
  private flinch = 0;
  private dead = false;
  private readonly death: DeathStyle;
  /** Last melee knockback: when, and the direction away from the blow (unit vector). */
  private knockAt = -Infinity;
  private knockX = 0;
  private knockY = 0;

  constructor(
    private readonly kit: ArtKit,
    private readonly art: CreepArt,
  ) {
    const h = art.frames.body!.h;
    // Pivot at the feet.
    const ay = (h / 2 + art.feet) / h;
    this.body = kit.sprite(art.id, 'body', 0.5, ay);
    this.flash = kit.sprite(art.id, 'body.flash', 0.5, ay);
    this.flash.alpha = 0;
    this.body.position.set(0, art.feet);
    this.flash.position.set(0, art.feet);
    this.shadow = art.frames.shadow ? kit.sprite(art.id, 'shadow') : null;
    this.shadow?.position.set(0, art.feet);
    this.death = TUNING.creeps[art.kind].boss ? DEATH.boss : DEATH.creep;
  }

  /** How long this creep's death reaction lasts, ms. */
  get deathMs(): number {
    return this.death.ms;
  }

  get facing(): number {
    return this.flip;
  }

  /** A pooled rig starts a new creep (facing: carry over a dead creep's facing). */
  reset(facing = 1): void {
    this.lastX = NaN;
    this.flip = facing;
    this.flinch = 0;
    this.knockAt = -Infinity;
    this.body.alpha = 1;
    if (this.shadow) this.shadow.alpha = 1;
    this.dead = false;
    this.setFrame('body');
  }

  /** Shows one of the art's variants (e.g. Shardback's Ether hide); set only when it changes. */
  setFrame(frame: string): void {
    if (frame === this.frame) return;
    this.frame = frame;
    this.body.texture = this.kit.frame(this.art.id, frame);
    this.flash.texture = this.kit.frame(this.art.id, `${frame}.flash`);
  }

  /** Shows the look the art picks for this creep (e.g. Shardback's hide), if it has variants. */
  setVariant(c: CreepSnap): void {
    if (this.art.variants) this.setFrame(this.art.variants.pick(c));
  }

  /** A melee blow hit it at `now`, from direction (dx, dy) (towards the creep). */
  knock(now: number, dx: number, dy: number): void {
    const d = Math.hypot(dx, dy) || 1;
    this.knockAt = now;
    this.knockX = dx / d;
    this.knockY = dy / d;
  }

  update(x: number, seed: number, still: boolean, now: number): void {
    const dx = x - this.lastX;
    if (Math.abs(dx) > 0.002) this.flip = dx < 0 ? -1 : 1;
    this.lastX = x;
    const b = this.body;
    const g: Gait = this.art.gait;
    const k = this.flinch * (this.death === DEATH.boss ? FLINCH / 2 : FLINCH);
    if (still) {
      b.rotation = 0;
      b.position.set(0, this.art.feet);
      b.scale.set(this.flip * (1 + k), 1 - k);
    } else {
      const s = Math.sin(now / g.stepMs + seed * 1.7);
      const hop = g.smooth ? (s + 1) / 2 : Math.abs(s);
      b.rotation = (g.smooth ? Math.cos(now / g.stepMs + seed * 1.7) : s) * g.rock;
      b.position.set(0, this.art.feet - hop * g.hop);
      b.scale.set(this.flip * (1 + k), (1 - (1 - hop) * g.squash) * (1 - k));
    }
    const kt = (now - this.knockAt) / KNOCK.ms;
    if (kt >= 0 && kt < 1) {
      // Pushed away from the blow and back, tilting away (only while it plays: no cost otherwise).
      const kp = knockPose(kt);
      const m = this.death === DEATH.boss ? 0.5 : 1;
      b.position.x += this.knockX * kp.push * KNOCK.px * m;
      b.position.y += this.knockY * kp.push * KNOCK.px * m * 0.6;
      b.rotation += (this.knockX >= 0 ? 1 : -1) * kp.tilt * m;
    }
    if (this.flash.alpha > 0 || kt < 1) this.copyToFlash();
  }

  /** Flash strength 0..1 (alpha of the white silhouette); the body flinches with it. */
  setFlash(f: number): void {
    this.flash.alpha = f;
    this.flinch = f / HIT_FLASH.alpha;
    if (f > 0) this.copyToFlash();
  }

  /** Whole-rig tint (frost). */
  setTint(tint: ColorSource): void {
    this.body.tint = tint;
  }

  /** Death reaction at progress t (0..1 of deathMs): flash, pop, collapse into the ground, fade. */
  die(t: number): void {
    const d = deathPose(t, this.death);
    const b = this.body;
    if (!this.dead) {
      this.dead = true;
      b.tint = 0xffffff;
    }
    b.rotation = d.rot * this.flip;
    b.scale.set(this.flip * d.sx, d.sy);
    // The squash is around the feet, so a flyer (pivot on its shadow) drops onto its shadow.
    b.position.set(d.dx * this.flip, this.art.feet + d.dy);
    if (this.shadow) this.shadow.alpha = d.alpha;
    b.alpha = d.alpha;
    this.flash.alpha = d.flash * d.alpha;
    this.copyToFlash();
  }

  private copyToFlash(): void {
    const b = this.body;
    this.flash.rotation = b.rotation;
    this.flash.position.copyFrom(b.position);
    this.flash.scale.copyFrom(b.scale);
  }
}

// ---------------------------------------------------------------------------
// Heroes: each hero's file builds its own rig on HeroRigBase, which does what they share: the
// `mine` ring and contact shadow, walking speed and step phase, the facing flip, the hit flash
// (every part carries its white silhouette), the attack and cast clocks and the death fall.
// ---------------------------------------------------------------------------

/** How long a cast pose lasts, ms (hero files shape it; the effect itself is in render/fx). */
export const CAST_MS = 480;

/** A standing hero's slow breath (px, at most 0.35 up or down): the rigs' idle bob, and the standing poses'. */
export const breath = (now: number): number => Math.sin(now / 500) * 0.35;

export abstract class HeroRigBase implements HeroRig {
  readonly body = new Container();
  /** Everything that flips with the facing, flinches and falls over; pivots at the feet. */
  protected readonly flipper = new Container();
  private readonly ground = new Container();
  private readonly flashes: Sprite[] = [];
  private flashShown = 0;
  private lastX = NaN;
  private lastY = NaN;
  /** Smoothed speed (tiles/s) and walk-cycle phase (radians). */
  protected speed = 0;
  protected phase = 0;
  /** +1 facing right, -1 facing left. */
  protected flip = 1;
  protected shotAt = -Infinity;
  /** Direction of the last attack's target (radians), NaN when unknown. */
  protected shotAim = NaN;
  /** The facing this frame (the snapshot's, unless the rig turns to its target: `faceOverride`). */
  protected facing = 0;
  protected castAt = -Infinity;
  protected castSlot: SkillSlot = 'Q';
  private hitAt = -Infinity;
  private dead = false;

  constructor(
    protected readonly kit: ArtKit,
    protected readonly id: string,
    mine: boolean,
    /** Feet, px below the hero's position. */
    protected readonly feet: number,
    /** Ground ring / shadow radius, px. */
    ring: number,
  ) {
    if (mine) {
      // Your hero: a ring on the ground (drawn once).
      this.ground.addChild(new Graphics().ellipse(0, feet + 1, ring, ring * 0.4).stroke({ width: 2, color: 0xffffff, alpha: 0.9 }));
    }
    const shadow = kit.sprite('common', 'shadow');
    shadow.position.set(0, feet + 1);
    shadow.scale.set(ring / 25);
    this.ground.addChild(shadow);
    this.flipper.pivot.set(0, feet);
    this.flipper.position.set(0, feet);
    this.body.addChild(this.ground, this.flipper);
  }

  /** A part: its sprite plus its white silhouette (when the frame bakes one), moved as one. */
  protected part(frame: string, ax = 0.5, ay = 0.5): Container {
    const c = new Container();
    c.addChild(this.kit.sprite(this.id, frame, ax, ay));
    if (this.kit.has(this.id, `${frame}.flash`)) {
      const f = this.kit.sprite(this.id, `${frame}.flash`, ax, ay);
      f.alpha = 0;
      c.addChild(f);
      this.flashes.push(f);
    }
    return c;
  }

  shot(now: number, aim?: number): number {
    this.shotAt = now;
    this.shotAim = aim ?? NaN;
    return 0;
  }

  cast(now: number, slot: SkillSlot): void {
    this.castAt = now;
    this.castSlot = slot;
  }

  hit(now: number): void {
    if (now - this.hitAt >= HIT_FLASH.everyMs) this.hitAt = now;
  }

  update(h: HeroPose, now: number, dtMs: number): void {
    if (this.dead) this.standUp();
    if (!Number.isNaN(this.lastX) && dtMs > 0) {
      const v = (Math.hypot(h.x - this.lastX, h.y - this.lastY) * 1000) / dtMs;
      this.speed += (v - this.speed) * Math.min(1, dtMs / 90);
    }
    this.lastX = h.x;
    this.lastY = h.y;
    const walking = this.speed > 0.4 && !h.stunned;
    if (walking) this.phase += (dtMs / 1000) * (7 + this.speed * 2.2);
    this.facing = this.faceOverride(now) ?? h.facing;
    this.flip = Math.cos(this.facing) < -0.05 ? -1 : 1;
    const since = now - this.hitAt;
    const f = since < HIT_FLASH.ms ? Math.ceil((1 - since / HIT_FLASH.ms) * 4) / 4 : 0;
    const k = f * FLINCH;
    this.flipper.scale.set(this.flip * (1 + k), 1 - k);
    this.setFlash(f * HIT_FLASH.alpha);
    this.pose(h, walking, now, dtMs);
  }

  die(t: number): void {
    this.dead = true;
    const d = deathPose(t, DEATH.hero);
    this.flipper.rotation = d.rot * this.flip;
    this.flipper.scale.set(this.flip * d.sx, d.sy);
    this.flipper.alpha = d.alpha;
    this.ground.alpha = d.alpha;
    this.setFlash(d.flash);
  }

  /** Poses the parts for this frame (the flipper is already flipped: draw facing +x). */
  protected abstract pose(h: HeroPose, walking: boolean, now: number, dtMs: number): void;

  /** A facing to use instead of the snapshot's this frame (e.g. towards the target of a swing), or null. */
  protected faceOverride(_now: number): number | null {
    return null;
  }

  /** Aim (radians) in the flipped frame, from this frame's facing. */
  protected aim(_h: HeroPose): number {
    const a = this.flip > 0 ? this.facing : Math.PI - this.facing;
    // Within (-π, π], so a rig can scale it (turn part of the way to a target).
    return Math.atan2(Math.sin(a), Math.cos(a));
  }

  /** Cast progress 0..1, or -1 when not casting. */
  protected casting(now: number, ms = CAST_MS): number {
    const t = (now - this.castAt) / ms;
    return t >= 0 && t < 1 ? t : -1;
  }

  /** Walk bob (px): a bounce each step when walking, a slow breath (≤ 0.5 px) when standing. */
  protected bob(walking: boolean, now: number, px: number): number {
    return walking ? Math.abs(Math.sin(this.phase)) * px : breath(now);
  }

  /** Places the two feet for the walk cycle (together when standing). */
  protected stepFeet(a: Container, b: Container, spread: number, stride: number, lift: number, walking: boolean): void {
    const s = walking ? Math.sin(this.phase) : 0;
    const c = walking ? Math.cos(this.phase) : 0;
    a.position.set(-spread + c * stride, this.feet - Math.max(0, s) * lift);
    b.position.set(spread - c * stride, this.feet - Math.max(0, -s) * lift);
  }

  private setFlash(a: number): void {
    if (a === this.flashShown) return;
    this.flashShown = a;
    for (const f of this.flashes) f.alpha = a;
  }

  private standUp(): void {
    this.dead = false;
    this.flipper.rotation = 0;
    this.flipper.alpha = 1;
    this.ground.alpha = 1;
    this.castAt = -Infinity;
    this.shotAt = -Infinity;
  }
}

/** Envelope of a pose that eases in, holds and eases out over t = 0..1. */
export function hold(t: number, inEnd = 0.2, outStart = 0.75): number {
  if (t < 0 || t >= 1) return 0;
  if (t < inEnd) return smooth(t / inEnd);
  if (t > outStart) return smooth((1 - t) / (1 - outStart));
  return 1;
}

// ---------------------------------------------------------------------------
// Towers: a base per tier / branch and a turret that turns towards its target.
// ---------------------------------------------------------------------------

/** Turret turn rate, rad/s. */
const TURN_RATE = 7;

export class TowerRig {
  readonly body = new Container();
  private readonly base: Sprite;
  private readonly turret = new Container();
  private readonly gun: Sprite;
  private angle = -Math.PI / 2;
  private key = '';

  constructor(
    private readonly kit: ArtKit,
    private readonly art: TowerArt,
  ) {
    const shadow = kit.sprite('common', 'shadow');
    shadow.scale.set(2.0, 3.2);
    shadow.position.set(2, 4);
    this.base = kit.sprite(art.id, 'base1');
    this.gun = kit.sprite(art.id, 'top1');
    this.turret.addChild(this.gun);
    this.turret.rotation = art.turret ? this.angle : 0;
    this.body.addChild(shadow, this.base, this.turret);
  }

  get turns(): boolean {
    return this.art.turret;
  }

  setTier(tier: number, branch: TowerBranch | null): void {
    const key = `${tier}${branch ?? ''}`;
    if (key === this.key) return;
    this.key = key;
    const t = Math.min(3, tier);
    const pick = (part: 'base' | 'top') => (branch && this.kit.has(this.art.id, `${branch}.${part}`) ? `${branch}.${part}` : `${part}${t}`);
    this.base.texture = this.kit.frame(this.art.id, pick('base'));
    this.gun.texture = this.kit.frame(this.art.id, pick('top'));
  }

  /** Turn towards `target` (radians) at a capped rate. */
  aim(target: number, dtMs: number): void {
    if (!this.art.turret) return;
    let d = target - this.angle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const max = (TURN_RATE * dtMs) / 1000;
    this.angle += Math.max(-max, Math.min(max, d));
    this.turret.rotation = this.angle;
  }

  /** Recoil: the gun slides back along its barrel (px). */
  kick(px: number): void {
    this.gun.x = -px;
  }
}
