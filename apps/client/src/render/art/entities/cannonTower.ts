// Cannon tower. From above; the barrel points +x and turns towards its target.
// Tier 1: a fieldstone ring with a wooden cart and a short barrel. Tier 2: an iron-riveted ring,
// longer banded barrel, two ember runes. Tier 3: gold bands and ring, a lit fuse, cannonball piles.
// Mortar (branch): an octagonal iron emplacement with ember studs and a squat glowing mortar.
// Shrapnel uses tier 3.

import { box, circle, ellipse, ngon, rrect, type Ctx, type Painter } from '../paint';
import { runeRing } from '../parts';
import { registerArt, type Draw } from '../registry';
import type { Tokens } from '../tokens';

function cannonballs(c: Ctx, p: Painter, k: Tokens, x: number, y: number): void {
  for (const [dx, dy] of [
    [-2.6, 1.6],
    [2.6, 1.6],
    [0, -2.2],
  ] as const) {
    p.part(c, circle(x + dx, y + dy, 2.8), k.ironDark, box(x + dx - 2.8, y + dy - 2.8, x + dx + 2.8, y + dy + 2.8), { line: 0.6 });
  }
}

const base =
  (tier: number): Draw =>
  (c, p, k) => {
    if (tier === 1) {
      const r = 27;
      p.part(c, circle(0, 0, r), k.stone, box(-r, -r, r, r));
      for (let i = 0; i < 7; i++) {
        const a = (i * Math.PI * 2) / 7 + 0.3;
        p.detail(c, ellipse(Math.cos(a) * 19, Math.sin(a) * 19, 5.5, 4, a), k.stoneDark);
      }
      p.part(c, circle(0, 0, 13), k.stoneDark, box(-13, -13, 13, 13), { line: 0.8 });
      return;
    }
    const outer = tier === 2 ? 31 : 33;
    p.part(c, circle(0, 0, outer), k.iron, box(-outer, -outer, outer, outer));
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12;
      p.detail(c, circle(Math.cos(a) * (outer - 4), Math.sin(a) * (outer - 4), 1.5), k.stone, false);
    }
    if (tier >= 3) p.line(c, circle(0, 0, outer - 7.5), k.gold, 2);
    p.part(c, circle(0, 0, 22), k.stone, box(-22, -22, 22, 22));
    if (tier >= 3) {
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        cannonballs(c, p, k, Math.cos(a) * 36, Math.sin(a) * 36);
      }
    }
    runeRing(c, p, k.ember, 26.5, tier === 2 ? 2 : 4, 1.6);
  };

const mortarBase: Draw = (c, p, k) => {
  p.part(c, ngon(0, 0, 38, 8, Math.PI / 8, 1.8), k.ironDark, box(-38, -38, 38, 38));
  p.part(c, ngon(0, 0, 29, 8, Math.PI / 8, 1.2), k.iron, box(-29, -29, 29, 29));
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    p.accent(c, rrect(Math.cos(a) * 33 - 1.6, Math.sin(a) * 33 - 1.6, 3.2, 3.2, 1), k.ember);
  }
  p.line(c, ngon(0, 0, 29, 8, Math.PI / 8, 1.2), k.gold, 1.6);
};

const top =
  (tier: number): Draw =>
  (c, p, k) => {
    const len = tier === 1 ? 24 : tier === 2 ? 28 : 30;
    const w = tier === 1 ? 10 : tier === 2 ? 12 : 13;
    const cart = tier === 1 ? 10 : 12;
    p.part(c, rrect(-13, -cart, 21, cart * 2, 2.4), k.woodDark, box(-13, -cart, 8, cart));
    p.part(c, circle(-8, 0, 4.2), k.ironDark, box(-12.2, -4.2, -3.8, 4.2), { line: 0.8 });
    const x0 = -5;
    p.part(c, rrect(x0, -w / 2, len, w, (w / 2.6) * 0.6), k.iron, box(x0, -w / 2, x0 + len, w / 2));
    p.part(c, rrect(x0 + len - 4, -w / 2 - 1.5, 5, w + 3, 1.5), k.ironDark, box(x0 + len - 4, -w / 2 - 1.5, x0 + len + 1, w / 2 + 1.5), {
      line: 0.8,
    });
    if (tier >= 2) {
      const band = tier >= 3 ? k.gold : k.stone;
      for (const bx of [x0 + len * 0.35, x0 + len * 0.62]) p.detail(c, rrect(bx, -w / 2 - 0.6, 2.4, w + 1.2, 0.6), band);
    }
    if (tier >= 3) p.accent(c, circle(-12.5, 0, 2), k.ember);
  };

const mortarTop: Draw = (c, p, k) => {
  p.part(c, rrect(-15, -15, 24, 30, 3), k.ironDark, box(-15, -15, 9, 15));
  p.part(c, circle(3, 0, 14.5), k.iron, box(-11.5, -14.5, 17.5, 14.5));
  p.line(c, circle(3, 0, 11.5), k.gold, 1.8);
  p.detail(c, circle(6.5, 0, 8.5), k.hole, false);
  p.accent(c, circle(6.5, 0, 3.2), k.ember);
  p.accent(c, circle(-13, 0, 2), k.ember);
};

const F = 84;

registerArt({
  id: 'cannonTower',
  name: 'Cannon tower',
  category: 'tower',
  kind: 'cannon',
  turret: true,
  frames: {
    base1: { w: F, h: F, draw: base(1) },
    base2: { w: F, h: F, draw: base(2) },
    base3: { w: F, h: F, draw: base(3) },
    top1: { w: F, h: F, draw: top(1) },
    top2: { w: F, h: F, draw: top(2) },
    top3: { w: F, h: F, draw: top(3) },
    'mortar.base': { w: F, h: F, draw: mortarBase },
    'mortar.top': { w: F, h: F, draw: mortarTop },
  },
});
