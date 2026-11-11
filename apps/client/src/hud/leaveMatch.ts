// ⚙ → Back to lobby (q1, Han's laptop run of 11 Nov 2026: no way out of a solo match but closing the app). Pure, tested.

/** What the Settings sheet knows about the match on screen. */
export interface MatchOnScreen {
  /** A match is attached to the view (solo, the lesson, the Daily run, Endless, or an online room's). */
  attached: boolean;
  /** It is an online room's match: those keep Leave room on the end card, and nothing here. */
  online: boolean;
}

/** Settings shows "Back to lobby" during a solo match only (Play solo, Learn to play, the Daily run, Endless). */
export function settingsLeaveShown(m: MatchOnScreen): boolean {
  return m.attached && !m.online;
}

/** The question the sheet asks before it leaves (never a browser dialog). */
export const LEAVE_QUESTION = "Leave this match? It won't be saved.";
