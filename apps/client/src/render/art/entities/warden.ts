// Warden (hero). Seen from the front (3/4 view), facing right; the rig flips it. A knight in bright
// steel plate under a blue tabard and cape: a great helm with a visor slit and glowing eyes, a big
// blue heater shield on the near arm (one rune on it) and a sword on the far arm.
//
// Rig: feet at y = +13; the sword arm turns around the far shoulder (-1, -4), the sword's grip is at
// the arm's origin + GRIP_X. Attack (melee), built to read at phone size (docs/ART.md §7): a visible
// wind-up (the sword goes up and back, the body leans back) over the ~180 ms before the swing is due
// (from the attack cooldown, or when an enemy comes within reach), then a big swing down with a
// small lunge towards the target and a moonlit slash smear (the `slash` frame, additive) in front.
// A hit that comes before the wind-up finished finishes it quickly first; `shot()` returns when the
// blade lands, so the renderer plays the impact (spark, knockback) then. Cast: Cleave is a wide
// sweep, Taunt thrusts the shield out with the sword raised, Last Stand braces behind the shield
// with the sword held high.

import { TUNING } from '@tdt/sim';
import { Container, type Sprite } from 'pixi.js';
import type { ArtKit } from '../kit';
import { box, circle, css, ellipse, pathLine, poly, rrect } from '../paint';
import { registerArt, type Draw, type HeroPose } from '../registry';
import { clamp01, hold, HeroRigBase, smooth } from '../rigs';

const ID = 'warden';

const cape: Draw = (c, p, k) => {
  p.part(c, poly([-6, -9, 5, -8, 4, 11, -3, 13, -12, 11], 1.4), k.wardenBlueDark, box(-12, -9, 5, 13));
};

const torso: Draw = (c, p, k) => {
  // Back pauldron, breastplate, tabard, belt, front pauldron.
  p.part(c, ellipse(-7.5, -6, 4.6, 3.8), k.plateDark, box(-12, -10, -3, -2), { line: 0.8 });
  p.part(c, poly([-8.5, -8, 8.5, -8, 9.5, 8, -9.5, 8], 2), k.plate, box(-9.5, -8, 9.5, 8));
  p.part(c, poly([-4.5, -5, 5.5, -5, 6.5, 10.5, 0.5, 8.5, -5.5, 10.5], 0.8), k.wardenBlue, box(-5.5, -5, 6.5, 10.5), { line: 0.7 });
  p.line(c, pathLine([0.5, -4, 0.5, 7.5]), k.gold, 1.3);
  p.detail(c, rrect(-9.5, 2.5, 19, 3, 1), k.woodDark);
  p.detail(c, rrect(-0.9, 2.1, 3.2, 3.8, 0.8), k.gold);
  p.part(c, ellipse(6.5, -6.5, 5, 4), k.plate, box(1.5, -10.5, 11.5, -2.5), { line: 0.8 });
  p.detail(c, circle(5.2, -7, 0.9), k.plateDark, false);
  p.detail(c, circle(8.2, -6.6, 0.9), k.plateDark, false);
};

const head: Draw = (c, p, k) => {
  // Blue crest swept back, then the great helm: a flat-topped dome with a visor slit looking right.
  p.part(c, poly([-3, -6.5, 3, -7.5, -2, -9.5, -10, -5, -6, -3.5], 1), k.wardenBlue, box(-10, -9.5, 3, -3.5), { line: 0.7 });
  p.part(c, poly([-6.5, -5, -4.5, -7.5, 4.5, -7.5, 7, -4.5, 7.2, 5.5, -6.5, 5.5], 2.2), k.plate, box(-6.5, -7.5, 7.2, 5.5));
  p.line(c, pathLine([-6, 1.5, 7, 1.5]), k.plateDark, 1.1, 0.8);
  p.detail(c, poly([0, -1.8, 7.6, -1.8, 7.6, 0.6, 0, 0.6], 0.5), k.hole, false);
  p.accent(c, ellipse(2.4, -0.6, 1.1, 0.8), k.heroEye);
  p.accent(c, ellipse(5.8, -0.6, 1.0, 0.8), k.heroEye);
  // Breathing holes.
  for (const [x, y] of [
    [4, 3.4],
    [6, 3.4],
  ] as const) {
    p.detail(c, circle(x, y, 0.55), k.hole, false);
  }
};

const foot: Draw = (c, p, k) => {
  p.part(c, ellipse(0, 0, 3.9, 2.4), k.plateDark, box(-3.9, -2.4, 3.9, 2.4), { line: 0.7 });
};

