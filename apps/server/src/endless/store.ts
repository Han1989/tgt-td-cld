// Endless's day files (docs/DEPLOY.md, docs/ANALYTICS.md "Endless board"): per UTC day, each browser's best solo run
// and the day's counts, as `endless/YYYY-MM-DD.json` in the analytics directory, kept 90 days, deleted with the play
// data (../daily/days.ts does the files, the pruning and the deletion; this file says what an Endless entry is).

import { HERO_KINDS } from '@tdt/protocol';
import { endlessRankOrder } from '@tdt/sim';
import { DayStore, entryBase, type DayStat } from '../daily/days';
import { topWave, type EndlessEntry } from './board';

/** The directory under the analytics directory. */
export const ENDLESS_DIR = 'endless';

/** One day's row on the analytics dashboard: the Daily run's, and the day's top wave. */
export interface EndlessDayStat extends DayStat {
  topWave: number | null;
}

function parseEntry(value: unknown): EndlessEntry | null {
  const base = entryBase(value);
  const e = value as Partial<EndlessEntry>;
  if (!base || !HERO_KINDS.includes(e.hero as never)) return null;
  for (const n of [e.wave, e.ticks]) if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return { ...base, hero: e.hero!, wave: e.wave!, ticks: e.ticks! };
}

export class EndlessStore extends DayStore<EndlessEntry> {
  constructor(configuredDir: string) {
    super(configuredDir, { dir: ENDLESS_DIR, parse: parseEntry, order: endlessRankOrder });
  }

  /** Every day's entry of this browser id, oldest day first (a copy request). */
  visitorRuns(visitor: string): { day: string; name: string; at: number; hero: EndlessEntry['hero']; wave: number; ticks: number }[] {
    return this.dayKeys().flatMap((key) => {
      const e = this.entryOn(key, visitor);
      return e ? [{ day: key, name: e.name, at: e.at, hero: e.hero, wave: e.wave, ticks: e.ticks }] : [];
    });
  }

  override stats(limit = 30): EndlessDayStat[] {
    return super.stats(limit).map((s) => ({ ...s, topWave: topWave(this.entries(s.day)) }));
  }
}
