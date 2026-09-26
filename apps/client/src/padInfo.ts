// Pad ownership as the client sees it (DOM-free, so it is unit-tested). The sim
// enforces the same rules; this only decides what a click on a pad does.

import type { PlayerId, Snapshot } from '@tdt/protocol';

export type PadStatus =
  /** The pad exists in this match and you may build on it. */
  | { kind: 'mine' }
  /** A teammate's pad: clicking it says whose it is. */
  | { kind: 'teammate'; owner: string }
  /** An extra pad that bigger teams unlock: not part of this match. */
  | { kind: 'absent' };

export function padStatus(snap: Snapshot | undefined, me: PlayerId | null, padId: number): PadStatus {
  const pad = snap?.pads.find((p) => p.id === padId);
  if (!pad) return { kind: 'absent' };
  if (pad.owner === null || pad.owner === me) return { kind: 'mine' };
  const name = snap?.players.find((p) => p.id === pad.owner)?.name ?? 'a teammate';
  return { kind: 'teammate', owner: name };
}
