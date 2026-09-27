// Glowing mushrooms (clearing prop): a small ring of pale caps with teal spots that glow, like the
// motes in the moss. They are emitters, so the spots may glow (docs/ART.md §3).

import { box, circle } from '../paint';
import { registerArt, type Draw } from '../registry';

const ring: Draw = (c, p, k) => {
  const caps: [number, number, number][] = [
    [-6, -2, 3.6],
    [1, -5, 3],
    [6, 1, 3.4],
    [-1, 5, 2.6],
  ];
  for (const [x, y, r] of caps) p.shadow(c, x + 1.5, y + 2, r + 1, r * 0.8);
  for (const [x, y, r] of caps) {
    p.part(c, circle(x, y, r), k.mushroom, box(x - r, y - r, x + r, y + r), { line: 0.6 });
    p.accent(c, circle(x + r * 0.2, y + r * 0.15, r * 0.3), k.rune);
  }
};

registerArt({
  id: 'mushrooms',
  name: 'Mushrooms',
  category: 'prop',
  where: 'clearing',
  weight: 2,
  frames: { ring: { w: 28, h: 26, draw: ring } },
});
