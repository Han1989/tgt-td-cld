# Meshy heroes (V-06a, added 22 Oct 2026)

The three heroes redesigned as original characters (**Han's decision of 22 Oct 2026**: the CC0 pack heroes were
generic and the game lost its identity) and generated in Meshy: designed by Claude from the style sheet
`docs/art/meshy-style.md` (one style paragraph that every prompt starts with, and a brief per hero), then text to
image, image to 3D, auto-rig and preset clips. Session 1 (this folder) is assets only; **session 2** puts them through
the painter and the render-ahead-of-time pipeline (`docs/ART.md` §15), as V-05b did with the KayKit models. Nothing
here ships to the client (`apps/client/test/art3d.test.ts`).

**Licence:** Generated on a Meshy Pro plan, private licence, commercial use permitted. These are **not CC0** (unlike
`../kaykit/` and `../quaternius/`): they are this game's own assets.

| Folder | Hero | The two marks at phone size | Kept attempt |
|---|---|---|---|
| `ranger/` | The Ranger: a hooded forest scout, moss green and leather | the curled leaf-peaked hood; a tall recurve bow with bone tips (left hand) | 2 of 2 ([README](ranger/README.md)) |
| `warden/` | The Warden: a heavy shield-captain, iron and ember | the ram-horn pauldron; the kite shield's ember rune (and the ember eyes in the T-visor) | 1 of 1 ([README](warden/README.md)) |
| `arcanist/` | The Arcanist: a battle-mage woman, violet and bone-white | the bone-white braid with violet rune beads; the crescent staff with its violet crystal | 1 of 1 ([README](arcanist/README.md)) |

Contact sheet for Han's phone: `docs/art/meshy-heroes.png` (each concept, then the rigged model's front, three-quarter
and back views at rest, rendered with three.js in headless Chromium).

## What each hero folder holds

