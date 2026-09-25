export interface Vec2 {
  x: number;
  y: number;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** Distance from point p to segment ab. */
export function distToSegment(px: number, py: number, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * abx + (py - a.y) * aby) / lenSq));
  return dist(px, py, a.x + abx * t, a.y + aby * t);
}

/**
 * Moves `pos` toward (tx, ty) by at most `step`. Returns true once it arrives.
 */
export function moveToward(pos: Vec2, tx: number, ty: number, step: number): boolean {
  const dx = tx - pos.x;
  const dy = ty - pos.y;
  const d = Math.hypot(dx, dy);
  if (d <= step || d === 0) {
    pos.x = tx;
    pos.y = ty;
    return true;
  }
  pos.x += (dx / d) * step;
  pos.y += (dy / d) * step;
  return false;
}
