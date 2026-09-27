// Warden (hero). Seen from the front (3/4 view), facing right; the rig flips it. A knight in bright
// steel plate under a blue tabard and cape: a great helm with a visor slit and glowing eyes, a big
// blue heater shield on the near arm (one rune on it) and a sword on the far arm.
//
// Rig: feet at y = +13; the sword arm turns around the far shoulder (-1, -4), the sword's grip is at
// the arm's origin + GRIP_X. Attack (melee): the sword is raised over the cooldown and swung down on
// the hit. Cast: Cleave is a wide sweep, Taunt thrusts the shield out with the sword raised, Last
// Stand braces behind the shield with the sword held high.

import { TUNING } from '@tdt/sim';
import { Container } from 'pixi.js';
import type { ArtKit } from '../kit';
import { box, circle, ellipse, pathLine, poly, rrect } from '../paint';
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

// ---------------------------------------------------------------------------
// Rig
// ---------------------------------------------------------------------------

const FEET = 13;
const SHOULDER = { x: -1, y: -4 };
const GRIP_X = 6;
/** Sword angles (radians, facing +x; negative is up): at rest, wound up, at the end of a swing. */
const REST = -1.0;
const WOUND = -2.2;
const STRUCK = 0.55;
/** A swing takes this long (ms), holds, then the sword comes back to rest. */
const SWING_MS = 110;

class WardenRig extends HeroRigBase {
  private readonly cape: Container;
  private readonly torso: Container;
  private readonly head: Container;
  private readonly footA: Container;
  private readonly footB: Container;
  private readonly shield: Container;
  private readonly arm = new Container();
  private readonly cooldownMs = TUNING.hero.warden.attackCooldown * 1000;

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
    this.flipper.addChild(this.cape, this.footB, this.arm, this.torso, this.footA, this.head, this.shield);
  }

  /** Melee: the renderer calls shot() when a creep in reach loses HP, so ignore hits faster than the cooldown. */
  override shot(now: number): void {
    if (now - this.shotAt >= this.cooldownMs * 0.7) super.shot(now);
  }

  protected pose(_h: HeroPose, walking: boolean, now: number): void {
    const cd = this.cooldownMs;
    const since = now - this.shotAt;
    // Sword: swung down on the hit, back to rest, raised again towards the next swing while fighting.
    let angle = REST;
    let lunge = 0;
    if (since < SWING_MS) {
      const t = since / SWING_MS;
      angle = WOUND + (STRUCK - WOUND) * (1 - (1 - t) * (1 - t));
      lunge = t;
    } else if (since < SWING_MS + 60) {
      angle = STRUCK;
      lunge = 1;
    } else if (since < 430) {
      const t = smooth((since - SWING_MS - 60) / (430 - SWING_MS - 60));
      angle = STRUCK + (REST - STRUCK) * t;
      lunge = 1 - t;
    } else if (since < cd * 1.6) {
      const up = smooth(clamp01((since - cd * 0.6) / (cd * 0.35))) - smooth(clamp01((since - cd * 1.3) / (cd * 0.3)));
      angle = REST + (WOUND - REST) * up;
    }

    let shieldX = 0;
    let shieldY = 0;
    let crouch = 0;
    let tilt = 0;
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
    const lean = lunge * 1.5;
    this.cape.position.set(-3 + lean * 0.5, 2 - bob * 0.8);
    this.cape.rotation = walking ? -0.06 - Math.abs(Math.sin(this.phase)) * 0.05 : 0;
    this.torso.position.set(lean, 2 - bob);
    this.head.position.set(0.5 + lean * 1.2, -9 - bob);
    this.head.rotation = tilt;
    this.shield.position.set(3.5 + lean + shieldX, 3.5 - bob + shieldY);
    this.stepFeet(this.footA, this.footB, 4, 2.2, 2.2, walking);
    this.arm.position.set(SHOULDER.x + lean, SHOULDER.y - bob);
    this.arm.rotation = angle;
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
  },
  rig: (kit, mine) => new WardenRig(kit, mine),
});