function shieldPath(): Path2D {
  const s = new Path2D();
  s.moveTo(-7, -9);
  s.lineTo(7, -9);
  s.quadraticCurveTo(7.6, 3, 0, 11);
  s.quadraticCurveTo(-7.6, 3, -7, -9);
  s.closePath();
  return s;
}

const shield: Draw = (c, p, k) => {
  p.part(c, shieldPath(), k.plate, box(-7.6, -9, 7.6, 11));
  c.save();
  c.translate(0, 0.4);
  c.scale(0.78, 0.8);
  p.part(c, shieldPath(), k.wardenBlue, box(-7.6, -9, 7.6, 11), { noOutline: true });
  c.restore();
  // A gold chevron and one rune in the middle.
  p.line(c, pathLine([-4.6, -4.5, 0, -1.2, 4.6, -4.5]), k.gold, 1.6);
  p.accent(c, poly([0, 0.8, 1.9, 3.2, 0, 5.6, -1.9, 3.2]), k.rune);
};

/** Sword gripped at (0, 0), blade towards +x. */
const sword: Draw = (c, p, k) => {
  p.part(c, poly([2.5, -1.7, 16.5, -1.3, 20, 0, 16.5, 1.3, 2.5, 1.7]), k.plate, box(2.5, -1.7, 20, 1.7), { line: 0.7 });
  p.line(c, pathLine([4, 0, 15.5, 0]), k.plateDark, 0.8, 0.8);
  p.part(c, rrect(1, -4, 2.2, 8, 0.8), k.gold, box(1, -4, 3.2, 4), { line: 0.6 });
  p.detail(c, rrect(-3, -1, 4.2, 2, 0.6), k.woodDark);
  p.detail(c, circle(-3.4, 0, 1.3), k.gold);
  // The gauntlet around the grip.
  p.part(c, circle(-0.4, 0, 2.5), k.plateDark, box(-2.9, -2.5, 2.1, 2.5), { line: 0.6 });
};

/** The swing's arc, around the shoulder (radians, facing +x, negative is up): from high behind to low in front. */
const SLASH_FROM = -2.05;
const SLASH_TO = 1.05;
const SLASH_R = 30;

/**
 * The slash smear: a moonlit crescent the sword's tip sweeps, thin and faint where the swing began
 * and thick and bright where it ends. Drawn around the shoulder; shown additive, alpha only.
 */
const slash: Draw = (c, p, k) => {
  const n = 28;
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const a0 = SLASH_FROM + (SLASH_TO - SLASH_FROM) * t0;
    const a1 = SLASH_FROM + (SLASH_TO - SLASH_FROM) * t1;
    // Thickness grows along the swing and tapers off at the very end.
    const w = (t: number) => 11 * Math.pow(t, 1.3) * Math.min(1, (1 - t) * 6 + 0.05);
    const ro = SLASH_R;
    const quad = new Path2D();
    quad.moveTo(Math.cos(a0) * ro, Math.sin(a0) * ro);
    quad.lineTo(Math.cos(a1) * ro, Math.sin(a1) * ro);
    quad.lineTo(Math.cos(a1) * (ro - w(t1)), Math.sin(a1) * (ro - w(t1)));
    quad.lineTo(Math.cos(a0) * (ro - w(t0)), Math.sin(a0) * (ro - w(t0)));
    quad.closePath();
    c.fillStyle = css(k.moon, 0.9 * Math.pow(t1, 1.6));
    c.fill(quad);
  }
  // A bright leading edge along the outside, where the blade's tip is.
  const edge = new Path2D();
  edge.arc(0, 0, SLASH_R - 1, SLASH_FROM + (SLASH_TO - SLASH_FROM) * 0.45, SLASH_TO - 0.08);
  p.line(c, edge, k.moon, 2.2, 0.95);
};

// ---------------------------------------------------------------------------
// Rig
// ---------------------------------------------------------------------------

const FEET = 13;
const SHOULDER = { x: -1, y: -4 };
const GRIP_X = 6;
/** Sword angles (radians, facing +x; negative is up): at rest, wound up high behind, at the end of a swing. */
const REST = -1.0;
const WOUND = -2.5;
const STRUCK = 1.0;
/**
 * The swing (ms): a wind-up (anticipated, so it plays before the hit), the swing itself, a hold and
 * the way back to rest. The blade passes the front (the impact) at CONTACT of the swing.
 */
