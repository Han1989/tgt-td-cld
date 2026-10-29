// The Daily run's day files (docs/DEPLOY.md, docs/ANALYTICS.md "Daily run"): per UTC day, each browser's best run and
// the day's counts, as `daily/YYYY-MM-DD.json` in the analytics directory, kept 90 days (days.ts does the files, the
// pruning and the deletion; this file says what a Daily entry is and how it ranks).

import { HERO_KINDS } from '@tdt/protocol';
import { rankOrder } from '@tdt/sim';
import { bestRun, type BestRun, type DailyEntry } from './board';
import { DAY_KEEP_DAYS, DayStore, entryBase, type DayStat } from './days';

export { dayKept, type DayCounts } from './days';

/** Day files older than this many days are deleted. */
export const DAILY_KEEP_DAYS = DAY_KEEP_DAYS;
/** The directory under the analytics directory. */
export const DAILY_DIR = 'daily';

/** One day's row on the analytics dashboard. */
export type DailyDayStat = DayStat;

function parseEntry(value: unknown): DailyEntry | null {
  const base = entryBase(value);
  const e = value as Partial<DailyEntry>;
  if (!base || !HERO_KINDS.includes(e.hero as never) || typeof e.won !== 'boolean') return null;
  for (const n of [e.heart, e.wave, e.ticks]) if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return { ...base, hero: e.hero!, won: e.won, heart: e.heart!, wave: e.wave!, ticks: e.ticks! };
}

export class DailyStore extends DayStore<DailyEntry> {
  constructor(configuredDir: string) {
    super(configuredDir, { dir: DAILY_DIR, parse: parseEntry, order: rankOrder });
  }

  /** Every day's entry of this browser id, oldest day first (a copy request). */
  visitorRuns(visitor: string): (BestRun & { day: string; name: string; at: number })[] {
    return this.dayKeys().flatMap((key) => {
      const e = this.entryOn(key, visitor);
      return e ? [{ day: key, name: e.name, at: e.at, ...bestRun(e) }] : [];
    });
  }

  /** This browser's best run over the days kept, and its day; null if it has none. */
  personalBest(visitor: string): (BestRun & { day: string }) | null {
    let best: (BestRun & { day: string }) | null = null;
    for (const key of this.dayKeys()) {
      const e = this.entryOn(key, visitor);
      if (e && (!best || rankOrder(e, best) < 0 || (rankOrder(e, best) === 0 && key > best.day))) best = { day: key, ...bestRun(e) };
    }
    return best;
  }
}
