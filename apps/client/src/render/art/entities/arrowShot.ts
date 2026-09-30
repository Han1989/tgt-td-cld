// Arrow-tower bolt. In flight, pointing +x; the renderer turns it along its path.
// A short iron quarrel: dark shaft, bone vanes, one rune on the head. Shorter and blunter than
// the Ranger's arrow, so a tower shot and a hero shot don't share a silhouette.

import { box, circle, poly, rrect } from '../paint';
import { registerArt, type Draw } from '../registry';

const body: Draw = (c, p, k) => {
  p.part(c, poly([-13, 0, -8.2, -4.4, -6.8, 0], 0.4), k.bone, box(-13, -4.4, -6.8, 0), { line: 0.6 });
  p.part(c, poly([-13, 0, -8.2, 4.4, -6.8, 0], 0.4), k.bone, box(-13, 0, -6.8, 4.4), { line: 0.6 });
  p.part(c, rrect(-8.5, -1.9, 15, 3.8, 0.7), k.woodDark, box(-8.5, -1.9, 6.5, 1.9), { line: 0.7 });
  p.detail(c, rrect(-1.2, -2.3, 2.4, 4.6, 0.4), k.iron);
  p.part(c, poly([5.2, -3.6, 14.2, 0, 5.2, 3.6], 0.45), k.iron, box(5.2, -3.6, 14.2, 3.6), { line: 0.75 });
  p.accent(c, circle(10.6, -0.8, 1.8), k.rune);
};

registerArt({
  id: 'arrowShot',
  name: 'Arrow bolt',
  category: 'projectile',
  kind: 'arrow',
  frames: { body: { w: 46, h: 32, draw: body } },
});
