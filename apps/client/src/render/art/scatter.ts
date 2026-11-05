// Where props go (docs/ART.md §4): pure and deterministic (tested), so the ground bakes the same
// every time. Trees cover the blocker tiles: small ones leaning off the cliff border, a dense
// canopy over the safe zone (under the touch controls). A few clearing props (rocks,
// mushrooms, runestones) sit on open ground off the lanes and pads, away from the Heart and the hero spawn.

import { Tile, tileAt, type GameMap } from '@tdt/sim';
import { hash } from './paint';
import type { PropArt } from './registry';

export interface PropSpot {
  id: string;
  frame: string;
  /** Tile units. */
  x: number;
  y: number;
  /** Never mirrored or rotated: that would move the moonlit rim off the upper left. */
  scale: number;
}

/** Spacing of the safe-zone canopy (tiles); rows are offset by half, like a hex grid. */
const CANOPY_STEP = 1.15;
/** Share of the candidate open tiles that get a clearing prop. */
const CLEARING_CHANCE = 0.1;
/** Clearing props keep this far (tiles) from the Heart and the hero spawn. */
const KEEP_CLEAR = 3;

function pick(props: readonly PropArt[], h: number): PropArt | undefined {
  const total = props.reduce((s, p) => s + p.weight, 0);
  let at = h * total;
  for (const p of props) {
    at -= p.weight;
    if (at < 0) return p;
  }
  return props[props.length - 1];
}

function frameOf(p: PropArt, h: number): string {
  const names = Object.keys(p.frames);
  return names[Math.min(names.length - 1, Math.floor(h * names.length))]!;
}

const blocked = (map: GameMap, tx: number, ty: number) => tileAt(map, tx, ty) === Tile.Blocker;

/** Every prop on the map, in drawing order (top to bottom, so lower canopies overlap upper ones). */
export function propSpots(map: GameMap, props: readonly PropArt[]): PropSpot[] {
  const out: PropSpot[] = [];
  const forest = props.filter((p) => p.where === 'forest');
  const clearing = props.filter((p) => p.where === 'clearing');

  if (forest.length > 0) {
    // The cliff border: small trees centred near the outer edge, so they lean off the map and
    // never reach the lanes or pads next to it.
    for (let ty = 0; ty < map.safeFromY; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (!blocked(map, tx, ty)) continue;
        const left = tx === 0;
        const right = tx === map.width - 1;
        const top = ty === 0;
        if (!left && !right && !top) continue;
        const h = hash(tx, ty, 17);
        const x = left ? 0.2 : right ? map.width - 0.2 : tx + 0.5;
        const y = top && !left && !right ? 0.15 : ty + 0.5;
        // Top-row trees between two lanes stay small.
        const narrow = top && (!blocked(map, tx - 1, ty) || !blocked(map, tx + 1, ty));
        const p = pick(forest, h)!;
        out.push({ id: p.id, frame: frameOf(p, hash(tx, ty, 23)), x, y, scale: (narrow ? 0.45 : 0.62) + 0.14 * hash(ty, tx, 5) });
      }
    }
    // The safe zone: a dense canopy over every blocker tile from safeFromY down.
    let row = 0;
    for (let y = map.safeFromY + 0.35; y < map.height + 0.5; y += CANOPY_STEP * 0.87, row++) {
      for (let x = (row % 2) * CANOPY_STEP * 0.5 - 0.2; x < map.width + 0.5; x += CANOPY_STEP) {
        const h = hash(Math.round(x * 10), Math.round(y * 10), 29);
        const jx = x + (hash(row, Math.round(x * 10), 3) - 0.5) * 0.5;
        const jy = y + (hash(Math.round(x * 10), row, 7) - 0.5) * 0.4;
        const p = pick(forest, h)!;
        out.push({ id: p.id, frame: frameOf(p, hash(row, Math.round(x * 10), 31)), x: jx, y: jy, scale: 0.8 + 0.3 * hash(row, 41, Math.round(x * 10)) });
      }
    }
  }

  if (clearing.length > 0) {
    const near = (tx: number, ty: number, p: { x: number; y: number }) => Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) < KEEP_CLEAR;
    for (let ty = 1; ty < map.safeFromY; ty++) {
      for (let tx = 1; tx < map.width - 1; tx++) {
        let clear = true;
        for (let dy = -1; dy <= 1 && clear; dy++) {
          for (let dx = -1; dx <= 1 && clear; dx++) {
            const t = tileAt(map, tx + dx, ty + dy);
            if (t === Tile.Lane || (dx === 0 && dy === 0 && t !== Tile.Open)) clear = false;
          }
        }
        if (!clear || near(tx, ty, map.heart) || near(tx, ty, map.heroSpawn)) continue;
        if (hash(tx, ty, 53) >= CLEARING_CHANCE) continue;
        const p = pick(clearing, hash(ty, tx, 59))!;
        out.push({
          id: p.id,
          frame: frameOf(p, hash(tx, 61, ty)),
          x: tx + 0.5 + (hash(tx, ty, 67) - 0.5) * 0.4,
          y: ty + 0.5 + (hash(ty, tx, 71) - 0.5) * 0.4,
          scale: 0.8 + 0.3 * hash(tx, ty, 73),
        });
      }
    }
  }
  return out.sort((a, b) => a.y - b.y);
}

