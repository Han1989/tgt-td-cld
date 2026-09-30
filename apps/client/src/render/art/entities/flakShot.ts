// Flak shell. A stubby steel slug with a tracer at the tail, shorter than an arrow and not round.

import { box, circle, poly, rrect } from '../paint';
import { registerArt, type Draw } from '../registry';

const body: Draw = (c, p, k) => {
  p.part(c, rrect(-11, -4.2, 15, 8.4, 2), k.steel, box(-11, -4.2, 4, 4.2));
  p.part(c, poly([2.2, -4.4, 14.5, 0, 2.2, 4.4], 0.5), k.steelDark, box(2.2, -4.4, 14.5, 4.4), { line: 0.75 });
  p.detail(c, rrect(-3.4, -4.6, 2.6, 9.2, 0.4), k.iron);
  p.accent(c, circle(-8.2, 0, 2.5), k.flare);
};

registerArt({
  id: 'flakShot',
  name: 'Flak shell',
  category: 'projectile',
  kind: 'flak',
  frames: { body: { w: 48, h: 32, draw: body } },
});
