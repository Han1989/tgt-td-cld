// Flak tower (anti-air). From above; the gun battery points +x and turns towards its target.
// Tier 1: a ring of sandbags round a plank floor and twin barrels (no glow). Tier 2: a square steel
// emplacement with rivets, three banded barrels, two flare runes. Tier 3: chamfered corners with ammo
// crates, a gold trim, four runes and a quad battery with gold bands and a glowing breech.
// Skyguard (branch): a diamond bastion with a radar dish and long twin rails tipped with a sighting lens.
// Hailstorm (branch): a cross-shaped redoubt with ammo drums and a rotary gun of six barrels.

import { box, circle, ellipse, ngon, pathLine, poly, rrect, type Ctx, type Painter } from '../paint';
import { planks, tierRunes } from '../parts';
import { registerArt, type Draw } from '../registry';
import type { Tokens } from '../tokens';

/** A barrel from x0 to x1 centred on y, width w; `band` puts two bands on it. */
function barrel(c: Ctx, p: Painter, k: Tokens, x0: number, x1: number, y: number, w: number, band: number | null): void {
  p.part(c, rrect(x0, y - w / 2, x1 - x0, w, w * 0.3), k.steel, box(x0, y - w / 2, x1, y + w / 2), { line: 0.7 });
  // Muzzle brake.
  const brake = box(x1 - 3.5, y - w / 2 - 1, x1 + 0.5, y + w / 2 + 1);
  p.part(c, rrect(x1 - 3.5, y - w / 2 - 1, 4, w + 2, 1), k.steelDark, brake, { line: 0.6 });
  if (band !== null) {
    for (const bx of [x0 + (x1 - x0) * 0.3, x0 + (x1 - x0) * 0.58]) p.detail(c, rrect(bx, y - w / 2 - 0.4, 2, w + 0.8, 0.5), band, false);
  }
}

function crate(c: Ctx, p: Painter, k: Tokens, x: number, y: number, s: number): void {
  p.part(c, rrect(x - s, y - s, s * 2, s * 2, 1), k.wood, box(x - s, y - s, x + s, y + s), { line: 0.7 });
  p.line(c, pathLine([x - s + 1.5, y - s + 1.5, x + s - 1.5, y + s - 1.5]), k.woodDark, 1, 0.8);
}

const base =
  (tier: number): Draw =>
  (c, p, k) => {
    if (tier === 1) {
      const floor = circle(0, 0, 20);
      p.part(c, floor, k.wood, box(-20, -20, 20, 20));
      planks(c, p, k, floor, 20);
      for (let i = 0; i < 11; i++) {
        const a = (i * Math.PI * 2) / 11;
        const x = Math.cos(a) * 25;
        const y = Math.sin(a) * 25;
        p.part(c, ellipse(x, y, 7.8, 5, a + Math.PI / 2), k.sandbag, box(x - 7, y - 7, x + 7, y + 7), { line: 0.7 });
      }
      return;
    }
    const h = tier === 2 ? 30 : 31;
    // Tier 3 chamfers the corners, where its ammo crates sit.
    const ch = 9;
    const chamfered = [-h + ch, -h, h - ch, -h, h, -h + ch, h, h - ch, h - ch, h, -h + ch, h, -h, h - ch, -h, -h + ch];
    const plate = tier === 2 ? rrect(-h, -h, h * 2, h * 2, 5) : poly(chamfered, 2);
    if (tier >= 3) {
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        crate(c, p, k, Math.cos(a) * 38, Math.sin(a) * 38, 5.5);
      }
    }
    p.part(c, plate, k.steelDark, box(-h, -h, h, h));
    // Rivets along the edge.
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI * 2) / 16;
      const r = tier === 2 ? 26 : 27;
      p.detail(c, circle(Math.cos(a) * r, Math.sin(a) * r, 1.4), k.steel, false);
    }
    const floor = rrect(-19, -19, 38, 38, 4);
    p.part(c, floor, k.stone, box(-19, -19, 19, 19), { line: 0.8 });
    p.line(c, pathLine([-19, 0, 19, 0]), k.stoneDark, 1, 0.7);
    p.line(c, pathLine([0, -19, 0, 19]), k.stoneDark, 1, 0.7);
    if (tier >= 3) p.line(c, rrect(-19, -19, 38, 38, 4), k.gold, 2);
    tierRunes(c, p, k.flare, 25, tier);
  };

const top =
  (tier: number): Draw =>
  (c, p, k) => {
    const rows = tier === 1 ? [-3.5, 3.5] : tier === 2 ? [-5.5, 0, 5.5] : [-8.4, -3, 3, 8.4];
    const len = tier === 1 ? 26 : tier === 2 ? 28 : 30;
    const w = tier === 1 ? 4.4 : 4.6;
    const band = tier === 1 ? null : tier === 2 ? k.steelDark : k.gold;
    const half = rows[rows.length - 1]! + w / 2 + 2.5;
    // The mount the barrels sit on.
    p.part(c, rrect(-12, -half, 16, half * 2, 3), k.steelDark, box(-12, -half, 4, half));
    for (const y of rows) barrel(c, p, k, -2, len, y, w, band);
    p.part(c, circle(-6, 0, tier === 1 ? 4 : 5), k.ironDark, box(-11, -5, -1, 5), { line: 0.8 });
    if (tier >= 3) p.accent(c, circle(-6, 0, 2.4), k.flare);
  };

