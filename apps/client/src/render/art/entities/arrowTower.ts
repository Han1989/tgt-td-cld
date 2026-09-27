// Arrow tower. From above; the crossbow turret points +x and turns towards its target.
// Tier 1: an octagonal wooden deck on four posts. Tier 2: a round stone keep with a plank deck and
// two runes. Tier 3: merlons, a gold ring, leaf pennants, four runes and a twin crossbow.
// Sniper (branch): a dark hexagonal bastion with a long rune-tipped arbalest and a sighting crystal.
// Volley (branch): a square timber fort with a stone bartizan and pennant at each corner, and three
// crossbows fanned out.

import { box, circle, ngon, pathLine, poly, rrect, type Ctx, type Painter } from '../paint';
import { planks, stoneBlocks, tierRunes } from '../parts';
import { registerArt, type Draw } from '../registry';
import type { Tokens } from '../tokens';

const base =
  (tier: number): Draw =>
  (c, p, k) => {
    if (tier === 1) {
      const deck = ngon(0, 0, 28, 8, Math.PI / 8, 1.8);
      p.part(c, deck, k.wood, box(-28, -28, 28, 28));
      planks(c, p, k, deck, 28);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        p.part(c, circle(Math.cos(a) * 21, Math.sin(a) * 21, 4), k.woodDark, box(-4, -4, 4, 4), { line: 0.8 });
      }
      return;
    }
    const outer = tier === 2 ? 32 : 34;
    p.part(c, circle(0, 0, outer), k.stone, box(-outer, -outer, outer, outer));
    stoneBlocks(c, p, k, 23, outer - 1, tier === 2 ? 12 : 14);
    if (tier >= 3) {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + Math.PI / 8;
        const x = Math.cos(a) * 32;
        const y = Math.sin(a) * 32;
        p.part(c, ngon(x, y, 6, 4, a + Math.PI / 4, 0.72), k.stone, box(x - 6, y - 6, x + 6, y + 6), { line: 0.8 });
      }
    }
    const deck = circle(0, 0, 23);
    p.part(c, deck, k.wood, box(-23, -23, 23, 23));
    planks(c, p, k, deck, 23);
    if (tier >= 3) {
      p.line(c, circle(0, 0, 23), k.gold, 2);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        const x = Math.cos(a) * 27;
        const y = Math.sin(a) * 27;
        p.part(c, poly([x - 4, y - 4, x + 4, y - 4, x, y + 5], 0.48), k.leaf, box(x - 4, y - 4, x + 4, y + 5), { line: 0.7 });
      }
    }
    tierRunes(c, p, k.rune, 28, tier);
  };

const sniperBase: Draw = (c, p, k) => {
  p.part(c, ngon(0, 0, 37, 6, Math.PI / 6, 1.8), k.stoneDark, box(-37, -37, 37, 37));
  p.part(c, ngon(0, 0, 28, 6, Math.PI / 6, 1.2), k.ironDark, box(-28, -28, 28, 28));
  p.line(c, ngon(0, 0, 31.5, 6, Math.PI / 6, 1.2), k.gold, 2);
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    p.accent(c, ngon(Math.cos(a) * 32, Math.sin(a) * 32, 3.6, 4, a, 0.5), k.rune);
  }
};

function bowArms(x: number, span: number): Path2D {
  const arms = new Path2D();
  arms.moveTo(x - 4.5, -span);
  arms.quadraticCurveTo(x + 8, 0, x - 4.5, span);
  arms.lineTo(x - 6, span - 1.6);
  arms.quadraticCurveTo(x + 1, 0, x - 6, -span + 1.6);
  arms.closePath();
  return arms;
}

function bolt(c: Ctx, p: Painter, k: Tokens, x0: number, y: number, x1: number, head: number): void {
  p.line(c, pathLine([x0, y, x1 - 3, y]), k.woodDark, 1.8);
  p.detail(c, poly([x1 - 4, y - 2.4, x1 + 0.5, y, x1 - 4, y + 2.4]), head);
}

/** A crossbow pointing +x (tier 1–3 look); `twin` doubles the stock. */
function crossbow(c: Ctx, p: Painter, k: Tokens, tier: number, twin: boolean): void {
  const span = tier === 1 ? 15 : tier === 2 ? 17.5 : 19;
  const armX = tier === 1 ? 8 : 9;
  const stocks = twin ? [-4.2, 4.2] : [0];
  // The crossbow must stand out from its wooden deck: a dark stock and iron arms.
  for (const sy of stocks) {
    p.part(c, rrect(-13, sy - 3, 27, 6, 1.2), k.woodDark, box(-13, sy - 3, 14, sy + 3));
    if (tier >= 2) p.detail(c, rrect(-4, sy - 3.4, 3, 6.8, 0.8), tier >= 3 ? k.gold : k.iron);
  }
  p.part(c, bowArms(armX, span), k.iron, box(armX - 5, -span, armX + 6, span));
  for (const sy of stocks) {
    p.line(c, pathLine([armX - 4.2, -span + 0.8, -5, sy, armX - 4.2, span - 0.8]), k.string, 1);
    bolt(c, p, k, -5, sy, 17, tier >= 3 ? k.gold : k.stone);
  }
  if (tier >= 2) {
    const tip = tier >= 3 ? k.gold : k.iron;
    p.accent(c, circle(armX - 4.4, -span, 1.8), tip);
    p.accent(c, circle(armX - 4.4, span, 1.8), tip);
  }
}

