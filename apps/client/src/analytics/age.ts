// The age check (docs/ANALYTICS.md "Age"): one neutral question, "How old are you?", asked once per browser before
// any play data (anything with an id) is sent; until then only an anonymous count with no id may go (preference.ts
// `countAllowed`). The answer stays in this browser (`tdt.age`) and is never sent. It only decides what is sent:
// under 13 nothing more is sent, not even the count; 13–15 starts off (the player may turn it on); 16 and over is
// the usual rule.
// Play is never blocked. Pure, except the small storage helpers at the end.

export const AGE_KEY = 'tdt.age';
/** Under this, play data is off and cannot be turned on. */
export const CHILD_UNDER = 13;
/** Under this (and 13 or over), play data starts off; the player may turn it on. */
export const TEEN_UNDER = 16;
export const MAX_AGE = 120;

export type AgeBand = 'child' | 'teen' | 'adult';

/** What is kept: the age typed and the month it was typed in (`YYYY-MM`), so the band moves on with time. */
export interface AgeAnswer {
  age: number;
  month: string;
}

function monthIndex(month: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12) return null;
  return Number(m[1]) * 12 + (mm - 1);
}

export function monthOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** The age field's text as a whole number of years, or null when it is not one we accept. */
export function parseAgeInput(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const age = Number(text);
  return age >= 1 && age <= MAX_AGE ? age : null;
}

export function parseAgeAnswer(raw: string | null | undefined): AgeAnswer | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AgeAnswer> | null;
    if (!value || typeof value !== 'object') return null;
    const { age, month } = value;
    if (typeof age !== 'number' || !Number.isInteger(age) || age < 1 || age > MAX_AGE) return null;
    if (typeof month !== 'string' || monthIndex(month) === null) return null;
    return { age, month };
  } catch {
    return null;
  }
}

/**
 * The age now: the age typed plus every full year since. Never older than that, so a 12-year-old is not counted as
 * 13 before a whole year has passed.
 */
export function ageNow(answer: AgeAnswer, now: Date): number {
  const then = monthIndex(answer.month) ?? 0;
  const months = Math.max(0, monthIndex(monthOf(now))! - then);
  return answer.age + Math.floor(months / 12);
}

export function ageBand(answer: AgeAnswer | null, now: Date): AgeBand | null {
  if (!answer) return null;
  const age = ageNow(answer, now);
  if (age < CHILD_UNDER) return 'child';
  if (age < TEEN_UNDER) return 'teen';
  return 'adult';
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Kept for this page when storage is blocked, so the question is not asked again until reload. */
let memoryAnswer: AgeAnswer | null = null;

export function readAgeAnswer(): AgeAnswer | null {
  try {
    const store = storage();
    if (store) return parseAgeAnswer(store.getItem(AGE_KEY)) ?? memoryAnswer;
  } catch {
    // Blocked storage: the in-page answer.
  }
  return memoryAnswer;
}

export function writeAgeAnswer(answer: AgeAnswer): void {
  memoryAnswer = answer;
  try {
    storage()?.setItem(AGE_KEY, JSON.stringify(answer));
  } catch {
    // Asked again on the next page.
  }
}

/** This browser's band now, or null before the question is answered. Never throws. */
export function currentAgeBand(): AgeBand | null {
  try {
    return ageBand(readAgeAnswer(), new Date());
  } catch {
    return null;
  }
}
