// Frost tower. From above; the ice lance points +x and turns towards its target.
// Tier 1: a snow-capped fieldstone ring and a bare ice shard (no glow). Tier 2: an octagonal dressed-stone
// keep on an ice floor, a lance with two side shards and a frost core, two runes. Tier 3: icicles at every
// corner, a gold ring, four runes and a longer gold-collared lance with a glowing tip.
// Glacier (branch): a jagged shelf of dark glacier ice with a heavy, blocky crystal ram.
// Blizzard (branch): a round snowfield swept by three spiral vanes, with a three-bladed frost rotor.

import { box, circle, ellipse, hash, ngon, pathLine, poly, type Ctx, type Painter } from '../paint';
import { stoneBlocks, tierRunes } from '../parts';
import { registerArt, type Draw } from '../registry';
import type { Tokens } from '../tokens';

/** An ice shard from x0 to its tip at x1, half-width w, drawn along the direction `a`. */
function shard(c: Ctx, p: Painter, k: Tokens, x0: number, x1: number, w: number, a = 0, ox = 0, oy = 0, line = 0.8): void {
  c.save();
  c.translate(ox, oy);
  c.rotate(a);
  const mid = x0 + (x1 - x0) * 0.62;
  p.part(c, poly([x0, -w * 0.7, mid, -w, x1, 0, mid, w, x0, w * 0.7], 0.6), k.ice, box(x0, -w, x1, w), { line });
  // The shaded lower facet and the ridge.
  p.detail(c, poly([x0, 0, x1 - 0.5, 0, mid, w * 0.9, x0, w * 0.62]), k.iceDark, false);
  p.line(c, pathLine([x0 + 1, 0, x1 - 1, 0]), k.snow, 0.9, 0.7);
  c.restore();
}

const base =
  (tier: number): Draw =>
  (c, p, k) => {
    if (tier === 1) {
      const r = 27;
      p.part(c, circle(0, 0, r), k.stone, box(-r, -r, r, r));
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI * 2) / 8 + 0.2;
        const x = Math.cos(a) * 20;
        const y = Math.sin(a) * 20;
        p.detail(c, ellipse(x, y, 5.5, 4.2, a), k.stoneDark);
        // Snow on the upper-left of every other stone.
        if (i % 2 === 0) p.detail(c, ellipse(x - 1.2, y - 1.2, 3, 2, a), k.snow, false);
      }
      p.part(c, circle(0, 0, 13), k.iceDark, box(-13, -13, 13, 13), { line: 0.8 });
      return;
    }
    const outer = tier === 2 ? 32 : 33;
    const keep = ngon(0, 0, outer, 8, Math.PI / 8, 2);
    if (tier >= 3) {
      // Icicles at every corner, pointing out.
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 8 + (i * Math.PI) / 4;
        shard(c, p, k, outer - 8, outer + 6, 4, a, 0, 0, 0.7);
      }
    }
    p.part(c, keep, k.stone, box(-outer, -outer, outer, outer));
    stoneBlocks(c, p, k, 22, outer - 2, 8);
    const floor = circle(0, 0, 22);
    p.part(c, floor, k.iceDark, box(-22, -22, 22, 22));
    // Frost cracks across the ice floor.
    c.save();
    c.clip(floor);
    for (let i = 0; i < 5; i++) {
      const a = hash(i, 7) * Math.PI * 2;
      const r0 = 6 + hash(i, 3) * 6;
      p.line(c, pathLine([Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a + 0.3) * 22, Math.sin(a + 0.3) * 22]), k.ice, 1, 0.45);
    }
    c.restore();
    if (tier >= 3) p.line(c, circle(0, 0, 22), k.gold, 2);
    tierRunes(c, p, k.frost, 27.5, tier);
  };

const top =
  (tier: number): Draw =>
  (c, p, k) => {
    const len = tier === 1 ? 22 : tier === 2 ? 25 : 29;
    const w = tier === 1 ? 4.2 : tier === 2 ? 4.8 : 5.4;
    if (tier >= 2) {
      // Side shards, swept back.
      const s = tier === 2 ? 11 : 14;
      shard(c, p, k, 0, s, 3, -0.75, 1, -3);
      shard(c, p, k, 0, s, 3, 0.75, 1, 3);
    }
    shard(c, p, k, -4, len, w, 0, 0, 0, 1);
    // The hub the lance sits in.
    p.part(c, circle(-6, 0, tier === 1 ? 6 : 7), k.stoneDark, box(-13, -7, 1, 7));
    if (tier >= 3) p.detail(c, poly([-1, -6, 3, -6, 3, 6, -1, 6], 0.6), k.gold);
    if (tier >= 2) p.accent(c, circle(-6, 0, tier === 2 ? 2.8 : 3.4), k.frost);
    if (tier >= 3) p.accent(c, ngon(len - 3, 0, 2.6, 4, 0, 0.3), k.frost);
  };

