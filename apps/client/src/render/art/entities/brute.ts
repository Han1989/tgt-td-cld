// Brute (creep). Front 3/4 view, facing right; the rig flips it. A hulking armoured goblin: iron
// helmet with a visor slit and red glowing eyes, pauldrons, a chest plate, big fists.
// One sprite with its contact shadow baked in. Feet at y = +16.

import { box, circle, ellipse, ngon, poly, rrect, shade } from '../paint';
import { registerArt, type Draw } from '../registry';
import { GAITS } from '../rigs';

const FEET = 16;

const brute: Draw = (c, p, k) => {
  p.part(c, ellipse(-7, 15.4, 5, 3), k.ironDark, box(-12, 12.4, -2, 18.4), { line: 0.8 });
  p.part(c, ellipse(7, 15.4, 5, 3), k.ironDark, box(2, 12.4, 12, 18.4), { line: 0.8 });
  // Back fist, body, belt.
  p.part(c, circle(-15.5, 6, 4.4), shade(k.brute, -0.15), box(-19.9, 1.6, -11.1, 10.4), { line: 0.9 });
  p.part(c, rrect(-13.5, -9, 27, 23, 4.2), k.brute, box(-13.5, -9, 13.5, 14));
  p.detail(c, rrect(-13, 7.5, 26, 4, 1.2), k.woodDark);
  p.accent(c, rrect(-2.4, 7, 5, 5, 1.2), k.gold);
  // Chest plate.
  p.part(c, poly([-7, -6, 8, -6, 6, 5, -5, 5], 1.2), k.iron, box(-7, -6, 8, 5), { line: 0.8 });
  // Pauldrons with rivets.
  for (const x of [-12, 12]) {
    p.part(c, ellipse(x, -7, 7, 5.6), k.iron, box(x - 7, -12.6, x + 7, -1.4));
    p.detail(c, circle(x - 2.5, -7.5, 0.9), k.stone, false);
    p.detail(c, circle(x + 2.5, -7.5, 0.9), k.stone, false);
  }
  // Helmet with a visor slit and glowing eyes; tusks under it.
  p.part(c, poly([-6, -10, -5, -21, 9, -21, 11, -10], 1.8), k.iron, box(-6, -21, 11, -10));
  p.detail(c, poly([-1, -17.5, 10.5, -17.5, 10.5, -14.6, -1, -14.6], 0.6), k.hole, false);
  p.accent(c, ellipse(3.5, -16, 1.4, 1), k.visorEye);
  p.accent(c, ellipse(8, -16, 1.3, 0.9), k.visorEye);
  p.accent(c, ngon(1.5, -22, 2.2, 4, 0, 0.3), k.gold);
  p.detail(c, poly([4, -9.8, 5.2, -6.6, 6.2, -9.8]), k.bone);
  p.detail(c, poly([8.2, -9.8, 9.3, -6.8, 10.2, -9.8]), k.bone);
  // Front fist.
  p.part(c, circle(15.2, 6.5, 4.6), k.brute, box(10.6, 1.9, 19.8, 11.1), { line: 0.9 });
};

registerArt({
  id: 'brute',
  name: 'Brute',
  category: 'creep',
  kind: 'brute',
  feet: FEET,
  gait: GAITS.stomp,
  frames: {
    body: {
      w: 46,
      h: 48,
      draw: (c, p, k) => {
        p.shadow(c, 0, FEET, 15, 6.3);
        brute(c, p, k);
      },
      flash: brute,
    },
  },
});
