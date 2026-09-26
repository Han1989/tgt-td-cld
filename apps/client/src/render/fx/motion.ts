// Particle motion (pure, tested): one short-lived bit of an effect, in world pixels.
// The Pixi side (effects.ts) copies a bit's state into a pooled Particle each frame.

export interface Bit {
  x: number;
  y: number;
  /** Velocity in px/s. */
  vx: number;
  vy: number;
  /** Downward acceleration in px/s² (negative rises). */
  gravity: number;
  /** Velocity lost per second, as a fraction (0 = none). */
  drag: number;
  rotation: number;
  /** Radians per second. */
  spin: number;
  /** Point the bit along its velocity (sparks, shards, streaks). */
  align: boolean;
  /** ms lived and ms to live. */
  age: number;
  life: number;
  /** Scale at birth and at death (eased between). */
  scale0: number;
  scale1: number;
  /** Extra length along the velocity for aligned bits (1 = none). */
  stretch: number;
  alpha0: number;
  alpha1: number;
  /** Stay fully visible for this fraction of the life before fading. */
  hold: number;
}

export function newBit(): Bit {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    gravity: 0,
    drag: 0,
    rotation: 0,
    spin: 0,
    align: false,
    age: 0,
    life: 1,
    scale0: 1,
    scale1: 1,
    stretch: 1,
    alpha0: 1,
    alpha1: 0,
    hold: 0,
  };
}

/** Advances a bit by `dtMs`. Returns false once it has lived its life. */
export function stepBit(b: Bit, dtMs: number): boolean {
  b.age += dtMs;
  if (b.age >= b.life) return false;
  const dt = dtMs / 1000;
  if (b.drag > 0) {
    const k = Math.max(0, 1 - b.drag * dt);
    b.vx *= k;
    b.vy *= k;
  }
  b.vy += b.gravity * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.align) {
    if (b.vx !== 0 || b.vy !== 0) b.rotation = Math.atan2(b.vy, b.vx);
  } else {
    b.rotation += b.spin * dt;
  }
  return true;
}

/** 0 at birth, 1 at death. */
export function bitProgress(b: Bit): number {
  return Math.max(0, Math.min(1, b.age / b.life));
}

/** Scale now: eases out from scale0 to scale1 (fast at first, like a burst). */
export function bitScale(b: Bit): number {
  const t = bitProgress(b);
  const e = 1 - (1 - t) * (1 - t);
  return b.scale0 + (b.scale1 - b.scale0) * e;
}

/** Alpha now: holds alpha0 for `hold` of the life, then fades linearly to alpha1. */
export function bitAlpha(b: Bit): number {
  const t = bitProgress(b);
  if (t <= b.hold) return b.alpha0;
  const f = (t - b.hold) / Math.max(1e-6, 1 - b.hold);
  return b.alpha0 + (b.alpha1 - b.alpha0) * f;
}
