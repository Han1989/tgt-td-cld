# The Grunt (V-06i, enemy batch 1)

The host's foot soldier, squat and square, a notched cleaver in its right hand: Han's pick **Grunt a**
(`../../enemy-concepts/grunt-a.png`, `docs/art/enemy-redesign.png`), made into the game's Grunt on 24 Oct 2026
(Han's decision; `docs/art/enemy-style.md`). Designed by Claude, generated in Meshy. **Generated on a Meshy Premium plan, private licence, commercial use permitted.**

| File | What |
|---|---|
| `concept.png` | the image the model was made from: the pick put into a clean pose by `meshy_image_to_image` (896 × 1200); the pick faces the picture's right, so it was flipped left to right first (the cleaver then in its right hand, the pauldron on its left shoulder, as the brief has them) |
| `model.glb` | the rigged, textured model, Meshy's `Character_output.glb` unchanged: 20,677 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, Meshy's 24-joint skeleton (`../../README.md`), facing glTF +Z; 4.3 MB |
| `walk.glb`, `run.glb` | the rig's free clips (armature only) |
| `idle.glb`, `attack.glb`, `hit.glb`, `death.glb` | the clips the game uses (below) |
| `axe-chop.glb`, `attack-b.glb` | two attacks tried and not used (below) |

Clip files are armature only (the skeleton, Meshy's 288-triangle bone display and one clip), split from Meshy's bundled
animation file onto the joints of the rig's own walk file, the keyframes as they are, the bone display's zero-length
normals set to +Y; the same format as the heroes' (`../../README.md`, "How the five action clips were split"). They play
on `model.glb` by joint name.

## Meshy tasks (24 Oct 2026)

| Step | Task id | Credits | |
|---|---|---|---|
| Pose (image to image) | `01a16c3a-91b1-7360-a1c2-97570bc5bf9d` | 9 | **kept** (`concept.png`): every mark of the pick, the arms out and down, the cleaver held out from the leg |
| Model (image to 3D) | `01a16c3c-6f2f-705d-b75d-f991d3060d07` | 30 | **kept**, attempt 1 of 1 |
| Rig | `01a16c3e-bb80-7262-ab79-c3a63d983311` | 5 | `model.glb`, `walk.glb`, `run.glb`; `height_meters` 1.2 |
| Clips | `01a16c43-3d17-776f-9aed-79ae20f5cf92` | 18 | `action_ids` [0, 219, 237, 4, 178, 189] |
| | | **62** | |

## Settings

`meshy_image_to_image`: `nano-banana-pro`, 3:4, one reference (the pick). `meshy_image_to_3d` from that task: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false (keeps the styling), `should_remesh` true, `target_polycount` 20000 (creeps are drawn at 4 px per world px, a third of a hero's screen size), `topology` triangle, no `pose_mode` (the concept's own pose: with `pose_mode` Meshy re-posed the Ranger and moved his bow onto his back), GLB.

## The prompt (image to image, reference: `grunt-a.png` flipped)

```text
Redraw exactly this creature: the same original design, proportions, colours and finish, a chibi risen skeleton soldier of bone and ember, a stylised 3D game creature like a small collectible vinyl toy. Keep every mark: the big blocky bone skull with its heavy square jaw and two deep eye sockets glowing ember-orange, the short barrel ribcage of bone with the small ember core glowing between the ribs, the short thick bone arms and short thick bone legs, the big flat bone feet, the one square pauldron of charred black wood bound with dark iron on its LEFT shoulder, and in its RIGHT hand the oversized short, broad, square-ended dark-iron cleaver blade with two big square notches cut in its edge.

Change only the pose, for rigging: a clean A-pose, standing straight and upright, both arms straight and angled down and out from the body at about 45 degrees, hands well clear of the hips; the right hand grips the cleaver's handle, the blade pointing down and out to the side, away from the leg, touching nothing; the left hand an open bone fist; legs straight and a little apart, both feet flat on the ground. Front three-quarter view, the creature turned slightly toward the left of the picture.

Full body, the whole creature and the cleaver inside the frame with margin, both feet fully visible, plain flat mid-grey background, nothing else in the picture. No fur, no cloth, no rags, no hair, no skin. Flat cel colours in two tones per material, no bone texture, no cracks, no scratches, no fine detail; even, readable lighting, no cast shadows, no motion blur, no text, no logo.
```

## Clips

| File | Meshy action | Clip in the file | Length | Hips' travel (max, at the end) |
|---|---|---|---|---|
| `idle.glb` | 0 Idle | `Idle` | 4.00 s | 0.01 m |
| `walk.glb` | walking, free with the rig | `Armature\|walking_man\|baselayer` | 1.04 s | 0.03 m |
| `run.glb` | running, free with the rig | `Armature\|running\|baselayer` | 0.67 s | 0.03 m |
| `attack.glb` | 219 Right-hand Sword Slash | `Right_Hand_Sword_Slash` | 1.50 s | 0.10 m, back to 0 |
| `hit.glb` | 178 Hit Reaction | `Hit_Reaction` | 1.62 s | 0.54 m, stays (pinned in the game) |
| `death.glb` | 189 Dying Backwards | `dying_backwards` | 2.17 s | 0.50 m, 0.47 at the end (pinned) |
| `axe-chop.glb` | 237 Charged Axe Chop | `Charged_Axe_Chop` | 7.67 s | 0.26 m (not used: a long crouch, then the blade raised and held) |
| `attack-b.glb` | 4 Attack | `Attack` | 2.79 s | 0.23 m (not used: it turns its back to the camera) |

All 30 frames a second. The game's moments (`tools/blender/creeps.py`): the walk cycle; the stand `Idle` at 2 s (at 0 s
the big skull hangs forward and its sockets hide under the brow; at 2 s the look round turns it toward the camera); the
attack `Right_Hand_Sword_Slash` 0.3–0.55 s, from the cleaver over its right shoulder to the blow swept down in front;
the flinch `Hit_Reaction` at 0.45 s; the death `dying_backwards` 0.3–1.5 s.

## The rebind

The cleaver is welded into the hand and skinned to the hand and forearm: every vertex with **x < −0.43 m** (bind pose,
glTF metres: the cleaver and the fist round its grip, 2,063 vertices) is bound 100% to `RightHand`; the blade alone
(those more than 11 cm from the fist's middle, (−0.47, 0.33, −0.17)) is cut into the weapon layer, left out of the size.

## What looks wrong

- The rig places the hips 16 cm behind the model's middle (z −0.16), so the figure leans its skull forward over its feet
  in the idle: at 0 s the sockets hide under the brow (the stand is taken at 2 s instead).
- The pauldron is skinned to the left collarbone, so it moves with the shoulder, not the arm (right for a pauldron).
- Its ember core shows through its back (the texture paints the inside of the ribcage), and from the 3/4 front the
  cleaver arm covers it in most of the walk.
