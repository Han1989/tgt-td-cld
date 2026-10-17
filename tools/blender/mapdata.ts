// The map data a plate is built from (docs/ART.md §16), written as JSON for tools/blender/tdt3d/map.py: never typed by
// hand. `npx tsx tools/blender/mapdata.ts <spire|card> <out.json>`; map.py runs it.
//
//   spire  getMap(): the game's map (26 × 50 tiles)
//   card   the link-preview card's small landscape map (apps/client/src/ogMap.ts, docs/ART.md §14)
//
// Out: the tile grid, the lanes' waypoints (portal first, Heart last), every pad with whether it is on the plate (it
// exists in every match: padLayout for 1, 2 and 3 players in every mode) or a patch (it exists only in some, the
// extra pads of bigger teams) or neither (no match has it with today's tuning: plain ground), the Heart, the hero spawn,
// the safe zone, and the prop spots the 2D ground painter uses (propSpots over the registered props, in the order
// render/art/load.ts registers them), so the rocks, mushrooms, runestones and trees land where the 2D ground had them.

import { writeFileSync } from 'node:fs';
import { GAME_MODES, MAX_PLAYERS } from '@tdt/protocol';
import { buildMap, getMap, padLayout, TILE_PX, TUNING, tuningForMode, type GameMap } from '@tdt/sim';
// The prop files, in load.ts's order (its glob is alphabetical): propSpots picks between props by their order.
import '../../apps/client/src/render/art/entities/mushrooms';
import '../../apps/client/src/render/art/entities/rock';
import '../../apps/client/src/render/art/entities/runestone';
import '../../apps/client/src/render/art/entities/tree';
import { propArts } from '../../apps/client/src/render/art/registry';
import { propSpots } from '../../apps/client/src/render/art/scatter';
import { CARD_MAP } from '../../apps/client/src/ogMap';

const [which, out] = process.argv.slice(2);
if (!which || !out || !['spire', 'card'].includes(which)) {
  console.error('Usage: npx tsx tools/blender/mapdata.ts <spire|card> <out.json>');
  process.exit(2);
}
const map: GameMap = which === 'spire' ? getMap() : buildMap(CARD_MAP);

// Which pads exist in which matches: the plate shows those in every match, the patches those in only some.
const counts = new Map<number, number>();
let matches = 0;
for (const mode of GAME_MODES) {
  const tuning = tuningForMode(TUNING, mode);
  for (let n = 1; n <= MAX_PLAYERS; n++) {
    matches++;
    for (const p of padLayout(map, tuning, Array.from({ length: n }, (_, i) => `p${i}`))) {
      counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
    }
  }
}

const props = propArts();
const data = {
  map: which,
  name: map.name,
  tilePx: TILE_PX,
  width: map.width,
  height: map.height,
  tiles: Array.from(map.tiles),
  tileKinds: { open: 0, lane: 1, pad: 2, blocker: 3 },
  laneHalfWidth: map.laneHalfWidth,
  lanes: map.lanes.map((l) => l.waypoints.map((p) => [p.x, p.y])),
  padSize: map.padSize,
  pads: map.pads.map((p) => ({
    id: p.id,
    tx: p.tx,
    ty: p.ty,
    zone: p.zone,
    extra: p.extra,
    show: counts.get(p.id) === matches ? 'plate' : counts.has(p.id) ? 'patch' : 'none',
  })),
  heart: [map.heart.x, map.heart.y],
  heroSpawn: [map.heroSpawn.x, map.heroSpawn.y],
  safeFromY: map.safeFromY,
  props: Object.fromEntries(props.map((p) => [p.id, { where: p.where, frames: Object.fromEntries(Object.entries(p.frames).map(([k, f]) => [k, [f.w, f.h]])) }])),
  spots: propSpots(map, props),
};
writeFileSync(out, JSON.stringify(data));
console.log(`${which}: ${map.width} × ${map.height} tiles, ${data.pads.filter((p) => p.show === 'plate').length} pads on the plate, ` +
  `${data.pads.filter((p) => p.show === 'patch').length} as patches, ${data.spots.length} prop spots`);
