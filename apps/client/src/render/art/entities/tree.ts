// Trees (forest prop). From above: round canopies of leaf clumps, lit from the upper left, with a
// soft shadow falling down-right. They cover the blocker tiles: the cliff border and the safe zone
// under the touch controls. Three variants: a broad oak, a small bush-tree and a pine.

import { box, circle, hash, ngon, pathLine, poly, type Ctx, type Painter } from '../paint';
import { registerArt, type Draw } from '../registry';
import type { Tokens } from '../tokens';

/** A canopy of clumps (x, y, r): one outline round the union, a lit body, inner lighter clumps. */
function canopy(c: Ctx, p: Painter, k: Tokens, clumps: readonly (readonly [number, number, number])[], seed: number): void {
  const all = new Path2D();
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y, r] of clumps) {
    all.addPath(circle(x, y, r));
    x0 = Math.min(x0, x - r);
    y0 = Math.min(y0, y - r);
    x1 = Math.max(x1, x + r);
    y1 = Math.max(y1, y + r);
  }
  p.shadow(c, (x0 + x1) / 2 + 6, (y0 + y1) / 2 + 7, (x1 - x0) * 0.55, (y1 - y0) * 0.5);
  // Outline the union only: a double-width ink stroke under the fill.
  p.line(c, all, k.ink, 4.8);
  p.part(c, all, k.canopy, box(x0, y0, x1, y1), { noOutline: true });
  // Lighter clumps towards the upper left of each big clump, and a few leaf ticks.
  for (const [i, [x, y, r]] of clumps.entries()) {
    if (r < 7) continue;
    const cx = x - r * 0.28;
    const cy = y - r * 0.3;
    p.part(c, circle(cx, cy, r * 0.5), k.canopyLight, box(cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5), { noOutline: true, flat: true });
    for (let j = 0; j < 3; j++) {
      const a = hash(seed, i, j) * Math.PI * 2;
      const d = r * (0.35 + 0.4 * hash(j, seed, i));
      const lx = x + Math.cos(a) * d;
      const ly = y + Math.sin(a) * d;
      p.line(c, pathLine([lx - 1.6, ly + 1.2, lx + 1.6, ly - 1.2]), k.tree, 1.1, 0.8);
    }
  }
}

const oak: Draw = (c, p, k) =>
  canopy(
    c,
    p,
    k,
    [
      [-8, -6, 12],
      [8, -7, 11],
      [10, 7, 11],
      [-7, 8, 11],
      [0, 0, 13],
    ],
    1,
  );

const bush: Draw = (c, p, k) =>
  canopy(
    c,
    p,
    k,
    [
      [-5, -3, 9],
      [6, -4, 8],
      [2, 6, 9],
    ],
    2,
  );

/** A pine from above: two tiers of spiky needles round a dark centre. */
const pine: Draw = (c, p, k) => {
  p.shadow(c, 6, 7, 22, 19);
  const star = (r: number, n: number, rot: number) => {
    const pts: number[] = [];
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i * Math.PI) / n;
      const rr = i % 2 === 0 ? r : r * 0.8;
      pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    return poly(pts, 2.4);
  };
  p.part(c, star(20, 9, 0), k.pine, box(-20, -20, 20, 20));
  p.part(c, star(12.5, 7, 0.4), k.pine, box(-12.5, -12.5, 12.5, 12.5), { line: 0.7, flat: true });
  p.part(c, ngon(0, 0, 4.5, 6, 0, 0.6), k.woodDark, box(-4.5, -4.5, 4.5, 4.5), { line: 0.6 });
};

registerArt({
  id: 'tree',
  name: 'Trees',
  category: 'prop',
  where: 'forest',
  weight: 1,
  frames: {
    oak: { w: 72, h: 72, draw: oak },
    bush: { w: 52, h: 52, draw: bush },
    pine: { w: 64, h: 64, draw: pine },
  },
});
