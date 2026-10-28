// V-07c's light pools (docs/ART.md §6, §16; Han's pick of 28 Oct 2026): a soft glow on the ground round the Heart
// (rose), round each portal (violet) and under every tier-3 tower (teal), so the map's few lights read on the Spring
// meadow's daylight grass. Each pool is one radial falloff (`POOL_STOPS`, baked once into the fx atlas's `pool` frame,
// tinted per pool) drawn twice: a tint laid over the ground (normal blend, `POOL_TINT` of its alpha) under a glow added
// on it (add blend, `POOL_GLOW` of it). Light only added turns rose to gold and violet to grey on green grass (red added
// to green is yellow), so the tint carries the hue and the glow the light (docs/art/ground-options.md, "The light
// pools"). Made once and animated by alpha only; non-essential (gone at Graphics → Low). The numbers are the sheet's.

export type PoolKind = 'heart' | 'portal' | 'tower';

/** The falloff from the middle (0) to the rim (1): the pool's share of its peak alpha. */
export const POOL_STOPS: readonly (readonly [at: number, share: number])[] = [
  [0, 1],
  [0.3, 0.72],
  [0.6, 0.3],
  [0.82, 0.08],
  [1, 0],
];

/** Spring meadow's strength: a lighter ground needs more for the same glow (the sheet's A, 1.3). */
export const POOL_STRENGTH = 1.3;
/** The two layers' shares of a pool's alpha: the tint laid over the ground, the glow added on it. */
export const POOL_TINT = 0.5;
export const POOL_GLOW = 0.7;

/** Each pool's radius (tiles) and peak alpha (before the strength). */
export const POOLS: Record<PoolKind, { radius: number; peak: number }> = {
  heart: { radius: 3.4, peak: 0.36 },
  portal: { radius: 2.6, peak: 0.38 },
  tower: { radius: 2.4, peak: 0.3 },
};

/** A tower's pool fades in over this long (ms) when the tower reaches tier 3 or a branch. */
export const POOL_FADE_MS = 400;
/** How much brighter a portal's pool is at the height of its wave-start flare (a boss lane's flare is brighter still). */
export const POOL_FLARE = 0.4;

/** A pool's two layers' alphas at `level` (1: its own; a fading pool less, a flaring portal's more). */
export function poolAlphas(kind: PoolKind, level = 1): { tint: number; glow: number } {
  const a = POOLS[kind].peak * POOL_STRENGTH * Math.max(0, level);
  return { tint: a * POOL_TINT, glow: a * POOL_GLOW };
}

/** A tower lights its pad from tier 3 (a branch is tier 4). */
export function towerLit(tier: number): boolean {
  return tier >= 3;
}

/** A new tower pool's level `ms` after it appeared: 0 → 1 over `POOL_FADE_MS`, eased. */
export function poolFadeIn(ms: number): number {
  const t = Math.min(1, Math.max(0, ms / POOL_FADE_MS));
  return t * t * (3 - 2 * t);
}

/** A portal's pool level with its flare (0..1, the wave-start flare's decay) and a boss lane's brighter flare. */
export function portalPoolLevel(flare: number, bossBoost = 1): number {
  return 1 + POOL_FLARE * Math.max(0, flare) * bossBoost;
}
