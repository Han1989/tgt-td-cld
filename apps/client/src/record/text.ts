// What the record says (record.ts; pure, tested): the mark on a hero button, the home card's line under the picked
// hero (richest first, the lobby shows the first that fits), and the end screen's "Personal best".

import type { GameMode } from '@tdt/protocol';
import type { DailyGain, HeartGain, HeartSlot, HeroRecord } from './record';
import { wonFull } from './record';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Quick solo", "Full co-op": a slot as the end screen names it. */
export function slotName(slot: HeartSlot): string {
  const [mode, team] = slot.split('-') as ['full' | 'quick', 'solo' | 'coop'];
  return `${mode === 'full' ? 'Full' : 'Quick'} ${team === 'solo' ? 'solo' : 'co-op'}`;
}

/** "in Quick", "in Full co-op": a slot as the home card's line names it (solo is the plain case). */
function slotPlace(slot: HeartSlot): string {
  const [mode, team] = slot.split('-') as ['full' | 'quick', 'solo' | 'coop'];
  return `in ${mode === 'full' ? 'Full' : 'Quick'}${team === 'coop' ? ' co-op' : ''}`;
}

/** The hero button's mark: a star once the hero has won Full, else his wins; none before the first win. */
export function heroMark(hero: HeroRecord | undefined): { text: string; star: boolean; label: string } | null {
  if (!hero || hero.wins < 1) return null;
  const wins = plural(hero.wins, 'win');
  if (wonFull(hero)) return { text: '★', star: true, label: `Won Full · ${wins}` };
  return { text: String(hero.wins), star: false, label: wins };
}

/**
 * The best Heart the line shows: the picked mode's (Full or Quick; Endless picked reads Full first), alone before with
 * friends, then the other mode's. Null when the hero has won neither on Normal.
 */
export function headlineHeart(hero: HeroRecord, mode: GameMode): { slot: HeartSlot; heart: number } | null {
  const order: HeartSlot[] =
    mode === 'quick' ? ['quick-solo', 'quick-coop', 'full-solo', 'full-coop'] : ['full-solo', 'full-coop', 'quick-solo', 'quick-coop'];
  for (const slot of order) {
    const heart = hero.heart[slot];
    if (heart !== undefined) return { slot, heart };
  }
  return null;
}

/**
 * The line under the picked hero, from the richest to the plainest ("Ranger · 7 wins · best 94 Heart in Quick · Daily
 * best #3", then without the Daily rank; then the same without the name, which the button and the stage already show;
 * the count last). Empty before the hero's first finished match. Endless's best is not on it: the Mode row shows it
 * over the Endless segment.
 */
export function recordLines(name: string, hero: HeroRecord | undefined, mode: GameMode): string[] {
  if (!hero || hero.played < 1) return [];
  const count = hero.wins > 0 ? plural(hero.wins, 'win') : `${plural(hero.played, 'match', 'matches')} played`;
  const best = headlineHeart(hero, mode);
  const extras = [
    ...(best ? [`best ${best.heart} Heart ${slotPlace(best.slot)}`] : []),
    ...(hero.daily ? [`Daily best #${hero.daily.rank}`] : []),
  ];
  const lines: string[] = [];
  for (const who of [[name], []]) {
    for (let k = extras.length; k >= 1; k--) lines.push([...who, count, ...extras.slice(0, k)].join(' · '));
  }
  lines.push(`${name} · ${count}`, count);
  return lines;
}

/** The line's font sizes in px, largest first: each line tries the next step down before a part of it gives way. */
export const LINE_SIZES = [12, 11] as const;

/**
 * The first of `lines`, at the first of `sizes`, that `fits` its column as the page measures it (so it holds in any
 * font: Inter, or CI's DejaVu Sans, 18% wider); the last line at the smallest size whatever it measures; '' for none.
 */
export function fittedLine(
  lines: readonly string[],
  fits: (text: string, size: number) => boolean,
  sizes: readonly number[] = LINE_SIZES,
): { text: string; size: number } {
  const smallest = sizes[sizes.length - 1] ?? LINE_SIZES[0];
  for (const text of lines) {
    for (const size of sizes) if (fits(text, size)) return { text, size };
  }
  return { text: lines[lines.length - 1] ?? '', size: smallest };
}

/** The end screen's line when a won match beats the slot's best: "Personal best: 94 Heart · Quick solo (was 88)". */
export function heartBestLine(gain: HeartGain | null): string {
  if (!gain?.isNew) return '';
  const was = gain.previous === null ? '' : ` (was ${gain.previous})`;
  return `Personal best: ${gain.heart} Heart · ${slotName(gain.slot)}${was}`;
}

/** The end screen's line when a posted Daily run places better than before: "Personal best: #3 in the Daily run (was #14)". */
export function dailyBestLine(gain: DailyGain | null): string {
  if (!gain?.isNew) return '';
  const was = gain.previous === null ? '' : ` (was #${gain.previous.rank})`;
  return `Personal best: #${gain.rank.rank} in the Daily run${was}`;
}