export const WARDEN_SWING = { windMs: 180, quickWindMs: 110, strikeMs: 150, contact: 0.47, holdMs: 90, recoverMs: 260 } as const;
/** A wind-up with nothing to hit sinks back over this long (ms)... */
const RELAX_MS = 300;
/** ...once it has been held ready this long (ms). */
const HOLD_READY_MS = 350;
/** How far the Warden lunges towards the target (px), and how much bigger the arm swings. */
const LUNGE_PX = 5;
const SWING_SCALE = 0.3;
/** How much of the way to the target (above or below) the swing turns: all of it would swing up-side down. */
const AIM_TURN = 0.6;

/**
 * The sword arm during a swing, `s` ms after it started (pure, tested): the arm's angle, how far the
 * body lunges (0..1), the arm's scale and the smear's alpha. Before the swing and after it, null.
 */
export function wardenStrike(s: number): { angle: number; lunge: number; scale: number; smear: number } | null {
  const { strikeMs, holdMs, recoverMs, contact } = WARDEN_SWING;
  if (s < 0 || s >= strikeMs + holdMs + recoverMs) return null;
  const hit = strikeMs * contact;
  // The smear builds up to the impact, then fades over 200 ms.
  const smear = s < hit ? (s / hit) * 0.85 : Math.max(0, 1 - (s - hit) / 200);
  if (s < strikeMs) {
    const t = s / strikeMs;
    const e = 1 - (1 - t) * (1 - t);
    return { angle: WOUND + (STRUCK - WOUND) * e, lunge: smooth(t), scale: 1 + SWING_SCALE * Math.sin(Math.PI * Math.min(1, t * 1.4)), smear };
  }
  if (s < strikeMs + holdMs) return { angle: STRUCK, lunge: 1, scale: 1 + SWING_SCALE * 0.3, smear };
  const r = smooth((s - strikeMs - holdMs) / recoverMs);
  return { angle: STRUCK + (REST - STRUCK) * r, lunge: 1 - r, scale: 1 + SWING_SCALE * 0.3 * (1 - r), smear };
}

class WardenRig extends HeroRigBase {
  private readonly cape: Container;
  private readonly torso: Container;
  private readonly head: Container;
  private readonly footA: Container;
  private readonly footB: Container;
  private readonly shield: Container;
  private readonly arm = new Container();
  private readonly smear: Sprite;
  private readonly cooldownMs = TUNING.hero.warden.attackCooldown * 1000;
  /** Wind-up 0..1 (the sword raised high behind). */
  private wind = 0;
  /** When the current swing starts, and the wind-up it started from (a hit before the wind-up finished). */
  private strikeAt = -Infinity;
  private hitWind = 0;
  /** When the wind-up was complete and held, waiting for the blow (-∞ when not). */
  private readyAt = -Infinity;

  constructor(kit: ArtKit, mine: boolean) {
    super(kit, ID, mine, FEET, 18);
    this.cape = this.part('cape');
    this.footA = this.part('foot');
    this.footB = this.part('foot');
    this.torso = this.part('body');
    this.head = this.part('head');
    this.shield = this.part('shield');
    const sword = this.part('sword');
    sword.x = GRIP_X;
    this.arm.addChild(sword);
    this.smear = kit.sprite(ID, 'slash');
    this.smear.blendMode = 'add';
    this.smear.alpha = 0;
    this.flipper.addChild(this.cape, this.footB, this.arm, this.torso, this.footA, this.head, this.shield, this.smear);
  }

  override shot(now: number, aim?: number): number {
    super.shot(now, aim);
    // Finish the wind-up first if it hadn't (quickly, so it still shows), then swing.
    this.hitWind = this.wind;
    this.readyAt = -Infinity;
    this.strikeAt = now + (1 - this.wind) * WARDEN_SWING.quickWindMs;
    return this.strikeAt - now + WARDEN_SWING.strikeMs * WARDEN_SWING.contact;
  }

  protected override faceOverride(now: number): number | null {
    // Turn to the target for the swing (the snapshot faces the way it walks while it walks).
    const { strikeMs, holdMs, recoverMs } = WARDEN_SWING;
    if (Number.isNaN(this.shotAim) || now < this.shotAt || now > this.strikeAt + strikeMs + holdMs + recoverMs * 0.5) return null;
    return this.shotAim;
  }

