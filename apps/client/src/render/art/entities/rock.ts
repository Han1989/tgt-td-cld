// Mossy rocks (clearing prop). From above: a carved-looking boulder with a moss cap, and a pair of
// small stones. Low contrast: props are decoration, never mistaken for something to click.

import { box, ellipse, pathLine, poly } from '../paint';
import { registerArt, type Draw } from '../registry';

const boulder: Draw = (c, p, k) => {
  p.shadow(c, 3, 4, 13, 9);
  const rock = poly([-11, 2, -8, -7, 1, -10, 9, -6, 11, 3, 5, 9, -5, 9], 3);
  p.part(c, rock, k.stoneDark, box(-11, -10, 11, 9));
  p.part(c, poly([-8, -3, -5, -8, 2, -9, 5, -5, -1, -2], 2.5), k.mossLight, box(-8, -9, 5, -2), { noOutline: true, flat: true });
  p.line(c, pathLine([2, -1, 6, 4, 4, 7]), k.ink, 1, 0.5);
};

const pebbles: Draw = (c, p, k) => {
  p.shadow(c, 2, 3, 12, 6);
  p.part(c, ellipse(-4, 0, 6, 4.5, -0.3), k.stoneDark, box(-10, -4.5, 2, 4.5), { line: 0.8 });
  p.part(c, ellipse(6, 2, 4, 3, 0.4), k.stoneDark, box(2, -1, 10, 5), { line: 0.7 });
};

registerArt({
  id: 'rock',
  name: 'Rocks',
  category: 'prop',
  where: 'clearing',
  weight: 3,
  frames: {
    boulder: { w: 32, h: 28, draw: boulder },
    pebbles: { w: 28, h: 20, draw: pebbles },
  },
});
