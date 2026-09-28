// Own-hero movement prediction (client only; the server stays authoritative).
//
// Without it, a joystick move reaches the screen one sim tick plus the interpolation delay later
// (solo), plus a round trip online. So while the joystick or a desktop move order drives your hero,
// it is drawn moving at once, along the path the sim will take (the same pathfinding and speed).
// Each snapshot is checked against where the prediction was when the server applied our input:
// the trail of drawn positions, one input lag ago (the lag is measured each time the hero starts
// from rest). The difference blends in smoothly; only past `snapTiles` does the hero jump. Once
// the hero stops and the server agrees, drawing hands back to the interpolated position.
// Pure (no DOM, no Pixi): tested in test/predict.test.ts.

export interface Pt {
  x: number;
  y: number;
}

/** Your hero as the newest snapshot has it. */
export interface ServerHero {
  x: number;
  y: number;
  alive: boolean;
  stunned: boolean;
}

/** Where to draw your hero; `facing` is null when the snapshot's facing applies. */
export interface DrawnHero {
  x: number;
  y: number;
  facing: number | null;
}

export const PREDICT = {
  /** A correction blends in with this time constant (ms). */
  blendMs: 90,
  /** Past this error (tiles), the hero jumps to the server's position. */
  snapTiles: 1.5,
  /** Drawn positions kept to compare snapshots against (ms). */
  trailMs: 1200,
  /** A snapshot is matched against the trail within this many ms of one input lag ago. */
  windowMs: 70,
  /** Input lag (ms: command sent → snapshot showing it) assumed until it is measured. */
  lagMs: 60,
  /** Stopped, the prediction hands back to interpolation once both are this close (tiles)... */
  handoffTiles: 0.04,
  /** ...or at the latest this long after the hero stopped (then it blends over). */
  settleMs: 1500,
  /** Blending over to the interpolated position (ms, time constant). */
  blendOutMs: 110,
} as const;

interface TrailPt {
  t: number;
  x: number;
  y: number;
}

type Mode = 'off' | 'drive' | 'blend';

export class HeroPredictor {
  /** Your hero's speed (tiles/s). */
  speed = 3;
  /** Measured input lag (ms). */
  lagMs: number = PREDICT.lagMs;
  private mode: Mode = 'off';
  private readonly pos = { x: 0, y: 0 };
  private facing = 0;
  private path: Pt[] = [];
  private moving = false;
  private stunned = false;
  private trail: TrailPt[] = [];
  /** Correction still to blend in (tiles). */
  private readonly err = { x: 0, y: 0 };
  /** Blend mode: drawn = interpolated + offset, decaying. */
  private readonly offset = { x: 0, y: 0 };
  private stoppedAt = 0;
  /** A start from rest: when the move was sent and where the server had the hero (lag probe). */
  private probe: TrailPt | null = null;
  private lagMeasured = false;
  private server: Pt | null = null;
  /** Snapshots in a row in which the server's hero didn't move. */
  private still = 0;
  private interp: Pt | null = null;
  private readonly drawnAt = { x: 0, y: 0 };

  /** `findPath(from, to)`: the waypoints the sim walks after `from`, or null (unreachable). */
  constructor(private readonly findPath: (from: Pt, to: Pt) => Pt[] | null) {}

  /** Drawing your hero from the prediction (or blending back from it). */
  get active(): boolean {
    return this.mode !== 'off';
  }

  /** Walking on a predicted path right now. */
  get walking(): boolean {
    return this.mode === 'drive' && this.moving;
  }

  /** Where your hero is drawn (tiles), or null before the first frame. */
  get drawn(): Pt | null {
    return this.interp ? { x: this.drawnAt.x, y: this.drawnAt.y } : null;
  }

  /** A new match or a new view: forget everything but the measured lag. */
  reset(): void {
    this.mode = 'off';
    this.path = [];
    this.moving = false;
    this.trail = [];
    this.err.x = this.err.y = 0;
    this.offset.x = this.offset.y = 0;
    this.probe = null;
    this.server = null;
    this.still = 0;
    this.interp = null;
  }

  /** A move order was sent: walk towards `target` from where the hero is drawn. */
  move(target: Pt, now: number): void {
    if (!this.interp) return;
    if (this.mode !== 'drive') {
      this.pos.x = this.drawnAt.x;
      this.pos.y = this.drawnAt.y;
      this.mode = 'drive';
      this.trail = [{ t: now, x: this.pos.x, y: this.pos.y }];
      this.err.x = this.err.y = 0;
      // Starting from rest: the first snapshot that shows the hero moving measures the input lag.
      if (this.server && this.still >= 1) this.probe = { t: now, x: this.server.x, y: this.server.y };
    }
    this.path = this.findPath(this.pos, target) ?? [];
    this.moving = this.path.length > 0;
    if (!this.moving) this.stoppedAt = now;
  }

  /** A stop order was sent (the joystick was let go). */
  stop(now: number): void {
    if (this.mode !== 'drive') return;
    this.path = [];
    if (this.moving) this.stoppedAt = now;
    this.moving = false;
  }

  /** Another order that moves the hero (attack, attack-move, targeted cast): the server leads again. */
  cancel(): void {
    if (this.mode === 'drive') this.blendOut();
  }

