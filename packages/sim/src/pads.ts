// Pad zones (docs/MOBILE.md §2): which build pads exist in a match and who may build on them.
// Solo: the player owns every base pad. 2 players: West + the west half of Mid, and East + the
// east half of Mid. 3 players: West / Mid / East, plus extra pads in each lane zone. 4 players:
// the same plus a Core zone of extra pads. Extra-pad amounts are in `tuning.pads`.

import type { PadSnap, PlayerId } from '@tdt/protocol';
import type { BuildPad, GameMap, PadZone } from './map';
import type { GameState } from './state';
import type { Tuning } from './tuning';

/** A pad that exists in this match. `owner` null = anyone may build on it. */
export type PadState = PadSnap;

const LANE_ZONES: PadZone[] = ['west', 'mid', 'east'];

/** Index (into the player list) of the player who owns `pad` in a team of `players`. */
export function zoneOwnerIndex(pad: BuildPad, players: number): number {
  if (players <= 1) return 0;
  if (players === 2) return pad.half;
  switch (pad.zone) {
    case 'west':
      return 0;
    case 'mid':
      return 1;
    case 'east':
      return 2;
    case 'core':
      return players >= 4 ? 3 : 1;
  }
}

/** How many extra pads of `zone` exist with `players` players. */
export function extraPadCount(tuning: Tuning, zone: PadZone, players: number): number {
  const table = zone === 'core' ? tuning.pads.core : tuning.pads.extraPerLaneZone;
  return table[Math.min(players, table.length) - 1] ?? 0;
}

/** The pads that exist for this team, with their owners, in map order. */
export function padLayout(map: GameMap, tuning: Tuning, playerIds: readonly PlayerId[]): PadState[] {
  const n = playerIds.length;
  const extrasLeft = new Map<PadZone, number>([...LANE_ZONES, 'core' as const].map((z) => [z, extraPadCount(tuning, z, n)]));
  const pads: PadState[] = [];
  for (const pad of map.pads) {
    if (pad.extra) {
      const left = extrasLeft.get(pad.zone) ?? 0;
      if (left <= 0) continue;
      extrasLeft.set(pad.zone, left - 1);
    }
    pads.push({ id: pad.id, owner: playerIds[zoneOwnerIndex(pad, n)] ?? null });
  }
  return pads;
}

/** Why `playerId` may not build on pad `padId` right now, or null if they may. */
export function padBlocker(state: GameState, playerId: PlayerId, padId: number): string | null {
  const pad = state.pads.find((p) => p.id === padId);
  if (!pad) return 'No build pad there';
  if (pad.owner !== null && pad.owner !== playerId) {
    const name = state.players.find((p) => p.id === pad.owner)?.name ?? 'a teammate';
    return `That pad belongs to ${name}`;
  }
  if (state.towers.some((t) => t.padId === padId && !t.dead)) return 'Pad is occupied';
  return null;
}
