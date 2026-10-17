# KayKit assets (CC0)

Third-party source models for the 3D hero pipeline (`docs/ART.md` §15), added 16 Oct 2026 as the replacement for
heroes modelled in code. Both packs are **Creative Commons Zero** by Kay Lousberg (www.kaylousberg.com): free for
commercial use, no attribution required (the `License.txt` in each folder is the pack's own). Only the glTF parts of
each pack are kept; the FBX/OBJ/Unity copies were left out.

| Folder | From | What |
|---|---|---|
| `adventurers/characters/` | KayKit Character Pack: Adventurers 2.0 (FREE) | `Knight.glb`, `Mage.glb`, `Ranger.glb`, `Rogue.glb`, `Rogue_Hooded.glb`, `Barbarian.glb`: rigged (Rig_Medium), no clips |
| `adventurers/assets/` | same | hand props: `bow.gltf`, `bow_withString.gltf`, `arrow_bow.gltf`, `quiver.gltf`, `staff.gltf`, `wand.gltf`, swords, shields… |
| `adventurers/textures/` | same | one palette texture per character |
| `adventurers/samples/` | same | the pack's own renders, for reference |
| `animations/rig_medium/` | KayKit Character Animations 1.1 | clips for Rig_Medium: `General` (Idle_A/B, Hit_A/B, Death_A/B…), `MovementBasic` (Walking_A/B/C, Running…), `CombatRanged` (Ranged_Bow_Draw, Ranged_Bow_Release, Ranged_Magic_Spellcasting, Ranged_Magic_Shoot…), `CombatMelee` (Melee_1H_Attack_Slice_*, Melee_Block…), `MovementAdvanced`, `Simulation`, `Tools`, `Special` |

Hero mapping (V-05b, `tools/blender/hero.py`): Warden ← `Knight.glb` (+ `sword_1handed`, `shield_round`), Arcanist ←
`Mage.glb` (+ `staff`), Ranger ← `Rogue_Hooded.glb` (+ `bow_withString`, `arrow_bow`, `quiver`). Runelight's palette
and lighting are applied at render time (`tools/blender/tdt3d/gltf.py` repaints every face from its palette cell to a
token; the painter, `tools/blender/tdt3d/npr.py`, lights and inks it), not by editing these files. None of them ships
to the client.

## Skeletons (added 17 Oct 2026)

| Folder | From | What |
|---|---|---|
| `skeletons/characters/` | KayKit Character Pack: Skeletons 1.1 (FREE), CC0 | `Skeleton_Minion.glb`, `Skeleton_Rogue.glb`, `Skeleton_Warrior.glb`, `Skeleton_Mage.glb`: rigged (Rig_Medium), no clips |
| `skeletons/assets/` | same | props: `Skeleton_Blade`, `Skeleton_Axe`, `Skeleton_Crossbow`, `Skeleton_Staff`, `Skeleton_Arrow*`, `Skeleton_Quiver`, four shields |
| `skeletons/textures/`, `skeletons/samples/` | same | the palette texture and the pack's own renders |

They share Rig_Medium with the Adventurers, so the clips in `animations/rig_medium/` fit them, including the `Special` pack's skeleton set (`Skeletons_Walking`, `Skeletons_Awaken_*`, `Skeletons_Death`, `Skeletons_Taunt`, `Skeletons_Spawn_Ground`).

Creep mapping (V-05c, `tools/blender/creeps.py`): Grunt ← Minion (+ `Skeleton_Blade`), Runner ← Rogue, Archer ← Minion + crossbow, Brute ← Warrior with axe and shield, each scaled to its radius in the game. The Wisps (flyers) and the three bosses are not in this pack (`../quaternius/monsters/`).
