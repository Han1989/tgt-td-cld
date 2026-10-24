# The Runner (V-06i, enemy batch 1)

The host's fastest, a bone raptor on long bird legs, its tail out behind: Han's pick **Runner b**
(`../../enemy-concepts/runner-b.png`), made into the game's Runner on 24 Oct 2026. Designed by Claude, generated in
Meshy. **Generated on a Meshy Premium plan, private licence, commercial use permitted.**

**The rig** (the brief: try `meshy_rig` once, and keep it unrigged if the auto-rig refuses or mangles the raptor): the
auto-rig took it as a biped leaning forward. Its legs work (the clips walk and run them), but it skinned the tail to the
left shin and the charred cage of ribs (with the stub arms folded on it) to the left collarbone, and a biped's clips
stand a spine upright. So the rig is kept and the pipeline fixes the rest: the tail bound whole to the hips, the cage to
the chest, and the spine, neck, head and arms held at the bind pose in every frame (`hold` in `tools/blender/creeps.py`):
the clips move its hips (and the body and tail with them) and its legs.

| File | What |
|---|---|
| `concept.png` | the image the model was made from: the pick put into a clean pose by `meshy_image_to_image` (896 × 1200); the pick faces the picture's right, so it was flipped first |
| `model.glb` | the rigged, textured model, Meshy's `Character_output.glb` unchanged: 20,900 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, Meshy's 24-joint skeleton (`../../README.md`), facing glTF +Z; 5.1 MB |
| `walk.glb`, `run.glb` | the rig's free clips (armature only) |
| `idle.glb`, `attack.glb`, `hit.glb`, `death.glb` | the clips the game uses (below) |
| `sprint.glb`, `attack-b.glb`, `death-back.glb`, `knock-down.glb` | clips tried and not used (below) |

Clip files are armature only (the skeleton, Meshy's 288-triangle bone display and one clip), split from Meshy's bundled
animation file onto the joints of the rig's own walk file, the keyframes as they are, the bone display's zero-length
normals set to +Y; the same format as the heroes' (`../../README.md`, "How the five action clips were split"). They play
on `model.glb` by joint name.

## Meshy tasks (24 Oct 2026)

| Step | Task id | Credits | |
|---|---|---|---|
| Pose (image to image) | `01a16c3c-d922-723e-bed7-59707559ccc0` | 9 | **kept**: its natural stance (a raptor can't A-pose), legs apart, tail out, the legs, neck and tail a little thicker |
| Model (image to 3D) | `01a16c3f-7543-7258-8a8d-c672b216108c` | 30 | **kept**, attempt 1 of 1 |
| Rig | `01a16c43-4fa9-73bc-ae1a-2350f29a82d3` | 5 | `model.glb`, `walk.glb`, `run.glb`; `height_meters` 1.0 (tried once, kept) |
| Clips 1 | `01a16c48-5c17-7558-a708-1dd65d7ed317` | 18 | `action_ids` [0, 509, 103, 206, 178, 189] |
| Clips 2 | `01a16c6f-8cc5-75a2-afd2-93ef521612f3` | 6 | `action_ids` [184, 187]: a death that falls forward |
| | | **68** | |

## Settings

`meshy_image_to_image`: `nano-banana-pro`, 3:4, one reference (the pick). `meshy_image_to_3d` from that task: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false (keeps the styling), `should_remesh` true, `target_polycount` 20000 (creeps are drawn at 4 px per world px, a third of a hero's screen size), `topology` triangle, no `pose_mode` (the concept's own pose: with `pose_mode` Meshy re-posed the Ranger and moved his bow onto his back), GLB.

## The prompt (image to image, reference: `runner-b.png` flipped)

```text
Redraw exactly this creature: the same original design, colours and finish, a chibi risen bone raptor of bone and ember, a stylised 3D game creature like a small collectible vinyl toy. Keep every mark: the small bone skull thrust forward on a long curved neck of vertebrae, two eye sockets glowing ember-orange, the small ribcage tipped forward with the ember core glowing inside it, the two tiny stub arms folded against the ribs, the two very long thin bone legs bent backwards at the knee like a running bird's with long three-toed bone feet, the ember glowing at the knees, and the long tail of vertebrae held straight out behind.

Change only the stance, for rigging: its natural standing stance, upright enough to balance, the body level, the neck curving up and forward, both legs apart and clearly separated from each other, one a little ahead of the other, both feet flat on the ground with their three toes spread, the tail held straight out behind, level, touching nothing. Make the legs, the neck and the tail a little thicker, chunky toy bones that stay readable at a small size. Front three-quarter view, the creature turned slightly toward the left of the picture, as if about to walk that way.

Full body, the whole creature, its head and its whole tail inside the frame with margin, both feet fully visible, plain flat mid-grey background, nothing else in the picture. No fur, no feathers, no cloth, no skin, no weapon. Flat cel colours in two tones per material, no bone texture, no cracks, no fine detail; even, readable lighting, no cast shadows, no motion blur, no text, no logo.
```

## Clips

| File | Meshy action | Clip in the file | Length | Hips' travel |
|---|---|---|---|---|
| `idle.glb` | 0 Idle | `Idle` | 4.00 s | 0.01 m |
| `walk.glb` | walking, free with the rig | `Armature\|walking_man\|baselayer` | 1.04 s | 0.03 m |
| `run.glb` | running, free with the rig | `Armature\|running\|baselayer` | 0.67 s | 0.02 m |
| `attack.glb` | 103 Simple Kick | `Simple_Kick` | 2.33 s | 0.91 m, stays (pinned in the game) |
| `hit.glb` | 178 Hit Reaction | `Hit_Reaction` | 1.62 s | 0.48 m (pinned) |
| `death.glb` | 184 Shot and Fall Forward | `Shot_and_Fall_Forward` | 2.17 s | 0.52 m (pinned) |
| `sprint.glb` | 509 Lean Forward Sprint | `Lean_Forward_Sprint` | 0.54 s | 1.23 m (not used: it runs off its spot) |
| `attack-b.glb` | 206 Spartan Kick | `Spartan_Kick` | 1.38 s | 0.19 m (not used: it tips sideways) |
| `death-back.glb` | 189 Dying Backwards | `dying_backwards` | 2.17 s | 0.45 m (not used: falling back, its rigid tail went into the ground) |
| `knock-down.glb` | 187 Knock Down | `Knock_Down` | 2.50 s | 0.42 m (not used: it flips in the air) |

The game's moments: the walk is Meshy's run (at its pace the bird legs sprint: a stride of 85 world px, so it steps
about once a second at the Runner's 3.2 tiles a second); the stand `Idle` at 0 s; the attack `Simple_Kick`
0.5–1.05 s, pinned on its spot; the flinch `Hit_Reaction` at 0.2 s; the death `Shot_and_Fall_Forward` 0.2–1.56 s.

## The rebind and the legs

Bind pose, glTF metres: the tail, every vertex with z < −0.06, y > 0.25 and |x| < 0.075 (4,294 vertices), bound 100% to
`Hips`; the cage, every vertex above y 0.3 that Meshy skinned most to a collarbone, an arm, a hand or `Spine02`
(12,283 vertices), bound to `Spine`. Its thin bird legs are thickened 1.8× round their bones (`gltf.thicken`); its line
is the Archer's.

## What looks wrong

- Seen from the 3/4 front (the match camera) its long body runs toward the camera: the tail hides behind it in the
  stand and shows in the run and the kick.
- A human run on bird legs: the knees bend as a biped's do, which at 40 px reads as a sprint.