/**
 * A prop of the denser edge (V-08a, docs/ART.md §16): the clearing's rocks, stumps, a cart and two banners, painted into
 * the map plate by the map build (tools/blender/mapdata.ts hands them to tdt3d/map.py), never drawn at runtime. Tile
 * units; `r` is the most the prop may reach from (x, y) before it would touch a lane, a pad or the Heart (the build sizes
 * it to fit); `turn` its heading (radians: a 3D prop is lit by the scene, so turning it keeps the light).
 */
export interface EdgeSpot {
  kind: 'rock' | 'stump' | 'cart' | 'banner';
  x: number;
  y: number;
  r: number;
  turn: number;
}

/** Edge props keep this far (tiles) from the clearing's props and from each other. */
const EDGE_GAP = 0.9;
/** The share of the candidate tiles that get a rock or a stump. */
const EDGE_CHANCE = 0.55;
/** The least room (tiles) a rock or a stump needs; the cart's. */
const EDGE_ROOM = 0.24;
const CART_ROOM = 0.75;

/** How far (tiles) a point is from the nearest tile that is not open ground (a lane, a pad, a blocker the edge allows). */
function roomAt(map: GameMap, x: number, y: number, blockerOk: boolean): number {
  let best = Infinity;
  const tx0 = Math.floor(x);
  const ty0 = Math.floor(y);
  for (let ty = ty0 - 2; ty <= ty0 + 2; ty++) {
    for (let tx = tx0 - 2; tx <= tx0 + 2; tx++) {
      const t = tileAt(map, tx, ty);
      if (t === Tile.Open || (blockerOk && t === Tile.Blocker)) continue;
      const dx = Math.max(tx - x, 0, x - (tx + 1));
      const dy = Math.max(ty - y, 0, y - (ty + 1));
      best = Math.min(best, Math.hypot(dx, dy));
    }
  }
  return best;
}

/**
 * The denser edge's props (V-08a): rocks and stumps on the open tiles along the border and the safe zone's edge (the
 * meadow's last row above the canopy), one cart where that edge has the most room, and two banners at the corners of
 * the two pads every match has that lie nearest the Heart, on the corner facing it. Nothing over a lane, a pad or the
 * Heart (each prop's `r` stops short of them), clear of the hero spawn and of the clearing's props (`avoid`: propSpots).
 * Pure and deterministic.
 */
