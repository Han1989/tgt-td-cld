// Grid pathfinding for heroes: 8-directional A* without corner cutting, then
// string-pulled into as few straight segments as the terrain allows.

import { isWalkable, type GameMap } from './map';
import type { Vec2 } from './vec';

const SQRT2 = Math.SQRT2;

/** True if the straight segment from a to b crosses only walkable tiles. */
export function hasLineOfWalk(map: GameMap, a: Vec2, b: Vec2): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.ceil(d / 0.25);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!isWalkable(map, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

/** Nearest walkable tile centre to (x, y), searching outward ring by ring. */
export function nearestWalkable(map: GameMap, x: number, y: number, maxRadius = 12): Vec2 | null {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (isWalkable(map, cx, cy)) return { x, y };
  for (let r = 1; r <= maxRadius; r++) {
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (let ty = cy - r; ty <= cy + r; ty++) {
      for (let tx = cx - r; tx <= cx + r; tx++) {
        if (Math.max(Math.abs(tx - cx), Math.abs(ty - cy)) !== r) continue;
        if (!isWalkable(map, tx, ty)) continue;
        const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
        if (d < bestD) {
          bestD = d;
          best = { x: tx + 0.5, y: ty + 0.5 };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Finds a walkable path from `from` to `to`. Returns the waypoints to visit
 * after `from` (ending exactly at `to`), or null if unreachable.
 */
export function findPath(map: GameMap, from: Vec2, to: Vec2): Vec2[] | null {
  if (!isWalkable(map, to.x, to.y)) return null;
  if (hasLineOfWalk(map, from, to)) return [{ x: to.x, y: to.y }];

  const w = map.width;
  const h = map.height;
  const start = Math.floor(from.y) * w + Math.floor(from.x);
  const goal = Math.floor(to.y) * w + Math.floor(to.x);
  const gx = goal % w;
  const gy = Math.floor(goal / w);

  const g = new Float64Array(w * h).fill(Infinity);
  const came = new Int32Array(w * h).fill(-1);
  const closed = new Uint8Array(w * h);
  const heap = new MinHeap();
  g[start] = 0;
  heap.push(start, octile(start % w, Math.floor(start / w), gx, gy));

  let found = false;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (cur === goal) {
      found = true;
      break;
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!isWalkable(map, nx, ny)) continue;
        // No squeezing diagonally between two blocked tiles.
        if (dx !== 0 && dy !== 0 && (!isWalkable(map, cx + dx, cy) || !isWalkable(map, cx, cy + dy))) continue;
        const n = ny * w + nx;
        if (closed[n]) continue;
        const cost = (g[cur] ?? Infinity) + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
        if (cost < (g[n] ?? Infinity)) {
          g[n] = cost;
          came[n] = cur;
          heap.push(n, cost + octile(nx, ny, gx, gy));
        }
      }
    }
  }
  if (!found) return null;

  const tiles: Vec2[] = [];
  for (let cur = goal; cur !== start && cur !== -1; cur = came[cur] ?? -1) {
    tiles.push({ x: (cur % w) + 0.5, y: Math.floor(cur / w) + 0.5 });
  }
  tiles.reverse();
  if (tiles.length > 0) tiles[tiles.length - 1] = { x: to.x, y: to.y };
  else tiles.push({ x: to.x, y: to.y });

  // String-pull: skip waypoints that are visible from the current anchor.
  const smoothed: Vec2[] = [];
  let anchor = from;
  let i = 0;
  while (i < tiles.length) {
    let j = tiles.length - 1;
    while (j > i && !hasLineOfWalk(map, anchor, tiles[j]!)) j--;
    smoothed.push(tiles[j]!);
    anchor = tiles[j]!;
    i = j + 1;
  }
  return smoothed;
}

function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
}

class MinHeap {
  private items: number[] = [];
  private prios: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, prio: number): void {
    this.items.push(item);
    this.prios.push(prio);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prios[parent]! <= prio) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0]!;
    const lastItem = this.items.pop()!;
    const lastPrio = this.prios.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.prios[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prios[l]! < this.prios[m]!) m = l;
        if (r < this.items.length && this.prios[r]! < this.prios[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
    [this.prios[a], this.prios[b]] = [this.prios[b]!, this.prios[a]!];
  }
}
