# The Archer (V-06i, enemy batch 1)

The host's bowman, thin, with a longbow taller than itself: Han's pick **Archer a** (`../../enemy-concepts/archer-a.png`),
made into the game's Archer on 24 Oct 2026. Designed by Claude, generated in Meshy. **Generated on a Meshy Premium plan, private licence, commercial use permitted.**

**The model is mirrored.** The pick holds its bow in its right hand, and Han's brief asked for the weapon there; but
Meshy's archery clips (Archery_Shot, Walk_Forward_with_Bow_Aimed, Hit_Reaction_with_Bow, as the Ranger's) hold a bow
in the left. Rigged as made, the right-hand bow was carried by the drawing hand. Playing the clips mirrored was tried
in the pipeline and failed: the auto-rig's rest is not symmetric (its right arm rests holding the bow forward, the left
hangs, its spine and head joints are rolled), so a mirrored pose turned its skull round. So the image to 3D's model was
mirrored left to right (`x → −x`, the faces turned back outward, the texture as it is) and rigged again from a GLB
data URI: the Archer holds its bow in its left hand, and every archery clip plays as made. The design is the pick's.

| File | What |
|---|---|
| `concept.png` | the image the model was made from: the pick put into a clean pose by `meshy_image_to_image` (896 × 1200) (as generated: the bow in its right hand; the model is its mirror image) |
| `model.glb` | the rigged, textured model, Meshy's `Character_output.glb` unchanged: 20,822 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, Meshy's 24-joint skeleton (`../../README.md`), facing glTF +Z; 5.3 MB |
| `walk.glb`, `run.glb` | the rig's free clips (armature only) |
| `idle.glb`, `attack.glb`, `walk-aim.glb`, `hit.glb`, `death.glb` | the clips (below) |

