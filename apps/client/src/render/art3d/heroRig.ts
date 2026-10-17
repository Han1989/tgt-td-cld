// A hero in a match from its 3D frames (docs/ART.md §15): one rig for every hero, driven by its layout. The layout's
// style says whose 2D timing it keeps (render/art/entities/<hero>.ts, exactly), its layers and frame kinds what to show:
//
// - bow (the Ranger): the body (no arms) shows its idle, walk or sky-cast frame; the arm layer (both arms and the bow
//   in profile) hangs at that frame's shoulder and turns towards the target, the string drawn over the attack
//   cooldown, released for 110 ms on the shot; the head goes over it, so the bow never covers the face.
// - melee (the Warden): the whole figure. The wind-up over the last 180 ms before a blow is due, the swing spaced by
//   how far the 2D swing has come (`wardenStrike`), the impact, the way back to guard; the moonlit slash over it and
//   the lunge, as in 2D. Cleave is the swing at the cast's pace; Taunt and Last Stand raise the shield.
// - staff (the Arcanist): the whole figure. The staff thrust at the shot and back (`arcanistThrust`), Fireball a
//   thrust at the cast's pace, Frost Nova the staff lifted, Meteor raised high; the gem's flare charging over the
//   cooldown and flashing on a shot, as in 2D.
//
// Every hero shows its flinch frame on a hit while it stands or walks, and its fall frames when it dies (instead of
// the base's tip-over). HeroRigBase gives the ring, the shadow, the hit flash and the fade.

import type { HeroKind, SkillSlot } from '@tdt/protocol';
import { TUNING } from '@tdt/sim';
import { Container, Sprite } from 'pixi.js';
import { arcanistThrust, METEOR_MS, THRUST_HOLD_MS, THRUST_MS, THRUST_BACK_MS } from '../art/entities/arcanist';
import { AIM_TURN, HOLD_READY_MS, LUNGE_PX, RELAX_MS, WARDEN_SWING, wardenStrike } from '../art/entities/warden';
import type { ArtKit } from '../art/kit';
import type { HeroPose } from '../art/registry';
import { CAST_MS, clamp01, HIT_FLASH, hold, HeroRigBase, smooth } from '../art/rigs';
import { fade } from '../fade';
import { cycleFrame, drawStep, progressFrame, walkCadence, type LayerBox, type MatchLayout, type Point } from './layout';
import type { Frame, Frames, HeroFrames } from './sheet';

/** Feet (px below the hero's position) and the ground ring's radius: the 2D rigs'. */
const BASE: Record<HeroKind, { feet: number; ring: number }> = {
  ranger: { feet: 9, ring: 15 },
  warden: { feet: 13, ring: 18 },
  arcanist: { feet: 9, ring: 15 },
};

// The Ranger, as the 2D rig (entities/ranger.ts).
const RELEASE_MS = 110;
const CAST_AIM: Partial<Record<SkillSlot, number>> = { Q: -0.45, W: 0.75, R: -1.2 };
const CAST_LOOSE = 0.55;
/** Casts that loose to the sky show the body's cast frame (leaning back, aimed up); the trap is aimed at the ground. */
const SKY_CASTS: ReadonlySet<SkillSlot> = new Set(['Q', 'R']);
/** The string's twang after a release (px the bow shivers along the arrow). */
const TWANG_PX = 0.35;
/** The arm layer is drawn this much larger than the body: at a phone's size the bow must read as a bow. */
const BOW_SCALE = 1.2;

// The Warden's slash smear (the 2D rig's `slash` frame) lies flatter over the 3D slice, which sweeps across the body.
const SMEAR_FLAT = 0.5;
/** Where the Warden's swing starts and ends (radians, the 2D rig's), to read how far a swing has come. */
const WOUND = wardenStrike(0)!.angle;
const STRUCK = wardenStrike(WARDEN_SWING.strikeMs)!.angle;

/** A layer's sprite and its white twin, the frame shown swapped only when it changes. */
class Layer {
  readonly holder = new Container();
  readonly sprite: Sprite;
  readonly flash: Sprite;
  private shown: Frame | null = null;

  constructor(
    readonly frames: Frames,
    box: LayerBox,
    res: number,
    addFlash: (s: Sprite) => Sprite,
  ) {
    const first = Object.values(frames)[0]![0]!;
    const make = (tex: Frame['tex']) => {
      const s = new Sprite(tex);
      s.anchor.set(box.ax / box.w, box.ay / box.h);
      s.scale.set(1 / res);
      return s;
    };
    this.sprite = make(first.tex);
    this.flash = addFlash(make(first.flash));
    this.holder.addChild(this.sprite, this.flash);
  }

