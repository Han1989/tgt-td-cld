// Hatchling (creep: the Matriarch's spawn). Front 3/4 view, facing right; the rig flips it. A tiny
// magenta spiderling fresh out of its egg: a round body in her colours with a jagged cap of cream
// eggshell still stuck on its back, four splayed legs, stubby mandibles and two glowing eyes. The
// smallest creep: the shell cap and the legs make its silhouette, not its size.
// One sprite with its contact shadow baked in. Feet at y = +8.

import { box, circle, ellipse, pathLine, poly, shade } from '../paint';
import { registerArt, type Draw } from '../registry';
import { GAITS } from '../rigs';

const FEET = 8;

const hatchling: Draw = (c, p, k) => {
  const shell = shade(k.matriarch, 0.12);
  const far = shade(k.matriarch, -0.45);
  // Legs: two behind the body, two in front, each hip → knee → foot.
  for (const [pts, col] of [
    [[-3, 2, -7.5, -1, -9, 7.5], far],
    [[2, 3, 5.5, -0.5, 8.5, 7.5], far],
    [[-2, 4, -6, 2.5, -5.5, 8], shell],
    [[3, 4.5, 7, 3, 10, 8], shell],
  ] as const) {
    p.line(c, pathLine(pts), k.ink, 3);
    p.line(c, pathLine(pts), col, 1.4);
  }
  // Body, then the eggshell cap with its jagged edge.
  p.part(c, ellipse(0, 2, 6.6, 5.6), shell, box(-6.6, -3.6, 6.6, 7.6));
  p.part(c, poly([-6.4, 0.4, -5.2, -5.2, 1.5, -7.8, 5.6, -4.2, 4.2, -2.6, 3, -0.6, 1.4, -2.2, -0.6, 0.2, -2.6, -1.8, -4.2, 0.8], 0.6), k.egg, box(-6.4, -7.8, 5.6, 0.8), {
    line: 0.7,
  });
  p.detail(c, circle(-2.6, -4.6, 0.9), shade(k.matriarch, 0.3), false);
  // Mandibles and glowing eyes, looking right.
  p.detail(c, poly([5.2, 3.6, 8.6, 4.2, 5.8, 5.6], 0.3), k.bone);
  p.accent(c, circle(3.4, 1.4, 1), k.eye);
  p.accent(c, circle(5.8, 1.8, 0.9), k.eye);
};

registerArt({
  id: 'hatchling',
  name: 'Hatchling',
  category: 'creep',
  kind: 'hatchling',
  feet: FEET,
  gait: GAITS.scurry,
  frames: {
    body: {
      w: 26,
      h: 24,
      draw: (c, p, k) => {
        p.shadow(c, 0, FEET, 8, 3);
        hatchling(c, p, k);
      },
      flash: hatchling,
    },
  },
});
