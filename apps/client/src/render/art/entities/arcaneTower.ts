// Arcane tower. From above; the focus (two prongs holding an orb) points +x and turns towards its target.
// Tier 1: a plain violet-stone circle with a chalk ring and a dull amethyst (no glow). Tier 2: a carved
// ring, a glowing orb, two runes. Tier 3: five standing stones, a gold ring, four runes, gold prongs and a
// bigger orb.
// Prism (branch): a pale triangular dais with a great faceted prism that splits light three ways.
// Void (branch): an obsidian black sun with curved thorns, and a black orb with a magenta rim and a needle.

import { box, circle, ngon, pathLine, poly, type Ctx, type Painter } from '../paint';
import { stoneBlocks, tierRunes } from '../parts';
import { registerArt, type Draw } from '../registry';

const base =
  (tier: number): Draw =>
  (c, p, k) => {
    const outer = tier === 1 ? 28 : tier === 2 ? 32 : 33;
    if (tier >= 3) {
      // Five standing stones round the circle.
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5 + Math.PI / 5;
        const x = Math.cos(a) * 33;
        const y = Math.sin(a) * 33;
        p.part(c, ngon(x, y, 6.5, 5, a, 1), k.stone, box(x - 6.5, y - 6.5, x + 6.5, y + 6.5), { line: 0.8 });
      }
    }
    p.part(c, circle(0, 0, outer), k.arcaneStone, box(-outer, -outer, outer, outer));
    if (tier >= 2) stoneBlocks(c, p, k, 22, outer - 1, tier === 2 ? 10 : 15);
    const floor = circle(0, 0, 22);
    p.part(c, floor, tier === 1 ? k.arcaneStone : k.stoneDark, box(-22, -22, 22, 22), { line: tier === 1 ? 0.6 : 1 });
    // A chalk circle with a five-point star inscribed.
    const r = tier === 1 ? 17 : 18;
    p.line(c, circle(0, 0, r), k.stone, 1.1, 0.7);
    const star: number[] = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + ((i * 2) % 5) * ((Math.PI * 2) / 5);
      star.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    star.push(star[0]!, star[1]!);
    p.line(c, pathLine(star), k.stone, 1, 0.55);
    if (tier >= 3) p.line(c, circle(0, 0, 22), k.gold, 2);
    tierRunes(c, p, k.arcane, 27.5, tier);
  };

/** Two curved prongs reaching +x round an orb at (ox, 0), from a hub at (-6, 0). */
function prongs(c: Ctx, p: Painter, color: number, ox: number, reach: number, spread: number): void {
  for (const s of [-1, 1]) {
    const prong = new Path2D();
    prong.moveTo(-8, s * 4);
    prong.quadraticCurveTo(ox - 4, s * (spread + 7), ox + reach, s * (spread - 3));
    prong.quadraticCurveTo(ox - 3, s * (spread + 0.5), -4, s * -1);
    prong.closePath();
    p.part(c, prong, color, box(-8, s < 0 ? -spread - 7 : 0, ox + reach, s < 0 ? 0 : spread + 7), { line: 0.8 });
  }
}

const top =
  (tier: number): Draw =>
  (c, p, k) => {
    const ox = tier === 1 ? 10 : tier === 2 ? 11 : 12;
    const orb = tier === 1 ? 5 : tier === 2 ? 5.8 : 7;
    prongs(c, p, tier >= 3 ? k.gold : tier === 2 ? k.stone : k.wood, ox, tier >= 3 ? 10 : 8, orb + 2.5);
    p.part(c, circle(-6, 0, 6.5), tier === 1 ? k.woodDark : k.arcaneStone, box(-12.5, -6.5, 0.5, 6.5));
    if (tier === 1) {
      p.part(c, circle(ox, 0, orb), k.amethyst, box(ox - orb, -orb, ox + orb, orb), { line: 0.7 });
    } else {
      p.accent(c, circle(ox, 0, orb), k.arcane);
      if (tier >= 3) p.accent(c, circle(-6, 0, 2.4), k.arcane);
    }
  };

