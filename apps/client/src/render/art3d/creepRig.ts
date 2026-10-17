// A creep or boss in a match from its 3D frames (docs/ART.md §7 and §15, V-05c): one rig for every kind, driven by
// its layout, on the same terms as the 2D CreepRig (render/art/rigs.ts) so the renderer, its pool and its death queue
// treat both alike. The frames carry the motion the 2D rig made with transforms:
//
// - walk: the clip's cycle, stepped at the pace that keeps a planted foot on the ground (`creepCadence`); a flyer bobs
//   slowly over its shadow, which stays on the ground (the 2D Wisp's `hover` gait and its shadow frame).
// - stand: rooted or stunned (as the 2D rig, it stands still), or between blows.
// - attack: a creep that stops (it only stops to fight) plays its attack every attack cooldown; an Archer's from its
//   shot (the renderer finds who fired).
// - the hit flash: the flinch frame and its white twin, the twin's alpha the flash (docs/ART.md §7).
// - death: the flinch while the death's flash fades, the death frames, then the fade (`creepDeathFrame`).
// - a boss's ability (Stomp, Hatch, the hide shift) on the boss events the client already gets.
// - the Shardback's hide: its spines lit violet (additive, `hideEther`) while the Ether hide is up.
//
// The knockback from a melee blow is the 2D rig's (`knockPose`). Nothing is redrawn; frames swap only when they change.

import type { CreepKind, CreepSnap } from '@tdt/protocol';
import { TUNING } from '@tdt/sim';
import { Container, Sprite, type ColorSource, type Texture } from 'pixi.js';
import type { ArtKit } from '../art/kit';
import { creepArt, type CreepRigView } from '../art/registry';
import { GAITS, KNOCK, knockPose } from '../art/rigs';
import { RL } from '../art/tokens';
import { ABILITY_MS, attackMs, CREEP_DEATH, creepCadence, creepDeathFrame, type CreepState } from './creeps';
import type { CreepFrame, CreepFrames } from './creepSheet';
import { cycleFrame } from './layout';

/** Tiles a second under which a creep stands (it fights, or waits). */
const MOVING = 0.15;
/** A flyer's bob over its shadow: the 2D Wisp's hover gait. */
const HOVER = GAITS.hover;
/** The Shardback's lit spines while the Ether hide is up. */
const HIDE_GLOW = 0.85;

export class Creep3DRig implements CreepRigView {
  /** The frame sprite itself, as the 2D rig's body (one node a creep); the Shardback's holds its hide's glow too. */
  readonly body: Container;
  readonly flash: Sprite;
  readonly shadow: Sprite | null;
  readonly deathMs: number;
  readonly is3d = true;
  readonly barY: number;
  /** The states this rig has shown (browser tests). */
  readonly shownStates = new Set<CreepState>();
  private readonly sprite: Sprite;
  private readonly hideSprite: Sprite | null;
  private readonly frames: CreepFrames['frames'];
  private readonly hide: CreepFrames['hide'];
  private readonly res: number;
  /** The body's own scale: the sheet's 1/res when the body is the frame sprite, else 1 (the sprite carries it). */
  private readonly k: number;
  private readonly feet: number;
  private readonly boss: boolean;
  private readonly flyer: boolean;
  private readonly cooldownS: number;
  private readonly attackFor: number;
  private readonly nominal: number;
  private readonly stride: number | null;
  private readonly cycleMs: number;
  private readonly baseMr: number;
  private shown: CreepFrame | null = null;
  private hideShown: Texture | null = null;
  private flip = 1;
  private lastX = NaN;
  private lastY = NaN;
  private lastAt = NaN;
  private seed = 0;
  private speed = 0;
  private phase = 0;
  private flashLevel = 0;
  private attackAt = -Infinity;
  private abilityAt = -Infinity;
  private knockAt = -Infinity;
  private knockX = 0;
  private knockY = 0;
  private ether = false;
  private dead = false;
  /** The body's transform is off its rest (a knockback or a flyer's bob): set it again next frame. */
  private moved = true;
  private shownFlip = 0;
  private lastState: CreepState | null = null;

