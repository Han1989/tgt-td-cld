// The name a posted Daily run shows on the public board: the home card's nickname through the protocol's
// `normalizeName` (1–16 characters, no control characters), then a short word filter. A name that fails either is
// shown as "Player". Server side only, so the list is not shipped to every browser.

import { normalizeName } from '@tdt/protocol';

export const FALLBACK_NAME = 'Player';

/**
 * Stems that keep a name off the board. Short on purpose (a dozen): it catches the obvious, not every spelling.
 * Kept to stems with few innocent words around them (no "ass", which is in "Cassandra").
 */
const BLOCKED_STEMS = [
  'fuck',
  'shit',
  'cunt',
  'nigg',
  'fagg',
  'whore',
  'slut',
  'bitch',
  'retard',
  'rapist',
  'hitler',
  'nazi',
];

/** Common look-alike characters, read as the letters they stand for. */
const LOOK_ALIKE: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', $: 's', '7': 't' };

/** The name folded for the filter: lower case, accents off, look-alikes read as letters, everything else dropped. */
export function foldName(name: string): string {
  return [...name.normalize('NFKD').toLowerCase()]
    .map((ch) => LOOK_ALIKE[ch] ?? ch)
    .join('')
    .replace(/[^a-z]/g, '');
}

export function nameBlocked(name: string): boolean {
  const folded = foldName(name);
  return BLOCKED_STEMS.some((stem) => folded.includes(stem));
}

/** The name to show for a posted run. */
export function boardName(raw: unknown): string {
  const name = normalizeName(raw);
  if (!name || nameBlocked(name)) return FALLBACK_NAME;
  // Invisible characters only: a name that shows nothing is no name.
  if (!/[\p{L}\p{N}\p{S}\p{P}]/u.test(name)) return FALLBACK_NAME;
  return name;
}
