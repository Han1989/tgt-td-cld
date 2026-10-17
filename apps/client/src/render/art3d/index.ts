// 3D heroes, creeps, towers, the Heart and the portals in a match (docs/ART.md §15): each gets its 3D rig or view once
// its sheet has loaded (`loadStructureSheet`, `loadCreepSheets`, `loadHeroSheets`, after the map plate, a second or so
// after the first screen); before that, and in ?showcase's 2D cards, its 2D art.

import { TOWER_BRANCHES, type CreepKind, type HeroKind, type TowerKind } from '@tdt/protocol';
import type { ArtKit } from '../art/kit';
import type { HeroRig } from '../art/registry';
import { Creep3DRig } from './creepRig';
import { creepFrames } from './creepSheet';
import { Hero3DRig } from './heroRig';
import { heroFrames } from './sheet';
import { Heart3DView, Portal3DView } from './buildings';
import { structureFrames } from './structureSheet';
import { Tower3DRig } from './towerRig';

export { Creep3DRig } from './creepRig';
export { creepSheetsVersion, loadCreepSheets } from './creepSheet';
export { Hero3DRig } from './heroRig';
export { loadHeroSheets } from './sheet';
export { Heart3DView, Portal3DView, PORTAL_FLARE, PORTAL_OPENING } from './buildings';
export { loadStructureSheet, structuresVersion } from './structureSheet';
export { Tower3DRig } from './towerRig';

/** The hero's 3D rig, or null while it has none (its sheet not loaded yet, or it failed). */
export function heroRig3d(kind: HeroKind, kit: ArtKit, mine: boolean): HeroRig | null {
  const frames = heroFrames(kind);
  return frames ? new Hero3DRig(kit, kind, mine, frames) : null;
}

/** The creep kind's 3D rig, or null while it has none (its sheet not loaded yet, or it failed). */
export function creepRig3d(kind: CreepKind, kit: ArtKit): Creep3DRig | null {
  const frames = creepFrames(kind);
  return frames ? new Creep3DRig(kit, kind, frames) : null;
}

/** Whether the creep kind's 3D sheet is in. */
export function hasCreep3d(kind: CreepKind): boolean {
  return creepFrames(kind) !== undefined;
}

/** The tower kind's 3D rig, or null while it has none (the structures sheet not loaded yet, failed, or without it). */
export function towerRig3d(kind: TowerKind, kit: ArtKit): Tower3DRig | null {
  const sheet = structureFrames();
  return sheet && Tower3DRig.covers(sheet, kind, ['1', '2', '3', ...TOWER_BRANCHES[kind]]) ? new Tower3DRig(kit, kind, sheet) : null;
}

/** The Heart's 3D view, or null while it has none. */
export function heartView3d(): Heart3DView | null {
  const sheet = structureFrames();
  return sheet && Heart3DView.covers(sheet) ? new Heart3DView(sheet) : null;
}

/** A portal's 3D view, or null while it has none. */
export function portalView3d(): Portal3DView | null {
  const sheet = structureFrames();
  return sheet && Portal3DView.covers(sheet) ? new Portal3DView(sheet) : null;
}