  constructor(
    kit: ArtKit,
    readonly kind: CreepKind,
    sheet: CreepFrames,
  ) {
    const L = sheet.layout;
    const t = TUNING.creeps[kind];
    this.frames = sheet.frames;
    this.hide = sheet.hide;
    this.res = L.res;
    this.boss = t.boss;
    this.flyer = t.flying;
    this.cooldownS = t.attackCooldown;
    this.attackFor = attackMs(t.attackCooldown);
    this.nominal = t.speed;
    this.stride = L.walkStride;
    this.cycleMs = L.cycleMs;
    this.baseMr = t.magicResist;
    this.deathMs = t.boss ? CREEP_DEATH.bossMs : CREEP_DEATH.creepMs;
    // The feet where the 2D art has them, so the creep stands on the same spot of its circle.
    const art = creepArt(kind);
    const r = t.radius * 32;
    this.feet = art?.feet ?? Math.round(r * 0.9);
    // The HP bar clears the figure's head (the 3D figures stand taller than the 2D creeps' round bodies).
    const top = this.feet - (L.top ?? 2 * r) - (this.flyer ? HOVER.hop : 0);
    this.barY = Math.min(-r - 7, top - 5);
    const ax = L.box.ax / L.box.w;
    const ay = L.box.ay / L.box.h;
    const first = this.frames.walk[0]!;
    this.sprite = new Sprite(first.tex);
    this.sprite.anchor.set(ax, ay);
    this.flash = new Sprite(this.frames.hit[0]!.flash!);
    this.flash.anchor.set(ax, ay);
    this.flash.alpha = 0;
    this.hideSprite = null;
    if (this.hide) {
      // The Shardback: its spines' glow over the frame, moved with it.
      this.body = new Container();
      this.k = 1;
      this.sprite.scale.set(1 / this.res);
      this.hideSprite = new Sprite(first.tex);
      this.hideSprite.anchor.set(ax, ay);
      this.hideSprite.scale.set(1 / this.res);
      this.hideSprite.blendMode = 'add';
      this.hideSprite.tint = RL.hideEther;
      this.hideSprite.alpha = 0;
      this.body.addChild(this.sprite, this.hideSprite);
    } else {
      this.body = this.sprite;
      this.k = 1 / this.res;
    }
    // A flyer's shadow stays on the ground under the bobbing body (the 2D Wisp's own shadow frame).
    this.shadow = null;
    if (this.flyer) {
      this.shadow = kit.has(kind, 'shadow') ? kit.sprite(kind, 'shadow') : kit.sprite('common', 'shadow');
      this.shadow.position.set(0, this.feet);
    }
    this.body.position.set(0, this.feet);
    this.body.scale.set(this.k);
    this.copyToFlash();
  }

  get facing(): number {
    return this.flip;
  }

  reset(facing = 1): void {
    this.flip = facing;
    this.lastX = this.lastY = this.lastAt = NaN;
    this.speed = 0;
    this.flashLevel = 0;
    this.attackAt = this.abilityAt = this.knockAt = -Infinity;
    this.dead = false;
    this.ether = false;
    this.body.alpha = 1;
    this.flash.alpha = 0;
    if (this.shadow) this.shadow.alpha = 1;
    if (this.hideSprite) this.hideSprite.alpha = 0;
    this.body.rotation = 0;
    this.body.position.set(0, this.feet);
    this.body.scale.set(this.flip * this.k, this.k);
    this.shownFlip = this.flip;
    this.moved = false;
    this.shown = null;
    this.lastState = null;
    this.show('walk', 0);
    this.copyToFlash();
  }

  setVariant(c: CreepSnap): void {
    if (!this.hideSprite) return;
    // The Ether hide raises its magic resist above the base value (as the 2D Shardback's pick).
    const ether = c.magicResist > this.baseMr + 0.01;
    if (ether === this.ether) return;
    this.ether = ether;
    this.hideSprite.alpha = ether ? HIDE_GLOW : 0;
    this.hideShown = null;
  }

  knock(now: number, dx: number, dy: number): void {
    const d = Math.hypot(dx, dy) || 1;
    this.knockAt = now;
    this.knockX = dx / d;
    this.knockY = dy / d;
  }

  shot(now: number): void {
    // The frames lead up to the blow: the release lands on the shot.
    this.attackAt = now - this.attackFor * 0.75;
  }

  ability(now: number): void {
    if (this.frames.ability) this.abilityAt = now;
  }

  setFlash(f: number): void {
    this.flashLevel = f;
  }

  setTint(tint: ColorSource): void {
    this.sprite.tint = tint;
  }

