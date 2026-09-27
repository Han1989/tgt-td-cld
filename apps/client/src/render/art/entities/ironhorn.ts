// Ironhorn (boss, wave 10: Stomp). Front 3/4 view, facing right; the rig flips it. A hulking bull
// beast on four stumpy legs, wide and low with a humped back: two great bone horns sweeping forward
// and up from a low head, iron plates bolted on its hump and brow, a gold nose ring and glowing eyes.
// One sprite with its contact shadow baked in. Feet at y = +26.

import { box, circle, ellipse, pathLine, poly, rrect, shade } from '../paint';
import { registerArt, type Draw } from '../registry';
import { GAITS } from '../rigs';

const FEET = 26;

/** A horn from its root (w px thick) curving through `bend` to its tip. */
function horn(root: [number, number], tip: [number, number], bend: [number, number], w: number): Path2D {
  const h = new Path2D();
  h.moveTo(root[0] - w, root[1]);
  h.quadraticCurveTo(bend[0] - w * 0.5, bend[1], tip[0], tip[1]);
  h.quadraticCurveTo(bend[0] + w * 0.8, bend[1] + w * 0.6, root[0] + w, root[1] + 1);
  h.closePath();
  return h;
}

const ironhorn: Draw = (c, p, k) => {
  const hide = k.ironhorn;
  const far = shade(hide, -0.35);
  // Far legs, tail, far horn.
  for (const x of [-15, 9]) {
    p.part(c, rrect(x - 3.5, 8, 7, 15, 2), far, box(x - 3.5, 8, x + 3.5, 23), { line: 0.8 });
    p.part(c, rrect(x - 4, 21, 8, 4.5, 1.5), k.ironDark, box(x - 4, 21, x + 4, 25.5), { line: 0.7 });
  }
  p.line(c, pathLine([-26, -2, -31, 6, -30, 10]), k.ink, 3.6);
  p.line(c, pathLine([-26, -2, -31, 6, -30, 10]), far, 1.8);
  p.part(c, ellipse(-30, 11.5, 2.6, 3.4), shade(hide, -0.55), box(-32.6, 8, -27.4, 15), { line: 0.6 });
  p.part(c, horn([17, -6], [18, -31], [9, -20], 3.2), shade(k.bone, -0.25), box(9, -31, 21, -6), { line: 0.9 });
  // Body with its hump, then the near legs.
  p.part(c, ellipse(-3, 3, 25, 15), hide, box(-28, -12, 22, 18));
  p.part(c, ellipse(1, -7, 15, 11), hide, box(-14, -18, 16, 4), { noOutline: true });
  p.line(c, ellipse(1, -7, 15, 11), k.ink, 2.4, 1);
  p.part(c, ellipse(-3, 4, 23, 12.5), hide, box(-26, -8.5, 20, 16.5), { noOutline: true, flat: true });
  for (const x of [-20, 4]) {
    p.part(c, rrect(x - 4, 10, 8, 14, 2.2), shade(hide, -0.1), box(x - 4, 10, x + 4, 24));
    p.part(c, rrect(x - 4.6, 22, 9.2, 4.6, 1.6), k.ironDark, box(x - 4.6, 22, x + 4.6, 26.6), { line: 0.7 });
  }
  // Iron plate on the hump with rivets.
  p.part(c, poly([-12, -12, -3, -18.5, 9, -17, 14, -9, 2, -6, -9, -6.5], 1.6), k.iron, box(-12, -18.5, 14, -6));
  for (const [x, y] of [
    [-7, -10],
    [0, -14.5],
    [8, -12],
  ] as const) {
    p.detail(c, circle(x, y, 1.1), k.stone, false);
  }
  // Head: a low, heavy snout with an iron brow plate, the near horn, nose ring, glowing eyes.
  p.part(c, ellipse(20, 2, 11, 10), hide, box(9, -8, 31, 12));
  p.part(c, ellipse(26.5, 6, 6.5, 5.5), shade(hide, 0.18), box(20, 0.5, 33, 11.5), { line: 0.8 });
  p.detail(c, ellipse(28.5, 5, 1, 1.4), k.hole, false);
  p.detail(c, ellipse(31.2, 5.4, 0.9, 1.3), k.hole, false);
  p.part(c, poly([12, -6.5, 25, -8, 28, -2.5, 14, -1], 1.2), k.iron, box(12, -8, 28, -1), { line: 0.8 });
  p.part(c, horn([23, -6], [34, -26], [34, -12], 3.6), k.bone, box(21, -26, 36, -5), { line: 0.9 });
  p.line(c, pathLine([27.5, -13, 31, -14]), shade(k.bone, -0.35), 1.1);
  p.line(c, pathLine([29.5, -18.5, 32.5, -19]), shade(k.bone, -0.35), 1.1);
  p.accent(c, ellipse(19.5, 0.8, 1.6, 1.2), k.visorEye);
  p.accent(c, ellipse(24.8, 0.8, 1.4, 1.1), k.visorEye);
  p.line(c, ellipse(29.5, 10.2, 2.4, 2.6), k.ink, 2.6);
  p.line(c, ellipse(29.5, 10.2, 2.4, 2.6), k.gold, 1.4);
};

registerArt({
  id: 'ironhorn',
  name: 'Ironhorn',
  category: 'creep',
  kind: 'ironhorn',
  feet: FEET,
  gait: GAITS.stomp,
  frames: {
    body: {
      w: 78,
      h: 66,
      draw: (c, p, k) => {
        p.shadow(c, -1, FEET, 32, 8);
        ironhorn(c, p, k);
      },
      flash: ironhorn,
    },
  },
});