| File | What |
|---|---|
| `concept.png` | The concept image the model was made from (896 × 1200, Meshy text to image, `nano-banana-pro`) |
| `model.glb` | The rigged, textured character in its bind pose (an A-pose), Meshy's `Character_output.glb`, unchanged: about 30,800 triangles, one 2048 × 2048 JPEG base colour embedded (no separate texture file), 24 joints, facing glTF +Z, Y up |
| `walk.glb`, `run.glb` | The rig's free clips, Meshy's armature-only files (`Animation_Walking_withSkin_armature.glb`, `Animation_Running_withSkin_armature.glb`), unchanged |
| `idle.glb`, `attack.glb`, `cast.glb`, `hit.glb`, `death.glb` | One preset action each (the hero's README maps file → action), split from Meshy's bundled animation file into the armature-only format of `walk.glb` (below) |

**Clip files are armature only.** Each clip file is the skeleton, its skin and a small bone-display mesh (288
triangles) with one clip, about 80–160 KB, the format Meshy itself returns for the rig's walk and run. The
same clips with the textured mesh are 5–5.5 MB each, the mesh of `model.glb` again, so they were not kept. A clip plays
on `model.glb` by joint name (the skeletons are the same: rest transforms agree to 0.00005 cm), as the KayKit clips
play on the KayKit characters (`docs/ART.md` §15, "Clips by name"); checked by playing every clip on its model in
three.js.

**How the five action clips were split.** `meshy_animate` takes up to ten preset actions per call and returns them as
one file (`merged_animations.glb`, the textured mesh with one clip per action, in the order asked). Each action's clip
was copied into a copy of the hero's `walk.glb` (its clip removed), channel by channel onto the same-named joints, the
keyframe arrays copied as they are (glTF-Transform 4.1, a scratch script); every output was read back and compared
with the bundle key for key. Nothing was re-timed, re-sampled or retargeted.

## The skeleton (Meshy's auto-rig) next to KayKit's Rig_Medium

All three share one Mixamo-like skeleton of 24 joints, under an `Armature` node scaled 0.01 (the joints are in
centimetres; the mesh's bind-pose positions are in metres, 0 at the soles):

```
Armature
  char1 (the skinned mesh)
  Hips
    Spine02 > Spine01 > Spine
      neck > Head > head_end, headfront
      LeftShoulder > LeftArm > LeftForeArm > LeftHand
      RightShoulder > RightArm > RightForeArm > RightHand
    LeftUpLeg > LeftLeg > LeftFoot > LeftToeBase
    RightUpLeg > RightLeg > RightFoot > RightToeBase
```

| Meshy | Rig_Medium (KayKit) |
|---|---|
| (none) | `root` |
| `Hips` | `hips` |
| `Spine02`, `Spine01`, `Spine` | `spine`, `chest` (three spine joints, not two) |
| `neck` | (none) |
| `Head`, `head_end`, `headfront` | `head` |
| `LeftShoulder` | (none: Rig_Medium has no clavicle) |
| `LeftArm`, `LeftForeArm` | `upperarm.l`, `lowerarm.l` |
| `LeftHand` | `wrist.l`, `hand.l` |
| (none) | `handslot.l` (the prop socket) |
| `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftToeBase` | `upperleg.l`, `lowerleg.l`, `foot.l`, `toes.l` |

(and the same for the right side). No finger joints: the hands are rigid mitts, so a draw hand never opens on a
release. No hand slots: a prop attached in session 2 hangs on `LeftHand` / `RightHand` with an offset.

## The one rig fault all three share: weapons bend

Meshy's remesh welds each weapon into the body as one surface (each model is a single connected mesh), and the
auto-rig spreads the weapon's weights over the bones near it: the Ranger's bow tips over his shoulder and thigh, the
Warden's shield over his upper arm, forearm and hand, the Arcanist's staff foot over her legs. In motion the weapon
bends like rubber (the staff like a rope). The sword alone came out 100% on `RightHand`.

**The fix (for session 2), tested here:** bind every vertex of the weapon 100% to one hand bone. The weapons stand
clear of the body in the bind pose, so a few boxes pick them out (each hero's README gives them, in `model.glb`'s
bind-pose glTF coordinates: metres, X = the hero's left, Y up, Z forward; after Blender's glTF import a mesh vertex at
glTF (x, y, z) sits at (x, −z, y) in the mesh's own coordinates). Tried in three.js on the walk, run and death clips: the bow, the shield and
the staff then stay rigid (`docs/art/meshy-heroes.png` shows the rest pose only).

The brief said to regenerate a hero bare-handed when its weapon rigs badly (and attach the KayKit weapon on the hand,
as V-05b does). That was not done: the fix above keeps the designed weapons, two of each hero's identity marks, and
costs no credits; a KayKit prop would bring the packs' generic look back next to Meshy's painted texture. Regenerating
bare-handed stays open (about 60 credits a hero) if Han prefers it.

## Open questions for session 2

- **Bone names:** the clips are Meshy's own skeleton, not Rig_Medium, so `tdt3d/figure.py` reads them by Meshy's
  names (table above); no clip needs retargeting, but the code that hangs props on `handslot.*` and names Rig_Medium
  bones needs a Meshy row.
- **Clip lengths:** idle 4.0 s; walk 1.07 s and run 0.67 s (cycles, in place); attacks 1.5–5.0 s and casts 2.7–7.8 s
  (longer than the 2D rigs' 420–700 ms poses: session 2 picks the moments, as V-05b sampled the KayKit clips); hit
  1.6–2.0 s; death 2.2 s. All 30 fps.
- **Root motion:** the Warden's and the Arcanist's `Hit_Reaction` step 0.8–0.9 m sideways and the Warden's
  `Sword_Shout` ends 0.5 m forward; the deaths fall 0.7–0.8 m back (part of the fall). Pin the hips' horizontal
  travel where a frame must stay on its spot.
- **Scale:** each model is rigged at a height in metres (Ranger 1.75, Warden 1.9, Arcanist 1.8, the bow and staff
  tips included in the bounds); `gltf.py` scales a figure to its 2D rig's height in world px anyway.
- **Painting:** the textures are painted base colour with soft light baked in, not KayKit's palette cells, so
  `gltf.py`'s repaint by palette cell does not apply; the painter needs another way to reach Runelight's tokens
  (sampled colours to tokens, or the texture toned as it is).
- **The weapon fix** above, and the root-motion and hand-slot rows.
