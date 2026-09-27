// Arcanist (hero). Seen from the front (3/4 view), facing right; the rig flips it. A mage in a long
// plum robe with gold trim and a squat hat whose tip flops back, a bearded face under the brim, and
// a staff whose gem is the one glowing accent.
//
// Rig: feet at y = +9; the staff arm turns around the shoulder (6, -2), the staff's grip is at the
// arm's origin + GRIP_X. Attack: the gem charges over the cooldown, and the staff thrusts at the
// target with a flare on the shot. Cast: Fireball is a big thrust, Frost Nova lifts the staff and
// slams it down, Meteor raises staff and hand to the sky.

import { TUNING } from '@tdt/sim';
import { Container } from 'pixi.js';
import type { ArtKit } from '../kit';
import { box, circle, ellipse, pathLine, poly } from '../paint';
import { registerArt, type Draw, type HeroPose } from '../registry';
import { clamp01, hold, HeroRigBase, smooth } from '../rigs';

const ID = 'arcanist';

const robe: Draw = (c, p, k) => {
  p.part(c, poly([-5.5, -7, 5.5, -7, 9, 8, -9, 8], 1.6), k.robe, box(-9, -7, 9, 8));
  // Gold hem and a sash.
  p.line(c, pathLine([-8.4, 6.2, 8.4, 6.2]), k.gold, 1.3);
  p.detail(c, poly([-7, -0.5, 7.2, -1, 7.6, 1.8, -7.4, 2.3], 0.5), k.robeDark);
  p.line(c, pathLine([1, -6.5, 1, -1]), k.robeDark, 1.2);
};

const head: Draw = (c, p, k) => {
  // Face and beard under the brim, looking right.
  p.part(c, ellipse(1.5, 1.8, 4.6, 4.2), k.skin, box(-3.1, -2.4, 6.1, 6), { line: 0.8 });
  p.part(c, poly([-0.5, 3.2, 6.4, 3, 4, 9.5, 1.5, 7.5], 1.2), k.bone, box(-0.5, 3, 6.4, 9.5), { line: 0.7 });
  p.detail(c, ellipse(3.4, 1.4, 0.75, 0.95), k.hole, false);
  p.detail(c, ellipse(5.7, 1.4, 0.7, 0.9), k.hole, false);
  // The hat: a cone whose tip flops back, then the brim.
  p.part(c, poly([-6, -1.8, -2.5, -8.2, 1.5, -8.2, 5.5, -1.8], 1.4), k.robe, box(-6, -8.2, 5.5, -1.8));
  p.part(c, poly([-2, -7.8, -6, -9.8, -10.8, -6.4, -6.8, -6.2, -3.6, -4.8], 1), k.robe, box(-10.8, -9.8, -2, -4.8), { line: 0.8 });
  p.line(c, pathLine([-5.2, -3.6, 4.7, -3.6]), k.gold, 1.2);
  p.part(c, ellipse(0, -1.6, 9.2, 2.3), k.robeDark, box(-9.2, -3.9, 9.2, 0.7));
};

const foot: Draw = (c, p, k) => {
  p.part(c, ellipse(0, 0, 3.2, 2.1), k.robeDark, box(-3.2, -2.1, 3.2, 2.1), { line: 0.7 });
};

const hand: Draw = (c, p, k) => {
  p.part(c, poly([-3.2, -2.8, 2, -2.2, 2.4, 2.4, -3.2, 2.8], 1), k.robe, box(-3.2, -2.8, 2.4, 2.8), { line: 0.7 });
  p.part(c, circle(3.4, 0, 2), k.skin, box(1.4, -2, 5.4, 2), { line: 0.6 });
};

/** Staff gripped at (0, 0), head towards +x: a wooden shaft, a claw and the gem at GEM_X. */
const GEM_X = 12.5;

const staff: Draw = (c, p, k) => {
  p.part(c, poly([-12, -1, 9.5, -1.2, 9.5, 1.2, -12, 1], 0.8), k.wood, box(-12, -1.2, 9.5, 1.2), { line: 0.7 });
  p.part(c, poly([8.5, -1.5, 13.5, -4.2, 11.5, -1, 11.5, 1, 13.5, 4.2, 8.5, 1.5], 0.5), k.woodDark, box(8.5, -4.2, 13.5, 4.2), { line: 0.6 });
  p.accent(c, poly([GEM_X - 2.6, 0, GEM_X, -2.4, GEM_X + 2.6, 0, GEM_X, 2.4], 0.4), k.staffGem);
  // The hand around the grip.
  p.part(c, circle(0, 0, 2.2), k.skin, box(-2.2, -2.2, 2.2, 2.2), { line: 0.6 });
};

/** The gem's flare (blended additively over the gem when it charges and fires). */
const flare: Draw = (c, p, k) => {
  p.accent(c, circle(0, 0, 3.2), k.staffGem);
};

// ---------------------------------------------------------------------------
// Rig
// ---------------------------------------------------------------------------

