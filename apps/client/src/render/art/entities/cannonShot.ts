// Cannonball. A round iron shot with one hot ember, so it stays a ball where the Arcane star
// and the Fireball's tongues do not. Pointing doesn't matter; the renderer still turns it.

import { box, circle, pathLine } from '../paint';
import { registerArt, type Draw } from '../registry';

const body: Draw = (c, p, k) => {
  p.part(c, circle(0, 0, 8), k.iron, box(-8, -8, 8, 8));
  p.line(c, pathLine([-3.2, 2.4, -0.4, 0.2, 2.6, 3.2]), k.ironDark, 1.4);
  p.accent(c, circle(1.2, 1.2, 3.1), k.ember);
};

registerArt({
  id: 'cannonShot',
  name: 'Cannonball',
  category: 'projectile',
  kind: 'cannon',
  frames: { body: { w: 36, h: 36, draw: body } },
});