export function edgeSpots(map: GameMap, avoid: readonly { x: number; y: number }[] = []): EdgeSpot[] {
  const out: EdgeSpot[] = [];
  const heartBox = { x0: map.heart.x - 2, y0: map.heart.y - 2, x1: map.heart.x + 2, y1: map.heart.y + 2 };
  const offHeart = (x: number, y: number) => Math.hypot(Math.max(heartBox.x0 - x, 0, x - heartBox.x1), Math.max(heartBox.y0 - y, 0, y - heartBox.y1));
  const taken = (x: number, y: number, gap: number) =>
    avoid.some((p) => Math.hypot(p.x - x, p.y - y) < gap) || out.some((p) => Math.hypot(p.x - x, p.y - y) < gap);
  const clearOfSpawn = (x: number, y: number) => Math.hypot(x - map.heroSpawn.x, y - map.heroSpawn.y) >= KEEP_CLEAR;

  // The banners: the two base pads nearest the Heart (centre to Heart), each at its corner facing it, a little outside.
  const n = map.padSize;
  const base = map.pads
    .filter((p) => !p.extra)
    .map((p) => ({ p, d: Math.hypot(p.tx + n / 2 - map.heart.x, p.ty + n / 2 - map.heart.y) }))
    .sort((a, b) => a.d - b.d || a.p.id - b.p.id);
  for (const { p } of base) {
    if (out.length === 2) break;
    const sx = map.heart.x >= p.tx + n / 2 ? 1 : -1;
    const sy = map.heart.y >= p.ty + n / 2 ? 1 : -1;
    const x = (sx > 0 ? p.tx + n : p.tx) + sx * 0.32;
    const y = (sy > 0 ? p.ty + n : p.ty) + sy * 0.32;
    const r = Math.min(roomAt(map, x, y, false), offHeart(x, y)) - 0.06;
    if (r < 0.2 || taken(x, y, 0.5)) continue;
    // Streaming away from the Heart's side (the breeze the leaves drift on is east-south-east).
    out.push({ kind: 'banner', x, y, r, turn: Math.atan2(0.35, 1) });
  }

  // Candidates: open tiles on the border strip (one tile in from the cliff) and the meadow's last row above the safe zone.
  const cands: { tx: number; ty: number; x: number; y: number; room: number; h: number }[] = [];
  for (let ty = 1; ty < map.safeFromY; ty++) {
    for (let tx = 1; tx < map.width - 1; tx++) {
      if (tileAt(map, tx, ty) !== Tile.Open) continue;
      const left = tx === 1;
      const right = tx === map.width - 2;
      const top = ty === 1;
      const safeEdge = ty === map.safeFromY - 1;
      if (!left && !right && !top && !safeEdge) continue;
      // Pushed toward the edge it lies on, a little jittered.
      const j = hash(tx, ty, 211);
      const x = left ? tx + 0.32 + 0.12 * j : right ? tx + 0.68 - 0.12 * j : tx + 0.3 + 0.4 * j;
      const y = top ? ty + 0.3 + 0.1 * j : safeEdge ? ty + 0.62 + 0.1 * j : ty + 0.3 + 0.4 * hash(ty, tx, 213);
      const room = Math.min(roomAt(map, x, y, true), offHeart(x, y), 2);
      if (!clearOfSpawn(x, y)) continue;
      cands.push({ tx, ty, x, y, room, h: hash(tx, ty, 217) });
    }
  }
  // The cart: where the edge has the most room (ties by the hash), clear of the clearing's props.
  const cart = cands
    .filter((c) => c.room >= CART_ROOM + 0.1 && !taken(c.x, c.y, EDGE_GAP + 0.4))
    .sort((a, b) => b.room - a.room || a.h - b.h)[0];
  if (cart) out.push({ kind: 'cart', x: cart.x, y: cart.y, r: CART_ROOM, turn: (hash(cart.tx, cart.ty, 219) - 0.5) * 0.8 });
  for (const c of cands) {
    if (c === cart || c.h >= EDGE_CHANCE || c.room < EDGE_ROOM || taken(c.x, c.y, EDGE_GAP)) continue;
    const kind = hash(c.ty, c.tx, 223) < 0.55 ? 'rock' : 'stump';
    out.push({ kind, x: c.x, y: c.y, r: Math.min(c.room - 0.04, 0.42), turn: hash(c.tx, c.ty, 227) * Math.PI * 2 });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}
