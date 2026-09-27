// Runner (creep). Front 3/4 view, facing right; the rig flips it. A skinny yellow imp sprinting,
// leaning hard into its run (a diagonal teardrop where the others stand upright): long ears and a
// red scarf streaming back, glowing eyes, a toothy grin, thin legs and big feet.
// One sprite with its contact shadow baked in. Feet at y = +10.

import { box, ellipse, pathLine, poly, shade } from '../paint';
import { registerArt, type Draw } from '../registry';
import { GAITS } from '../rigs';

const FEET = 10;

const runner: Draw = (c, p, k) => {
  const scarf = shade(k.grunt, -0.15);
  // Scarf tail and back ear streaming behind.
  p.part(c, poly([-1, -5, -9, -8.5, -14, -6, -10, -4.5, -14, -1.5, -7, -1.5, 0, -1], 0.8), shade(scarf, -0.2), box(-14, -8.5, 0, -1), {
    line: 0.7,
  });
  p.part(c, poly([-1, -7, -13, -12, -2.5, -3.5], 0.6), shade(k.runner, -0.25), box(-13, -12, -1, -3.5), { line: 0.7 });
  // Legs: back leg pushing off, front leg reaching.
  p.line(c, pathLine([-1, 4, -4.5, 7.5, -5, 9.5]), k.ink, 3.4);
  p.line(c, pathLine([-1, 4, -4.5, 7.5, -5, 9.5]), shade(k.runner, -0.35), 1.6);
  p.line(c, pathLine([2, 4, 5.5, 6, 4.5, 9.5]), k.ink, 3.4);
  p.line(c, pathLine([2, 4, 5.5, 6, 4.5, 9.5]), shade(k.runner, -0.2), 1.6);
  p.part(c, ellipse(-5.4, 10, 3, 1.7), shade(k.runner, -0.5), box(-8.4, 8.3, -2.4, 11.7), { line: 0.6 });
  p.part(c, ellipse(5.4, 10, 3.2, 1.7), shade(k.runner, -0.5), box(2.2, 8.3, 8.6, 11.7), { line: 0.6 });
  // Body leaning forward, head at the front.
  p.part(c, ellipse(0.5, -0.5, 5.4, 7.6, 0.55), k.runner, box(-5, -8.5, 6, 6));
  p.part(c, poly([2.5, -8.5, 5, -15, 6.8, -7.5], 0.5), k.runner, box(2.5, -15, 6.8, -7.5), { line: 0.7 });
  // Scarf around the neck.
  p.part(c, poly([-2.8, -4.6, 3.6, -1.8, 3, 0.6, -3.6, -2.2], 0.8), scarf, box(-3.6, -4.6, 3.6, 0.6), { line: 0.7 });
  // Glowing eyes, a grin with a fang.
  p.accent(c, ellipse(4.4, -6, 1.1, 1), k.eye);
  p.accent(c, ellipse(7, -5, 1, 0.9), k.eye);
  const mouth = new Path2D();
  mouth.moveTo(4.8, -3);
  mouth.quadraticCurveTo(7, -1.6, 8.6, -3.4);
  p.line(c, mouth, shade(k.runner, -0.65), 1.2);
  p.detail(c, poly([6.2, -2.6, 6.9, -0.9, 7.4, -2.8]), k.bone);
};

registerArt({
  id: 'runner',
  name: 'Runner',
  category: 'creep',
  kind: 'runner',
  feet: FEET,
  gait: GAITS.scurry,
  frames: {
    body: {
      w: 32,
      h: 34,
      draw: (c, p, k) => {
        p.shadow(c, 0, FEET, 8.5, 3.4);
        runner(c, p, k);
      },
      flash: runner,
    },
  },
});
