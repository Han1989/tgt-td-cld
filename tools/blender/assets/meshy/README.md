# Meshy heroes (V-06a, added 22 Oct 2026), creeps (V-06i and V-06j, 24 Oct 2026) and wards (V-06l, 24 Oct 2026)

The three heroes redesigned as original characters (**Han's decision of 22 Oct 2026**: the CC0 pack heroes were
generic and the game lost its identity), designed by Claude from the style sheet `docs/art/meshy-style.md` and
generated in Meshy: a concept image, image to 3D, auto-rig and preset clips. Session 1 (this folder) is assets only;
**session 2** puts them through the painter and the render-ahead-of-time pipeline (`docs/ART.md` §15), as V-05b did
with the KayKit models. Nothing here ships to the client (`apps/client/test/art3d.test.ts`).

**Licence:** Generated on a Meshy Pro plan, private licence, commercial use permitted (the creeps of V-06i and V-06j and the
wards of V-06l on a Meshy Premium plan, the same terms). These are **not CC0** (unlike `../kaykit/` and `../quaternius/`): they are this game's
own assets.

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
| `enemy-concepts/` | V-06h, images only | the enemy faction, the Spire's host (Han, 24 Oct 2026): nine kinds, two concepts each, by the faction sheet `docs/art/enemy-style.md`; the picks marked for Han ([README](enemy-concepts/README.md)) | | concepts only: no model |
| `wards-concepts/` | V-06l, images only | the towers, the Heart and the portals designed as one faction, the Spire's wards (Han, 24 Oct 2026), in two themes (A medieval, B East Asian), by the style sheet `docs/art/wards-style.md`; Han picks a theme ([README](wards-concepts/README.md)) | | concepts only: no model |
| `creeps/grunt/`, `creeps/archer/`, `creeps/runner/`, `creeps/brute/` | V-06i, enemy batch 1 | the four ground creeps from Han's picks (Grunt a, Archer a, Runner b, Brute b), the game's since V-06i (24 Oct 2026): a README a kind ([Grunt](creeps/grunt/README.md), [Archer](creeps/archer/README.md), [Runner](creeps/runner/README.md), [Brute](creeps/brute/README.md)) | the ember eye sockets and core; the Grunt's notched cleaver, the Archer's tall bow, the Runner's bird legs and tail, the Brute's iron yoke | the Grunt's cleaver and the Archer's bow, part of the mesh (the Archer's model mirrored before its rig: its bow in its left hand) |
| `creeps/wisp/`, `creeps/hatchling/`, `creeps/ironhorn/`, `creeps/matriarch/`, `creeps/shardback/` | V-06j, enemy batch 2 | the Wisp, the Hatchling and the three bosses from Han's picks (Wisp b, Hatchling b, Ironhorn a without its tufts, Matriarch a with her brood cage raised into her ribs, Shardback b), the game's since V-06j (24 Oct 2026): a README a kind ([Wisp](creeps/wisp/README.md), [Hatchling](creeps/hatchling/README.md), [Ironhorn](creeps/ironhorn/README.md), [Matriarch](creeps/matriarch/README.md), [Shardback](creeps/shardback/README.md)) | the Wisp's skull-lantern and flame, the Hatchling's shell on eight legs, the Ironhorn's horns and iron plates, the Matriarch's crown and her brood of ember eggs, the Shardback's ridge of shards (ember at rest) | none; only the Matriarch is rigged: the Wisp and the Hatchling need no skeleton, and Meshy's rig stood the two four-legged bosses on their hind legs (tried once each), so these four are posed from their bind pose |
| `wards/arrow/`, `wards/cannon/`, `wards/frost/`, `wards/arcane/`, `wards/flak/` | V-06l, the Spire's wards, batch 1 | the five towers from theme A, Han's pick (24 Oct 2026, 18:51), the game's since V-06l: a tier-1 body and its turret a kind, each from an image edit of the concept, no rig (a README a kind: [Arrow](wards/arrow/README.md), [Cannon](wards/cannon/README.md), [Frost](wards/frost/README.md), [Arcane](wards/arcane/README.md), [Flak](wards/flak/README.md)) | the Arrow's ballista on a narrow tower, the Cannon's stone-thrower on an octagonal bastion, the Frost's ice lance over its column, the Arcane's crystal staff on its slate dome, the Flak's six-sailed rotor in a square | the turret is its own model; a welded moving part (the thrower's arm, the rotor's sails) is posed from its vertices in the pipeline |

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

## The creeps (V-06i, enemy batch 1)

`creeps/<kind>/` holds the four ground creeps of the Spire's host (`docs/art/enemy-style.md`), made from Han's picks
of `enemy-concepts/` the way the heroes were made, with three differences:

- **A pose, not a new design.** `meshy_image_to_image` (`nano-banana-pro`) put each pick into a clean pose for the rig,
  facing the picture's left (the Grunt and the Runner flipped first); the Runner stands as a raptor stands. One image a
  kind but the Archer (three: the edit never thickened its limbs nor opened its pose; the first is kept).
- **A third of a hero's triangles:** `meshy_image_to_3d` remeshed to 20,000 (creeps are drawn at 4 px per world px).
- **The same skeleton, different faults.** The rig is the heroes' 24 joints, but the auto-rig skinned more of each creep
  to the wrong bone (a tail to a shin, a cage of ribs or a yoke to a collarbone, fists to the feet beside them), and the
  Runner, a raptor, was rigged as a biped. `tools/blender/creeps.py` rebinds each part whole to one bone, thickens thin
  limbs and holds the Runner's spine at its bind pose (its README and each kind's say how).

The clips are split as the heroes' (above), with the action ids in each README. The Archer's model is mirrored (its
README): Meshy's archery clips hold a bow in the left hand. 292 credits for the four (2,226 → 1,934).

## The creeps, batch 2 (V-06j)

`creeps/wisp/`, `creeps/hatchling/`, `creeps/ironhorn/`, `creeps/matriarch/` and `creeps/shardback/` finish the host
(Han's picks, 24 Oct 2026), made as batch 1 was, with these differences:

- **One model with no skeleton for four of them.** The Wisp (a bob drawn by the rig) and the Hatchling (a hop) need no
  rig (Han's brief), and `meshy_rig` (for bipeds) took the Ironhorn and the Shardback but its clips stood them up on
  their hind legs (tried once each, 5 credits each, not used). Their `model.glb` is the image to 3D's own; the pipeline
  poses it from its bind pose (`tools/blender/tdt3d/posed.py`): a leg swung, the body pitched about its hind feet,
  squashed, rolled, lifted. The Matriarch is rigged and plays her own clips.
- **The bosses at 30,000 triangles** (the Wisp and the Hatchling at 20,000): a boss is drawn at 3 px per world px but
  three times a creep's size.
- **The Matriarch took three image edits and two models:** her eggs had to move up into her ribs (Han's note), and the
  first model, made from eggs drawn as a glow behind the ribs, lost them.
- 279 credits in all (the Wisp 39, the Hatchling 39, the Ironhorn 44, the Shardback 44, the Matriarch 113):
  `meshy_check_balance` 1,934 before, 1,655 after.
