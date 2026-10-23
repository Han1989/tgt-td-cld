# Meshy heroes (V-06a, added 22 Oct 2026)

The three heroes redesigned as original characters (**Han's decision of 22 Oct 2026**: the CC0 pack heroes were
generic and the game lost its identity), designed by Claude from the style sheet `docs/art/meshy-style.md` and
generated in Meshy: a concept image, image to 3D, auto-rig and preset clips. Session 1 (this folder) is assets only;
**session 2** puts them through the painter and the render-ahead-of-time pipeline (`docs/ART.md` §15), as V-05b did
with the KayKit models. Nothing here ships to the client (`apps/client/test/art3d.test.ts`).

**Licence:** Generated on a Meshy Pro plan, private licence, commercial use permitted. These are **not CC0** (unlike
`../kaykit/` and `../quaternius/`): they are this game's own assets.

**Two rounds.** Round 1 (PR #127, not merged) drew the designs with realistic proportions; **Han, 22 Oct 2026, 11:44:
the game's heroes are chibi**, so round 2 redraws the same three designs 2.5 heads tall, the in-game hero's stage
poster as the proportion reference. Round 2 is the one session 2 uses; round 1 stays for comparison. Contact sheet for
Han's phone, both rounds: `docs/art/meshy-heroes.png` (the in-game hero, each concept, then the rigged model's front,
three-quarter and back views at rest, rendered with three.js in headless Chromium).

| Folder | Round | Hero | The marks at phone size | Weapon |
|---|---|---|---|---|
| `ranger/` | 2, chibi | The Ranger: a hooded forest scout, moss green and leather ([README](ranger/README.md)) | the big hood with its leaf peak; the mask and two glinting eyes | a recurve bow in his left hand, part of the mesh |
| `warden/` | 2, chibi | The Warden: a heavy shield-captain, iron and ember ([README](warden/README.md)) | the ram-horn pauldron; the kite shield's ember rune | a sword and a kite shield, part of the mesh |
| `arcanist/` | V-06e, chibi | The Arcanist as the Hooded Oracle (Han, 23 Oct 2026): a battle-mage, violet and bone-white, her face hidden ([README](arcanist/README.md)) | the peaked hood swept back, with its trailing end; two violet eyes in its dark, the half-mask dark | none in the model: her crescent staff is a separate prop, `staff.glb` (kept from round 2) |
| `arcanist-r2/` | 2, chibi | round 2's Arcanist, the game's from V-06b to V-06d: the big hat, the white braid with violet rune beads, her face ([README](arcanist-r2/README.md)) | | her staff is `arcanist/staff.glb` |
| `ranger-r1/`, `warden-r1/`, `arcanist-r1/` | 1, realistic | the same designs, kept as PR #127 landed them | | in hand, part of the mesh |
| `arcanist-concepts/` | V-06e, images only | the Arcanist redesigned with her face hidden (Han, 23 Oct 2026): the Hooded Oracle and the Bone-Masked Seer, two images each; Han picked the Oracle, `oracle-a.png` ([README](arcanist-concepts/README.md)) | | concepts only: no model |

## What each hero folder holds

| File | What |
|---|---|
| `concept.png` | The concept image the model was made from (896 × 1200, `nano-banana-pro`; round 2's Arcanist, `arcanist-r2/`, also has `concept-bare.png`, the edit the model was made from; the Oracle's is her bare-handed edit flipped) |
| `model.glb` | The rigged, textured character in its bind pose, Meshy's `Character_output.glb` unchanged: about 30,800 triangles, one 2048 × 2048 JPEG base colour embedded (no separate texture file), 24 joints, facing glTF +Z, Y up |
| `walk.glb`, `run.glb` | The rig's free clips (armature only) |
| `idle.glb`, `attack.glb`, `cast.glb`, `hit.glb`, `death.glb` | One preset action each (the hero's README maps file → action), split from Meshy's bundled animation file into the armature-only format of `walk.glb` |

**Clip files are armature only.** Each clip file is the skeleton, its skin and Meshy's small bone-display mesh (288
triangles) with one clip, about 80–160 KB: the format Meshy itself returns for the rig's walk and run. The same clips
with the textured mesh are 4–5.5 MB each, the mesh of `model.glb` again, so they were not kept. A clip plays on
`model.glb` by joint name (the skeletons are the same), as the KayKit clips play on the KayKit characters
(`docs/ART.md` §15, "Clips by name").

