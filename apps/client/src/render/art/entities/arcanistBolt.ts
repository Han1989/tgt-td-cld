// Arcanist bolt. A narrow robe-pink crystal, thinner than the Frost shard and not the Arcane
// tower's four-point star. The staff gem glows once, up-left of centre.

import { box, circle, poly } from '../paint';
import { registerArt, type Draw } from '../registry';

const body: Draw = (c, p, k) => {
  p.part(c, poly([-15, 0, -2, -3.6, 16, 0, -2, 3.6], 0.5), k.robe, box(-15, -3.6, 16, 3.6));
  p.detail(c, poly([3.5, -1.6, 12.2, 0, 3.5, 1.6], 0.3), k.robeDark);
  p.accent(c, circle(5.5, -1.2, 2.2), k.staffGem);
};

registerArt({
  id: 'arcanistBolt',
  name: 'Arcanist bolt',
  category: 'projectile',
  kind: 'arcanist',
  frames: { body: { w: 48, h: 28, draw: body } },
});
