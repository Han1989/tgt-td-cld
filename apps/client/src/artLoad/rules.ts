// The first minute's art (V-07d, docs/ART.md §15 "The first wave's art"): which pictures a match's first wave needs,
// when a solo match stops holding its start for them, and how far along they are. Pure: tested in
// test/artLoad.test.ts. The downloads themselves are tracked in track.ts, the order they load in is order.ts.

import type { CreepKind, GamePhase, HeroKind } from '@tdt/protocol';
import { waveGroups, type Tuning } from '@tdt/sim';

/** A picture the match draws: the map plate, the towers' / Heart's / portals' sheet, a creep's or a hero's sheet. */
export type SheetId = 'plate' | 'structures' | `creep:${CreepKind}` | `hero:${HeroKind}`;

/**
 * Where a picture is: not asked for yet, downloading, in (decoded, its textures made), failed (it is not coming: the
 * 2D art stays), or off (this build does not load it: the browser tests' `?towers2d` and `?creeps2d`).
 */
export type SheetStatus = 'idle' | 'loading' | 'in' | 'failed' | 'off';

export interface SheetProgress {
  status: SheetStatus;
  /** Bytes received so far. */
  received: number;
  /** The file's bytes from its Content-Length, or null while unknown (not asked for yet, or the server sent none). */
  expected: number | null;
}

/** The longest a solo match holds its start for its first wave's art (ms); after it, the 2D art covers what is missing. */
export const ART_HOLD_MS = 6000;

/**
 * Every picture the match's first wave shows, in the order they load: the map plate, the structures' sheet, the
 * first wave's creep kinds (`waveGroups(tuning, 1)`, `tuning` the match's mode's) and the heroes' sheets (solo: the
 * picked hero; online: every hero in the room).
 */
export function firstWaveSheets(tuning: Tuning, heroes: readonly HeroKind[]): SheetId[] {
  const out: SheetId[] = ['plate', 'structures'];
  for (const g of waveGroups(tuning, 1)) {
    const id: SheetId = `creep:${g.kind}`;
    if (!out.includes(id)) out.push(id);
  }
  for (const h of heroes) {
    const id: SheetId = `hero:${h}`;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** The creep kinds among `ids`, in their order (the creep sheets load them first). */
export function creepKinds(ids: readonly SheetId[]): CreepKind[] {
  return ids.filter((id): id is `creep:${CreepKind}` => id.startsWith('creep:')).map((id) => id.slice(6) as CreepKind);
}

/** A picture that is no longer awaited: in, failed or not loaded in this build. */
export function settled(p: SheetProgress): boolean {
  return p.status === 'in' || p.status === 'failed' || p.status === 'off';
}

/** Every picture of the set is in (or will never come). */
export function allSettled(items: readonly SheetProgress[]): boolean {
  return items.every(settled);
}

/** A solo match's hold is over: every picture is in, or `limitMs` (ART_HOLD_MS) have passed since the match started. */
export function holdOver(items: readonly SheetProgress[], sinceStartMs: number, limitMs = ART_HOLD_MS): boolean {
  return allSettled(items) || sinceStartMs >= limitMs;
}

/**
 * How far along the set is, 0..1: the bytes received over the bytes expected when every picture has told its size
 * (its Content-Length), else the share of pictures settled. A settled picture counts whole; one this build does not
 * load is not part of it.
 */
export function artFraction(items: readonly SheetProgress[]): number {
  const set = items.filter((p) => p.status !== 'off');
  if (set.every(settled)) return 1;
  if (set.every((p) => p.expected !== null && p.expected > 0)) {
    let got = 0;
    let want = 0;
    for (const p of set) {
      const size = p.expected!;
      want += size;
      got += settled(p) ? size : Math.min(p.received, size);
    }
    return got / want;
  }
  return set.filter(settled).length / set.length;
}

/**
 * Online (no hold: the server starts the room), the line shows while the set is not in, during the build phase and
 * the first wave only: never after it.
 */
export function onlineLineAllowed(phase: GamePhase, wave: number): boolean {
  return phase === 'build' || (phase === 'waves' && wave <= 1);
}