  /** The newest snapshot arrived at local time `at` (ms) with your hero (null if it has none). */
  snapshot(hero: ServerHero | null, at: number): void {
    if (!hero || !hero.alive) {
      const lag = this.lagMs;
      this.reset();
      this.lagMs = lag;
      return;
    }
    const prev = this.server;
    const moved = !prev || Math.hypot(hero.x - prev.x, hero.y - prev.y) > 1e-3;
    this.still = moved ? 0 : this.still + 1;
    this.server = { x: hero.x, y: hero.y };
    this.stunned = hero.stunned;
    const probe = this.probe;
    if (probe) {
      if (Math.hypot(hero.x - probe.x, hero.y - probe.y) > 0.02) {
        const sample = at - probe.t;
        this.lagMs = this.lagMeasured ? this.lagMs + (sample - this.lagMs) * 0.3 : sample;
        this.lagMeasured = true;
        this.probe = null;
      } else if (at - probe.t > 1000) this.probe = null;
    }
    if (this.mode !== 'drive') return;
    const e = this.errorAt(hero, at);
    if (Math.hypot(e.x, e.y) > PREDICT.snapTiles) {
      this.shift(e.x, e.y);
      this.err.x = this.err.y = 0;
    } else {
      this.err.x = e.x;
      this.err.y = e.y;
    }
  }

  /** Advances the prediction by one frame. */
  frame(now: number, dtMs: number): void {
    if (this.mode === 'off') return;
    if (this.mode === 'blend') {
      const k = Math.exp(-dtMs / PREDICT.blendOutMs);
      this.offset.x *= k;
      this.offset.y *= k;
      if (Math.hypot(this.offset.x, this.offset.y) < 0.005) this.mode = 'off';
      return;
    }
    if (this.moving && !this.stunned) this.advance((this.speed * dtMs) / 1000, now);
    const f = 1 - Math.exp(-dtMs / PREDICT.blendMs);
    const cx = this.err.x * f;
    const cy = this.err.y * f;
    this.err.x -= cx;
    this.err.y -= cy;
    this.shift(cx, cy);
    this.trail.push({ t: now, x: this.pos.x, y: this.pos.y });
    const old = now - PREDICT.trailMs;
    let drop = 0;
    while (drop < this.trail.length - 1 && this.trail[drop]!.t < old) drop++;
    if (drop > 0) this.trail.splice(0, drop);
    if (!this.moving) {
      const s = this.server;
      const i = this.interp;
      const h = PREDICT.handoffTiles;
      const agreed =
        this.still >= 2 && s && i && Math.hypot(this.pos.x - s.x, this.pos.y - s.y) < h && Math.hypot(s.x - i.x, s.y - i.y) < h;
      // Agreed: blend the last few hundredths of a tile over, rather than switching in one frame.
      if (agreed || now - this.stoppedAt > PREDICT.settleMs) this.blendOut();
    }
  }

  /** Where to draw your hero this frame, given its interpolated position. */
  resolve(interp: Pt): DrawnHero {
    this.interp = { x: interp.x, y: interp.y };
    let x = interp.x;
    let y = interp.y;
    let facing: number | null = null;
    if (this.mode === 'drive') {
      x = this.pos.x;
      y = this.pos.y;
      if (this.moving && !this.stunned) facing = this.facing;
    } else if (this.mode === 'blend') {
      x += this.offset.x;
      y += this.offset.y;
    }
    this.drawnAt.x = x;
    this.drawnAt.y = y;
    return { x, y, facing };
  }

  private blendOut(): void {
    this.mode = 'blend';
    this.moving = false;
    this.path = [];
    const i = this.interp ?? this.pos;
    this.offset.x = this.pos.x - i.x;
    this.offset.y = this.pos.y - i.y;
  }

  private advance(budget: number, now: number): void {
    while (budget > 0 && this.path.length > 0) {
      const next = this.path[0]!;
      const dx = next.x - this.pos.x;
      const dy = next.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      if (d > 0) this.facing = Math.atan2(dy, dx);
      if (d <= budget) {
        this.pos.x = next.x;
        this.pos.y = next.y;
        this.path.shift();
        budget -= d;
      } else {
        this.pos.x += (dx / d) * budget;
        this.pos.y += (dy / d) * budget;
        budget = 0;
      }
    }
    if (this.path.length === 0) {
      this.moving = false;
      this.stoppedAt = now;
    }
  }

  /** Moves the prediction and its trail together (the trail stays in corrected coordinates). */
  private shift(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.pos.x += dx;
    this.pos.y += dy;
    for (const p of this.trail) {
      p.x += dx;
      p.y += dy;
    }
  }

  /**
   * Server position minus where the prediction was when the server was there: the closest point of
   * the trail within `windowMs` of one input lag before the snapshot arrived.
   */
  private errorAt(s: Pt, at: number): Pt {
    const trail = this.trail;
    if (trail.length === 0) return { x: s.x - this.pos.x, y: s.y - this.pos.y };
    const t = at - this.lagMs;
    let i0 = -1;
    let i1 = -1;
    let nearest = 0;
    for (let i = 0; i < trail.length; i++) {
      const dt = Math.abs(trail[i]!.t - t);
      if (dt < Math.abs(trail[nearest]!.t - t)) nearest = i;
      if (dt <= PREDICT.windowMs) {
        if (i0 < 0) i0 = i;
        i1 = i;
      }
    }
    if (i0 < 0) i0 = i1 = nearest;
    let bestD = Infinity;
    let bx = trail[i0]!.x;
    let by = trail[i0]!.y;
    for (let i = Math.max(0, i0 - 1); i <= Math.min(trail.length - 1, i1 + 1); i++) {
      const a = trail[i]!;
      const b = trail[Math.min(trail.length - 1, i + 1)]!;
      const p = closestOnSegment(s, a, b);
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestD) {
        bestD = d;
        bx = p.x;
        by = p.y;
      }
    }
    return { x: s.x - bx, y: s.y - by };
  }
}

function closestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + dx * t, y: a.y + dy * t };
}
