// V-07c's light pools (docs/ART.md §6, §16; Han's pick of 28 Oct 2026): a soft glow on the ground round the Heart
// (rose), round each portal (violet) and under every tier-3 tower (teal), so the map's few lights read on the Spring
// meadow's daylight grass. Each pool is one radial falloff (`POOL_STOPS`) tinted in its colour, as a tint laid over the
// ground (`POOL_TINT` of its alpha) and a glow added on it (`POOL_GLOW` of it). Light only added turns rose to gold and
// violet to grey on green grass (red added to green is yellow), so the tint carries the hue and the glow the light
// (docs/art/ground-options.md, "The light pools"). Both are drawn by one quad at the normal blend (`poolTexels`), made
// once and animated by alpha only; non-essential (gone at Graphics → Low). The numbers are the sheet's.

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
/** The tint's share of a pool's light: its texture's alpha against its colour (`poolTexels`). */
export const POOL_COVER = POOL_TINT / (POOL_TINT + POOL_GLOW);

/** Radius of the pools' texture (px, `poolTexels`): the falloff reaches 0 at its edge. */
export const POOL_PX = 64;

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

/**
 * A pool's alpha at `level` (1: its own; a fading pool less, a flaring portal's more): its quad's, the tint's and the
 * glow's shares together (`poolTexels`). At most 1, a boss portal's flare included (a test checks).
 */
export function poolAlpha(kind: PoolKind, level = 1): number {
  return POOLS[kind].peak * POOL_STRENGTH * Math.max(0, level) * (POOL_TINT + POOL_GLOW);
}

/** The falloff's share of a pool's peak at `r` (0 the middle, 1 the rim; past it 0), straight between `POOL_STOPS`. */
export function poolShare(r: number): number {
  let [at0, share0] = POOL_STOPS[0]!;
  for (const [at, share] of POOL_STOPS) {
    if (r <= at) return at === at0 ? share : share0 + ((share - share0) * (r - at0)) / (at - at0);
    [at0, share0] = [at, share];
  }
  return 0;
}

/**
 * The pools' texture, `size` px square, premultiplied RGBA (uploaded as it is, never premultiplied again): white light
 * of the falloff's share (sampled at each pixel's middle, as a canvas gradient is) whose alpha is only the tint's part
 * of it (`POOL_COVER`). Drawn at `poolAlpha` with the normal blend (colour + ground × (1 − alpha)), a ground pixel g
 * under a pool of colour c and share s at alpha a becomes g × (1 − a·T·s) + c × a·(T + G)·s: the tint laid over it
 * (g × (1 − a·T·s) + c × a·T·s) and the glow added on it (+ c × a·G·s), which #150 drew as two quads, one of them with
 * the add blend. One quad and no add batch: half the fill and two draw calls fewer, the same pixels. A canvas cannot
 * hold a colour brighter than its alpha, so this is not in the fx atlas.
 */
export function poolTexels(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = poolShare(Math.hypot(x + 0.5 - half, y + 0.5 - half) / half);
      const light = Math.round(255 * s);
      const i = (y * size + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = light;
      px[i + 3] = Math.round(255 * s * POOL_COVER);
    }
  }
  return px;
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