  show(kind: string, i: number): void {
    const f = this.frames[kind]?.[i] ?? this.frames.idle?.[0];
    if (!f || f === this.shown) return;
    this.shown = f;
    this.sprite.texture = f.tex;
    this.flash.texture = f.flash;
  }

  count(kind: string): number {
    return this.frames[kind]?.length ?? 0;
  }
}

export class Hero3DRig extends HeroRigBase {
  private readonly L: MatchLayout;
  private readonly torso: Layer;
  private readonly head: Layer | null;
  private readonly arm: Layer | null;
  private readonly fall: Layer;
  private readonly smear: Sprite | null = null;
  private readonly flare: Sprite | null = null;
  private readonly feetPx: number;
  private readonly cooldownMs: number;
  /** The body frame kinds this rig has shown (browser tests: a Warden's swing was drawn). */
  readonly shownKinds = new Set<string>();
  private walkPhase = 0;
  private flinchAt = -Infinity;
  // The Warden's swing (as the 2D rig): the wind-up 0..1, when the swing starts and the wind-up it starts from, and
  // when the wind-up was complete and held.
  private wind = 0;
  private strikeAt = -Infinity;
  private hitWind = 0;
  private readyAt = -Infinity;

  constructor(
    kit: ArtKit,
    kind: HeroKind,
    mine: boolean,
    frames: HeroFrames,
  ) {
    super(kit, kind, mine, BASE[kind].feet, BASE[kind].ring);
    this.L = frames.layout;
    this.feetPx = BASE[kind].feet;
    this.cooldownMs = TUNING.hero[kind].attackCooldown * 1000;
    const L = this.L;
    const flash = (s: Sprite) => this.addFlash(s);
    const layer = (name: keyof HeroFrames['layers']): Layer | null => {
      const f = frames.layers[name];
      const box = L.layers[name];
      return f && box ? new Layer(f, box, L.res, flash) : null;
    };
    this.torso = layer('body')!;
    this.arm = layer('arm');
    this.head = layer('head');
    this.fall = layer('fall')!;
    for (const l of [this.torso, this.head, this.fall]) l?.holder.position.set(0, this.feetPx);
    this.fall.holder.visible = false;
    if (L.style === 'melee' && kit.has(kind, 'slash')) {
      this.smear = kit.sprite(kind, 'slash');
      this.smear.blendMode = 'add';
      fade(this.smear, 0);
    }
    if (L.style === 'staff' && kit.has(kind, 'flare')) {
      this.flare = kit.sprite(kind, 'flare');
      this.flare.blendMode = 'add';
      fade(this.flare, 0);
    }
    const order = [this.torso.holder, this.arm?.holder, this.head?.holder, this.smear, this.flare, this.fall.holder];
    this.flipper.addChild(...order.filter((c): c is Container => !!c));
  }

  override shot(now: number, aim?: number): number {
    super.shot(now, aim);
    if (this.L.style !== 'melee') return 0;
    // As the 2D Warden: finish the wind-up first if it hadn't (quickly, so it still shows), then swing.
    this.hitWind = this.wind;
    this.readyAt = -Infinity;
    this.strikeAt = now + (1 - this.wind) * WARDEN_SWING.quickWindMs;
    return this.strikeAt - now + WARDEN_SWING.strikeMs * WARDEN_SWING.contact;
  }

  override hit(now: number): void {
    if (now - this.flinchAt >= HIT_FLASH.everyMs) this.flinchAt = now;
    super.hit(now);
  }

  override die(t: number): void {
    super.die(t);
    // The fall frames fall; the base's tip-over would fall twice. Its fade and flash stay.
    this.flipper.rotation = 0;
    this.flipper.scale.set(this.flip, 1);
    this.flipper.position.set(0, this.feetPx);
    const n = this.fall.count('death');
    this.fall.show('death', Math.min(n - 1, Math.floor(clamp01(t) * n)));
    this.fall.holder.visible = true;
    for (const c of [this.torso.holder, this.arm?.holder, this.head?.holder, this.smear, this.flare]) if (c) c.visible = false;
  }

  protected override faceOverride(now: number): number | null {
    if (this.L.style !== 'melee') return null;
    // As the 2D Warden: turn to the target for the swing.
    const { strikeMs, holdMs, recoverMs } = WARDEN_SWING;
    if (Number.isNaN(this.shotAim) || now < this.shotAt || now > this.strikeAt + strikeMs + holdMs + recoverMs * 0.5) return null;
    return this.shotAim;
  }

