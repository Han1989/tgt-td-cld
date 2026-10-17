// 3D heroes in a match (docs/ART.md §15): a hero made in 3D gets its 3D rig once its sheet has loaded
// (`loadHeroSheets`, a second or so after the first screen); before that, and in ?showcase, its 2D rig.

import type { HeroKind } from '@tdt/protocol';
import type { ArtKit } from '../art/kit';
import type { HeroRig } from '../art/registry';
import { Hero3DRig } from './heroRig';
import { heroFrames } from './sheet';

export { Hero3DRig } from './heroRig';
export { loadHeroSheets } from './sheet';

/** The hero's 3D rig, or null while it has none (its sheet not loaded yet, or it failed). */
export function heroRig3d(kind: HeroKind, kit: ArtKit, mine: boolean): HeroRig | null {
  const frames = heroFrames(kind);
  return frames ? new Hero3DRig(kit, kind, mine, frames) : null;
}
