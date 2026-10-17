// 3D heroes and creeps in a match (docs/ART.md §15): a hero or creep made in 3D gets its 3D rig once its sheet has
// loaded (`loadHeroSheets`, `loadCreepSheets`, a second or so after the first screen); before that, and in ?showcase's
// 2D cards, its 2D rig.

import type { CreepKind, HeroKind } from '@tdt/protocol';
import type { ArtKit } from '../art/kit';
import type { HeroRig } from '../art/registry';
import { Creep3DRig } from './creepRig';
import { creepFrames } from './creepSheet';
import { Hero3DRig } from './heroRig';
import { heroFrames } from './sheet';

export { Creep3DRig } from './creepRig';
export { creepSheetsVersion, loadCreepSheets } from './creepSheet';
export { Hero3DRig } from './heroRig';
export { loadHeroSheets } from './sheet';

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
