// Seeded PRNG (mulberry32). The generator state lives in GameState so a match
// replays identically from its seed; the sim has no other randomness source.

export function seedRng(seed: number): number {
  return seed >>> 0;
}

/** Advances `state` and returns [nextState, value in [0, 1)]. */
export function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [next, value];
}