  protected pose(h: HeroPose, walking: boolean, now: number, dtMs: number): void {
    this.fall.holder.visible = false;
    for (const c of [this.torso.holder, this.arm?.holder, this.head?.holder, this.smear, this.flare]) if (c) c.visible = true;
    // Steps that match the ground: the cadence follows the speed and how large the hero is drawn.
    const scale = Math.abs(this.body.parent?.scale.x ?? 1) || 1;
    if (walking) this.walkPhase += (dtMs / 1000) * Math.PI * 2 * walkCadence(this.speed, scale, this.L.walkStride);
    const style = this.L.style;
    const pick = style === 'bow' ? this.bow(h, walking, now) : style === 'melee' ? this.melee(h, walking, now, dtMs) : this.staff(walking, now);
    // The flinch, while standing or walking (an attack or a cast keeps its frames).
    let { kind } = pick;
    if ((kind === 'idle' || kind === 'walk') && now - this.flinchAt < HIT_FLASH.ms && this.torso.count('hit') > 0) kind = 'hit';
    const n = this.torso.count(kind);
    const i =
      kind === 'idle'
        ? cycleFrame((now / this.L.idleMs) * Math.PI * 2, n)
        : kind === 'walk'
          ? cycleFrame(this.walkPhase, n)
          : kind === 'hit'
            ? 0
            : progressFrame(pick.u, n);
    this.torso.show(kind, i);
    this.head?.show(kind, i);
    this.shownKinds.add(kind);
    const shoulder = this.point('shoulder', kind, i);
    const gem = this.point('gem', kind, i);
    if (this.arm && pick.arm) {
      const a = this.arm.holder;
      a.position.set(shoulder.x, this.feetPx + shoulder.y);
      a.rotation = pick.arm.aim - (this.L.layers.arm?.aim ?? 0);
      a.scale.set(BOW_SCALE);
      this.arm.show(pick.arm.kind, pick.arm.i);
      this.arm.sprite.x = this.arm.flash.x = pick.arm.twang * TWANG_PX;
    }
    if (this.smear) {
      this.smear.position.set(shoulder.x, this.feetPx + shoulder.y);
      this.smear.rotation = this.aim(h) * AIM_TURN;
      const s = pick.scale * (0.92 + 0.12 * pick.smear);
      this.smear.scale.set(s, s * SMEAR_FLAT);
      fade(this.smear, pick.smear);
    }
    if (this.flare) {
      this.flare.position.set(gem.x, this.feetPx + gem.y);
      fade(this.flare, Math.round(pick.flare * 10) / 10);
      this.flare.scale.set(1 + pick.flare * 0.5);
    }
  }

  private point(name: string, kind: string, i: number): Point {
    return this.L.points[name]?.[kind]?.[i] ?? this.L.points[name]?.idle?.[0] ?? { x: 0, y: -12 };
  }

  /** The Ranger (entities/ranger.ts): the draw over the cooldown, the release, the cast aims and loose. */
  private bow(h: HeroPose, walking: boolean, now: number): Pick {
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
    const kind = sky > 0.5 && this.torso.count('cast') > 0 ? 'cast' : walking ? 'walk' : 'idle';
    const steps = this.arm?.count('draw') ?? 1;
    return {
      kind,
      u: 0,
      arm: released ? { kind: 'loose', i: 0, aim, twang } : { kind: 'draw', i: drawStep(draw, steps), aim, twang },
      smear: 0,
      scale: 1,
      flare: 0,
    };
  }

