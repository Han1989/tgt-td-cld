// Prints the map as ASCII: `npm run map`. Useful when editing map data (maps/*.ts).
// Legend: # blocker, . open, = lane, H Heart, lower-case = base pad (w/m/e), upper-case = extra pad (W/M/E/C).

import { getMap, Tile, tileAt } from '../src';

const map = getMap();
const rows: string[] = [];
for (let ty = 0; ty < map.height; ty++) {
  let row = '';
  for (let tx = 0; tx < map.width; tx++) {
    const t = tileAt(map, tx, ty);
    const pad = map.pads.find((p) => tx >= p.tx && tx < p.tx + map.padSize && ty >= p.ty && ty < p.ty + map.padSize);
    if (Math.hypot(tx + 0.5 - map.heart.x, ty + 0.5 - map.heart.y) < 1.8) row += 'H';
    else if (pad) row += pad.extra ? pad.zone[0]!.toUpperCase() : pad.zone[0]!;
    else row += t === Tile.Blocker ? '#' : t === Tile.Lane ? '=' : '.';
  }
  rows.push(`${String(ty).padStart(2)} ${row}`);
}
console.log(`${map.name}: ${map.width} × ${map.height}, ${map.pads.filter((p) => !p.extra).length} base pads + ${map.pads.filter((p) => p.extra).length} extra`);
console.log(rows.join('\n'));
