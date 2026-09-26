// Spire: the portrait map (docs/MOBILE.md §2). 26 × 50 tiles, fitted to a phone's width.
// Three lanes run down from portals on the top edge; West and East bend in and join Mid
// above the Heart. Rows 40+ are forest under the touch controls (scenery only).
//
// Columns: border | West pads | walk | West lane | walk | inner pads | walk | Mid lane |
// walk | inner pads | walk | East lane | walk | East pads | border.

import type { MapData, PadData } from '../map';

const HEART = { x: 13, y: 36 };
const JUNCTION_Y = 30;
const BEND_Y = 23;

/** A column of pads at `tx`, one every 4 rows from `from` to `to` (top-left rows). */
function column(tx: number, from: number, to: number, zone: PadData['zone']): PadData[] {
  const pads: PadData[] = [];
  for (let ty = from; ty <= to; ty += 4) pads.push({ tx, ty, zone });
  return pads;
}

export const SPIRE: MapData = {
  name: 'Spire',
  width: 26,
  height: 50,
  heart: HEART,
  heroSpawn: { x: HEART.x, y: HEART.y - 3 },
  laneHalfWidth: 1,
  lanes: [
    [{ x: 6, y: 0.5 }, { x: 6, y: BEND_Y }, { x: HEART.x, y: JUNCTION_Y }, HEART],
    [{ x: 13, y: 0.5 }, HEART],
    [{ x: 20, y: 0.5 }, { x: 20, y: BEND_Y }, { x: HEART.x, y: JUNCTION_Y }, HEART],
  ],
  padSize: 3,
  pads: [
    ...column(1, 4, 32, 'west'),
    ...column(8, 4, 20, 'mid'),
    ...column(15, 4, 20, 'mid'),
    ...column(22, 4, 32, 'east'),
    // Extra pads for bigger teams, in unlock order within each zone.
    { tx: 5, ty: 27, zone: 'west', extra: true },
    { tx: 8, ty: 0, zone: 'mid', extra: true },
    { tx: 18, ty: 27, zone: 'east', extra: true },
    { tx: 15, ty: 0, zone: 'mid', extra: true },
    { tx: 5, ty: 31, zone: 'west', extra: true },
    { tx: 18, ty: 31, zone: 'east', extra: true },
    { tx: 9, ty: 31, zone: 'core', extra: true },
    { tx: 14, ty: 31, zone: 'core', extra: true },
    { tx: 5, ty: 35, zone: 'core', extra: true },
    { tx: 18, ty: 35, zone: 'core', extra: true },
    { tx: 1, ty: 36, zone: 'core', extra: true },
    { tx: 22, ty: 36, zone: 'core', extra: true },
  ],
  safeFromY: 40,
};
