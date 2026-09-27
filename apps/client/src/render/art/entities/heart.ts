// The Heart. A faceted ruby heart (front 3/4 view) floating over a round stone pedestal (from
// above) ringed with glowing heart-red runes, a molten pool under the gem, an ember at its core.
// Damage states are overlays on the gem: `cracks1` (under 60% HP: a few cracks leaking ember
// light) and `cracks2` (under 30%: it splits open, shown on top of cracks1).

import { box, css, ellipse, ngon, pathLine, poly, shade, type Ctx, type Painter } from '../paint';
import { registerArt, type Draw } from '../registry';
import type { Tokens } from '../tokens';

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

/** Jagged cracks (polylines) inside the gem: ink, with a thin glowing ember core. */
function cracks(c: Ctx, p: Painter, k: Tokens, lines: readonly (readonly number[])[], core: number): void {
  c.save();
  c.clip(heartPath());
  const path = new Path2D();
  for (const pts of lines) path.addPath(pathLine(pts));
  p.line(c, path, k.ink, 2.2);
  c.shadowColor = css(k.ember, 0.95);
  c.shadowBlur = 5;
  p.line(c, path, shade(k.ember, 0.35), core);
  c.restore();
}

const cracks1: Draw = (c, p, k) =>
  cracks(
    c,
    p,
    k,
    [
      [-19, -14, -13, -9, -14, -4, -8, 1],
      [-14, -4, -18, 0],
      [21, -4, 15, -1, 13, 5, 8, 7],
      [4, -15, 6, -10, 3, -7],
    ],
    0.8,
  );

const cracks2: Draw = (c, p, k) =>
  cracks(
    c,
    p,
    k,
    [
      [0, -12, -2, -6, 2, -1, -1, 5, 2, 11, 0, 19],
      [2, -1, 9, -3, 12, -9],
      [-1, 5, -8, 7, -12, 3],
      [-23, -8, -16, -6],
      [2, 11, 8, 12],
    ],
    1.3,
  );

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
    cracks1: { w: 54, h: 48, draw: cracks1 },
    cracks2: { w: 54, h: 48, draw: cracks2 },
  },
});