/** Skyguard: a diamond bastion with glowing corner beacons. */
const skyguardBase: Draw = (c, p, k) => {
  p.part(c, ngon(0, 0, 40, 4, 0, 3), k.steelDark, box(-40, -40, 40, 40));
  p.part(c, ngon(0, 0, 30, 4, 0, 2), k.stone, box(-30, -30, 30, 30));
  p.part(c, circle(0, 0, 17), k.steelDark, box(-17, -17, 17, 17), { line: 0.8 });
  p.line(c, ngon(0, 0, 30, 4, 0, 2), k.gold, 1.6);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    p.accent(c, circle(Math.cos(a) * 35, Math.sin(a) * 35, 3), k.rune);
  }
};

/** Skyguard: a radar dish behind long twin rails that end in a sighting lens. */
const skyguardTop: Draw = (c, p, k) => {
  const dish = new Path2D();
  dish.moveTo(-8, -17);
  dish.quadraticCurveTo(-22, 0, -8, 17);
  dish.quadraticCurveTo(-15, 0, -8, -17);
  dish.closePath();
  p.part(c, dish, k.steel, box(-22, -17, -8, 17), { line: 0.8 });
  p.line(c, pathLine([-11, 0, -2, 0]), k.steelDark, 1.4);
  for (const y of [-4.2, 4.2]) {
    p.part(c, rrect(-4, y - 2.4, 38, 4.8, 1), k.steel, box(-4, y - 2.4, 34, y + 2.4), { line: 0.7 });
  }
  p.part(c, rrect(-6, -8, 14, 16, 2.5), k.steelDark, box(-6, -8, 8, 8), { line: 0.9 });
  p.detail(c, rrect(16, -7, 3, 14, 0.8), k.gold);
  p.accent(c, circle(1, 0, 3), k.rune);
  p.accent(c, ngon(33, 0, 3, 4, 0, 0.4), k.rune);
};

/** Hailstorm: a cross-shaped redoubt with ammo drums in its corners. */
const hailstormBase: Draw = (c, p, k) => {
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = Math.cos(a) * 29;
    const y = Math.sin(a) * 29;
    p.part(c, circle(x, y, 7.5), k.iron, box(x - 7.5, y - 7.5, x + 7.5, y + 7.5), { line: 0.8 });
    p.detail(c, circle(x, y, 3.5), k.ironDark, false);
  }
  const cross = poly([-14, -38, 14, -38, 14, -14, 38, -14, 38, 14, 14, 14, 14, 38, -14, 38, -14, 14, -38, 14, -38, -14, -14, -14], 3);
  p.part(c, cross, k.steelDark, box(-38, -38, 38, 38));
  p.part(c, circle(0, 0, 21), k.stoneDark, box(-21, -21, 21, 21), { line: 0.8 });
  p.line(c, circle(0, 0, 21), k.gold, 1.6);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    p.accent(c, rrect(Math.cos(a) * 31 - 2, Math.sin(a) * 31 - 2, 4, 4, 1), k.flare);
  }
};

/** Hailstorm: a rotary gun, six barrels round a spindle, fed from a round drum. */
const hailstormTop: Draw = (c, p, k) => {
  p.part(c, circle(-9, 0, 10), k.iron, box(-19, -10, 1, 10));
  p.detail(c, circle(-9, 0, 5.5), k.ironDark, false);
  const ys = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5];
  // Back barrels first so the middle ones sit on top, as if in a ring.
  for (const y of [ys[0]!, ys[5]!, ys[1]!, ys[4]!, ys[2]!, ys[3]!]) {
    const x1 = 30 - Math.abs(y) * 0.6;
    p.part(c, rrect(-1, y - 1.7, x1 + 1, 3.4, 1), k.steel, box(-1, y - 1.7, x1, y + 1.7), { line: 0.55 });
  }
  for (const bx of [8, 24]) p.part(c, rrect(bx, -9.5, 3.5, 19, 1), k.steelDark, box(bx, -9.5, bx + 3.5, 9.5), { line: 0.7 });
  p.detail(c, rrect(13, -9.8, 2.4, 19.6, 0.6), k.gold);
  p.accent(c, circle(-9, 0, 2.6), k.flare);
};

const F = 84;
const T = { w: 84, h: 60 };

registerArt({
  id: 'flakTower',
  name: 'Flak tower',
  category: 'tower',
  kind: 'flak',
  turret: true,
  frames: {
    base1: { w: F, h: F, draw: base(1) },
    base2: { w: F, h: F, draw: base(2) },
    base3: { w: F, h: F, draw: base(3) },
    top1: { ...T, draw: top(1) },
    top2: { ...T, draw: top(2) },
    top3: { ...T, draw: top(3) },
    'skyguard.base': { w: F, h: F, draw: skyguardBase },
    'skyguard.top': { ...T, draw: skyguardTop },
    'hailstorm.base': { w: F, h: F, draw: hailstormBase },
    'hailstorm.top': { ...T, draw: hailstormTop },
  },
});
