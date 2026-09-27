// Runestone (clearing prop): a flat standing stone seen from above, a faint rune carved into it.
// Rare: one or two per map. The rune glows dimly (player-side magic, like the pads' studs).

import { box, css, pathLine, poly } from '../paint';
import { registerArt, type Draw } from '../registry';

const stone: Draw = (c, p, k) => {
  p.shadow(c, 4, 5, 12, 10);
  p.part(c, poly([-9, -8, 7, -10, 10, 6, -6, 9], 3), k.stone, box(-10, -10, 10, 9));
  const rune = pathLine([-3, -5, 0, 4, 3, -5]);
  rune.addPath(pathLine([-2.5, -1, 2.5, -1]));
  p.line(c, rune, k.stoneDark, 2.4);
  c.save();
  c.globalAlpha = 0.7;
  c.shadowColor = css(k.rune, 0.9);
  c.shadowBlur = 5;
  p.line(c, rune, k.rune, 1.1);
  c.restore();
};

registerArt({
  id: 'runestone',
  name: 'Runestone',
  category: 'prop',
  where: 'clearing',
  weight: 0.35,
  frames: { stone: { w: 32, h: 30, draw: stone } },
});
