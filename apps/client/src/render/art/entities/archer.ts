// Archer (creep). Front 3/4 view, facing right; the rig flips it. A lanky orange goblin, pear-shaped
// (narrow head, wide hips) where the Grunt is round: long ears swept back, a leather cap, glowing eyes,
// a pointed nose, a quiver on its back and a short bow held out in front.
// One sprite: its contact shadow, quiver and bow are baked in. Feet at y = +10.

import { box, circle, ellipse, pathLine, poly, shade } from '../paint';
import { registerArt, type Draw } from '../registry';
import { GAITS } from '../rigs';

const FEET = 10;

const archer: Draw = (c, p, k) => {
  // Quiver across the back, fletchings sticking out.
  c.save();
  c.translate(-6.5, 1);
  c.rotate(-0.35);
  p.part(c, poly([-2.4, -7, 2.4, -7, 2, 6, -2, 6], 0.8), k.woodDark, box(-2.4, -7, 2.4, 6), { line: 0.7 });
  p.detail(c, poly([-1.8, -7, 0, -11, 0.2, -7]), k.bone);
  p.detail(c, poly([0.2, -7, 1.8, -10.5, 2.2, -7]), k.bone);
  c.restore();
  // Feet, back ear, body, head.
  p.part(c, ellipse(-3.2, 9.6, 3, 2), shade(k.archer, -0.45), box(-6.2, 7.6, -0.2, 11.6), { line: 0.7 });
  p.part(c, ellipse(3.4, 9.6, 3, 2), shade(k.archer, -0.45), box(0.4, 7.6, 6.4, 11.6), { line: 0.7 });
  p.part(c, poly([-3, -7, -11.5, -11.5, -4.5, -2.5], 0.6), shade(k.archer, -0.2), box(-11.5, -11.5, -3, -2.5), { line: 0.8 });
  p.part(c, ellipse(0, 3.6, 7, 6.2), k.archer, box(-7, -2.6, 7, 9.8));
  p.part(c, ellipse(1.2, -5, 5.6, 5.4), k.archer, box(-4.4, -10.4, 6.8, 0.4));
  p.part(c, poly([3, -7.5, 6, -14.5, 7.6, -6], 0.5), k.archer, box(3, -14.5, 7.6, -6), { line: 0.8 });
  // Leather cap, belly strap, nose.
  p.part(c, poly([-4.6, -5.5, -2.5, -10.6, 3.5, -10.8, 6.4, -7, 3, -8, -1, -7.5], 1), k.woodDark, box(-4.6, -10.8, 6.4, -5.5), { line: 0.7 });
  p.line(c, pathLine([-6, 1, 5, 7]), k.woodDark, 1.4);
  p.detail(c, poly([6, -4.4, 10, -3, 6.2, -2.2], 0.3), shade(k.archer, -0.1));
  // Glowing eyes and a thin mouth.
  p.accent(c, ellipse(3.2, -5.4, 1.2, 1.1), k.eye);
  p.accent(c, ellipse(6.2, -5.6, 1, 1), k.eye);
  p.line(c, pathLine([3.2, -1.6, 6.2, -1.9]), shade(k.archer, -0.6), 1.1);
};

/** The bow, gripped at (0, 0), belly towards +x; tips at (-1.5, ±9). */
const bow: Draw = (c, p, k) => {
  const b = new Path2D();
  b.moveTo(-2, -9.5);
  b.quadraticCurveTo(7.5, 0, -2, 9.5);
  b.lineTo(-0.8, 9);
  b.quadraticCurveTo(4.2, 0, -0.8, -9);
  b.closePath();
  p.line(c, pathLine([-1.5, -9, -1.5, 9]), k.string, 0.8);
  p.part(c, b, k.wood, box(-2, -9.5, 3, 9.5), { line: 0.6 });
  // The fist.
  p.part(c, circle(2, 0.4, 2.3), k.archer, box(-0.3, -1.9, 4.3, 2.7), { line: 0.7 });
};

const withBow: Draw = (c, p, k) => {
  archer(c, p, k);
  c.save();
  c.translate(8.5, 2);
  bow(c, p, k);
  c.restore();
};

registerArt({
  id: 'archer',
  name: 'Archer',
  category: 'creep',
  kind: 'archer',
  feet: FEET,
  gait: GAITS.waddle,
  frames: {
    body: {
      w: 34,
      h: 34,
      draw: (c, p, k) => {
        p.shadow(c, 0, FEET, 9, 3.8);
        withBow(c, p, k);
      },
      flash: withBow,
    },
  },
});
