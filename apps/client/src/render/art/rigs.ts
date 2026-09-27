// Shared rigs (docs/ART.md §7): styled entities are atlas sprites animated by moving parts only
// (position, rotation, scale, tint, alpha). Nothing is redrawn per frame and nothing toggles
// `visible` per frame (in Pixi v8 that rebuilds the draw list); flashes and hidden parts use alpha.

import type { TowerBranch } from '@tdt/protocol';
import { Container, type ColorSource, type Sprite } from 'pixi.js';
import type { ArtKit } from './kit';
import type { CreepArt, Gait, TowerArt } from './registry';

/** Walk cycles for creeps (CreepArt.gait). */
export const GAITS = {
  /** Small, light creeps: quick steps, big rock and hop. */
  waddle: { stepMs: 105, rock: 0.15, hop: 2.2, squash: 0 },
  /** Heavy creeps: slow steps, little rock, a squash on each step. */
  stomp: { stepMs: 190, rock: 0.07, hop: 1.2, squash: 0.05 },
} as const satisfies Record<string, Gait>;

// ---------------------------------------------------------------------------
// Creeps: one sprite (shadow and weapon baked in) that rocks around its feet, hops each step and
// flips to its walking direction, plus a white silhouette on top for hit flashes.
// ---------------------------------------------------------------------------

export class CreepRig {
  readonly body: Sprite;
  /** Hit flash: copies the body's transform while it shows; alpha only. */
  readonly flash: Sprite;
  private lastX = NaN;
  private flip = 1;

  constructor(
    kit: ArtKit,
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
  }

  /** A pooled rig starts a new creep. */
  reset(): void {
    this.lastX = NaN;
  }

  update(x: number, seed: number, still: boolean, now: number): void {
    const dx = x - this.lastX;
    if (Math.abs(dx) > 0.002) this.flip = dx < 0 ? -1 : 1;
    this.lastX = x;
    const b = this.body;
    const g = this.art.gait;
    if (still) {
      b.rotation = 0;
      b.position.y = this.art.feet;
      b.scale.set(this.flip, 1);
    } else {
      const s = Math.sin(now / g.stepMs + seed * 1.7);
      const hop = Math.abs(s);
      b.rotation = s * g.rock;
      b.position.y = this.art.feet - hop * g.hop;
      b.scale.set(this.flip, 1 - (1 - hop) * g.squash);
    }
    if (this.flash.alpha > 0) {
      this.flash.rotation = b.rotation;
      this.flash.position.y = b.position.y;
      this.flash.scale.copyFrom(b.scale);
    }
  }

  /** Flash strength 0..1 (alpha of the white silhouette). */
  setFlash(f: number): void {
    this.flash.alpha = f;
    if (f > 0) {
      this.flash.rotation = this.body.rotation;
      this.flash.position.y = this.body.position.y;
      this.flash.scale.copyFrom(this.body.scale);
    }
  }

  /** Whole-rig tint (frost). */
  setTint(tint: ColorSource): void {
    this.body.tint = tint;
  }
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
