// The anonymous counts that need a day (docs/ANALYTICS.md "Before the age question"): this browser's first counted open
// and its returns 1 and 7 UTC days later. Pure, except nothing: the store is passed in.
//
// The browser keeps, in localStorage only, the UTC day of its first counted open and which returns it has counted
// (`tdt.firstDay`). None of it is ever sent: a count says only `first_open`, `return_d1` or `return_d7`. A cleared
// store starts again (the next open is a first open); no store means no first open and no returns. Delete my data
// clears it (myData.ts `LOCAL_COUNT_KEYS`).

export const FIRST_DAY_KEY = 'tdt.firstDay';

const DAY_MS = 86_400_000;

/** The returns counted, by how many UTC days after the first counted open. */
export const RETURN_DAYS = { return_d1: 1, return_d7: 7 } as const;
export type ReturnKind = keyof typeof RETURN_DAYS;
export type VisitKind = 'first_open' | ReturnKind;

/** What is kept: the UTC day number of the first counted open and the returns already counted. */
export interface FirstDay {
  day: number;
  counted: ReturnKind[];
}

export function utcDayOf(at: number): number {
  return Math.floor(at / DAY_MS);
}

function isReturn(value: unknown): value is ReturnKind {
  return typeof value === 'string' && Object.hasOwn(RETURN_DAYS, value);
}

export function parseFirstDay(raw: string | null | undefined): FirstDay | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<FirstDay> | null;
    if (!value || typeof value !== 'object') return null;
    const { day, counted } = value;
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 0) return null;
    if (!Array.isArray(counted) || !counted.every(isReturn)) return null;
    return { day, counted: [...new Set(counted)] };
  } catch {
    return null;
  }
}

/**
 * The counts this open adds and what to keep after. Nothing kept (or a value we can't read): a first open, kept as
 * today. Exactly 1 or 7 days after the kept day, that return once. Otherwise nothing, and nothing to write.
 */
export function visitCounts(raw: string | null, today: number): { kinds: VisitKind[]; keep: FirstDay | null } {
  const kept = parseFirstDay(raw);
  if (!kept || kept.day > today) return { kinds: ['first_open'], keep: { day: today, counted: [] } };
  for (const kind of Object.keys(RETURN_DAYS) as ReturnKind[]) {
    if (today - kept.day === RETURN_DAYS[kind] && !kept.counted.includes(kind)) {
      return { kinds: [kind], keep: { day: kept.day, counted: [...kept.counted, kind] } };
    }
  }
  return { kinds: [], keep: null };
}

/** The few storage calls it needs; a store that throws counts nothing and never throws. */
export interface VisitStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Reads and updates the kept day, then hands each count to `count`. Call it only once the open itself was allowed
 * (`countOn`), so a day is kept only for an open that was counted. Never throws.
 */
export function countVisit(store: VisitStore | null, now: number, count: (kind: VisitKind) => void): void {
  if (!store) return;
  let plan: ReturnType<typeof visitCounts>;
  try {
    plan = visitCounts(store.getItem(FIRST_DAY_KEY), utcDayOf(now));
    if (plan.keep) store.setItem(FIRST_DAY_KEY, JSON.stringify(plan.keep));
  } catch {
    return;
  }
  for (const kind of plan.kinds) count(kind);
}
