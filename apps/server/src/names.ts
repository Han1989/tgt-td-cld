// Names players write, as the server shows them (q16, docs/GAME_DESIGN.md "Daily run" → Names): a posted run's name
// on both boards and a room's seat names. The protocol's `normalizeName` first (1–16 characters, no control
// characters), then the word filter of nameList.ts on a folded copy of the name. Server side only, so the list is
// never shipped to a browser.
//
// The fold: Unicode NFKD, lower case, combining marks and invisible characters out, letters of other scripts that
// read as Latin ones read as those (Cyrillic and Greek look-alikes; full-width forms through NFKD), digits and signs
// read as the letters they stand for (1, ! and | as i or l: both are tried). Stems are matched in the folded name
// with everything that is not a letter dropped; whole words against each word of the name (split on anything that
// is not a letter or a look-alike, and where lower case turns to upper; single letters in a row joined) and against
// the whole folded name. A run of a letter in an entry matches any longer run of it in the name.

import { normalizeName } from '@tdt/protocol';
import { INNOCENT, STEMS, WORDS } from './nameList';

export const FALLBACK_NAME = 'Player';

/** Cyrillic and Greek letters that read as Latin ones (lower case; NFKD has taken accents off already). */
const SCRIPT_LOOK_ALIKE: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i',
  ї: 'i', ј: 'j', һ: 'h', ԍ: 'g', ү: 'y', ɑ: 'a', ѕ: 's', ԁ: 'd', ԛ: 'q', ԝ: 'w', ɡ: 'g',
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w', ς: 's',
  // Letters NFKD leaves whole.
  ß: 'ss', ł: 'l', ƒ: 'f', ø: 'o', đ: 'd', ð: 'd', æ: 'ae', œ: 'oe', ı: 'i', ħ: 'h', þ: 'th',
};

/** Digits and signs read as letters. A list: each is tried (1 as i and as l). */
const SIGN_LOOK_ALIKE: Record<string, readonly string[]> = {
  '0': ['o'], '1': ['i', 'l'], '!': ['i', 'l'], '|': ['i', 'l'], '3': ['e'], '4': ['a'], '@': ['a'], '5': ['s'],
  $: ['s'], '7': ['t'], '8': ['b'], '9': ['g'], '€': ['e'], '+': ['t'],
};

/** Most spellings tried for one name: past this, every two-way sign is read one way, then the other. */
const MAX_VARIANTS = 16;

/** Hate symbols that keep a name out whatever its letters. */
const HATE_SIGNS = /[卐卍ϟ]|ᛋᛋ/u;
/** Hate number codes in the name's digits. */
const HATE_CODES = /1488|14\D{0,2}88/;
/** A name that is an address or a contact: a dot and a common ending, t.me, or a name starting with @. */
const ADDRESS = /\.\s*(?:com|net|org|gg|io|ru|xyz|tv|me|ly|co|app|dev)(?![\p{L}\p{N}])/iu;

/** NFKD, lower case, marks and invisible characters out, other scripts' look-alikes read as Latin. */
function baseFold(name: string): string {
  let out = '';
  for (const ch of name.normalize('NFKD').toLowerCase()) {
    if (/[\p{M}\p{Cf}\p{Cc}]/u.test(ch)) continue;
    out += SCRIPT_LOOK_ALIKE[ch] ?? ch;
  }
  return out;
}

/** Every spelling of a base-folded piece with its signs read as letters, everything else that is no letter dropped. */
function spellings(folded: string): string[] {
  let variants = [''];
  const two: string[] = [];
  for (const ch of folded) {
    const as = SIGN_LOOK_ALIKE[ch];
    if (as) {
      if (as.length > 1) two.push(ch);
      variants = variants.flatMap((v) => as.map((a) => v + a));
    } else if (/\p{L}/u.test(ch)) variants = variants.map((v) => v + ch);
    if (variants.length > MAX_VARIANTS) break;
  }
  if (variants.length <= MAX_VARIANTS) return [...new Set(variants)];
  // Too many: each two-way sign read the same way throughout.
  const read = (pick: 0 | 1) =>
    [...folded].map((ch) => SIGN_LOOK_ALIKE[ch]?.[pick] ?? SIGN_LOOK_ALIKE[ch]?.[0] ?? (/\p{L}/u.test(ch) ? ch : '')).join('');
  return [...new Set([read(0), read(1)])];
}