const top =
  (tier: number): Draw =>
  (c, p, k) => {
    p.part(c, circle(0, 0, 6), k.woodDark, box(-6, -6, 6, 6));
    crossbow(c, p, k, tier, tier >= 3);
  };

const sniperTop: Draw = (c, p, k) => {
  p.part(c, circle(0, 0, 7), k.ironDark, box(-7, -7, 7, 7));
  p.part(c, rrect(-15, -3.6, 43, 7.2, 1.2), k.woodDark, box(-15, -3.6, 28, 3.6));
  p.detail(c, rrect(4, -4, 3, 8, 0.8), k.gold);
  p.detail(c, rrect(18, -4, 3, 8, 0.8), k.gold);
  p.part(c, bowArms(16, 16), k.ironDark, box(11, -16, 22, 16));
  p.line(c, pathLine([11.8, -15.2, -7, 0, 11.8, 15.2]), k.string, 1.1);
  bolt(c, p, k, -7, 0, 34, k.rune);
  // A sighting crystal on top.
  p.accent(c, ngon(2, 0, 4, 4, 0, 0.4), k.rune);
};

/** Volley: a square timber fort with a stone bartizan at each corner and a leaf banner on each side. */
const volleyBase: Draw = (c, p, k) => {
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    c.save();
    c.rotate(a);
    p.part(c, poly([26, -7, 39, 0, 26, 7], 0.6), k.leaf, box(26, -7, 39, 7), { line: 0.7 });
    c.restore();
  }
  const deck = rrect(-30, -30, 60, 60, 4);
  p.part(c, deck, k.wood, box(-30, -30, 30, 30));
  planks(c, p, k, deck, 30);
  p.part(c, circle(0, 0, 17), k.stone, box(-17, -17, 17, 17), { line: 0.8 });
  p.line(c, rrect(-25, -25, 50, 50, 3), k.gold, 2);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = Math.cos(a) * 37;
    const y = Math.sin(a) * 37;
    p.part(c, circle(x, y, 8), k.stone, box(x - 8, y - 8, x + 8, y + 8), { line: 0.9 });
    p.accent(c, circle(x, y, 2.8), k.rune);
  }
};

/** Volley: one great recurve bow over three fanned stocks, loosing three bolts at once. */
const volleyTop: Draw = (c, p, k) => {
  const fan = [-0.42, 0.42, 0];
  for (const a of fan) {
    c.save();
    c.rotate(a);
    p.part(c, rrect(-8, -2.8, 26, 5.6, 1.2), k.woodDark, box(-8, -2.8, 18, 2.8), { line: 0.8 });
    p.detail(c, rrect(3, -3.2, 2.6, 6.4, 0.8), k.gold);
    c.restore();
  }
  p.part(c, bowArms(12, 24), k.iron, box(7, -24, 18, 24));
  p.line(c, pathLine([7.8, -23.2, -4, 0, 7.8, 23.2]), k.string, 1.1);
  for (const a of fan) {
    c.save();
    c.rotate(a);
    bolt(c, p, k, -2, 0, 24, k.gold);
    c.restore();
  }
  p.accent(c, circle(7.6, -24, 2), k.gold);
  p.accent(c, circle(7.6, 24, 2), k.gold);
  p.part(c, circle(-6, 0, 6), k.woodDark, box(-12, -6, 0, 6));
  p.accent(c, circle(-6, 0, 2.6), k.rune);
};

const F = 84;
const T = { w: 84, h: 56 };

registerArt({
  id: 'arrowTower',
  name: 'Arrow tower',
  category: 'tower',
  kind: 'arrow',
  turret: true,
  frames: {
    base1: { w: F, h: F, draw: base(1) },
    base2: { w: F, h: F, draw: base(2) },
    base3: { w: F, h: F, draw: base(3) },
    top1: { ...T, draw: top(1) },
    top2: { ...T, draw: top(2) },
    top3: { ...T, draw: top(3) },
    'sniper.base': { w: F, h: F, draw: sniperBase },
    'sniper.top': { ...T, draw: sniperTop },
    'volley.base': { w: F, h: F, draw: volleyBase },
    'volley.top': { w: 72, h: 64, draw: volleyTop },
  },
});
