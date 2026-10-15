// 3D heroes in a match (docs/ART.md §15): a hero made in 3D gets its 3D rig once its sheet has loaded
// (`loadHeroSheets`, a second or so after the first screen); before that, and in ?showcase, its 2D rig.

import type { HeroKind } from '@tdt/protocol';
import type { ArtKit } from '../art/kit';
import type { HeroRig } from '../art/registry';
import { Ranger3DRig } from './rangerRig';
import { heroFrames } from './sheet';

export { loadHeroSheets } from './sheet';

/** The hero's 3D rig, or null while it has none (not made in 3D yet, or its sheet not loaded). */
export function heroRig3d(kind: HeroKind, kit: ArtKit, mine: boolean): HeroRig | null {
  const frames = heroFrames(kind);
  if (!frames) return null;
  if (kind === 'ranger') return new Ranger3DRig(kit, mine, frames);
  return null;
}
