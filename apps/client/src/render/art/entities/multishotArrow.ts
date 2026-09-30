// Multishot arrow. A barbed head and wide yellow-green vanes (the skill's colour), wider than
// the Ranger's single arrow. One rune on the head.

import { box, circle, poly, rrect } from '../paint';
import { registerArt, type Draw } from '../registry';

const body: Draw = (c, p, k) => {
  // Flat, so the skill yellow-green stays bright (a body gradient would olive it).
  p.detail(c, poly([-16.5, 0, -9.5, -6.4, -7.4, 0], 0.45), k.multishot);
  p.detail(c, poly([-16.5, 0, -9.5, 6.4, -7.4, 0], 0.45), k.multishot);
  p.part(c, rrect(-9, -1.6, 16, 3.2, 0.6), k.wood, box(-9, -1.6, 7, 1.6), { line: 0.65 });
  // Barbs stick out past a plain arrowhead.
  p.part(c, poly([5.5, -5.6, 8.2, -1.4, 4.2, -1.6], 0.35), k.bone, box(4.2, -5.6, 8.2, -1.4), { line: 0.6 });
  p.part(c, poly([5.5, 5.6, 8.2, 1.4, 4.2, 1.6], 0.35), k.bone, box(4.2, 1.4, 8.2, 5.6), { line: 0.6 });
  p.part(c, poly([6.4, -3.2, 16.4, 0, 6.4, 3.2], 0.4), k.bone, box(6.4, -3.2, 16.4, 3.2), { line: 0.7 });
  p.accent(c, circle(12.4, -1, 1.8), k.rune);
};

registerArt({
  id: 'multishotArrow',
  name: 'Multishot arrow',
  category: 'projectile',
  kind: 'multishot',
  frames: { body: { w: 50, h: 32, draw: body } },
});
