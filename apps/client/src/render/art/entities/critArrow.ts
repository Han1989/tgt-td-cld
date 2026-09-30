// Keen Eye crit. The Ranger's arrow struck bright: a gold head and a spark above the shaft,
// so the outline isn't the plain arrow's.

import { box, ngon, poly, rrect } from '../paint';
import { registerArt, type Draw } from '../registry';

const body: Draw = (c, p, k) => {
  p.part(c, poly([-17.5, 0, -11.4, -4.6, -9.6, 0], 0.4), k.bone, box(-17.5, -4.6, -9.6, 0), { line: 0.6 });
  p.part(c, poly([-17.5, 0, -11.4, 4.6, -9.6, 0], 0.4), k.bone, box(-17.5, 0, -9.6, 4.6), { line: 0.6 });
  p.part(c, rrect(-11, -1.6, 20, 3.2, 0.6), k.wood, box(-11, -1.6, 9, 1.6), { line: 0.65 });
  p.detail(c, rrect(2, -2.1, 3.2, 4.2, 0.4), k.gold);
  p.part(c, poly([7.4, -4.2, 18.2, 0, 7.4, 4.2], 0.45), k.gold, box(7.4, -4.2, 18.2, 4.2), { line: 0.75 });
  p.accent(c, ngon(12, -7.2, 3.2, 4, Math.PI / 4, 0.4), k.gold);
};

registerArt({
  id: 'critArrow',
  name: 'Crit arrow',
  category: 'projectile',
  kind: 'crit',
  frames: { body: { w: 56, h: 48, draw: body } },
});