const FEET = 9;
const SHOULDER = { x: 6, y: -2 };
const GRIP_X = 2;
/** The staff held upright at rest (radians, facing +x; negative is up). */
const REST = -1.2;
/** A thrust reaches the target in this long (ms), holds, then comes back. */
const THRUST_MS = 70;
const METEOR_MS = 700;

class ArcanistRig extends HeroRigBase {
  private readonly robe: Container;
  private readonly head: Container;
  private readonly footA: Container;
  private readonly footB: Container;
  private readonly hand: Container;
  private readonly arm = new Container();
  private readonly staff: Container;
  private readonly flare: Container;
  private readonly cooldownMs = TUNING.hero.arcanist.attackCooldown * 1000;

  constructor(kit: ArtKit, mine: boolean) {
    super(kit, ID, mine, FEET, 15);
    this.footA = this.part('foot');
    this.footB = this.part('foot');
    this.robe = this.part('body');
    this.head = this.part('head');
    this.hand = this.part('hand');
    this.staff = this.part('staff');
    this.staff.x = GRIP_X;
    this.flare = this.part('flare');
    this.flare.x = GRIP_X + GEM_X;
    this.flare.alpha = 0;
    this.flare.children[0]!.blendMode = 'add';
    this.arm.addChild(this.staff, this.flare);
    this.flipper.addChild(this.footB, this.robe, this.footA, this.head, this.arm, this.hand);
  }

  /** A thrust towards `aim` at time `since` after it started: 0..1 of the way there. */
  private static thrust(since: number): number {
    if (since < 0) return 0;
    if (since < THRUST_MS) return smooth(since / THRUST_MS);
    if (since < THRUST_MS + 80) return 1;
    return 1 - smooth(clamp01((since - THRUST_MS - 80) / 280));
  }

  protected pose(h: HeroPose, walking: boolean, now: number): void {
    const cd = this.cooldownMs;
    const since = now - this.shotAt;
    const aim = this.aim(h);
    // Staff: thrust at the target on the shot; the gem charges towards the next one while fighting.
    let t = ArcanistRig.thrust(since);
    let angle = REST + (aim - REST) * t;
    let reach = t * 3;
    let lift = 0;
    let flare = since < 250 ? 1 - since / 250 : 0;
    if (since < cd * 2) flare = Math.max(flare, 0.15 + 0.45 * smooth(clamp01((since - cd * 0.3) / (cd * 0.6))));
    let handX = 1;
    let handY = 2;

    const meteor = this.castSlot === 'R';
    const c = this.casting(now, meteor ? METEOR_MS : undefined);
    if (c >= 0) {
      const w = hold(c, 0.2, 0.75);
      if (this.castSlot === 'Q') {
        // Fireball: a big thrust, the free hand pushing forward.
        t = ArcanistRig.thrust(c * 480 - 60);
        angle = REST + (aim - REST) * t;
        reach = t * 4.5;
        flare = Math.max(flare, w);
        handX += 3 * w;
        handY -= 1.5 * w;
      } else if (this.castSlot === 'W') {
        // Frost Nova: lift the staff, then slam it down.
        const up = smooth(clamp01(c / 0.35));
        const slam = smooth(clamp01((c - 0.35) / 0.12));
        angle = angle + (-1.5 - angle) * w;
        lift = (-4 * up + 6 * slam) * w;
        flare = Math.max(flare, slam * w);
      } else if (meteor) {
        // Meteor: staff and hand raised to the sky, the gem blazing.
        angle = angle + (-1.75 - angle) * w;
        lift = -3 * w;
        flare = Math.max(flare, w);
        handX -= 1 * w;
        handY -= 9 * w;
      }
    }

    const bob = this.bob(walking, now, 1.6);
    this.robe.position.set(0, 1 - bob);
    this.robe.rotation = walking ? Math.sin(this.phase) * 0.04 : 0;
    this.head.position.set(0.5, -7 - bob);
    this.stepFeet(this.footA, this.footB, 3, 2.2, 2, walking);
    this.hand.position.set(handX, handY - bob);
    this.arm.position.set(SHOULDER.x, SHOULDER.y - bob + lift);
    this.arm.rotation = angle;
    this.staff.x = GRIP_X + reach;
    this.flare.x = GRIP_X + GEM_X + reach;
    this.flare.alpha = Math.round(flare * 10) / 10;
    this.flare.scale.set(1 + flare * 0.5);
  }
}

registerArt({
  id: ID,
  name: 'Arcanist',
  category: 'hero',
  kind: 'arcanist',
  frames: {
    body: { w: 24, h: 20, draw: robe, flash: true },
    head: { w: 26, h: 24, draw: head, flash: true },
    foot: { w: 9, h: 7, draw: foot, flash: true },
    hand: { w: 14, h: 10, draw: hand, flash: true },
    staff: { w: 36, h: 14, draw: staff, flash: true },
    flare: { w: 24, h: 24, draw: flare },
  },
  rig: (kit, mine) => new ArcanistRig(kit, mine),
});
