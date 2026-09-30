// Fireball. A coal with three tongues, so the outline is spiky where the cannonball is round.
// The core glows flare-hot.

import { box, circle, poly } from '../paint';
import { registerArt, type Draw } from '../registry';

const body: Draw = (c, p, k) => {
  const tongues: readonly (readonly [number, number])[] = [
    [0.15, 1],
    [2.35, 0.72],
    [-2.15, 0.85],
  ];
  for (const [ang, len] of tongues) {
    c.save();
    c.rotate(ang);
    const tip = 9 + len * 6;
    p.part(c, poly([3, -3.4, tip, 0, 3, 3.4], 0.7), k.ember, box(3, -3.4, tip, 3.4), { line: 0.6 });
    c.restore();
  }
  p.part(c, circle(0, 0, 7.6), k.ember, box(-7.6, -7.6, 7.6, 7.6));
  p.detail(c, circle(-2.4, -2.6, 2.2), k.gold, false);
  p.accent(c, circle(0.4, 0.6, 3.2), k.flare);
};

registerArt({
  id: 'fireball',
  name: 'Fireball',
  category: 'projectile',
  kind: 'fireball',
  frames: { body: { w: 48, h: 48, draw: body } },
});
