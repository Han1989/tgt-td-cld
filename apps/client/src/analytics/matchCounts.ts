// The anonymous match counts (docs/ANALYTICS.md "Before the age question"): from the snapshots a player sees, a match
// started (one second of match time), played a minute (60 s), ended, and a second match in the same page load. Pure:
// the game view feeds it and hands what it returns to the counter (install.ts `countMatch`), which sends each kind at
// most once per page load and only when `countOn` allows it. Never fed by the stress scene (no analytics there).

import type { MatchSample } from './matchTracker';

export type MatchCountKind = 'match_start' | 'match_minute' | 'match_end' | 'match_second';

/** Match time for `match_minute`, in seconds. */
export const MATCH_MINUTE_S = 60;

export class MatchCounts {
  private lastTick = -1;
  /** Snapshots of this match seen while it was still being played. */
  private live = 0;
  private started = false;
  private minute = false;
  private ended = false;
  /** Matches started in this page load. */
  private starts = 0;

  /** A new transport (another match, or the lobby). The page load's matches are kept. */
  reset(): void {
    this.lastTick = -1;
    this.newMatch();
  }

  feed(snap: Pick<MatchSample, 'tick' | 'tickRate' | 'phase'>): MatchCountKind[] {
    if (snap.tick < this.lastTick) this.newMatch();
    this.lastTick = snap.tick;
    const over = snap.phase === 'victory' || snap.phase === 'defeat';
    const out: MatchCountKind[] = [];
    if (!over) this.live++;
    // As MatchTracker: a second in, and never a match already over when first seen (a rejoin after the end).
    if (!this.started && this.live > 0 && (over || snap.tick >= snap.tickRate)) {
      this.started = true;
      this.starts++;
      out.push('match_start');
      if (this.starts === 2) out.push('match_second');
    }
    if (!this.started) return out;
    if (!this.minute && !over && snap.tickRate > 0 && snap.tick >= MATCH_MINUTE_S * snap.tickRate) {
      this.minute = true;
      out.push('match_minute');
    }
    if (over && !this.ended) {
      this.ended = true;
      out.push('match_end');
    }
    return out;
  }

  private newMatch(): void {
    this.live = 0;
    this.started = false;
    this.minute = false;
    this.ended = false;
  }
}