Clip files are armature only (the skeleton, Meshy's 288-triangle bone display and one clip), split from Meshy's bundled
animation file onto the joints of the rig's own walk file, the keyframes as they are, the bone display's zero-length
normals set to +Y; the same format as the heroes' (`../../README.md`, "How the five action clips were split"). They play
on `model.glb` by joint name.

## Meshy tasks (24 Oct 2026)

| Step | Task id | Credits | |
|---|---|---|---|
| Pose 1 | `01a16c3c-9e6c-77e4-9811-42275f1dda0d` | 9 | **kept** (`concept.png`) |
| Pose 2 | `01a16c3d-e70e-7104-a16d-04d6eca1121d` | 9 | rejected: the concept README's note holds (its limbs thickened), but the edit kept them thin and its pose unchanged; a stronger prompt changed nothing either |
| Pose 3 | `01a16c3f-5106-7654-85b8-164dc419cd74` | 9 | rejected: with the pick and `archer-b.png` (its thicker limbs) as references, the same picture again; `nano-banana-pro` holds a reference's pose and build. The limbs are thickened in the pipeline instead (`gltf.thicken`) |
| Model (image to 3D) | `01a16c3f-fa37-7288-84f4-5c3b9422c94b` | 30 | **kept** (from pose 1), attempt 1 of 1; mirrored before the second rig |
| Rig 1 | `01a16c43-42c9-7283-81d9-51fc3fc3d1e1` | 5 | not used (the bow in its right hand) |
| Clips 1 | `01a16c48-574c-7623-9a15-d2729f8029fa` | 18 | not used: [0, 224, 236, 228, 150, 189] on rig 1 |
| Rig 2 | `01a16c5d-b3bf-734b-8e38-560be54ef5e6` | 5 | **kept**: the mirrored model as a GLB data URI, `height_meters` 1.0: `model.glb`, `walk.glb`, `run.glb` |
| Clips 2 | `01a16c60-dff3-75aa-a13e-84596e1e259e` | 15 | `action_ids` [0, 224, 228, 150, 189] |
| | | **100** | |

## Settings

`meshy_image_to_image`: `nano-banana-pro`, 3:4, one reference (the pick). `meshy_image_to_3d` from that task: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false (keeps the styling), `should_remesh` true, `target_polycount` 20000 (creeps are drawn at 4 px per world px, a third of a hero's screen size), `topology` triangle, no `pose_mode` (the concept's own pose: with `pose_mode` Meshy re-posed the Ranger and moved his bow onto his back), GLB.

## The prompts (image to image, reference: `archer-a.png`; pose 3 also `archer-b.png`)

Pose 1 (kept):

```text
Redraw exactly this creature: the same original design, colours and finish, a chibi risen skeleton archer of bone and ember, a stylised 3D game creature like a small collectible vinyl toy. Keep every mark: the narrow bone skull with its long chin and two eye sockets glowing ember-orange, the narrow ribcage with the small ember core, the joints glowing ember, the small quiver of charred wood on its back with three ember-tipped arrows, and in its RIGHT hand the oversized longbow of charred black wood, taller than the archer itself, its tips capped with bone and its string a thin glowing ember line. One change to the body: make every limb bone clearly thicker, chunky toy bones about twice as thick as now (the arms, the legs, the spine and the neck), so they stay readable at a small size; keep it thin and narrow overall, 2.5 heads tall.

Change only the pose, for rigging: a clean A-pose, standing straight and upright, both arms straight and angled down and out from the body at about 45 degrees, hands well clear of the hips; the right hand grips the bow at its middle, the bow held upright beside the body and out from it, touching nothing, its lower tip clear of the ground; the left hand open and empty; legs straight and a little apart, both feet flat on the ground. Front three-quarter view, the creature turned slightly toward the left of the picture.

Full body, the whole creature and the whole bow inside the frame with margin, both feet fully visible, plain flat mid-grey background, nothing else in the picture. No fur, no cloth, no rags, no hood, no hair, no skin. Flat cel colours in two tones per material, no bone texture, no cracks, no wood grain, no fine detail; even, readable lighting, no cast shadows, no motion blur, no text, no logo.
```

Pose 2:

```text
Redraw this creature as a chunkier toy, keeping its design: a chibi risen skeleton archer of bone and ember, a stylised 3D game creature like a small collectible vinyl toy. Keep every mark: the big narrow bone skull with its long chin and two eye sockets glowing ember-orange, the narrow ribcage with the small ember core, the joints glowing ember, the small quiver of charred wood on its back with three ember-tipped arrows, and in its RIGHT hand the oversized longbow of charred black wood, taller than the archer, its tips capped with bone and its string a thin glowing ember line.

Two changes. First, the bones must be THICK, like a chunky vinyl toy's: every arm bone and leg bone as thick as one of its eye sockets is wide, the spine and neck as thick, the hands and feet big and simple; it stays the narrowest of the skeletons, 2.5 heads tall. Second, the pose: a strict A-pose for rigging, standing straight, both arms held straight out from the body like the sides of the letter A, each arm about 40 degrees from the body, with a clear gap of at least a hand's width between each hand and the hip; the right hand grips the bow at its middle and holds it upright, out to the side, the bow touching nothing and its lower tip well clear of the ground; the left hand open and empty, held out from the body; legs straight and a little apart, both feet flat on the ground. Front three-quarter view, turned slightly toward the left of the picture.

Full body, the whole creature and the whole bow inside the frame with margin, both feet fully visible, plain flat mid-grey background, nothing else in the picture. No fur, no cloth, no hood, no hair, no skin. Flat cel colours in two tones per material, no texture, no cracks, no wood grain, no fine detail; even, readable lighting, no cast shadows, no motion blur, no text, no logo.
```

Pose 3:

```text
Two reference images of one creature design, a chibi risen skeleton archer of bone and ember, a stylised 3D game creature like a small collectible vinyl toy. Draw the archer of the FIRST image (its big narrow skull with the long chin and two ember-orange glowing eye sockets, its narrow ribcage with the small ember core, its ember-glowing joints, the small charred-wood quiver on its back with three ember-tipped arrows, and the oversized longbow of charred black wood in its RIGHT hand, taller than the archer, its string a thin glowing ember line), but give it the thick, chunky limb bones of the SECOND image: arms, legs, spine and neck as thick as the second image's, big simple hands and feet. Leave out everything else of the second image: no iron cuffs, no plates, no wood on the legs.

Pose for rigging: a strict A-pose, standing straight, both arms held straight and out from the body like the sides of the letter A, a clear gap between each hand and the hip; the right hand grips the bow at its middle and holds it upright out to the side, the bow touching nothing, its lower tip clear of the ground; the left hand open and empty, held out from the body; legs straight and a little apart, both feet flat on the ground. Front three-quarter view, turned slightly toward the left of the picture.

Full body, the whole creature and the whole bow inside the frame with margin, both feet fully visible, plain flat mid-grey background, nothing else in the picture. No fur, no cloth, no hood, no hair, no skin. Flat cel colours in two tones per material, no texture, no cracks, no wood grain, no fine detail; even, readable lighting, no cast shadows, no motion blur, no text, no logo.
```

## Clips

| File | Meshy action | Clip in the file | Length | Hips' travel |
|---|---|---|---|---|
| `idle.glb` | 0 Idle | `Idle` | 4.00 s | 0.01 m |
| `walk.glb` | walking, free with the rig | `Armature\|walking_man\|baselayer` | 1.04 s | 0.02 m |
| `run.glb` | running, free with the rig | `Armature\|running\|baselayer` | 0.67 s | 0.02 m |
| `walk-aim.glb` | 228 Walk Forward with Bow Aimed | `Walk_Forward_with_Bow_Aimed` | 1.17 s | 0.03 m |
| `attack.glb` | 224 Archery Shot | `Archery_Shot` | 5.00 s | 0.03 m |
| `hit.glb` | 150 Hit Reaction with Bow | `Hit_Reaction_with_Bow` | 1.96 s | 0.03 m |
| `death.glb` | 189 Dying Backwards | `dying_backwards` | 2.17 s | 0.32 m, 0.30 at the end (pinned) |

The game's moments: the walk is `Walk_Forward_with_Bow_Aimed` (the bow up and aimed, as the pack Archer's crossbow
was); the stand `Archery_Shot` at 2.6 s (the bow raised); the attack `Archery_Shot` 2.5–3.95 s, from the draw to the
loose; the flinch `Hit_Reaction_with_Bow` at 0.2 s; the death `dying_backwards` 0.2–1.5 s.

