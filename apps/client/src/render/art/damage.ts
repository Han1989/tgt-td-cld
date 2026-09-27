// Damage states of the Heart (docs/ART.md §7): whole, cracked under 60% HP, split open (and
// blazing) under 30%. Pure, tested; the renderer shows the matching overlay frames.

/** The Heart shows cracks under this share of its HP. */
export const HEART_CRACKED = 0.6;
/** The Heart splits open, blazes and warns (faster beat, red ring) under this share. */
export const HEART_LOW = 0.3;

/** 0 whole, 1 cracked, 2 split open. */
export type HeartStage = 0 | 1 | 2;

export function heartStage(frac: number): HeartStage {
  if (frac < HEART_LOW) return 2;
  if (frac < HEART_CRACKED) return 1;
  return 0;
}
