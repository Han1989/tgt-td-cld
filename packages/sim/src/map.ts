// Maps are data (`maps/*.ts`): size, lanes, the Heart, build pads with zone
// tags and a safe zone. `buildMap` turns that data into the tile grid the sim,
// the bots and the client share. The grid is derived deterministically, so the
// host and every client build the same map without sending it over the wire.

import type { LaneId } from '@tdt/protocol';
import { SPIRE } from './maps/spire';
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

/**
 * Pad zones. West, Mid and East hold the pads alongside each lane; Core pads sit where the lanes
 * converge above the Heart and only exist in bigger teams (see `padLayout`).
 */
export const PAD_ZONES = ['west', 'mid', 'east', 'core'] as const;
export type PadZone = (typeof PAD_ZONES)[number];

/** One build pad as map data. */
export interface PadData {
  /** Top-left tile. */
  tx: number;
  ty: number;
  zone: PadZone;
  /**
   * Extra pads only exist in bigger teams (`tuning.pads`). Within a zone, extra pads unlock in the
   * order they are listed.
   */
  extra?: boolean;
}

/** A map as plain data. Adding a map needs a new `MapData`, not engine changes. */
export interface MapData {
  name: string;
  width: number;
  height: number;
  heart: Vec2;
  heroSpawn: Vec2;
  /** Lane half width in tiles (tiles whose centre is this close to a lane line are lane). */
  laneHalfWidth: number;
  /** Waypoints per lane (West, Mid, East): the portal first, the Heart last. */
  lanes: Vec2[][];
  /** Pad edge in tiles (pads are square). */
  padSize: number;
  pads: PadData[];
  /** Rows from this one down are scenery only (forest under the touch controls). */
  safeFromY: number;
}

export interface Lane {
  id: LaneId;
  /** Waypoints in tile units; the first is the portal, the last is the Heart. */
  waypoints: Vec2[];
  /** Remaining path length from waypoint i to the Heart. */
  remainingFrom: number[];
}

export interface BuildPad {
  id: number;
  /** Top-left tile of the pad (`GameMap.padSize` tiles square). */
  tx: number;
  ty: number;
  /** Centre in tile units (where a tower stands). */
  x: number;
  y: number;
  /** Nearest lane. */
  lane: LaneId;
  zone: PadZone;
  extra: boolean;
  /** Which player of a 2-player team owns it: West and the west half of Mid = 0, the rest = 1. */
  half: 0 | 1;
}

export interface GameMap {
  name: string;
  width: number;
  height: number;
  /** Row-major TileType per tile. */
  tiles: Uint8Array;
  lanes: Lane[];
  /** Every pad on the map, extra pads included; `padLayout` says which exist in a match. */
  pads: BuildPad[];
  padSize: number;
  heart: Vec2;
  heroSpawn: Vec2;
  safeFromY: number;
}

let cached: GameMap | null = null;

/** Returns the (shared, read-only) map: Spire, the only map for now. */
export function getMap(): GameMap {
  cached ??= buildMap(SPIRE);
  return cached;
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
  const n = map.padSize;
  return map.pads.find((p) => tx >= p.tx && tx < p.tx + n && ty >= p.ty && ty < p.ty + n);
}

/** Distance from a point to the nearest lane centre line. */
export function laneDistance(lanes: readonly { waypoints: Vec2[] }[], x: number, y: number): number {
  let best = Infinity;
  for (const lane of lanes) {
    for (let w = 0; w < lane.waypoints.length - 1; w++) {
      best = Math.min(best, distToSegment(x, y, lane.waypoints[w]!, lane.waypoints[w + 1]!));
    }
  }
  return best;
}

/** Builds the tile grid from map data. */
export function buildMap(data: MapData): GameMap {
  const { width, height, heart } = data;
  const tiles = new Uint8Array(width * height).fill(Tile.Open);
  const idx = (tx: number, ty: number) => ty * width + tx;

  const lanes: Lane[] = data.lanes.map((waypoints, i) => {
    const remainingFrom = new Array<number>(waypoints.length).fill(0);
    for (let w = waypoints.length - 2; w >= 0; w--) {
      const a = waypoints[w]!;
      const b = waypoints[w + 1]!;
      remainingFrom[w] = remainingFrom[w + 1]! + Math.hypot(b.x - a.x, b.y - a.y);
    }
    return { id: i as LaneId, waypoints: waypoints.map((p) => ({ ...p })), remainingFrom };
  });

  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      if (laneDistance(lanes, tx + 0.5, ty + 0.5) <= data.laneHalfWidth) tiles[idx(tx, ty)] = Tile.Lane;
    }
  }

  const n = data.padSize;
  const pads: BuildPad[] = data.pads.map((p, id) => {
    const x = p.tx + n / 2;
    const y = p.ty + n / 2;
    let lane: LaneId = 0;
    let best = Infinity;
    for (const l of lanes) {
      const d = laneDistance([l], x, y);
      if (d < best) {
        best = d;
        lane = l.id;
      }
    }
    const half = p.zone === 'west' ? 0 : p.zone === 'east' ? 1 : x < heart.x ? 0 : 1;
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) tiles[idx(p.tx + dx, p.ty + dy)] = Tile.Pad;
    return { id, tx: p.tx, ty: p.ty, x, y, lane, zone: p.zone, extra: p.extra ?? false, half };
  });

  // Blockers: a cliff border and the forest of the safe zone. Lanes and pads stay as they are.
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const i = idx(tx, ty);
      const border = tx === 0 || ty === 0 || tx === width - 1 || ty === height - 1;
      if (ty >= data.safeFromY || (border && tiles[i] === Tile.Open)) tiles[i] = Tile.Blocker;
    }
  }

  // Fill any walkable pocket that cannot reach the Heart, so every walkable tile is reachable by heroes.
  const reachable = new Uint8Array(width * height);
  const start = idx(Math.floor(heart.x), Math.floor(heart.y));
  const queue = [start];
  reachable[start] = 1;
  while (queue.length > 0) {
    const cur = queue.pop()!;
    const cx = cur % width;
    const cy = (cur - cx) / width;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = idx(nx, ny);
      if (reachable[next] || tiles[next] === Tile.Blocker) continue;
      reachable[next] = 1;
      queue.push(next);
    }
  }
  for (let i = 0; i < tiles.length; i++) {
    if (!reachable[i] && tiles[i] === Tile.Open) tiles[i] = Tile.Blocker;
  }

  return {
    name: data.name,
    width,
    height,
    tiles,
    lanes,
    pads,
    padSize: n,
    heart: { ...heart },
    heroSpawn: { ...data.heroSpawn },
    safeFromY: data.safeFromY,
  };
}
