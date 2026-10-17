// The creeps' layouts as the Blender pipeline wrote them (docs/ART.md §15, `npm run art:3d -- creeps`): loaded with
// the sheets after the first screen (creepSheet.ts imports this module when it starts), so the first screen carries
// none of it.

import type { CreepKind } from '@tdt/protocol';
import archer from './archer.json';
import brute from './brute.json';
import type { CreepLayout } from './creeps';
import grunt from './grunt.json';
import hatchling from './hatchling.json';
import ironhorn from './ironhorn.json';
import matriarch from './matriarch.json';
import runner from './runner.json';
import shardback from './shardback.json';
import wisp from './wisp.json';

/** Every creep kind is made in 3D (V-05c), in the order they first come in the waves (the order their sheets load). */
export const CREEP_3D: Record<CreepKind, CreepLayout> = {
  grunt: grunt as CreepLayout,
  runner: runner as CreepLayout,
  archer: archer as CreepLayout,
  brute: brute as CreepLayout,
  wisp: wisp as CreepLayout,
  ironhorn: ironhorn as CreepLayout,
  matriarch: matriarch as CreepLayout,
  hatchling: hatchling as CreepLayout,
  shardback: shardback as CreepLayout,
};
