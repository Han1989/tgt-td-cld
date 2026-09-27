// The Heart. A faceted ruby heart (front 3/4 view) floating over a round stone pedestal (from
// above) ringed with glowing heart-red runes, a molten pool under the gem, an ember at its core.

import { box, ellipse, ngon, pathLine, poly, shade } from '../paint';
import { registerArt, type Draw } from '../registry';

const base: Draw = (c, p, k) => {
  p.part(c, ellipse(0, 5, 50, 22), k.stoneDark, box(-50, -17, 50, 27));
  p.part(c, ellipse(0, 0, 45, 18), k.stone, box(-45, -18, 45, 18));
  p.line(c, ellipse(0, 0, 30, 11.5), k.stoneDark, 1.5, 0.9);
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI * 2) / 10;
    p.accent(c, ngon(Math.cos(a) * 37.5, Math.sin(a) * 14.5, 1.9, 4, 0, 0.3), k.heart);
  }
  p.accent(c, ellipse(0, 0, 22, 8), shade(k.heart, -0.5));
};

function heartPath(): Path2D {
  const h = new Path2D();
  h.moveTo(0, 19);
  h.bezierCurveTo(-9, 11, -23, 3, -23, -8);
  h.bezierCurveTo(-23, -19, -9, -23, 0, -12);
  h.bezierCurveTo(9, -23, 23, -19, 23, -8);
  h.bezierCurveTo(23, 3, 9, 11, 0, 19);
  h.closePath();
  return h;
}

const gem: Draw = (c, p, k) => {
  const heart = heartPath();
  p.part(c, heart, k.heart, box(-23, -22, 23, 19), { line: 1.2 });
  // Facets and a shine on the upper left.
  c.save();
  c.clip(heart);
  for (const pts of [
    [0, -12, 0, 19],
    [-14, -4, 0, 19],
    [14, -4, 0, 19],
    [-14, -4, 0, -12],
    [14, -4, 0, -12],
    [-14, -4, -23, -8],
    [14, -4, 23, -8],
  ]) {
    p.line(c, pathLine(pts), k.heartFacet, 1.1, 0.8);
  }
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fill(poly([-14, -4, 0, -12, -9, -19, -20, -15]));
  c.restore();
  p.accent(c, ellipse(0, -1, 5, 6), k.ember);
};

registerArt({
  id: 'heart',
  name: 'Heart',
  category: 'heart',
  baseY: 26,
  gemScale: 1.35,
  gemY: -10,
  floatPx: 2.5,
  frames: {
    base: { w: 108, h: 58, draw: base },
    gem: {
      w: 54,
      h: 48,
      draw: gem,
      flash: (c) => {
        c.fillStyle = '#fff';
        c.fill(heartPath());
      },
    },
  },
});