/** The name folded for the filter, one spelling (the first reading of each sign): for tests and logs. */
export function foldName(name: string): string {
  return spellings(baseFold(name))[0] ?? '';
}

/** An entry as a pattern: each run of a letter matches that run or a longer one. */
function entryPattern(entry: string): string {
  const folded = spellings(baseFold(entry))[0] ?? '';
  return [...folded.matchAll(/(.)\1*/gsu)].map((m) => `${m[1]}{${[...m[0]].length},}`).join('');
}

const alternation = (list: readonly string[]) => list.map(entryPattern).filter(Boolean).join('|');
const STEM_RE = new RegExp(`(?:${alternation(STEMS)})`, 'u');
const WORD_RE = new RegExp(`^(?:${alternation(WORDS)})$`, 'u');
const INNOCENT_RE = new RegExp(`(?:${alternation(INNOCENT)})`, 'gu');

/** The name's words: split on what is no letter or look-alike and where lower case turns to upper; single letters joined. */
function words(name: string): string[] {
  const pieces = name
    .normalize('NFKD')
    .replace(/[\p{M}\p{Cf}]/gu, '')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}0-9!|@$€+]+/u)
    .filter(Boolean);
  const out: string[] = [];
  let run = '';
  for (const piece of pieces) {
    if ([...piece].length === 1) run += piece;
    else {
      if (run) out.push(run);
      run = '';
      out.push(piece);
    }
  }
  if (run) out.push(run);
  return out;
}

function stemHit(spelling: string): boolean {
  return STEM_RE.test(spelling.replace(INNOCENT_RE, ' '));
}

/** True when the name holds a word of the list, poses as someone, or is an address or a contact. */
export function nameBlocked(name: string): boolean {
  const raw = name.normalize('NFKC');
  if (raw.trimStart().startsWith('@') || ADDRESS.test(raw) || HATE_SIGNS.test(raw)) return true;
  if (HATE_CODES.test(raw.replace(/[^0-9/\\\- .]/g, ''))) return true;
  const whole = spellings(baseFold(name));
  if (whole.some((s) => stemHit(s) || WORD_RE.test(s))) return true;
  return words(name).some((w) => spellings(baseFold(w)).some((s) => WORD_RE.test(s)));
}

/** A name that passed `normalizeName` and shows something: true when it may be shown as it is. */
function shows(name: string): boolean {
  return /[\p{L}\p{N}\p{S}\p{P}]/u.test(name);
}

/** Folded answers kept for the boards' reads (a board shows the same names on every request). */
const memo = new Map<string, boolean>();
const MEMO_SIZE = 4096;

function blockedMemo(name: string): boolean {
  let hit = memo.get(name);
  if (hit === undefined) {
    hit = nameBlocked(name);
    if (memo.size >= MEMO_SIZE) memo.clear();
    memo.set(name, hit);
  }
  return hit;
}

/** The name to show for a posted run, on a board: run when a run is posted and again whenever a board is read. */
export function boardName(raw: unknown): string {
  const name = normalizeName(raw);
  if (!name || !shows(name) || blockedMemo(name)) return FALLBACK_NAME;
  return name;
}

/**
 * The name a room's seat carries: the nickname as it came (the codec has normalized it) when the filter lets it
 * through, else "Player", or "Player 2", "Player 3" when that is another seat's name in the room (`taken`).
 */
export function seatName(name: string, taken: readonly string[]): string {
  if (shows(name) && !blockedMemo(name)) return name;
  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  if (!used.has(FALLBACK_NAME.toLowerCase())) return FALLBACK_NAME;
  for (let n = 2; ; n++) if (!used.has(`${FALLBACK_NAME} ${n}`.toLowerCase())) return `${FALLBACK_NAME} ${n}`;
}