**How the five action clips were split.** `meshy_animate` takes up to ten preset actions per call and returns them as
one file (the textured mesh with one clip per action, in the order asked). Each action's channels were copied onto the
same-named joints of the hero's walk file (its own clip removed), the keyframe arrays as they are: nothing re-timed,
re-sampled or retargeted. Round 1 did it with glTF-Transform and kept Meshy's walk and run files unchanged; round 2
with a scratch Python script that writes all seven files the same way and sets the bone display's zero-length normals
(on its degenerate faces, in Meshy's own files too) to +Y, so round 2's clip files pass the Khronos glTF validator
with no errors (one warning, which Meshy's models carry too: the skinned mesh is not a root node). Both rounds checked
every clip by playing it on its `model.glb` in three.js against the bundle's pose.

## The skeleton (Meshy's auto-rig) next to KayKit's Rig_Medium

All six models share one Mixamo-like skeleton of 24 joints, under an `Armature` node scaled 0.01 (the joints are in
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
release. No hand slots: a prop attached in session 2 hangs on `LeftHand` / `RightHand` with an offset. In round 2's
chibi figures the hips sit at about a third of the height (the Ranger's at 58 cm of 175).

## The one rig fault: weapons bend

Meshy's remesh welds each weapon into the body as one surface (each model is a single connected mesh), and the
auto-rig spreads the weapon's weights over the bones near it, so in motion the weapon bends like rubber. Both rounds
show it:

| | Round 1 | Round 2 |
|---|---|---|
| Ranger's bow | tips on `LeftShoulder` / `LeftArm` and `LeftLeg` / `LeftUpLeg` | lower limb ~57% `LeftLeg` / `LeftFoot`, the top shares `headfront` (the big head is next to it) |
| Warden's sword | 100% `RightHand` | 93–100% `RightHand` |
| Warden's shield | over the upper arm, forearm and hand | the lower half `LeftHand`, the top shared with `LeftForeArm` and `LeftArm` |
| Arcanist's staff | the foot 85–100% her thigh and shin | the foot on her leg, a piece of the crescent 97% `Head`: round 2 regenerated her bare-handed, the staff a separate prop |

**The fix (for session 2), tested here:** bind every vertex of the weapon 100% to one hand bone. The weapons stand
clear of the body in the bind pose, so a few boxes (or, for round 2's leaning bow, a slab) pick them out; each hero's
README gives them in `model.glb`'s bind-pose glTF coordinates (metres, x = the hero's left, y up, z forward; after
Blender's glTF import a mesh vertex at glTF (x, y, z) sits at (x, −z, y) in the mesh's own coordinates). Tried in
three.js on the walk, the run, the death, the attack, the cast and the hit: the weapons then stay rigid and nothing
else tears.

The brief said to regenerate a hero bare-handed when its weapon rigs badly (and attach the KayKit weapon on the
hand, as V-05b does). Round 1 kept all three weapons with the fix above; round 2 regenerated the Arcanist bare-handed
(her staff ran down beside her leg and its crescent was skinned to her head) and generated her staff as its own Meshy
prop, so her oversized crescent head, the signature piece Han's note names, survives: session 2 hangs `staff.glb` (or
the pack's staff) on `RightHand`.

## Open questions for session 2

- **Bone names:** the clips are Meshy's own skeleton, not Rig_Medium, so `tdt3d/figure.py` reads them by Meshy's
  names (table above); no clip needs retargeting, but the code that hangs props on `handslot.*` and names Rig_Medium
  bones needs a Meshy row.
- **Clip lengths:** idle 4.0 s; walk 1.07 s and run 0.67 s (cycles, in place); attacks 1.5–5.0 s and casts 2.7–7.8 s
  (longer than the 2D rigs' 420–700 ms poses: session 2 picks the moments, as V-05b sampled the KayKit clips); hit
  1.6–2.0 s; death 2.2 s. All 30 fps.
- **Root motion** (both rounds): the Warden's and the Arcanist's `Hit_Reaction` step 0.8–0.9 m sideways and the
  Warden's `Sword_Shout` ends 0.5 m forward; the deaths fall 0.7–0.8 m back (part of the fall). Every other clip stays
  within 0.2 m. Pin the hips' horizontal travel where a frame must stay on its spot.
- **Scale:** each model is rigged at a height in metres (Ranger 1.75, Warden 1.9, Arcanist 1.8, the weapons included
  in the bounds); `gltf.py` scales a figure to its 2D rig's height in world px anyway. Round 2's Warden is wider (1.94 m,
  sword to shield) than he is tall.
- **Painting:** the textures are painted base colour with soft light baked in, not KayKit's palette cells, so
  `gltf.py`'s repaint by palette cell does not apply; the painter needs another way to reach Runelight's tokens
  (sampled colours to tokens, or the texture toned as it is). Round 2's textures are flatter (two tones a material).
- **Chibi and the clips:** the clips are made for adult proportions. With the big heads and short arms, the Ranger's
  draw hand comes back into his hood's face, the Arcanist's raised hand dips into her hat brim, and the Warden's helm
  dips far forward in the slash: pick the frames with care.
- **The bow string** is welded and never flexes (both rounds): draw it as a line from the tips to the hand, or delete
  the bow and hang the pack's `bow_withString` (its string a shape key) on `LeftHand`.
