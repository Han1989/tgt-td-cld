// A browser's data key (docs/ANALYTICS.md "Your data"): 32 random bytes the browser keeps to itself, as 64 hex
// characters. Its visitor id is derived from it, so the key proves the id is yours and the id never gives the key
// away. The client derives the id the same way (apps/client/src/analytics/dataKey.ts); a test checks they agree.

import { createHash } from 'node:crypto';

export const DATA_KEY = /^[0-9a-f]{64}$/;

/** The domain tag keeps this hash from meaning anything anywhere else. */
const TAG = 'tdt-visitor-v1:';

/** The visitor id for a data key: the first 32 hex characters of SHA-256 of the tagged key. */
export function visitorFromKey(key: string): string {
  return createHash('sha256').update(TAG + key, 'utf8').digest('hex').slice(0, 32);
}
