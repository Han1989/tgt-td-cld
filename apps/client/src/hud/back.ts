// "<name> is back" (q12): a teammate who was away is in the match again (they rejoined, or their seat was taken by the
// room code under a new nickname). Pure: the HUD keeps the last presence and toasts each line.

import type { PlayerId, PlayerSnap } from '@tdt/protocol';

/** Who was connected in the last snapshot, by player id. */
export type PresenceMap = ReadonlyMap<PlayerId, boolean>;

export function presenceOf(players: readonly PlayerSnap[]): Map<PlayerId, boolean> {
  return new Map(players.map((p) => [p.id, p.connected]));
}

/** The lines to show: each teammate (never you, never the bot teammate) away in `before` and connected now. */
export function backLines(before: PresenceMap | null, players: readonly PlayerSnap[], me: PlayerId | null): string[] {
  if (!before) return [];
  return players.filter((p) => p.id !== me && !p.bot && p.connected && before.get(p.id) === false).map((p) => `${p.name} is back`);
}
