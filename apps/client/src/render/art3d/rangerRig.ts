// The Ranger in a match, from his 3D frames (docs/ART.md §15): three layers. The body (3/4 view, no arms) shows its
// idle, walk or cast frame; the bow layer (both arms and the bow, in profile) hangs at the shoulder of that frame and
// turns towards the target, showing how far the string is drawn; the head of that frame goes over both, so the bow
// never covers the face. Everything the 2D rig
// times is timed the same (entities/ranger.ts): the draw over the cooldown, the release, the cast aims and loose,
// the facing flip; HeroRigBase gives the ring, shadow, flinch, hit flash and death fall.

import type { SkillSlot } from '@tdt/protocol';
import { TUNING } from '@tdt/sim';
import { Container, Sprite } from 'pixi.js';
import type { ArtKit } from '../art/kit';
import type { HeroPose } from '../art/registry';
import { CAST_MS, clamp01, hold, HeroRigBase, smooth } from '../art/rigs';
import { cycleFrame, drawStep, walkCadence } from './layout';
import type { Frame, HeroFrames } from './sheet';

/** As the 2D rig (entities/ranger.ts). */
const FEET = 9;
const RELEASE_MS = 110;
const CAST_AIM: Partial<Record<SkillSlot, number>> = { Q: -0.45, W: 0.75, R: -1.2 };
const CAST_LOOSE = 0.55;
/** Casts that loose to the sky show the body's cast frame (leaning back, head up); the trap is aimed at the ground. */
const SKY_CASTS: ReadonlySet<SkillSlot> = new Set(['Q', 'R']);
/** The string's twang after a release (px the bow shivers along the arrow). */
const TWANG_PX = 0.35;

export class Ranger3DRig extends HeroRigBase {
  private readonly bodySprite: Sprite;
  private readonly bodyFlash: Sprite;
  private readonly bowSprite: Sprite;
  private readonly bowFlash: Sprite;
  private readonly headSprite: Sprite;
  private readonly headFlash: Sprite;
  private readonly bowArm = new Container();
  private readonly cooldownMs = TUNING.hero.ranger.attackCooldown * 1000;
  private walkPhase = 0;
  private shown: Frame | null = null;
  private headShown: Frame | null = null;
  private bowShown: Frame | null = null;

  constructor(
    kit: ArtKit,
    mine: boolean,
    private readonly frames: HeroFrames,
  ) {
    super(kit, 'ranger', mine, FEET, 15);
    const L = frames.layout;
    const k = 1 / L.res;
    const sprite = (f: Frame, ax: number, ay: number, flash: boolean): Sprite => {
      const s = new Sprite(flash ? f.flash : f.tex);
      s.anchor.set(ax, ay);
      s.scale.set(k);
      return s;
    };
    const first = frames.idle[0]!;
    const bx = L.body.feetX / L.body.w;
    const by = L.body.feetY / L.body.h;
    this.bodySprite = sprite(first, bx, by, false);
    this.bodyFlash = this.addFlash(sprite(first, bx, by, true));
    const hx = L.head.feetX / L.head.w;
    const hy = L.head.feetY / L.head.h;
    const head = frames.heads.idle[0]!;
    this.headSprite = sprite(head, hx, hy, false);
    this.headFlash = this.addFlash(sprite(head, hx, hy, true));
    for (const s of [this.bodySprite, this.bodyFlash, this.headSprite, this.headFlash]) s.position.set(0, FEET);
    const bow = frames.draw[0]!;
    const px = L.bow.pivotX / L.bow.w;
    const py = L.bow.pivotY / L.bow.h;
    this.bowSprite = sprite(bow, px, py, false);
    this.bowFlash = this.addFlash(sprite(bow, px, py, true));
    this.bowArm.addChild(this.bowSprite, this.bowFlash);
    this.flipper.addChild(this.bodySprite, this.bodyFlash, this.bowArm, this.headSprite, this.headFlash);
  }

  protected pose(h: HeroPose, walking: boolean, now: number, dtMs: number): void {
    const f = this.frames;
    const L = f.layout;
    // Steps that match the ground: the cadence follows the speed and how large the hero is drawn.
    const scale = Math.abs(this.body.parent?.scale.x ?? 1) || 1;
    if (walking) this.walkPhase += (dtMs / 1000) * Math.PI * 2 * walkCadence(this.speed, scale, L.walkStride);

    // The string: released right after a shot, then drawn back over the cooldown while fighting (as in 2D).
    const since = now - this.shotAt;
    let draw: number;
    if (since < RELEASE_MS) draw = 0;
    else if (since < this.cooldownMs * 2.5) draw = Math.min(1, (since - RELEASE_MS) / Math.max(1, this.cooldownMs * 0.85 - RELEASE_MS));
    else draw = 0.18;
    draw = smooth(draw);
    let released = since < RELEASE_MS;
    let twang = since < 260 ? Math.sin(since / 12) * (1 - since / 260) : 0;
    let aim = this.aim(h);
    let sky = 0;

    const c = this.casting(now);
    if (c >= 0) {
      const w = hold(c, 0.25, 0.8);
      const target = CAST_AIM[this.castSlot] ?? -0.45;
      aim += (target - aim) * w;
      if (SKY_CASTS.has(this.castSlot)) sky = w;
      const loose = (c - CAST_LOOSE) * CAST_MS;
      draw = c < CAST_LOOSE ? smooth(clamp01(c / 0.4)) : 0;
      released = loose >= 0 && loose < RELEASE_MS * 1.5;
      twang = loose >= 0 && loose < 260 ? Math.sin(loose / 12) * (1 - loose / 260) * 1.2 : 0;
    }

    const kind = sky > 0.5 ? 'cast' : walking ? 'walk' : 'idle';
    const i =
      kind === 'cast' ? 0 : kind === 'walk' ? cycleFrame(this.walkPhase, f.walk.length) : cycleFrame((now / L.idleMs) * Math.PI * 2, f.idle.length);
    const frame = f[kind][i]!;
    const head = f.heads[kind][i]!;
    const shoulder = L.shoulders[kind][i]!;
    if (frame !== this.shown) {
      this.shown = frame;
      this.bodySprite.texture = frame.tex;
      this.bodyFlash.texture = frame.flash;
    }
    if (head !== this.headShown) {
      this.headShown = head;
      this.headSprite.texture = head.tex;
      this.headFlash.texture = head.flash;
    }
    const bow = released ? f.loose[0]! : f.draw[drawStep(draw, f.draw.length)]!;
    if (bow !== this.bowShown) {
      this.bowShown = bow;
      this.bowSprite.texture = bow.tex;
      this.bowFlash.texture = bow.flash;
    }
    this.bowArm.position.set(shoulder.x, FEET + shoulder.y);
    this.bowArm.rotation = aim;
    this.bowSprite.x = this.bowFlash.x = twang * TWANG_PX;
  }
}