/** Prism: a pale triangular dais (a corner pointing each way the light splits). */
const prismBase: Draw = (c, p, k) => {
  p.part(c, ngon(0, 0, 40, 3, -Math.PI / 2, 5), k.stone, box(-35, -40, 35, 22));
  p.part(c, ngon(0, 0, 29, 3, -Math.PI / 2, 3), k.arcaneStone, box(-25, -29, 25, 15));
  p.line(c, ngon(0, 0, 19, 3, Math.PI / 2, 2), k.crystal, 1.2, 0.5);
  p.line(c, ngon(0, 0, 29, 3, -Math.PI / 2, 3), k.gold, 1.6);
  // One colour of the split light at each corner.
  const glows = [k.rune, k.arcane, k.frost] as const;
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    p.accent(c, ngon(Math.cos(a) * 30, Math.sin(a) * 30, 3.8, 4, a, 0.4), glows[i]!);
  }
};

/** Prism: a great faceted prism (a triangle pointing +x) with three coloured facets. */
const prismTop: Draw = (c, p, k) => {
  const tri = poly([-14, -18, 30, 0, -14, 18], 2);
  p.part(c, tri, k.crystal, box(-14, -18, 30, 18), { line: 1.1 });
  // Facets meeting at the centre of light.
  p.detail(c, poly([-14, 18, 30, 0, 2, 2]), k.ice, false);
  p.line(c, pathLine([-14, -18, 2, 2, 30, 0]), k.iceDark, 1, 0.6);
  p.line(c, pathLine([2, 2, -14, 18]), k.iceDark, 1, 0.6);
  p.accent(c, circle(2, 1, 4), k.arcane);
  p.accent(c, ngon(23, 0, 2.6, 4, 0, 0.3), k.rune);
  p.accent(c, ngon(-9, -12, 2.4, 4, 0, 0.3), k.frost);
  p.accent(c, ngon(-9, 12, 2.4, 4, 0, 0.3), k.eye);
};

/** Void: an obsidian black sun ringed with curved thorns. */
const voidBase: Draw = (c, p, k) => {
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    c.save();
    c.rotate(a);
    const thorn = new Path2D();
    thorn.moveTo(26, -6);
    thorn.quadraticCurveTo(36, -5, 39, 4);
    thorn.quadraticCurveTo(33, 1, 26, 5);
    thorn.closePath();
    p.part(c, thorn, k.obsidian, box(26, -6, 39, 5), { line: 0.7 });
    c.restore();
  }
  p.part(c, circle(0, 0, 30), k.obsidian, box(-30, -30, 30, 30));
  p.part(c, circle(0, 0, 21), k.void, box(-21, -21, 21, 21), { line: 0.8 });
  p.line(c, circle(0, 0, 25.5), k.voidGlow, 1.2, 0.45);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    p.accent(c, ngon(Math.cos(a) * 25.5, Math.sin(a) * 25.5, 3, 4, a, 0.3), k.voidGlow);
  }
};

/** Void: a black orb in a glowing magenta rim, and a long needle that pierces. */
const voidTop: Draw = (c, p, k) => {
  const needle = poly([4, -3.4, 33, 0, 4, 3.4]);
  p.part(c, needle, k.obsidian, box(4, -3.4, 33, 3.4), { line: 0.8 });
  p.line(c, pathLine([8, 0, 30, 0]), k.voidGlow, 1, 0.8);
  for (const s of [-1, 1]) {
    const hook = new Path2D();
    hook.moveTo(-4, s * 8);
    hook.quadraticCurveTo(4, s * 17, 16, s * 10);
    hook.quadraticCurveTo(6, s * 12, 2, s * 6);
    hook.closePath();
    p.part(c, hook, k.obsidian, box(-4, s < 0 ? -17 : 6, 16, s < 0 ? -6 : 17), { line: 0.7 });
  }
  p.accent(c, circle(0, 0, 10.5), k.voidGlow);
  p.detail(c, circle(0, 0, 8.2), k.void, false);
  p.accent(c, circle(-2.5, -2.5, 1.6), k.arcane);
};

const F = 84;
const T = { w: 84, h: 60 };

registerArt({
  id: 'arcaneTower',
  name: 'Arcane tower',
  category: 'tower',
  kind: 'arcane',
  turret: true,
  frames: {
    base1: { w: F, h: F, draw: base(1) },
    base2: { w: F, h: F, draw: base(2) },
    base3: { w: F, h: F, draw: base(3) },
    top1: { ...T, draw: top(1) },
    top2: { ...T, draw: top(2) },
    top3: { ...T, draw: top(3) },
    'prism.base': { w: F, h: F, draw: prismBase },
    'prism.top': { ...T, draw: prismTop },
    'void.base': { w: F, h: F, draw: voidBase },
    'void.top': { ...T, draw: voidTop },
  },
});
