// How a lane surge is shown (docs/REPLAYABILITY.md §2): the toast a wave ahead and the chips under the top of the
// map. Display text only; the surge event and `snapshot.surgeLane` / `nextSurge` carry the facts.

import { laneName, type LaneId } from '@tdt/protocol';

export interface SurgeToastCopy {
  lane: LaneId;
  title: string;
  sub: string;
}

/** Toast for a `surge` event. The lane and the wave come from the event. */
export function surgeToastCopy(notice: { wave: number; lane: LaneId }): SurgeToastCopy {
  return {
    lane: notice.lane,
    title: laneName(notice.lane),
    sub: `Surge · wave ${notice.wave}`,
  };
}

export interface SurgeFlagCopy {
  lane: LaneId;
  title: string;
  sub: string;
}

export interface MatchFlagFace {
  /** This wave's pile, or null when the creeps are spread across the lanes. */
  now: SurgeFlagCopy | null;
  /** Announced a wave ahead. */
  next: SurgeFlagCopy | null;
}

export function matchFlagFace(snap: { surgeLane: LaneId | null; nextSurge: { wave: number; lane: LaneId } | null }): MatchFlagFace {
  return {
    now: snap.surgeLane == null ? null : { lane: snap.surgeLane, title: laneName(snap.surgeLane), sub: 'Surge now' },
    next: snap.nextSurge
      ? { lane: snap.nextSurge.lane, title: laneName(snap.nextSurge.lane), sub: 'Surge next' }
      : null,
  };
}
