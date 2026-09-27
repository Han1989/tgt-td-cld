// Ranger (hero). Seen from the front (3/4 view), facing right; the rig flips it. A hooded archer:
// green cloak and hood, face lost in shadow with glowing eyes, a quiver on the back and a bow held
// out along the facing, drawn between shots.
//
// Rig: feet at y = +9, shoulder at (1, -1); the bow's grip is at the arm's origin + BOW_X.
// Attack: the string is drawn back over the cooldown and released on the shot. Cast: the bow swings
// up to the sky (Arrow Storm, Multishot) or down at the ground (Snare Trap), drawn fully, and looses.

import type { SkillSlot } from '@tdt/protocol';
import { TUNING } from '@tdt/sim';
import { Container, Sprite, Texture } from 'pixi.js';
import type { ArtKit } from '../kit';
import { box, circle, ellipse, pathLine, poly, rrect } from '../paint';
import { registerArt, type Draw, type HeroPose } from '../registry';
import { CAST_MS, clamp01, hold, HeroRigBase, smooth } from '../rigs';
import { RL } from '../tokens';

const ID = 'ranger';

const cloak: Draw = (c, p, k) => {
  p.part(c, poly([-5, -7, 4, -6, 5, 9, -2, 11, -10, 9], 1.2), k.leafDark, box(-10, -7, 5, 11));
  // Quiver across the back with fletchings sticking out.
  p.part(c, rrect(-9, -9, 4.5, 13, 0.9), k.woodDark, box(-9, -9, -4.5, 4), { line: 0.7 });
  for (const [x, col] of [
    [-8, k.cloth],
    [-6, k.bone],
  ] as const) {
    p.detail(c, poly([x - 1.2, -9, x + 1.2, -9, x, -13.5], 0.4), col);
  }
};

const torso: Draw = (c, p, k) => {
  p.part(c, poly([-6, -6, 6, -6, 8, 8, -8, 8], 1.5), k.leaf, box(-8, -6, 8, 8));
  p.detail(c, rrect(-8, 3, 16, 2.6, 1), k.woodDark);
  p.detail(c, rrect(-1.4, 2.6, 3, 3.4, 0.8), k.gold);
  // Shoulder strap.
  p.line(c, pathLine([-5, -5, 5, 4]), k.woodDark, 1.6);
};

const head: Draw = (c, p, k) => {
  // Hood tip falling back, then the hood.
  p.part(c, poly([-4, -5, -11, 1, -3, 3], 0.9), k.leafDark, box(-11, -5, -3, 3), { line: 0.8 });
  p.part(c, ellipse(0, 0, 7.6, 7.2), k.leaf, box(-7.6, -7.2, 7.6, 7.2));
  // Face lost in the hood's shadow, looking right; the eyes glow.
  p.detail(c, ellipse(2.6, 1.2, 4.4, 4.1), k.hoodShadow);
  p.accent(c, ellipse(2.4, 1, 0.9, 1.1), k.heroEye);
  p.accent(c, ellipse(5.2, 1, 0.9, 1.1), k.heroEye);
};

const foot: Draw = (c, p, k) => {
  p.part(c, ellipse(0, 0, 3.4, 2.3), k.woodDark, box(-3.4, -2.3, 3.4, 2.3), { line: 0.7 });
};

/** Bow held at its grip (0, 0), belly towards +x; tips at (-4, ±15). */
const BOW_TIP = { x: -4, y: 15 };

const bow: Draw = (c, p, k) => {
  const b = new Path2D();
  b.moveTo(-4.5, -15.5);
  b.quadraticCurveTo(13, 0, -4.5, 15.5);
  b.lineTo(-3, 15);
  b.quadraticCurveTo(5, 0, -3, -15);
  b.closePath();
  p.part(c, b, k.wood, box(-4.5, -15.5, 5, 15.5), { line: 0.8 });
  p.detail(c, rrect(2, -2.6, 2.8, 5.2, 1), k.woodDark);
  p.accent(c, circle(-4, -15, 1.4), k.gold);
  p.accent(c, circle(-4, 15, 1.4), k.gold);
  // The bow hand.
  p.part(c, circle(3.4, 0, 2.3), k.gloveDark, box(1, -2.3, 5.7, 2.3), { line: 0.6 });
};

/** Arrow on the string, tail at x = -12, head at +12 (anchored at its centre). */
const arrow: Draw = (c, p, k) => {
  p.line(c, pathLine([-11, 0, 9, 0]), k.ink, 2.4);
  p.line(c, pathLine([-11, 0, 9, 0]), k.wood, 1.3);
  p.detail(c, poly([8.5, -2.4, 12.5, 0, 8.5, 2.4]), k.rune);
  p.detail(c, poly([-12, -2.6, -7.5, 0, -12, 0]), k.cloth, false);
  p.detail(c, poly([-12, 2.6, -7.5, 0, -12, 0]), k.bone, false);
};

// ---------------------------------------------------------------------------
// Rig: walk bob with stepping feet, bow arm aimed along the facing, string drawn between shots.
// ---------------------------------------------------------------------------

