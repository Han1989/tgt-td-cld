// The link-preview card's map (docs/ART.md §14): a small landscape clearing, 30 × 16 tiles, three lanes sweeping
// from portals into the Heart. Plain data, shared by `?ogcard` (src/ogCard.ts) and the map plate's build
// (tools/blender/mapdata.ts), which renders this map's ground in Blender as it does Spire's (docs/ART.md §16).

import type { MapData, PadData } from '@tdt/sim';

export const HEART = { x: 15, y: 9.6 };

/** A quadratic curve sampled into waypoints: down from a portal, then sweeping into the Heart from the side. */
function sweep(x: number): { x: number; y: number }[] {
  const p0 = { x, y: 0.5 };
  const p1 = { x, y: HEART.y };
  const p2 = { x: HEART.x + Math.sign(x - HEART.x) * 1.2, y: HEART.y };
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const a = (1 - t) * (1 - t);
    const b = 2 * t * (1 - t);
    const c = t * t;
    pts.push({ x: a * p0.x + b * p1.x + c * p2.x, y: a * p0.y + b * p1.y + c * p2.y });
  }
  return [...pts, HEART];
}

/** Left-hand pads (top-left tiles; the outer column is West, the inner one Mid); the right mirrors them. */
const LEFT_PADS: PadData[] = [
  { tx: 1, ty: 2, zone: 'west' },
  { tx: 1, ty: 6, zone: 'west' },
  { tx: 9, ty: 1, zone: 'mid' },
  { tx: 10, ty: 5, zone: 'mid' },
];

export const CARD_MAP: MapData = {
  name: 'Card',
  width: 30,
  height: 16,
  heart: HEART,
  heroSpawn: { x: HEART.x, y: HEART.y - 2 },
  laneHalfWidth: 1,
  lanes: [sweep(6), [{ x: 15, y: 0.5 }, HEART], sweep(24)],
  padSize: 3,
  pads: [...LEFT_PADS, ...LEFT_PADS.map((p): PadData => ({ tx: 30 - p.tx - 3, ty: p.ty, zone: p.zone === 'west' ? 'east' : 'mid' }))],
  safeFromY: 12,
};
