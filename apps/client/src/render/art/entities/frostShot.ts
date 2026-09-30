// Frost shard. A long ice diamond (not a shaft and head), with a snow facet and a frost core.

import { box, circle, poly } from '../paint';
import { registerArt, type Draw } from '../registry';

const body: Draw = (c, p, k) => {
  p.part(c, poly([-16, 0, -1, -6.2, 16, 0, -1, 6.2], 0.7), k.ice, box(-16, -6.2, 16, 6.2));
  p.detail(c, poly([-6, 0, 1, -2.8, 9, 0, 1, 2.8], 0.4), k.snow);
  p.accent(c, circle(2, -1.2, 2.2), k.frost);
};

registerArt({
  id: 'frostShot',
  name: 'Frost shard',
  category: 'projectile',
  kind: 'frost',
  frames: { body: { w: 48, h: 32, draw: body } },
});
