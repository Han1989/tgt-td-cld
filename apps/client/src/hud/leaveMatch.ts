// ⚙ → Back to lobby (q1, Han's laptop run of 11 Nov 2026: no way out of a solo match but closing the app) and, in a
// solo Endless run, End run (q2, protocol 26: the honest way to end a run, which counts). Pure, tested.

import type { Snapshot } from '@tdt/protocol';

/** What the Settings sheet knows about the match on screen. */
export interface MatchOnScreen {
  /** A match is attached to the view (solo, the lesson, the Daily run, Endless, or an online room's). */
  attached: boolean;
  /** It is an online room's match: those keep Leave room on the end card, and nothing here. */
  online: boolean;
  /** The latest snapshot, while a match is attached (End run reads its mode, phase and wave). */
  snap?: Pick<Snapshot, 'mode' | 'phase' | 'wave' | 'nextWaveIn' | 'canCallEarly'> | null;
}

/** Settings shows "Back to lobby" during a solo match only (Play solo, Learn to play, the Daily run, Endless). */
export function settingsLeaveShown(m: MatchOnScreen): boolean {
  return m.attached && !m.online;
}

/** The question the sheet asks before it leaves (never a browser dialog). */
export const LEAVE_QUESTION = "Leave this match? It won't be saved.";

/**
 * Settings shows "End run" in a solo Endless match only, while it is on: never in a room, the Daily run (Quick on
 * Hard), Full or Quick. The sim refuses it there too.
 */
export function endRunShown(m: MatchOnScreen): boolean {
  const snap = m.snap;
  return settingsLeaveShown(m) && !!snap && snap.mode === 'endless' && (snap.phase === 'build' || snap.phase === 'waves');
}

/**
 * The wave End run would end on, as the sim decides it: the wave the match is in, or the one before while it is still
 * arriving (a next wave exists and a call would be refused).
 */
export function endRunWave(snap: Pick<Snapshot, 'phase' | 'wave' | 'nextWaveIn' | 'canCallEarly'>): number {
  const arriving = snap.phase === 'waves' && snap.nextWaveIn >= 0 && !snap.canCallEarly;
  return arriving && snap.wave > 0 ? snap.wave - 1 : snap.wave;
}

/** The question the sheet asks before it ends the run (never a browser dialog). */
export function endRunQuestion(wave: number): string {
  return `End this run on wave ${wave}? It counts and can be posted.`;
}