const FEET = 9;
const BOW_X = 8;
const SHOULDER = { x: 1, y: -1 };
/** The string is drawn back this far (px) at full draw. */
const DRAW_PX = 10;
/** The arrow is gone this long after a shot (ms). */
const RELEASE_MS = 110;
/** Cast: where the bow points (radians, facing +x), and when in the cast it looses. */
const CAST_AIM: Partial<Record<SkillSlot, number>> = { Q: -0.45, W: 0.75, R: -1.2 };
const CAST_LOOSE = 0.55;

class RangerRig extends HeroRigBase {
  private readonly torso: Container;
  private readonly head: Container;
  private readonly cloak: Container;
  private readonly footA: Container;
  private readonly footB: Container;
  private readonly arm = new Container();
  private readonly stringA: Sprite;
  private readonly stringB: Sprite;
  private readonly arrow: Container;
  private readonly cooldownMs = TUNING.hero.ranger.attackCooldown * 1000;

  constructor(kit: ArtKit, mine: boolean) {
    super(kit, ID, mine, FEET, 15);
    this.cloak = this.part('cloak');
    this.footA = this.part('foot');
    this.footB = this.part('foot');
    this.torso = this.part('body');
    this.head = this.part('head');
    const bow = this.part('bow');
    bow.position.set(BOW_X, 0);
    this.stringA = new Sprite(Texture.WHITE);
    this.stringB = new Sprite(Texture.WHITE);
    for (const s of [this.stringA, this.stringB]) {
      s.anchor.set(0, 0.5);
      s.height = 0.9;
      s.tint = RL.string;
    }
    this.arrow = this.part('arrow');
    this.arm.position.set(SHOULDER.x, SHOULDER.y);
    this.arm.addChild(bow, this.stringA, this.stringB, this.arrow);
    this.flipper.addChild(this.cloak, this.footB, this.torso, this.footA, this.head, this.arm);
  }

  protected pose(h: HeroPose, walking: boolean, now: number): void {
    // Bow: released right after a shot, then drawn back over the cooldown while fighting.
    const since = now - this.shotAt;
    let draw: number;
    if (since < RELEASE_MS) draw = 0;
    else if (since < this.cooldownMs * 2.5) draw = Math.min(1, (since - RELEASE_MS) / Math.max(1, this.cooldownMs * 0.85 - RELEASE_MS));
    else draw = 0.18;
    draw = smooth(draw);
    let twang = since < 260 ? Math.sin(since / 12) * (1 - since / 260) * 1.5 : 0;
    let released = since < RELEASE_MS;
    let aim = this.aim(h);
    let tilt = 0;

    // Cast: swing the bow to the skill's aim at full draw, loose, and come back.
    const c = this.casting(now);
    if (c >= 0) {
      const w = hold(c, 0.25, 0.8);
      const target = CAST_AIM[this.castSlot] ?? -0.45;
      aim += (target - aim) * w;
      tilt = target * 0.3 * w;
      const loose = (c - CAST_LOOSE) * CAST_MS;
      draw = c < CAST_LOOSE ? smooth(clamp01(c / 0.4)) : 0;
      released = loose >= 0 && loose < RELEASE_MS * 1.5;
      twang = loose >= 0 && loose < 260 ? Math.sin(loose / 12) * (1 - loose / 260) * 1.8 : 0;
    }

    const bob = this.bob(walking, now, 1.8);
    const s = walking ? Math.abs(Math.sin(this.phase)) : 0;
    this.torso.position.set(0, 1 - bob);
    this.cloak.position.set(-2, 1 - bob * 0.8);
    this.cloak.rotation = walking ? -0.08 - s * 0.06 : 0;
    this.head.position.set(0.5, -8 - bob);
    this.head.rotation = tilt;
    this.stepFeet(this.footA, this.footB, 3.2, 2.4, 2.4, walking);
    this.arm.y = SHOULDER.y - bob;
    this.arm.rotation = aim;

    const tipX = BOW_X + BOW_TIP.x;
    const nockX = tipX - draw * DRAW_PX + twang;
    for (const [str, ty] of [
      [this.stringA, -BOW_TIP.y],
      [this.stringB, BOW_TIP.y],
    ] as const) {
      str.position.set(tipX, ty);
      const dx = nockX - tipX;
      const dy = -ty;
      str.width = Math.hypot(dx, dy);
      str.rotation = Math.atan2(dy, dx);
    }
    this.arrow.alpha = released ? 0 : 1;
    this.arrow.x = nockX + 12;
  }
}

registerArt({
  id: ID,
  name: 'Ranger',
  category: 'hero',
  kind: 'ranger',
  frames: {
    cloak: { w: 26, h: 30, draw: cloak, flash: true },
    body: { w: 22, h: 20, draw: torso, flash: true },
    head: { w: 26, h: 20, draw: head, flash: true },
    foot: { w: 10, h: 7, draw: foot, flash: true },
    bow: { w: 24, h: 36, draw: bow, flash: true },
    arrow: { w: 28, h: 8, draw: arrow },
  },
  rig: (kit, mine) => new RangerRig(kit, mine),
});
