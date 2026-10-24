# The Matriarch (V-06j, enemy batch 2)

A boss, the host's broodmother: tall, thin and hunched, a long bone skull under a crown of spikes running down her
neck and spine as a crest, long clawed fingers, and in the cage of her ribs a brood of ember eggs. Han's pick **Matriarch
a** (`../../enemy-concepts/matriarch-a.png`) with **her brood cage bigger and raised into her ribs** (Han's note), made
into the game's Matriarch on 24 Oct 2026. Designed by Claude, generated in Meshy. **Generated on a Meshy Premium plan,
private licence, commercial use permitted.**

| File | What |
|---|---|
| `concept.png` | the image the model was made from: the third image edit (896 × 1200): her eggs solid, filling her ribcage, her pelvis bare, her arms down and out |
| `model.glb` | the rigged, textured model, Meshy's `Character_output.glb` unchanged: 31,162 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, Meshy's 24-joint skeleton (`../../README.md`), facing glTF +Z; 5.9 MB |
| `walk.glb`, `run.glb` | the rig's free clips (armature only) |
| `idle.glb`, `attack.glb`, `hit.glb`, `death.glb` | the clips the game uses (below) |
| `attack-b.glb`, `scream.glb`, `walk-monster.glb` | clips tried and not used (below) |

Clip files are armature only (the skeleton, Meshy's 288-triangle bone display and one clip), split from Meshy's bundled
animation file onto the joints of the rig's own walk file, the keyframes as they are, the bone display's zero-length
normals set to +Y; the same format as the heroes' and batch 1's (`../../README.md`, "How the five action clips were
split"). They play on `model.glb` by joint name.

## Meshy tasks (24 Oct 2026)

| Step | Task id | Credits | |
|---|---|---|---|
| Pose 1 (image to image) | `01a16ca7-7cbf-77b1-895b-320b55cb0ffd` | 9 | not used: the loincloth gone, but the eggs still low in her belly |
| Pose 2 (image to image, from pose 1) | `01a16ca8-de57-734d-9984-d09ee3f30d04` | 9 | not used: the eggs up in her ribs, but only as a glow behind them; her far arm opened |
| Pose 3 (image to image, from pose 2) | `01a16cab-b42b-7791-b9ef-0c348078e0da` | 9 | **kept** (`concept.png`): six solid eggs filling the ribcage |
| Model 1 (image to 3D, from pose 2) | `01a16ca9-a327-7166-97b7-802f2455e12e` | 30 | not used: **the eggs were lost** (an empty cage), the pick's signature mark, so a second attempt was made |
| Model 2 (image to 3D, from pose 3) | `01a16cac-71f7-73f0-8c24-e38fcc0e6f57` | 30 | **kept**, attempt 2 of 2 |
| Rig | `01a16cae-107e-752d-8b70-57a57ec34149` | 5 | `model.glb`, `walk.glb`, `run.glb`; `height_meters` 1.6 |
| Clips | `01a16cae-e034-7038-b636-4d4d1295d8a3` | 21 | `action_ids` [0, 128, 92, 386, 178, 189, 112] |
| | | **113** | |

## Settings

`meshy_image_to_image`: `nano-banana-pro`, 3:4, one reference (pose 1: the pick; poses 2 and 3: the edit before).
`meshy_image_to_3d` from pose 3: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false,
`should_remesh` true, `target_polycount` 30000 (a boss), `topology` triangle, no `pose_mode`, `target_formats`
["glb"].

## The prompts (image to image)

Pose 1 (reference: `matriarch-a.png`):

```text
Redraw exactly this creature: the same original design, proportions, colours and finish, a chibi risen broodmother of bone and ember, a boss in a stylised 3D game like a small collectible vinyl toy. Keep every mark: the long bone skull like a long mask with its eye sockets glowing ember-orange, the tall crown of bone spikes on her head running down her neck and spine as a crest of spikes, the long thin bone arms with long clawed bone fingers, the long thin bone legs, the ember glowing at her joints, and her hollow ribcage of bone like a cage.

Make her brood cage bigger and raise it into her ribs: a big cluster of round eggs glowing ember-orange fills the open cage of her ribs in her chest, the brightest part of her, held inside the ribs, not hanging low in her belly. Remove the dark loincloth: her pelvis is bare bone. Change only the pose, for rigging: a clean A-pose, standing upright with only a slight forward hunch, both arms straight and angled down and out from the body at about 45 degrees, the clawed hands open and well clear of the hips and legs, the legs straight and a little apart, both feet flat on the ground. Front three-quarter view, the creature turned slightly toward the left of the picture.

Full body, the whole creature, the tips of her crown and her claws inside the frame with margin, both feet fully visible, plain flat mid-grey background, nothing else in the picture. No wings, no robe, no skirt, no loincloth, no cloth, no skin. Flat cel colours in two tones per material, no bone texture, no cracks, no fine detail; even, readable lighting, no cast shadows, no motion blur, no text, no logo.
```

Pose 2 (reference: pose 1):

```text
Redraw exactly this creature, the same original design, colours and finish, with two changes only.

First, move her eggs up into her chest: the cluster of round glowing ember-orange eggs sits high inside her ribcage, behind the ribs, at the height of her shoulders and chest, filling the cage of her ribs from the collarbones down to the bottom rib, bigger than now (about as wide as her ribcage), the ribs curving round in front of the eggs like the bars of a cage. Below the ribcage her spine and her bare bone pelvis show, with nothing hanging there: her belly under the ribs is empty, just the spine.

Second, open her arms for rigging: both arms straight and angled down and out from the body at about 45 degrees, the clawed hands open and well clear of the hips and legs, with clear space between each arm and the body. Keep her legs straight and a little apart, both feet flat on the ground, her slight forward hunch, her long bone skull with its glowing eye sockets, her crown of bone spikes and the crest of spikes down her neck and spine. Front three-quarter view, turned slightly toward the left of the picture.

Full body, the whole creature, the tips of her crown and her claws inside the frame with margin, both feet fully visible, plain flat mid-grey background, nothing else in the picture. No wings, no robe, no skirt, no loincloth, no cloth, no skin. Flat cel colours in two tones per material, no fine detail; even, readable lighting, no cast shadows, no motion blur, no text, no logo.
```

Pose 3 (reference: pose 2):

```text
Redraw exactly this creature, the same original design, pose, colours and finish, with one change only: her eggs must be solid objects. Inside the cage of her ribs, in her chest, sits a cluster of six big solid round eggs, opaque and smooth like glossy vinyl balls, glowing ember-orange, each egg clearly drawn with its own round outline and its own light and shadow side, packed together and filling the whole ribcage from side to side and from the collarbones down to the bottom rib; the ribs are thin bone bars curving round in front of the eggs, with wide gaps between them through which the eggs clearly show. The eggs are the biggest, brightest, most solid shapes on her body. Below the ribcage her spine and her bare bone pelvis show, with nothing hanging there.

Keep everything else exactly as it is: her arms angled down and out from the body, the clawed hands open and clear of the hips and legs, her legs straight and a little apart, both feet flat on the ground, her slight forward hunch, her long bone skull with its glowing eye sockets, her crown of bone spikes and the crest of spikes down her neck and spine. Front three-quarter view, turned slightly toward the left of the picture.

Full body, the whole creature, the tips of her crown and her claws inside the frame with margin, both feet fully visible, plain flat mid-grey background, nothing else in the picture. No wings, no robe, no skirt, no loincloth, no cloth, no skin, no glow haze. Flat cel colours in two tones per material, no fine detail; even, readable lighting, no cast shadows, no motion blur, no text, no logo.
```

## Clips

| File | Meshy action | Clip in the file | Length | Hips' travel (max, at the end) |
|---|---|---|---|---|
| `idle.glb` | 0 Idle | `Idle` | 4.00 s | 0.02 m |
| `walk.glb` | walking, free with the rig | `Armature\|walking_man\|baselayer` | 1.03 s | 0.04 m |
| `run.glb` | running, free with the rig | `Armature\|running\|baselayer` | 0.63 s | 0.04 m |
| `attack.glb` | 128 Heavy Hammer Swing | `Heavy_Hammer_Swing` | 1.80 s | 0.08 m, 0.07 at the end |
| `hit.glb` | 178 Hit Reaction | `Hit_Reaction` | 1.63 s | 0.68 m, stays (pinned in the game) |
| `death.glb` | 189 Dying Backwards | `dying_backwards` | 2.20 s | 0.63 m, 0.60 at the end (pinned) |
| `attack-b.glb` | 92 Double Combo Attack | `Double_Combo_Attack` | 2.83 s | 0.89 m (not used: it turns and lunges off its spot) |
| `scream.glb` | 386 Zombie Scream | `Zombie_Scream` | 2.80 s | 0.07 m (not used: crouched, the brood hidden; the Hatch is the swing's open chest) |
| `walk-monster.glb` | 112 Frankenstein Walk | `Monster_Walk` | 4.10 s | 0.04 m (not used: arms held out, slow) |

All 30 frames a second. The game's moments (`tools/blender/creeps.py`): the walk cycle; the stand `Idle` at 0 s; the
attack `Heavy_Hammer_Swing` 0.9–1.35 s, both claws raised over her open chest and raked down; the flinch
`Hit_Reaction` at 0.2 s; the death `dying_backwards` 0.2–1.5 s; **the Hatch** the same swing at 0.7, 0.85 and
0.95 s, her claws raised wide and the brood bared (Han's brief: the attack's open-chest frames).

## The rebind

The auto-rig skinned her worse than any batch 1 creep: her hips own most of her chest (3,688 vertices of it), her eggs
went to her arms and hips, her upper arms own the sides of her ribcage, her shoulders part of her crown, and her claws
and feet stretched with the wrong bones. Rebound whole, in the bind pose (glTF metres):

| Part | To | Select | Vertices |
|---|---|---|---|
| left claws | `LeftHand` | x > 0.31, 0.26 < y < 0.67, within 0.24 m of the hand's column (0.449, −0.083), more than 0.08 m from her leg bones | 2,449 |
| right claws | `RightHand` | x < −0.37, 0.26 < y < 0.68, within 0.24 m of the hand's column (−0.504, 0.047), off her legs | 3,553 |
| left foot, right foot | `LeftFoot`, `RightFoot` | y < 0.2 on each side (its toes stretched it into a blade, as the Brute's) | 1,420, 1,352 |
| the cage (ribs and eggs) | `Spine01` | \|x + 0.05\| < 0.29, 0.84 < y < 1.19, \|z\| < 0.32, more than 0.07 m from her arm bones | 8,563 |
| the crest down her back | `Spine` | z < −0.12, y > 1.0, \|x + 0.05\| < 0.27, off her arms | 809 |

Her claws at y > 0.26: lower, the box took the outer toes of her right foot, and the swing stretched her foot up to her
raised hand.

## Paint

Bone (three greys of it, to `bone`), the charred mantle on her shoulders (`char`), and ember: **the eggs and her eye
sockets are her only glow** (Han); the same ember in her joints is unlit (`seam`).

## What looks wrong

- **She stands tall:** the radius rule (the disc with her idle silhouette's area) makes a thin figure tall: 80 × 112
  world px at rest (the pack's MushroomKing 64.7 × 78.3), about 3.5 hero heights on a phone.
- The swing turns her shoulders from the camera at its blow; the Hatch frames, before it, face it.
