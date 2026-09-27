// Wisp (creep, flying). Front 3/4 view, facing right; the rig flips it. A violet spirit flame (enemy
// magic): a round head trailing a flickering tail up and back, dark eye slits over a glowing core, a
// few loose sparks. It floats: its shadow is its own frame, on the ground FEET px below the body's
// centre, so the body can bob over it (docs/ART.md §7).

import { box, circle, ellipse, poly, shade } from '../paint';
import { registerArt, type Draw } from '../registry';
import { GAITS } from '../rigs';

/** The ground (the shadow) is this far below the body's centre: the rig pivots there. */
const FEET = 13;

const wisp: Draw = (c, p, k) => {
  // Tail flickering up and back, then the head.
  const tail = new Path2D();
  tail.moveTo(1, -6.5);
  tail.quadraticCurveTo(-6, -8, -9, -12.5);
  tail.quadraticCurveTo(-8, -7, -12.5, -5.5);
  tail.quadraticCurveTo(-8, -3.5, -11, 1.5);
  tail.quadraticCurveTo(-5, 2, 0, 5.5);
  tail.closePath();
  p.part(c, tail, shade(k.wisp, -0.25), box(-12.5, -12.5, 1, 5.5), { line: 0.8 });
  p.part(c, circle(1.5, -0.5, 6.6), k.wisp, box(-5.1, -7.1, 8.1, 6.1));
  // Glowing core, eye slits over it.
  p.accent(c, ellipse(2, 0.5, 3.6, 3.4), shade(k.wisp, 0.35));
  p.detail(c, poly([2.2, -2.8, 4.6, -2.2, 4.2, -0.6, 2.4, -1.2], 0.4), k.void, false);
  p.detail(c, poly([5.6, -2.4, 7.6, -2, 7.2, -0.4, 5.6, -0.9], 0.4), k.void, false);
  // Loose sparks.
  p.detail(c, circle(-13, -9.5, 1.3), shade(k.wisp, 0.2));
  p.detail(c, circle(-12.5, 1, 1), shade(k.wisp, 0.2));
};

registerArt({
  id: 'wisp',
  name: 'Wisp',
  category: 'creep',
  kind: 'wisp',
  feet: FEET,
  gait: GAITS.hover,
  frames: {
    body: { w: 34, h: 30, draw: wisp, flash: true },
    shadow: { w: 22, h: 12, draw: (c, p) => p.shadow(c, 0, 0, 8, 3) },
  },
});
