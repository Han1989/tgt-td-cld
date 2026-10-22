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

/** A stored value back to bests: anything but a whole wave of 1 or more for a known hero is dropped. */
export function parseBests(raw: string | null): EndlessBests {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
    const out: EndlessBests = {};
    for (const hero of HERO_KINDS) {
      const wave = (data as Record<string, unknown>)[hero];
      if (typeof wave === 'number' && Number.isSafeInteger(wave) && wave >= 1) out[hero] = wave;
    }
    return out;
  } catch {
    return {};
  }
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

function readBests(): EndlessBests {
  try {
    return parseBests(localStorage.getItem(ENDLESS_BEST_KEY));
  } catch {
    return {};
  }
}

/** `hero`'s best Endless wave in this browser, or null. */
export function endlessBest(hero: HeroKind): number | null {
  return readBests()[hero] ?? null;
}

/** Counts an Endless match of `hero` that fell on `wave`: stores a new best, and says how it compares. */
export function recordEndlessRun(hero: HeroKind, wave: number): EndlessRun {
  const { bests, run } = withRun(readBests(), hero, wave);
  if (run.isNew) {
    try {
      localStorage.setItem(ENDLESS_BEST_KEY, JSON.stringify(bests));
    } catch {
      // ignore: the run still shows, the best is not kept
    }
  }
  return run;
}
