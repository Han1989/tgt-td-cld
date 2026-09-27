// Shardback (final boss, wave 30: Shifting Hide). Front 3/4 view, facing right; the rig flips it.
// A great slate-skinned beast under a domed back of hide plates with jagged shards along its spine,
// a heavy low head with glowing eyes, and four stout legs. Its hide is what matters: `body` shows the
// Stone hide (tan stone slabs with cracks, armour up), `ether` the Ether hide (violet crystal plates
// with glowing seams and shards, magic resist up). The renderer switches between them as it shifts.
// One sprite with its contact shadow baked in. Feet at y = +26.

import { TUNING } from '@tdt/sim';
import { box, ellipse, pathLine, poly, rrect, shade } from '../paint';
import type { Ctx, Painter } from '../paint';
import { registerArt, type Draw } from '../registry';
import { GAITS } from '../rigs';
import type { Tokens } from '../tokens';

const FEET = 26;

/** Hide plates on the dome: [x0, y0, x1, y1, …] polygons, back to front. */
const PLATES: readonly (readonly number[])[] = [
  [-30, 8, -27, -4, -17, -8, -15, 6],
  [-17, -8, -9, -17, 2, -17, 3, -6, -15, 6],
  [3, -6, 2, -17, 13, -14, 20, -3, 17, 8],
  [-27, -4, -24, -12, -12, -19, -9, -17, -17, -8],
  [-15, 6, 3, -6, 17, 8],
];

/** Shards along the spine: base centre x, base y, height, lean. */
const SHARDS: readonly (readonly [number, number, number, number])[] = [
  [-20, -12, 10, -3],
  [-10, -18, 15, -2],
  [1, -18, 17, 0],
  [11, -15, 12, 2],
];

function beast(c: Ctx, p: Painter, k: Tokens, ether: boolean): void {
  const skin = k.shardback;
  const plate = ether ? k.hideEther : k.hideStone;
  const seam = ether ? shade(k.hideEther, -0.45) : k.hideStoneDark;
  // Far legs.
  for (const x of [-16, 10]) {
    p.part(c, rrect(x - 4, 8, 8, 14, 2.4), shade(skin, -0.35), box(x - 4, 8, x + 4, 22), { line: 0.8 });
    p.part(c, ellipse(x, 22.5, 5, 3), shade(skin, -0.55), box(x - 5, 19.5, x + 5, 25.5), { line: 0.7 });
  }
  // Body under the dome, then the plates and their cracks.
  p.part(c, ellipse(-4, 5, 28, 14), skin, box(-32, -9, 24, 19));
  const dome = new Path2D();
  dome.moveTo(-32, 10);
  dome.bezierCurveTo(-32, -18, 22, -24, 24, 10);
  dome.quadraticCurveTo(-4, 15, -32, 10);
  dome.closePath();
  p.part(c, dome, seam, box(-32, -22, 24, 13));
  for (const pts of PLATES) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      x0 = Math.min(x0, pts[i]!);
      x1 = Math.max(x1, pts[i]!);
      y0 = Math.min(y0, pts[i + 1]!);
      y1 = Math.max(y1, pts[i + 1]!);
    }
    c.save();
    c.clip(dome);
    p.part(c, poly(pts, 1.6), plate, box(x0, y0, x1, y1), { line: 0.7 });
    c.restore();
  }
  if (ether) {
    // Ether: the seams between the plates glow.
    for (const pts of [
      [-17, -8, -15, 6, 3, -6, 2, -17],
      [3, -6, 17, 8],
    ]) {
      p.accent(c, ribbon(pts), k.hideEther);
    }
  } else {
    // Stone: cracks across the slabs.
    for (const pts of [
      [-24, 1, -21, -2, -22, -5],
      [-7, -12, -4, -9, -6, -5],
      [8, -9, 11, -6, 10, -2],
      [-6, 3, -2, 1, 2, 3],
    ]) {
      p.line(c, pathLine(pts), k.hideStoneDark, 1.1);
    }
  }
  // Shards along the spine.
  for (const [x, y, h, lean] of SHARDS) {
    const shard = poly([x - 3.6, y + 2, x + lean, y - h, x + 3.6, y + 2], 0.5);
    if (ether) p.accent(c, shard, shade(k.hideEther, 0.1));
    else p.part(c, shard, shade(k.hideStone, 0.08), box(x - 3.6, y - h, x + 3.6, y + 2), { line: 0.7 });
    p.line(c, pathLine([x + lean * 0.3, y - h * 0.2, x + lean * 0.8, y - h * 0.8]), ether ? shade(k.hideEther, 0.6) : k.hideStoneDark, 0.9, 0.8);
  }
  // Near legs.
  for (const x of [-22, 4]) {
    p.part(c, rrect(x - 5, 9, 10, 14, 2.6), skin, box(x - 5, 9, x + 5, 23));
    p.part(c, ellipse(x, 23, 6, 3.2), shade(skin, -0.45), box(x - 6, 19.8, x + 6, 26.2), { line: 0.7 });
  }
  // Head: heavy and low, a stony brow plate, glowing eyes, a jaw with blunt teeth.
  p.part(c, ellipse(26, 6, 10, 8.5), skin, box(16, -2.5, 36, 14.5));
  p.part(c, poly([18, -2.5, 30, -3.5, 35, 1.5, 22, 2.5], 1.2), plate, box(18, -3.5, 35, 2.5), { line: 0.8 });
  p.accent(c, ellipse(27, 3.6, 1.5, 1.1), k.eye);
  p.accent(c, ellipse(32, 3.8, 1.3, 1), k.eye);
  p.line(c, pathLine([24, 10, 30, 11.5, 35, 9.5]), shade(skin, -0.6), 1.3);
  p.detail(c, poly([28, 10.6, 29, 13, 30.2, 10.9]), k.bone);
  p.detail(c, poly([31.4, 10.8, 32.4, 12.8, 33.4, 10.4]), k.bone);
}

/** A thin ribbon along an open polyline (so `accent` can fill it): out along it, back 1.2 px lower. */
function ribbon(pts: readonly number[]): Path2D {
  const path = new Path2D();
  path.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i]!, pts[i + 1]!);
  for (let i = pts.length - 2; i >= 0; i -= 2) path.lineTo(pts[i]! + 0.4, pts[i + 1]! + 1.2);
  path.closePath();
  return path;
}

const stone: Draw = (c, p, k) => beast(c, p, k, false);
const ether: Draw = (c, p, k) => beast(c, p, k, true);
const withShadow =
  (draw: Draw): Draw =>
  (c, p, k) => {
    p.shadow(c, 0, FEET, 34, 8.5);
    draw(c, p, k);
  };

const BASE_MR = TUNING.creeps.shardback.magicResist;

registerArt({
  id: 'shardback',
  name: 'Shardback',
  category: 'creep',
  kind: 'shardback',
  feet: FEET,
  gait: GAITS.stomp,
  frames: {
    body: { w: 80, h: 70, draw: withShadow(stone), flash: stone },
    ether: { w: 80, h: 70, draw: withShadow(ether), flash: ether },
  },
  // Ether hide raises its magic resist above the base value.
  variants: { frames: ['ether'], pick: (c) => (c.magicResist > BASE_MR + 0.01 ? 'ether' : 'body') },
});
