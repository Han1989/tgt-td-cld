// The bot teammate of a solo match (q6, docs/GAME_DESIGN.md "Bot teammate"): when one plays, and the one-time line that
// teaches its combo. Pure, tested.

import type { HeroKind, Snapshot } from '@tdt/protocol';
import { allyHeroFor } from '@tdt/sim';
import type { SoloMatch } from '../tutorial/logic';

/**
 * The bot teammate's hero for a solo match, or null: Play solo in Full or Quick with ⚙ "Bot teammate" on. Never the
 * lesson, Endless or the Daily run (which never asks).
 */
export function soloAlly(match: SoloMatch, on: boolean): HeroKind | null {
  if (!on || match.lesson || match.mode === 'endless') return null;
  return allyHeroFor(match.hero);
}

/** The one-time line: your R and the ally's both ready with creeps out. */
export const ALLY_HINT = 'Your ally is ready: cast R together for a combo';

/** Whether the snapshot is the moment for the one-time line: your ultimate and the bot teammate's both ready, creeps out. */
export function allyHintDue(snap: Snapshot, me: string | null): boolean {
  if (snap.creeps.length === 0 || snap.phase !== 'waves') return false;
  const ally = snap.players.find((p) => p.bot);
  if (!ally) return false;
  const ready = (heroId: number) => {
    const h = snap.heroes.find((x) => x.id === heroId);
    const r = h?.skills.find((s) => s.slot === 'R');
    return !!h && h.alive && !!r && r.rank > 0 && r.cooldown === 0;
  };
  const mine = snap.players.find((p) => p.id === me);
  return !!mine && ready(mine.heroId) && ready(ally.heroId);
}

/** The people in a match: every seat but the bot teammate's (solo with an ally is still solo). */
export function humanCount(snap: Pick<Snapshot, 'players'>): number {
  return snap.players.filter((p) => !p.bot).length;
}
