// The Crossroads map: an 80 × 60 tile grid with the Heart bottom-centre and
// three lanes from portals on the top edge. The layout is static and
// generated deterministically, so the host and every client derive the same
// map without sending it over the wire.

import type { LaneId } from '@tdt/protocol';
import { distToSegment, type Vec2 } from './vec';

/** Render scale: one tile is 32 px. The sim itself works in tile units. */
export const TILE_PX = 32;

export const Tile = {
  Open: 0,
  Lane: 1,
  Pad: 2,
  Blocker: 3,
} as const;
export type TileType = (typeof Tile)[keyof typeof Tile];

export interface Lane {
  id: LaneId;
  /** Waypoints in tile units; the first is the portal, the last is the Heart. */
  waypoints: Vec2[];
  /** Remaining path length from waypoint i to the Heart. */
  remainingFrom: number[];
}

export interface BuildPad {
  id: number;
  /** Top-left tile of the 2 × 2 pad. */
  tx: number;
  ty: number;
  /** Centre in tile units (where a tower stands). */
  x: number;
  y: number;
  lane: LaneId;
}

export interface GameMap {
  name: string;
  width: number;
  height: number;
  /** Row-major TileType per tile. */
  tiles: Uint8Array;
  lanes: Lane[];
  pads: BuildPad[];
  heart: Vec2;
  heroSpawn: Vec2;
}

const LANE_HALF_WIDTH = 1.6;
const PAD_SPACING = 5;
const PAD_OFFSET = 3.3;
const TREE_CLEARANCE = 5.5;

interface MapLayout {
  name: string;
  width: number;
  height: number;
  heart: Vec2;
  lanes: Vec2[][];
}

const HEART: Vec2 = { x: 40, y: 55 };

const LANE_WAYPOINTS: Vec2[][] = [
  // Left
  [
    { x: 12.5, y: 0.5 },
    { x: 12.5, y: 20 },
    { x: 22, y: 29 },
    { x: 22, y: 42 },
    { x: 32, y: 51 },
    HEART,
  ],
  // Middle
  [
    { x: 40, y: 0.5 },
    { x: 40, y: 12 },
    { x: 48, y: 18 },
    { x: 48, y: 27 },
    { x: 32, y: 34 },
    { x: 32, y: 42 },
    { x: 40, y: 47 },
    HEART,
  ],
  // Right
  [
    { x: 67.5, y: 0.5 },
    { x: 67.5, y: 20 },
    { x: 58, y: 29 },
    { x: 58, y: 42 },
    { x: 48, y: 51 },
    HEART,
  ],
];

const CROSSROADS: MapLayout = { name: 'Crossroads', width: 80, height: 60, heart: HEART, lanes: LANE_WAYPOINTS };

// Portrait spike: a tall 45 × 80 map for phones held upright. Heart at the
// bottom, three portals on the top edge.
const SPIRE_HEART: Vec2 = { x: 22.5, y: 75 };
const SPIRE: MapLayout = {
  name: 'Spire',
  width: 45,
  height: 80,
  heart: SPIRE_HEART,
  lanes: [
    // Left
    [
      { x: 6.5, y: 0.5 },
      { x: 6.5, y: 26 },
      { x: 11, y: 34 },
      { x: 11, y: 54 },
      { x: 19, y: 68 },
      SPIRE_HEART,
    ],
    // Middle
    [
      { x: 22.5, y: 0.5 },
      { x: 22.5, y: 12 },
      { x: 18.5, y: 18 },
      { x: 18.5, y: 32 },
      { x: 26.5, y: 40 },
      { x: 26.5, y: 52 },
      { x: 22.5, y: 58 },
      SPIRE_HEART,
    ],
    // Right
    [
      { x: 38.5, y: 0.5 },
      { x: 38.5, y: 26 },
      { x: 34, y: 34 },
      { x: 34, y: 54 },
      { x: 26, y: 68 },
      SPIRE_HEART,
    ],
  ],
};

export type MapName = 'crossroads' | 'spire';

const cache = new Map<MapName, GameMap>();
let active: MapName = 'crossroads';

/**
 * Portrait spike: picks the map every later `getMap()` returns. The host (worker)
 * and the client both call it before creating a game. Defaults to Crossroads.
 */
export function setActiveMap(name: MapName): void {
  active = name;
}

/** Returns the (shared, read-only) active map (Crossroads unless changed). */
export function getMap(): GameMap {
  let map = cache.get(active);
  if (!map) {
    map = buildMap(active === 'spire' ? SPIRE : CROSSROADS);
    cache.set(active, map);
  }
  return map;
}

export function tileAt(map: GameMap, tx: number, ty: number): TileType {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return Tile.Blocker;
  return map.tiles[ty * map.width + tx] as TileType;
}

export function isWalkable(map: GameMap, x: number, y: number): boolean {
  return tileAt(map, Math.floor(x), Math.floor(y)) !== Tile.Blocker;
}

/** Returns the pad covering tile (tx, ty), if any. */
export function padAtTile(map: GameMap, tx: number, ty: number): BuildPad | undefined {
  return map.pads.find((p) => tx >= p.tx && tx < p.tx + 2 && ty >= p.ty && ty < p.ty + 2);
}

