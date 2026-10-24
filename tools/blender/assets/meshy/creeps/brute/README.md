# The Brute (V-06i, enemy batch 1)

The host's heavy: one flat iron yoke across its shoulders, the tiny skull in a notch in it, huge iron-bound fists:
Han's pick **Brute b** (`../../enemy-concepts/brute-b.png`), made into the game's Brute on 24 Oct 2026. Designed by
Claude, generated in Meshy. **Generated on a Meshy Premium plan, private licence, commercial use permitted.**

| File | What |
|---|---|
| `concept.png` | the image the model was made from: the pick put into a clean pose by `meshy_image_to_image` (896 × 1200) |
| `model.glb` | the rigged, textured model, Meshy's `Character_output.glb` unchanged: 20,641 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, Meshy's 24-joint skeleton (`../../README.md`), facing glTF +Z; 4.0 MB |
| `walk.glb`, `run.glb` | the rig's free clips (armature only) |
| `idle.glb`, `attack.glb`, `hit.glb`, `death.glb` | the clips the game uses (below) |
| `slash.glb`, `punch.glb` | two attacks tried and not used (below) |

Clip files are armature only (the skeleton, Meshy's 288-triangle bone display and one clip), split from Meshy's bundled
animation file onto the joints of the rig's own walk file, the keyframes as they are, the bone display's zero-length
normals set to +Y; the same format as the heroes' (`../../README.md`, "How the five action clips were split"). They play
on `model.glb` by joint name.

## Meshy tasks (24 Oct 2026)

| Step | Task id | Credits | |
|---|---|---|---|
| Pose (image to image) | `01a16c3c-df2e-7594-8ea0-86264cec190b` | 9 | **kept**: the arms down and out, the fists clear of the legs |
| Model (image to 3D) | `01a16c3f-7c8a-7557-9a9b-8abfcbf28345` | 30 | **kept**, attempt 1 of 1 |
| Rig | `01a16c43-5d1d-72c5-b516-92644dfbb1f9` | 5 | `model.glb`, `walk.glb`, `run.glb`; `height_meters` 1.6 |
| Clips | `01a16c48-6160-7386-990c-82458aaca295` | 18 | `action_ids` [0, 219, 128, 214, 178, 189] |
| | | **62** | |

## Settings

`meshy_image_to_image`: `nano-banana-pro`, 3:4, one reference (the pick). `meshy_image_to_3d` from that task: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false (keeps the styling), `should_remesh` true, `target_polycount` 20000 (creeps are drawn at 4 px per world px, a third of a hero's screen size), `topology` triangle, no `pose_mode` (the concept's own pose: with `pose_mode` Meshy re-posed the Ranger and moved his bow onto his back), GLB.

## The prompt (image to image, reference: `brute-b.png`)

```text
Redraw exactly this creature: the same original design, proportions, colours and finish, a chibi risen skeleton brute of bone and ember, a stylised 3D game creature like a small collectible vinyl toy. Keep every mark: the one huge flat-topped slab of dark iron armour across both shoulders like a yoke, wider than the body, held by a few big rivets, with the tiny bone skull sunk in a notch in its middle, its two eye sockets glowing ember-orange; the massive barrel ribcage of bone with the big ember core glowing inside; the huge thick bone arms with massive fists bound in dark iron cuffs; the short thick bone legs; the ember glowing at the joints. Bare-fisted, no weapon: its fists are its weapons.

Change only the pose, for rigging: a clean A-pose, standing straight and upright, both arms straight and angled down and out from the body at about 30 degrees, the big fists hanging well clear of the hips and the legs, touching nothing; legs straight and a little apart, both feet flat on the ground. Front three-quarter view, the creature turned slightly toward the left of the picture.

Full body, the whole creature inside the frame with margin, both feet fully visible, plain flat mid-grey background, nothing else in the picture. No fur, no cloth, no rags, no hair, no skin. Flat cel colours in two tones per material, no bone texture, no cracks, no metal scratches, no fine detail; even, readable lighting, no cast shadows, no motion blur, no text, no logo.
```

## Clips

| File | Meshy action | Clip in the file | Length | Hips' travel |
|---|---|---|---|---|
| `idle.glb` | 0 Idle | `Idle` | 4.00 s | 0.02 m |
| `walk.glb` | walking, free with the rig | `Armature\|walking_man\|baselayer` | 1.04 s | 0.04 m |
| `run.glb` | running, free with the rig | `Armature\|running\|baselayer` | 0.67 s | 0.04 m |
| `attack.glb` | 128 Heavy Hammer Swing | `Heavy_Hammer_Swing` | 1.79 s | 0.09 m |
| `hit.glb` | 178 Hit Reaction | `Hit_Reaction` | 1.62 s | 0.76 m (pinned in the game) |
| `death.glb` | 189 Dying Backwards | `dying_backwards` | 2.17 s | 0.71 m (pinned) |
| `slash.glb` | 219 Right-hand Sword Slash | `Right_Hand_Sword_Slash` | 1.50 s | 0.15 m (not used: the sweep turns its back to the camera) |
| `punch.glb` | 214 Punch Forward with Both Fists | `Punch_Forward_with_Both_Fists` | 3.46 s | 0.46 m (not used: bent over, the yoke hides the blow) |

The game's moments: the walk cycle; the stand `Idle` at 0 s; the attack `Heavy_Hammer_Swing` 0.89–1.42 s, both fists
raised over the yoke (its core shows) and brought down: bare-fisted, its fists are its weapons; the flinch
`Hit_Reaction` at 0.2 s; the death `dying_backwards` 0.2–1.5 s.

## The rebind

Bind pose, glTF metres. The auto-rig skinned the yoke and the ribs to the two collarbones (so the yoke would bend in its
middle), the fists partly to the feet beside them and the feet to their toes (in the walk they stretched into blades):
the yoke, every vertex above y 0.95 but the skull in its notch (|x| < 0.16, y < 1.32, z > 0.12), 7,772 vertices, to
`Spine`; the ribs (0.55 < y ≤ 0.95, |x| < 0.45, as skinned to a collarbone), 2,035, to `Spine01`; each fist
(|x| > 0.43, y < 0.52), 2,730 and 2,414, to its hand; each foot (|x| ≤ 0.43, y < 0.16), 544 and 517, to its foot.

## What looks wrong

- From the match camera's 20° above, the yoke's lip hides most of the tiny skull: its eyes are two small ember points.
- The yoke's iron takes the teal rim along its top edge (the player side's rim light, as every creep's).