  update(x: number, seed: number, still: boolean, now: number, y = 0): void {
    if (Number.isNaN(this.lastAt)) {
      // A new creep: its own phase, so a pack doesn't step in time.
      this.seed = seed;
      this.phase = seed * 1.7;
    } else {
      const dt = now - this.lastAt;
      const dx = x - this.lastX;
      if (Math.abs(dx) > 0.002) this.flip = dx < 0 ? -1 : 1;
      if (dt > 0) {
        const dy = y - this.lastY;
        const v = (Math.sqrt(dx * dx + dy * dy) * 1000) / dt;
        this.speed += (v - this.speed) * Math.min(1, dt / 90);
      }
    }
    const dtMs = Number.isNaN(this.lastAt) ? 0 : Math.min(100, now - this.lastAt);
    this.lastX = x;
    this.lastY = y;
    this.lastAt = now;

    let state: CreepState = 'idle';
    let i = 0;
    if (now - this.abilityAt < ABILITY_MS && this.frames.ability) {
      state = 'ability';
      i = Math.min(this.frames.ability.length - 1, Math.floor(((now - this.abilityAt) / ABILITY_MS) * this.frames.ability.length));
    } else if (this.flashLevel > 0) {
      state = 'hit';
    } else if (still) {
      this.attackAt = -Infinity;
    } else if (this.speed > MOVING) {
      // How much larger the creep is drawn (its root: V-04's creep scale): the stride is in world px.
      const scale = Math.abs(this.body.parent?.scale.x ?? 1) || 1;
      this.phase += (dtMs / 1000) * Math.PI * 2 * creepCadence(this.speed, scale, this.stride, this.cycleMs, this.nominal);
      state = 'walk';
      i = cycleFrame(this.phase, this.frames.walk.length);
    } else if (this.frames.attack) {
      // It only stops to fight: a blow every attack cooldown, the stand between.
      if (now - this.attackAt >= this.cooldownS * 1000) this.attackAt = now;
      const u = (now - this.attackAt) / this.attackFor;
      if (u < 1) {
        state = 'attack';
        i = Math.min(this.frames.attack.length - 1, Math.floor(u * this.frames.attack.length));
      }
    }
    this.show(state, i);
    this.flash.alpha = state === 'hit' ? this.flashLevel : 0;

    // The body moves only for a knockback, a flyer's bob or a turn (the walk is in the frames): most frames, nothing to set.
    const kt = (now - this.knockAt) / KNOCK.ms;
    const knocked = kt >= 0 && kt < 1;
    if (knocked || this.flyer || this.moved || this.flip !== this.shownFlip) {
      const b = this.body;
      let px = 0;
      let py = this.feet;
      let rot = 0;
      if (this.flyer) py -= ((Math.sin(now / HOVER.stepMs + this.seed * 1.7) + 1) / 2) * HOVER.hop;
      if (knocked) {
        // Pushed away from the blow and back, tilting away (the 2D rig's knockback; bosses half).
        const kp = knockPose(kt);
        const m = this.boss ? 0.5 : 1;
        px += this.knockX * kp.push * KNOCK.px * m;
        py += this.knockY * kp.push * KNOCK.px * m * 0.6;
        rot = (this.knockX >= 0 ? 1 : -1) * kp.tilt * m;
      }
      b.position.set(px, py);
      b.rotation = rot;
      b.scale.set(this.flip * this.k, this.k);
      this.shownFlip = this.flip;
      this.moved = knocked;
      this.copyToFlash();
    } else if (this.flash.alpha > 0) {
      this.copyToFlash();
    }
  }

  die(t: number): void {
    if (!this.dead) {
      this.dead = true;
      this.sprite.tint = 0xffffff;
      if (this.hideSprite) this.hideSprite.alpha = 0;
      this.body.rotation = 0;
      this.body.position.set(0, this.feet);
      this.body.scale.set(this.flip * this.k, this.k);
      this.shownFlip = this.flip;
      this.moved = true;
    }
    const d = creepDeathFrame(t, this.frames.death.length);
    this.show(d.state, d.i);
    this.body.alpha = d.alpha;
    if (this.shadow) this.shadow.alpha = d.alpha;
    this.flash.alpha = d.flash * d.alpha;
    this.copyToFlash();
  }

  private show(state: CreepState, i: number): void {
    const list = this.frames[state] ?? this.frames.idle;
    const f = list[i] ?? list[0]!;
    if (f !== this.shown) {
      this.shown = f;
      this.sprite.texture = f.tex;
      if (f.flash) this.flash.texture = f.flash;
      if (state !== this.lastState) {
        this.lastState = state;
        this.shownStates.add(state);
      }
    }
    if (this.hideSprite && this.ether) {
      const h = this.hide?.[state]?.[i] ?? this.hide?.idle?.[0];
      if (h && h !== this.hideShown) {
        this.hideShown = h;
        this.hideSprite.texture = h;
      }
    }
  }

  private copyToFlash(): void {
    const b = this.body;
    this.flash.position.copyFrom(b.position);
    this.flash.rotation = b.rotation;
    this.flash.scale.set((b.scale.x / this.k) / this.res, (b.scale.y / this.k) / this.res);
  }
}
