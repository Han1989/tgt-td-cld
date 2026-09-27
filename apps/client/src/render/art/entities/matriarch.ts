// Matriarch (boss, wave 20: Hatch). Front 3/4 view, facing right; the rig flips it. A broodmother:
// a tall magenta shell at the back carrying a clutch of cream eggs, a low armoured head in front
// with mandibles and a cluster of glowing eyes, and six spindly legs. Where Ironhorn is wide and
// horned, she is a tall dome of eggs on thin legs.
// One sprite with its contact shadow baked in. Feet at y = +25.

import { box, circle, ellipse, pathLine, poly, shade } from '../paint';
import type { Ctx, Painter } from '../paint';
import { registerArt, type Draw } from '../registry';
import { GAITS } from '../rigs';
import type { Tokens } from '../tokens';

const FEET = 25;

/** A leg: hip → knee (up and out) → foot, an ink stroke with a coloured core. */
function leg(c: Ctx, p: Painter, k: Tokens, pts: number[], color: number): void {
  p.line(c, pathLine(pts), k.ink, 4.4);
  p.line(c, pathLine(pts), color, 2.2);
  p.detail(c, circle(pts[2]!, pts[3]!, 1.4), shade(color, -0.2));
}

const matriarch: Draw = (c, p, k) => {
  const shell = k.matriarch;
  const far = shade(shell, -0.45);
  // Far legs behind everything.
  leg(c, p, k, [-8, 6, -20, -3, -26, 24], far);
  leg(c, p, k, [4, 8, 0, -2, -6, 24], far);
  leg(c, p, k, [14, 9, 22, 0, 22, 24], far);
  // The abdomen (a tall shell), its plate seams, and the clutch of eggs on top.
  p.part(c, ellipse(-8, 2, 20, 17), shell, box(-28, -15, 12, 19));
  for (const [x0, y0, x1, y1] of [
    [-24, -2, 8, -6],
    [-26, 7, 10, 3],
  ] as const) {
    const seam = new Path2D();
    seam.moveTo(x0, y0);
    seam.quadraticCurveTo((x0 + x1) / 2, y0 - 6, x1, y1);
    p.line(c, seam, shade(shell, -0.4), 1.2, 0.9);
  }
  for (const [x, y, r] of [
    [-19, -14, 4.6],
    [-10, -18, 5],
    [-1, -15, 4.6],
    [-15, -22, 4.2],
    [-5, -24.5, 4.2],
    [5, -20.5, 3.8],
    [-24, -7, 3.8],
  ] as const) {
    p.part(c, ellipse(x, y, r, r * 1.15), k.egg, box(x - r, y - r * 1.15, x + r, y + r * 1.15), { line: 0.7 });
    p.detail(c, circle(x + r * 0.2, y + r * 0.3, r * 0.28), shade(shell, 0.25), false);
  }
  // Head and thorax: an armoured wedge low at the front, mandibles, a cluster of eyes.
  p.part(c, ellipse(14, 7, 10, 8.5), shade(shell, -0.15), box(4, -1.5, 24, 15.5));
  p.part(c, poly([17, 1, 29, 3.5, 32, 9, 27, 14, 17, 13], 2), shell, box(17, 1, 32, 14));
  p.part(c, poly([28, 11, 36, 12, 33, 14.5, 36, 17, 29, 15], 0.6), k.bone, box(28, 11, 36, 17), { line: 0.7 });
  p.part(c, poly([26, 13, 31, 17.5, 26.5, 17], 0.5), shade(k.bone, -0.2), box(26, 13, 31, 17.5), { line: 0.6 });
  for (const [x, y, r] of [
    [23, 5, 1.4],
    [27, 5.4, 1.3],
    [25.4, 8.2, 1],
    [29.6, 7.4, 0.9],
  ] as const) {
    p.accent(c, circle(x, y, r), k.eye);
  }
  // Near legs in front.
  leg(c, p, k, [-12, 12, -24, 6, -30, 25], shell);
  leg(c, p, k, [2, 14, -4, 8, -10, 25], shell);
  leg(c, p, k, [16, 14, 26, 8, 30, 25], shell);
};

registerArt({
  id: 'matriarch',
  name: 'Matriarch',
  category: 'creep',
  kind: 'matriarch',
  feet: FEET,
  gait: GAITS.crawl,
  frames: {
    body: {
      w: 80,
      h: 66,
      draw: (c, p, k) => {
        p.shadow(c, 0, FEET, 33, 8);
        matriarch(c, p, k);
      },
      flash: matriarch,
    },
  },
});