function buildMap(layout: MapLayout): GameMap {
  const { width: WIDTH, height: HEIGHT, heart: HEART } = layout;
  const tiles = new Uint8Array(WIDTH * HEIGHT).fill(Tile.Open);
  const idx = (tx: number, ty: number) => ty * WIDTH + tx;

  const lanes: Lane[] = layout.lanes.map((waypoints, i) => {
    const remainingFrom = new Array<number>(waypoints.length).fill(0);
    for (let w = waypoints.length - 2; w >= 0; w--) {
      const a = waypoints[w]!;
      const b = waypoints[w + 1]!;
      remainingFrom[w] = remainingFrom[w + 1]! + Math.hypot(b.x - a.x, b.y - a.y);
    }
    return { id: i as LaneId, waypoints, remainingFrom };
  });

  // Distance from each tile centre to the nearest lane centre line.
  const laneDist = new Float32Array(WIDTH * HEIGHT);
  for (let ty = 0; ty < HEIGHT; ty++) {
    for (let tx = 0; tx < WIDTH; tx++) {
      let best = Infinity;
      for (const lane of lanes) {
        for (let w = 0; w < lane.waypoints.length - 1; w++) {
          best = Math.min(best, distToSegment(tx + 0.5, ty + 0.5, lane.waypoints[w]!, lane.waypoints[w + 1]!));
        }
      }
      laneDist[idx(tx, ty)] = best;
      if (best <= LANE_HALF_WIDTH) tiles[idx(tx, ty)] = Tile.Lane;
    }
  }

  // Build pads: 2 × 2 blocks on both sides of each lane at regular spacing.
  const pads: BuildPad[] = [];
  const padFits = (ptx: number, pty: number) => {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const tx = ptx + dx;
        const ty = pty + dy;
        if (tx < 1 || ty < 4 || tx >= WIDTH - 1 || ty >= HEIGHT - 1) return false;
        if (tiles[idx(tx, ty)] !== Tile.Open) return false;
        if (laneDist[idx(tx, ty)]! < LANE_HALF_WIDTH + 0.4) return false;
        if (Math.hypot(tx + 0.5 - HEART.x, ty + 0.5 - HEART.y) < 4) return false;
        // Keep a one-tile walkable gap between pads.
        for (const p of pads) {
          if (tx >= p.tx - 1 && tx <= p.tx + 2 && ty >= p.ty - 1 && ty <= p.ty + 2) return false;
        }
      }
    }
    return true;
  };
  for (const lane of lanes) {
    let carry = PAD_SPACING / 2;
    for (let w = 0; w < lane.waypoints.length - 1; w++) {
      const a = lane.waypoints[w]!;
      const b = lane.waypoints[w + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      let s = carry;
      for (; s < len; s += PAD_SPACING) {
        const cx = a.x + ((b.x - a.x) * s) / len;
        const cy = a.y + ((b.y - a.y) * s) / len;
        for (const side of [1, -1]) {
          const px = cx + nx * PAD_OFFSET * side;
          const py = cy + ny * PAD_OFFSET * side;
          const ptx = Math.round(px - 1);
          const pty = Math.round(py - 1);
          if (!padFits(ptx, pty)) continue;
          pads.push({ id: pads.length, tx: ptx, ty: pty, x: ptx + 1, y: pty + 1, lane: lane.id });
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) tiles[idx(ptx + dx, pty + dy)] = Tile.Pad;
        }
      }
      carry = s - len;
    }
  }

  // Blockers: a cliff border plus clustered groves away from lanes and pads.
  for (let ty = 0; ty < HEIGHT; ty++) {
    for (let tx = 0; tx < WIDTH; tx++) {
      const i = idx(tx, ty);
      if (tiles[i] !== Tile.Open) continue;
      const border = tx === 0 || ty === 0 || tx === WIDTH - 1 || ty === HEIGHT - 1;
      const nearPad = pads.some((p) => Math.hypot(p.x - (tx + 0.5), p.y - (ty + 0.5)) < 2.5);
      const nearHeart = Math.hypot(tx + 0.5 - HEART.x, ty + 0.5 - HEART.y) < 8;
      const grove =
        laneDist[i]! > TREE_CLEARANCE && !nearPad && !nearHeart && valueNoise(tx / 5, ty / 5) > 0.58;
      if (border || grove) tiles[i] = Tile.Blocker;
    }
  }

  // Fill any walkable pocket that cannot reach the Heart, so every walkable
  // tile is reachable by heroes.
  const reachable = new Uint8Array(WIDTH * HEIGHT);
  const start = idx(Math.floor(HEART.x), Math.floor(HEART.y));
  const queue = [start];
  reachable[start] = 1;
  while (queue.length > 0) {
    const cur = queue.pop()!;
    const cx = cur % WIDTH;
    const cy = (cur - cx) / WIDTH;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= WIDTH || ny >= HEIGHT) continue;
      const n = idx(nx, ny);
      if (reachable[n] || tiles[n] === Tile.Blocker) continue;
      reachable[n] = 1;
      queue.push(n);
    }
  }
  for (let i = 0; i < tiles.length; i++) {
    if (!reachable[i] && tiles[i] === Tile.Open) tiles[i] = Tile.Blocker;
  }

  return {
    name: layout.name,
    width: WIDTH,
    height: HEIGHT,
    tiles,
    lanes,
    pads,
    heart: { ...HEART },
    heroSpawn: { x: HEART.x, y: HEART.y - 3 },
  };
}

// Deterministic 2D value noise used only for map decoration.
function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash(x0, y0) * (1 - sx) + hash(x0 + 1, y0) * sx;
  const bottom = hash(x0, y0 + 1) * (1 - sx) + hash(x0 + 1, y0 + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}