  /** The Warden (entities/warden.ts): the wind-up, the swing (wardenStrike), the hold and the way back; the casts. */
  private melee(h: HeroPose, walking: boolean, now: number, dtMs: number): Pick {
    const cd = this.cooldownMs;
    let lunge = 0;
    let smear = 0;
    let scale = 1;
    const strike = wardenStrike(now - this.strikeAt);
    if (now < this.strikeAt) {
      // A hit came before the wind-up finished: finish it now, quickly.
      const t = (now - this.shotAt) / Math.max(1, this.strikeAt - this.shotAt);
      this.wind = this.hitWind + (1 - this.hitWind) * clamp01(t);
    } else if (strike) {
      this.wind = 0;
      ({ lunge, smear, scale } = strike);
    } else {
      // Wind up over the last windMs before the next swing can come, while an enemy is in reach; a wind-up that no
      // blow follows for a while sinks back.
      const due = !!h.engaged && !h.stunned && now - this.shotAt >= cd - WARDEN_SWING.windMs;
      if (!due) this.readyAt = -Infinity;
      else if (this.wind >= 1 && this.readyAt === -Infinity) this.readyAt = now;
      const held = this.readyAt !== -Infinity && now - this.readyAt > HOLD_READY_MS;
      this.wind = due && !held ? Math.min(1, this.wind + dtMs / WARDEN_SWING.windMs) : Math.max(0, this.wind - dtMs / RELAX_MS);
    }
    const s = now - this.strikeAt;
    let kind = walking ? 'walk' : 'idle';
    let u = 0;
    if (strike) {
      if (s < WARDEN_SWING.strikeMs) {
        kind = 'swing';
        u = (strike.angle - WOUND) / (STRUCK - WOUND);
      } else if (s < WARDEN_SWING.strikeMs + WARDEN_SWING.holdMs) {
        kind = 'swing';
        u = 1;
      } else {
        kind = 'recover';
        u = 1 - strike.lunge;
      }
    } else if (this.wind > 0.02) {
      kind = 'wind';
      u = smooth(this.wind);
    }
    const c = this.casting(now);
    if (c >= 0) {
      if (this.castSlot === 'Q') {
        // Cleave: the swing at the cast's pace, from high behind to low in front.
        const w = hold(c, 0.2, 0.75);
        if (c < 0.2) [kind, u] = ['wind', c / 0.2];
        else if (c < 0.42) [kind, u] = ['swing', (c - 0.2) / 0.22];
        else if (c < 0.75) [kind, u] = ['swing', 1];
        else [kind, u] = ['recover', (c - 0.75) / 0.25];
        lunge = w * clamp01((c - 0.2) / 0.2);
      } else {
        // Taunt and Last Stand: the shield raised.
        const w = hold(c, 0.2, 0.75);
        if (w > 0.05) [kind, u] = ['block', w];
      }
    }
    const step = lunge * LUNGE_PX;
    this.flipper.position.set(Math.cos(this.facing) * step, this.feetPx + Math.sin(this.facing) * step * 0.6);
    return { kind, u, arm: null, smear, scale, flare: 0 };
  }

  /** The Arcanist (entities/arcanist.ts): the thrust, the gem's charge and flare; Fireball, Frost Nova, Meteor. */
  private staff(walking: boolean, now: number): Pick {
    const cd = this.cooldownMs;
    const since = now - this.shotAt;
    let flare = since < 250 ? 1 - since / 250 : 0;
    if (since < cd * 2) flare = Math.max(flare, 0.15 + 0.45 * smooth(clamp01((since - cd * 0.3) / (cd * 0.6))));
    let [kind, u] = thrust(since) ?? [walking ? 'walk' : 'idle', 0];
    const meteor = this.castSlot === 'R';
    const c = this.casting(now, meteor ? METEOR_MS : undefined);
    if (c >= 0) {
      const w = hold(c, 0.2, 0.75);
      if (this.castSlot === 'Q') {
        // Fireball: a big thrust.
        [kind, u] = thrust(c * 480 - 60) ?? [kind, u];
        flare = Math.max(flare, w);
      } else if (this.castSlot === 'W') {
        // Frost Nova: the staff lifted, then brought down.
        const slam = smooth(clamp01((c - 0.35) / 0.12));
        if (w > 0.05) [kind, u] = ['raise', w];
        flare = Math.max(flare, slam * w);
      } else if (meteor) {
        // Meteor: the staff raised to the sky, the gem blazing.
        if (w > 0.05) [kind, u] = ['summon', w];
        flare = Math.max(flare, w);
      }
    }
    return { kind, u, arm: null, smear: 0, scale: 1, flare };
  }
}

/** What a rig shows this frame: the body's kind and progress through it, the arm layer's frame, the slash (its alpha
 * and the 2D swing's scale), the gem's flare. */
interface Pick {
  kind: string;
  u: number;
  arm: { kind: string; i: number; aim: number; twang: number } | null;
  smear: number;
  scale: number;
  flare: number;
}

/** The Arcanist's thrust frames `since` ms after it began: up to the target, held, and back; null once it is over. */
function thrust(since: number): [string, number] | null {
  if (since < 0) return null;
  if (since < THRUST_MS) return ['thrust', arcanistThrust(since)];
  if (since < THRUST_MS + THRUST_HOLD_MS) return ['thrust', 1];
  if (since < THRUST_MS + THRUST_HOLD_MS + THRUST_BACK_MS) return ['return', 1 - arcanistThrust(since)];
  return null;
}
