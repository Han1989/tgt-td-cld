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

## Structures: Medieval Hexagon, Medieval Builder, Dungeon (added 17 Oct 2026)

Three more KayKit packs, CC0 (each folder keeps the pack's own `LICENSE.txt`), for the towers, the Heart and the
portals (V-05d). Only the pieces the game maps are here; copy more from the packs when a row needs them.

| Folder | From | What |
|---|---|---|
| `hexagon/buildings/` | KayKit Medieval Hexagon Pack 1.0 (FREE) | `building_tower_A`, `_B`, `_base`, `_catapult` (round stone towers, a siege tower), `castle`, `windmill`, `blacksmith`, `church`, `mine`, `well` (the `_blue` variants: the painter remaps every material, so the colour does not matter), `building_destroyed`, `wall_corner_A_outside`, `wall_straight_gate`; glTF + `.bin`, UVs on `hexagon/hexagons_medieval.png` |
| `hexagon/props/` | same | `bucket_arrows`, `target`, `weaponrack`, `flag_red`, `resource_stone`, `barrel` |
| `builder/` | KayKit Medieval Builder Pack 1.0 (legacy) | `watchtower.glb`, `castle.glb`, `wall_gate.glb`, `wall_corner.glb` (binary glTF) |
| `dungeon/` | KayKit Dungeon Pack 1.1 (FREE) | `pillar`, `pillar_decorated`, `column`, `barrier_column`, `torch_lit`, `torch_mounted`, `candle_triple`, `wall_arched`, `wall_archedwindow_open`, two banners, `chest_gold`, `coin_stack_large`, `rubble_large`, `rubble_half`, `sword_shield_gold`; UVs on `dungeon/dungeon_texture.png` |

Kitbash mapping (V-05d; a tower is a base that never turns plus a turret that turns and recoils):

| Thing | Base | Turret / top | Tier 2 / 3 | Branches |
|---|---|---|---|---|
| Arrow tower | `building_tower_base` | `building_tower_A` top with `bucket_arrows` | taller (`tower_B`), `weaponrack`, two then four rune pillars (`pillar`) | Volley: a second bucket; the other branch: `target` banner |
| Cannon tower | `building_tower_base` | `building_tower_catapult` arm as the barrel | `blacksmith` chimney, braziers (`torch_lit`) | Shrapnel: `barrel`s; the other: a wider arm |
| Frost tower | `building_tower_base` | `building_tower_B` with a `church` spire | spire grows, `column`s | Blizzard / Glacier: tint and emissive only (no crystal model in the packs: make the ice an emissive tint on the spire) |
| Arcane tower | `pillar_decorated` ring | `church` spire, `candle_triple` | `banner_patternA_red`, `pillar_decorated` ×4 | Prism / Void: emissive colour, a second ring |
| Flak tower | `building_tower_base` | `windmill` sails as the rotor (turns, recoils by a kick) | `watchtower` cage, `flag_red` | the two branches: sail count and tint |
| Heart | `castle` (hexagon) on `building_tower_base` ×3 | `chest_gold` glow in the keep, `banner_shield_white` | damage: `rubble_half` under 60%, `building_destroyed` + `rubble_large` + fire under 30% | — |
| Portal | `wall_straight_gate` or `wall_arched` | `torch_mounted` ×2, the flare at wave start | — | — |

Tier runes stay the 2D language (no glow / 2 runes / 4 runes + gold): rune pillars and the gold accent are the
painter's emissives, not pack colours.

**As built (V-05d, `tools/blender/structures.py`, `docs/ART.md` §15).** Towers are rendered straight down (a turret
frame can only turn truly as a plan view), so every turret is a piece that points, and a few rows of the table above
changed: the Arrow turret is the Adventurers' `crossbow_2handed` (Sniper: the Skeletons' crossbow, longer); the Frost
turret the Adventurers' `sword_2handed` laid flat as an ice lance; the Arcane base the Hexagon `well` without its roof,
posts and bucket (a pool), its turret the Mage's `staff` (Prism adds `resource_stone` as a crystal, Void the Skeletons'
blades as thorns); the Flak square is four `barrier_column` walls (the Hexagon `wall_corner_A_outside` is a curved
piece that left the pad); the Heart is the Builder `castle` (the Hexagon castle is too tall seen from the south) and a
portal the Builder `wall_gate`, both seen from the south at 55°. The catapult, the tower base, the windmill rotor,
`bucket_arrows`, `barrel`, `torch_lit`, `pillar`, `column`, `candle_triple`, `pillar_decorated`, `chest_gold`,
`rubble_half` and `rubble_large` are used as the table says. The Builder `.glb` files colour by named material, not a
palette cell (`_repaint_named` in `tdt3d/structure.py`).
