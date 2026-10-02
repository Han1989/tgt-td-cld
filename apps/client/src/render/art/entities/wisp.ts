// Wisp (creep, flying). Front 3/4 view, facing right; the rig flips it. A violet spirit flame (enemy
// magic): a round head trailing a flickering tail up and back, dark eye slits over a glowing core, a
// few loose sparks. Two bone wings sit above the head — a badge, not a second creature — so the
// silhouette still reads at phone size and in a CrazyGames frame (docs/ART.md §7). The renderer
// also draws flyers a little larger than walkers (`FLYER_DRAW_SCALE`); the sim radius is unchanged.
// It floats: its shadow is its own frame, on the ground FEET px below the body's centre, so the body
// can bob over it.

import { box, circle, ellipse, poly, shade } from '../paint';
import { registerArt, type Draw } from '../registry';
import { GAITS } from '../rigs';

/** The ground (the shadow) is this far below the body's centre: the rig pivots there. */
const FEET = 13;

const wisp: Draw = (c, p, k) => {
  // Wing badge, above the flame. Bone on a violet body, with the painter's ink outline.
  const wingL = new Path2D();
  wingL.moveTo(-1, -9);
  wingL.quadraticCurveTo(-9, -19, -16, -10);
  wingL.quadraticCurveTo(-9, -12.5, -1, -9);
  wingL.closePath();
  const wingR = new Path2D();
  wingR.moveTo(4, -9);
  wingR.quadraticCurveTo(12, -19, 18, -10);
  wingR.quadraticCurveTo(12, -12.5, 4, -9);
  wingR.closePath();
  p.part(c, wingL, k.bone, box(-16, -19, -1, -9), { line: 0.85 });
  p.part(c, wingR, k.bone, box(4, -19, 18, -9), { line: 0.85 });

  // Tail flickering up and back, then a larger head so the body is not a speck.
  const tail = new Path2D();
  tail.moveTo(1, -7);
  tail.quadraticCurveTo(-7, -9, -11, -15);
  tail.quadraticCurveTo(-9, -8, -15, -6);
  tail.quadraticCurveTo(-9, -4, -13, 2);
  tail.quadraticCurveTo(-6, 2.5, 0, 7);
  tail.closePath();
  p.part(c, tail, shade(k.wisp, -0.25), box(-15, -15, 1, 7), { line: 0.95 });
  p.part(c, circle(1.5, -0.5, 8.2), k.wisp, box(-6.7, -8.7, 9.7, 7.7), { line: 1.15 });
  // Glowing core, eye slits over it.
  p.accent(c, ellipse(2, 0.2, 4.4, 4.1), shade(k.wisp, 0.4));
  p.detail(c, poly([2.4, -3.2, 5.2, -2.5, 4.7, -0.6, 2.6, -1.3], 0.4), k.void, false);
  p.detail(c, poly([6.2, -2.7, 8.6, -2.2, 8.1, -0.4, 6.2, -1], 0.4), k.void, false);
  // Loose sparks.
  p.detail(c, circle(-15, -12, 1.5), shade(k.wisp, 0.25));
  p.detail(c, circle(-14, 2, 1.2), shade(k.wisp, 0.25));
};

registerArt({
  id: 'wisp',
  name: 'Wisp',
  category: 'creep',
  kind: 'wisp',
  feet: FEET,
  gait: GAITS.hover,
  frames: {
    body: { w: 44, h: 46, draw: wisp, flash: true },
    shadow: { w: 28, h: 14, draw: (c, p) => p.shadow(c, 0, 0, 11, 3.6) },
  },
});
