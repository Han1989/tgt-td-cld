// Grunt (creep). Front 3/4 view, facing right; the rig flips it. A round red brute of a goblin:
// stubby feet, bone horns, glowing yellow eyes, a tusked grin and a studded club.
// One sprite: its contact shadow and club are baked in (300 creeps on screen). Feet at y = +11.

import { box, circle, ellipse, pathLine, poly, rrect, shade } from '../paint';
import { registerArt, type Draw } from '../registry';
import { GAITS } from '../rigs';

const FEET = 11;

const grunt: Draw = (c, p, k) => {
  // Feet, back arm, horns, body, belly.
  p.part(c, ellipse(-4, 10.4, 3.4, 2.2), shade(k.grunt, -0.45), box(-7.4, 8.2, -0.6, 12.6), { line: 0.8 });
  p.part(c, ellipse(4, 10.4, 3.4, 2.2), shade(k.grunt, -0.45), box(0.6, 8.2, 7.4, 12.6), { line: 0.8 });
  p.part(c, ellipse(-8.6, 2.5, 2.8, 3.4), shade(k.grunt, -0.15), box(-11.4, -1, -5.8, 6), { line: 0.8 });
  p.part(c, poly([-5.2, -6.5, -8.5, -13, -1.8, -8.8], 0.6), k.bone, box(-8.5, -13, -1.8, -6.5), { line: 0.8 });
  p.part(c, poly([2.5, -8.8, 5, -14, 7, -7], 0.6), k.bone, box(2.5, -14, 7, -7), { line: 0.8 });
  p.part(c, ellipse(0, 1, 10.2, 9.8), k.grunt, box(-10.2, -8.8, 10.2, 10.8));
  p.detail(c, ellipse(2, 4.8, 5.8, 4.2), k.gruntBelly, false);
  // Glowing eyes (looking right), a brow and a tusked grin.
  p.accent(c, ellipse(2.6, -2.2, 1.6, 1.3), k.eye);
  p.accent(c, ellipse(7.2, -2.2, 1.4, 1.2), k.eye);
  p.line(c, pathLine([-1, -5.6, 4, -4.8]), shade(k.grunt, -0.55), 1.4);
  const mouth = new Path2D();
  mouth.moveTo(2, 2);
  mouth.quadraticCurveTo(6, 4.6, 9.4, 1.4);
  p.line(c, mouth, shade(k.grunt, -0.6), 1.5);
  p.detail(c, poly([4.4, 2.8, 5.4, 0.6, 6.2, 3.2]), k.bone);
};

/** Club, gripped at (0, 4), head up. */
const club: Draw = (c, p, k) => {
  p.part(c, rrect(-1.3, -6, 2.6, 11, 1), k.woodDark, box(-1.3, -6, 1.3, 5), { line: 0.8 });
  p.part(c, ellipse(0, -8.5, 3.6, 4.8), k.wood, box(-3.6, -13.3, 3.6, -3.7), { line: 0.8 });
  p.detail(c, circle(-2.6, -10, 0.9), k.bone);
  p.detail(c, circle(2.4, -7.5, 0.9), k.bone);
  // The fist.
  p.part(c, circle(0, 4, 2.8), shade(k.grunt, -0.1), box(-2.8, 1.2, 2.8, 6.8), { line: 0.8 });
};

const withClub: Draw = (c, p, k) => {
  grunt(c, p, k);
  c.save();
  c.translate(8.5, 3);
  c.rotate(-0.3);
  c.translate(0, -4);
  club(c, p, k);
  c.restore();
};

registerArt({
  id: 'grunt',
  name: 'Grunt',
  category: 'creep',
  kind: 'grunt',
  feet: FEET,
  gait: GAITS.waddle,
  frames: {
    body: {
      w: 32,
      h: 36,
      draw: (c, p, k) => {
        p.shadow(c, 0, FEET, 10, 4.2);
        withClub(c, p, k);
      },
      flash: withClub,
    },
  },
});
