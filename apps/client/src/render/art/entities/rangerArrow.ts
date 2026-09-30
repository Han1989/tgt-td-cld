// Ranger arrow. A long wooden shaft, leaf vanes and a bone head with a gold tip. No glow:
// a plain shot. Longer than the tower bolt and cooler than the Archer's arrow.

import { box, poly, rrect } from '../paint';
import { registerArt, type Draw } from '../registry';

const body: Draw = (c, p, k) => {
  p.part(c, poly([-18.5, 0, -12.2, -5.4, -10.2, 0], 0.45), k.leaf, box(-18.5, -5.4, -10.2, 0), { line: 0.65 });
  p.part(c, poly([-18.5, 0, -12.2, 5.4, -10.2, 0], 0.45), k.leaf, box(-18.5, 0, -10.2, 5.4), { line: 0.65 });
  p.part(c, poly([-16.4, 0, -12.6, -2.3, -11.2, 0], 0.3), k.leafDark, box(-16.4, -2.3, -11.2, 0), { line: 0.55 });
  p.part(c, rrect(-12, -1.45, 22, 2.9, 0.6), k.wood, box(-12, -1.45, 10, 1.45), { line: 0.65 });
  p.part(c, poly([8.2, -3.5, 18.6, 0, 8.2, 3.5], 0.4), k.bone, box(8.2, -3.5, 18.6, 3.5), { line: 0.7 });
  p.detail(c, poly([13.4, -1.7, 17.6, 0, 13.4, 1.7], 0.3), k.gold);
};

registerArt({
  id: 'rangerArrow',
  name: 'Ranger arrow',
  category: 'projectile',
  kind: 'ranger',
  frames: { body: { w: 52, h: 28, draw: body } },
});
