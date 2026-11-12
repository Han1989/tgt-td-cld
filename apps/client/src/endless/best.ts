// Endless's best wave per hero, kept in this browser only (`tdt.endlessBest`; docs/GAME_DESIGN.md "Endless"): shown on
// the Mode row, written when an Endless match ends. No scoreboard and no posting. The rules and the words are pure and
// tested; the store reads and writes localStorage inside try / catch (a private window may refuse it).

import { HERO_KINDS, type HeroKind } from '@tdt/protocol';

export const ENDLESS_BEST_KEY = 'tdt.endlessBest';

/** The best wave each hero's Heart fell on (a hero with no Endless run yet has none). */
export type EndlessBests = Partial<Record<HeroKind, number>>;

/** An Endless match that just ended, against the best before it. */
export interface EndlessRun {
  wave: number;
  /** The best after this run (0: none yet). */
  best: number;
  /** The best before it, or null on the hero's first run. */
  previous: number | null;
  /** This run went further than every earlier one (the first run too). */
  isNew: boolean;
}

/**
 * The stored bests' version (q2, protocol 26): before it Call early could stack waves, so a best may count presses,
 * not waves fought (Han's "Best: wave 148" of a run that reached wave 46). Bests stored without it are dropped once.
 */
export const ENDLESS_BEST_VERSION = 2;

/** The one line the Mode row shows, once, where a dropped best would have been. */
export const BESTS_RESET_LINE = 'Bests start again: Call early can no longer stack waves';

/** What `tdt.endlessBest` holds: the bests, and the heroes whose old best was dropped and not yet told. */
export interface BestStore {
  bests: EndlessBests;
  dropped: HeroKind[];
}

function wavesOf(data: unknown): EndlessBests {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
  const out: EndlessBests = {};
  for (const hero of HERO_KINDS) {
    const wave = (data as Record<string, unknown>)[hero];
    if (typeof wave === 'number' && Number.isSafeInteger(wave) && wave >= 1) out[hero] = wave;
  }
  return out;
}

/**
 * A stored value back to the store: anything but a whole wave of 1 or more for a known hero is dropped. A value from
 * before the version (a bare `{ ranger: 37 }`) keeps no best; its heroes are `dropped`, to be told once.
 */
export function parseStore(raw: string | null): BestStore {
  if (!raw) return { bests: {}, dropped: [] };
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return { bests: {}, dropped: [] };
    const d = data as { v?: unknown; bests?: unknown; dropped?: unknown };
    if (d.v !== ENDLESS_BEST_VERSION) return { bests: {}, dropped: HERO_KINDS.filter((h) => wavesOf(data)[h] !== undefined) };
    const dropped = Array.isArray(d.dropped) ? HERO_KINDS.filter((h) => (d.dropped as unknown[]).includes(h)) : [];
    return { bests: wavesOf(d.bests), dropped };
  } catch {
    return { bests: {}, dropped: [] };
  }
}

/** The store as `tdt.endlessBest` keeps it. */
export function serializeStore(store: BestStore): string {
  return JSON.stringify({ v: ENDLESS_BEST_VERSION, bests: store.bests, dropped: store.dropped });
}

/** The bests a stored value holds (see `parseStore`). */
export function parseBests(raw: string | null): EndlessBests {
  return parseStore(raw).bests;
}

/**
 * What the Mode row shows for `hero`: his best, or, the first time it would have shown a dropped best, the reset
 * line (and `told`: the store no longer names any hero, so it is said once).
 */
export function bestShown(store: BestStore, hero: HeroKind): { line: string | null; told: boolean } {
  const best = store.bests[hero];
  if (best !== undefined) return { line: bestLine(best), told: false };
  if (store.dropped.includes(hero)) return { line: BESTS_RESET_LINE, told: true };
  return { line: null, told: false };
}

/** The bests once `hero`'s Heart fell on `wave`, and how that run compares (a run that never reached wave 1 does not count). */
export function withRun(bests: EndlessBests, hero: HeroKind, wave: number): { bests: EndlessBests; run: EndlessRun } {
  const previous = bests[hero] ?? null;
  const isNew = wave >= 1 && (previous === null || wave > previous);
  const best = isNew ? wave : (previous ?? 0);
  return { bests: isNew ? { ...bests, [hero]: best } : bests, run: { wave, best, previous, isNew } };
}

/** The Mode row's line: "Best: wave 37". */
export function bestLine(best: number): string {
  return `Best: wave ${best}`;
}

/** The end screen of an Endless match: its title and the best (or "New best"). */
export function endlessEndCopy(run: EndlessRun): { title: string; line: string } {
  const title = `Fallen on wave ${run.wave}`;
  if (!run.isNew) return { title, line: run.best >= 1 ? `${bestLine(run.best)}.` : '' };
  return { title, line: run.previous === null ? 'New best!' : `New best! Your best was wave ${run.previous}.` };
}

/**
 * The end screen's line on how far the run grew (Endless): the hero's level, which goes past 10, and the Reinforce ranks
 * bought, once the host's report is in (null before it): "Level 14 · 9 Reinforce ranks."
 */
export function endlessRunLine(level: number, reinforces: number | null): string {
  if (reinforces === null) return `Level ${level}.`;
  return `Level ${level} · ${reinforces} Reinforce rank${reinforces === 1 ? '' : 's'}.`;
}

/** Heroes told of the reset on this page: the line stays while the page is open, then never again. */
const toldHere = new Set<HeroKind>();

function readStore(): BestStore {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(ENDLESS_BEST_KEY);
  } catch {
    return { bests: {}, dropped: [] };
  }
  const store = parseStore(raw);
  // An old value is rewritten at once, so its bests are gone for good.
  if (raw !== null && raw !== serializeStore(store)) writeStore(store);
  return store;
}

function writeStore(store: BestStore): void {
  try {
    localStorage.setItem(ENDLESS_BEST_KEY, serializeStore(store));
  } catch {
    // ignore: the run still shows, the best is not kept
  }
}

/** `hero`'s best Endless wave in this browser, or null. */
export function endlessBest(hero: HeroKind): number | null {
  return readStore().bests[hero] ?? null;
}

/** The Mode row's line for `hero` (`bestShown`): his best, the reset line once, or null. */
export function endlessBestLine(hero: HeroKind): string | null {
  const store = readStore();
  const shown = bestShown(store, hero);
  if (shown.told) {
    for (const h of store.dropped) toldHere.add(h);
    writeStore({ ...store, dropped: [] });
  }
  if (shown.line === null && toldHere.has(hero)) return BESTS_RESET_LINE;
  return shown.line;
}

/** Counts an Endless match of `hero` that fell on `wave`: stores a new best, and says how it compares. */
export function recordEndlessRun(hero: HeroKind, wave: number): EndlessRun {
  const store = readStore();
  const { bests, run } = withRun(store.bests, hero, wave);
  if (run.isNew) writeStore({ bests, dropped: store.dropped.filter((h) => h !== hero) });
  return run;
}
