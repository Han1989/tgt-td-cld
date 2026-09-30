// Archer arrow. The creep's shot: a short crude shaft, orange vanes, a bone head. Warm, and
// it does not glow — player shots are the ones with a rune or a gem.

import { box, poly, rrect } from '../paint';
import { registerArt, type Draw } from '../registry';

const body: Draw = (c, p, k) => {
  p.part(c, poly([-12.5, 0, -7.2, -4.8, -5.6, 0], 0.4), k.archer, box(-12.5, -4.8, -5.6, 0), { line: 0.65 });
  p.part(c, poly([-12.5, 0, -7.2, 4.8, -5.6, 0], 0.4), k.archer, box(-12.5, 0, -5.6, 4.8), { line: 0.65 });
  p.part(c, rrect(-7, -2, 13, 4, 0.6), k.wood, box(-7, -2, 6, 2), { line: 0.7 });
  p.part(c, poly([4.6, -3.8, 13.2, 0, 4.6, 3.8], 0.4), k.bone, box(4.6, -3.8, 13.2, 3.8), { line: 0.7 });
};

registerArt({
  id: 'archerArrow',
  name: 'Archer arrow',
  category: 'projectile',
  kind: 'archer',
  frames: { body: { w: 42, h: 26, draw: body } },
});