  protected pose(h: HeroPose, walking: boolean, now: number, dtMs: number): void {
    const cd = this.cooldownMs;
    let angle = REST;
    let lunge = 0;
    let scale = 1;
    let smear = 0;
    const strike = wardenStrike(now - this.strikeAt);
    if (now < this.strikeAt) {
      // A hit came before the wind-up finished: finish it now, quickly.
      const t = (now - this.shotAt) / Math.max(1, this.strikeAt - this.shotAt);
      this.wind = this.hitWind + (1 - this.hitWind) * clamp01(t);
    } else if (strike) {
      this.wind = 0;
      ({ angle, lunge, scale, smear } = strike);
    } else {
      // Wind up over the last WIND_MS before the next swing can come, while an enemy is in reach; a
      // wind-up that no blow follows for a while (the enemy stayed just out of reach) sinks back.
      const due = !!h.engaged && !h.stunned && now - this.shotAt >= cd - WARDEN_SWING.windMs;
      if (!due) this.readyAt = -Infinity;
      else if (this.wind >= 1 && this.readyAt === -Infinity) this.readyAt = now;
      const held = this.readyAt !== -Infinity && now - this.readyAt > HOLD_READY_MS;
      this.wind = due && !held ? Math.min(1, this.wind + dtMs / WARDEN_SWING.windMs) : Math.max(0, this.wind - dtMs / RELAX_MS);
    }
    if (!strike) angle = REST + (WOUND - REST) * smooth(this.wind);
    const wind = strike ? 0 : smooth(this.wind);
    // The blow arcs towards the target: the swing (and its smear) turn part of the way to the aim,
    // turning in as it swings (the wind-up stays the plain one) and back out with the recovery.
    const s = now - this.strikeAt;
    const hitMs = WARDEN_SWING.strikeMs * WARDEN_SWING.contact;
    const toward = strike ? (s < WARDEN_SWING.strikeMs ? smooth(Math.min(1, s / hitMs)) : strike.lunge) : 0;
    const aimTurn = this.aim(h) * AIM_TURN * toward;

    let shieldX = 0;
    let shieldY = 0;
    let crouch = 0;
    let tilt = -0.12 * wind;
    const c = this.casting(now);
    if (c >= 0) {
      const w = hold(c, 0.2, 0.75);
      if (this.castSlot === 'Q') {
        // Cleave: a wide sweep from high behind to low in front.
        const sweep = c < 0.2 ? -2.6 * smooth(c / 0.2) + REST * (1 - smooth(c / 0.2)) : -2.6 + 4 * smooth(clamp01((c - 0.2) / 0.22));
        angle = angle + (sweep - angle) * w;
        lunge = w * clamp01((c - 0.2) / 0.2);
      } else if (this.castSlot === 'W') {
        // Taunt: shield thrust out, sword raised, head up.
        angle = angle + (-1.9 - angle) * w;
        shieldX = 4 * w;
        shieldY = -2 * w;
        tilt = -0.15 * w;
      } else {
        // Last Stand: braced low behind the shield, sword held high.
        angle = angle + (-1.75 - angle) * w;
        shieldX = 2 * w;
        crouch = 1.8 * w;
      }
    }

    const bob = this.bob(walking, now, 1.6) - crouch;
    // Lean into the swing, back during the wind-up.
    const lean = lunge * 1.5 - wind * 1.5;
    this.cape.position.set(-3 + lean * 0.5, 2 - bob * 0.8);
    this.cape.rotation = walking ? -0.06 - Math.abs(Math.sin(this.phase)) * 0.05 : 0;
    this.torso.position.set(lean, 2 - bob);
    this.head.position.set(0.5 + lean * 1.2, -9 - bob);
    this.head.rotation = tilt;
    this.shield.position.set(3.5 + lean + shieldX, 3.5 - bob + shieldY);
    this.stepFeet(this.footA, this.footB, 4, 2.2, 2.2, walking);
    this.arm.position.set(SHOULDER.x + lean, SHOULDER.y - bob);
    this.arm.rotation = angle + aimTurn;
    this.arm.scale.set(scale);
    // The smear sits on the shoulder, turned with the swing; the whole body steps in.
    this.smear.position.copyFrom(this.arm.position);
    this.smear.rotation = this.aim(h) * AIM_TURN;
    this.smear.scale.set(scale * (0.92 + 0.12 * smear));
    this.smear.alpha = smear;
    const dir = this.facing;
    const step = lunge * LUNGE_PX;
    this.flipper.position.set(Math.cos(dir) * step, FEET + Math.sin(dir) * step * 0.6);
  }
}

registerArt({
  id: ID,
  name: 'Warden',
  category: 'hero',
  kind: 'warden',
  frames: {
    cape: { w: 28, h: 28, draw: cape, flash: true },
    body: { w: 26, h: 26, draw: torso, flash: true },
    head: { w: 24, h: 24, draw: head, flash: true },
    foot: { w: 11, h: 7, draw: foot, flash: true },
    shield: { w: 20, h: 26, draw: shield, flash: true },
    sword: { w: 46, h: 12, draw: sword, flash: true },
    slash: { w: 70, h: 70, draw: slash },
  },
  rig: (kit, mine) => new WardenRig(kit, mine),
});