/** Glacier: a jagged shelf of old dark ice with pale blocks pushed up through it. */
const glacierBase: Draw = (c, p, k) => {
  const pts: number[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI * 2) / n;
    const r = i % 2 === 0 ? 38 : 29 + hash(i, 11) * 4;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  p.part(c, poly(pts, 1.2), k.iceDark, box(-38, -38, 38, 38));
  // Ice blocks pushed up through the shelf, between its spikes.
  for (let i = 0; i < 7; i++) {
    const a = ((i + 0.5) * Math.PI * 2) / 7;
    const x = Math.cos(a) * 25;
    const y = Math.sin(a) * 25;
    p.part(c, ngon(x, y, 6, 4, a + 0.4, 1), k.ice, box(x - 6, y - 6, x + 6, y + 6), { line: 0.7 });
  }
  p.part(c, ngon(0, 0, 18, 6, 0, 1.5), k.ironDark, box(-18, -18, 18, 18));
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    p.accent(c, ngon(Math.cos(a) * 31, Math.sin(a) * 31, 3.4, 4, a, 0.4), k.frost);
  }
};

/** Glacier: a blunt, blocky crystal ram flanked by two thick shards. */
const glacierTop: Draw = (c, p, k) => {
  shard(c, p, k, 0, 14, 4.5, -0.6, 0, -6, 0.9);
  shard(c, p, k, 0, 14, 4.5, 0.6, 0, 6, 0.9);
  const ram = poly([-12, -10, 16, -10, 31, -4.5, 31, 4.5, 16, 10, -12, 10], 1);
  p.part(c, ram, k.snow, box(-12, -10, 31, 10), { line: 1.2 });
  p.detail(c, poly([-12, 1, 31, 1, 31, 4.5, 16, 10, -12, 10]), k.ice, false);
  p.line(c, pathLine([16, -10, 16, 10]), k.iceDark, 1.4);
  p.line(c, pathLine([-10, 1, 29, 1]), k.iceDark, 1, 0.6);
  p.accent(c, circle(2, 0, 3.8), k.frost);
  p.accent(c, ngon(24, 0, 2.6, 4, 0, 0.3), k.frost);
};

/** Blizzard: a round snowfield swept by three spiral ice vanes. */
const blizzardBase: Draw = (c, p, k) => {
  p.part(c, circle(0, 0, 36), k.stone, box(-36, -36, 36, 36));
  p.part(c, circle(0, 0, 31), k.snow, box(-31, -31, 31, 31), { line: 0.8 });
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    c.save();
    c.rotate(a);
    const vane = new Path2D();
    vane.moveTo(6, -3);
    vane.quadraticCurveTo(26, -6, 30, 12);
    vane.quadraticCurveTo(20, 2, 6, 4);
    vane.closePath();
    p.part(c, vane, k.ice, box(6, -6, 30, 12), { line: 0.8 });
    c.restore();
  }
  p.part(c, circle(0, 0, 10), k.iceDark, box(-10, -10, 10, 10), { line: 0.8 });
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    p.accent(c, circle(Math.cos(a) * 33.5, Math.sin(a) * 33.5, 1.9), k.frost);
  }
};

/** Blizzard: a three-bladed frost rotor round a glowing core; the longest blade leads. */
const blizzardTop: Draw = (c, p, k) => {
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    const len = i === 0 ? 27 : 20;
    c.save();
    c.rotate(a);
    const blade = new Path2D();
    blade.moveTo(4, -4);
    blade.quadraticCurveTo(len * 0.7, -7, len, -1);
    blade.quadraticCurveTo(len * 0.6, 3, 4, 4);
    blade.closePath();
    p.part(c, blade, k.ice, box(4, -7, len, 4), { line: 0.8 });
    p.line(c, pathLine([6, -1, len - 3, -1.5]), k.snow, 0.9, 0.7);
    c.restore();
  }
  p.part(c, circle(0, 0, 7), k.stoneDark, box(-7, -7, 7, 7), { line: 0.9 });
  p.accent(c, circle(0, 0, 4), k.frost);
  p.accent(c, ngon(22, -1, 2.2, 4, 0, 0.3), k.frost);
};

const F = 84;
const T = { w: 84, h: 64 };

registerArt({
  id: 'frostTower',
  name: 'Frost tower',
  category: 'tower',
  kind: 'frost',
  turret: true,
  frames: {
    base1: { w: F, h: F, draw: base(1) },
    base2: { w: F, h: F, draw: base(2) },
    base3: { w: F, h: F, draw: base(3) },
    top1: { ...T, draw: top(1) },
    top2: { ...T, draw: top(2) },
    top3: { ...T, draw: top(3) },
    'glacier.base': { w: F, h: F, draw: glacierBase },
    'glacier.top': { ...T, draw: glacierTop },
    'blizzard.base': { w: F, h: F, draw: blizzardBase },
    'blizzard.top': { w: 64, h: 64, draw: blizzardTop },
  },
});