## The rebind and the limbs

The bow, welded in, is skinned to the forearm, the hand and a toe. Bound 100% to `LeftHand` (bind pose, glTF metres of
`model.glb`): every vertex within 6 cm of the plane the bow lies in (through (0.22, 0.527, 0.124), normal
(0.957, 0.073, −0.282)) with x > 0.12, its forearm (within 4 cm of the elbow-to-wrist segment, but for the hand) and its
skull (within 21.5 cm of (0.01, 0.8, 0)) left out, then grown along the mesh's edges into its string (within 11 cm of the
plane, x > 0.12: the string runs past the skull's cheek, and no box holds the one and not the other), 3,535 vertices; and
its charred lower tip, curled in by the left foot and skinned to its toe (y < 0.13, x > 0.09, −0.06 < z < 0.04, faces
darker than L 12), 61 more. Both are turned 81° in the fist about the grip (0.215, 0.483, 0.123): held as the model holds
it, the bow lay flat in Meshy's archery clips; so turned it stands upright from the raise to the loose and in the aimed
walk. The quiver, skinned to the right upper arm, is bound whole to the chest (`Spine`; within 5.5 cm of its axis,
4,763 vertices). Its limbs, single thin bones, are thickened 2.6× round their bones (`gltf.thicken`, the arms and legs,
13,087 vertices): at match size the painter's line ate them; its line is the thinner one the Ranger's bow layer uses.

## What looks wrong

- From the 3/4 front its skull hides most of its narrow body; in the aimed walk the bow is held out to its left and reads
  as a tall bar beside it.
- The concept's limbs were thinner than the brief asked (the README's note); thickened in the pipeline, the joints'
  ember rings thicken with them.
