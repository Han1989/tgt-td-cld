// Pad zones (docs/MOBILE.md §2): which build pads exist in a match and who may build on them.
// Solo: the player owns every base pad. 2 players: West + the west half of Mid, and East + the
// east half of Mid. 3 players (the most a match holds): West / Mid / East, plus extra pads in each lane
// zone. Extra-pad amounts are in `tuning.pads`.

import type { PadSnap, PlayerId } from '@tdt/protocol';
import { PAD_ZONES, type BuildPad, type GameMap, type PadZone } from './map';
import type { GameState } from './state';
import type { Tuning } from './tuning';

/** A pad that exists in this match. `owner` null = anyone may build on it. */
export type PadState = PadSnap;

/** Index (into the player list) of the player who owns `pad` in a team of `players`. */
export function zoneOwnerIndex(pad: BuildPad, players: number): number {
  if (players <= 1) return 0;
  if (players === 2) return pad.half;
  return PAD_ZONES.indexOf(pad.zone);
}

/** How many extra pads each lane zone gets with `players` players. */
export function extraPadCount(tuning: Tuning, players: number): number {
  const table = tuning.pads.extraPerLaneZone;
  return table[Math.min(players, table.length) - 1] ?? 0;
}

/** The pads that exist for this team, with their owners, in map order. */
export function padLayout(map: GameMap, tuning: Tuning, playerIds: readonly PlayerId[]): PadState[] {
  const n = playerIds.length;
  const extrasLeft = new Map<PadZone, number>(PAD_ZONES.map((z) => [z, extraPadCount(tuning, n)]));
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
