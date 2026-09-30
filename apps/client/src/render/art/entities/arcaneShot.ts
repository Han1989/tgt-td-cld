// Arcane bolt. A four-point amethyst star with a glowing core. Round shots are the cannonball
// and the Fireball; this one is a star so the tower reads at phone size.

import { box, circle, poly } from '../paint';
import { registerArt, type Draw } from '../registry';

const body: Draw = (c, p, k) => {
  p.part(
    c,
    poly([0, -12, 3.6, -3.6, 12, 0, 3.6, 3.6, 0, 12, -3.6, 3.6, -12, 0, -3.6, -3.6], 0.55),
    k.amethyst,
    box(-12, -12, 12, 12),
  );
  p.accent(c, circle(-1.2, -1.4, 3), k.arcane);
};

registerArt({
  id: 'arcaneShot',
  name: 'Arcane bolt',
  category: 'projectile',
  kind: 'arcane',
  frames: { body: { w: 40, h: 40, draw: body } },
});
