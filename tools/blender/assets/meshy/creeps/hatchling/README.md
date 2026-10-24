# The Hatchling (V-06j, enemy batch 2)

The Matriarch's brood and the smallest of the host: a round skull-shell on eight jointed bone legs, two ember eyes, a lit
crack across its top, a charred band round its middle. Han's pick **Hatchling b**
(`../../enemy-concepts/hatchling-b.png`), made into the game's Hatchling on 24 Oct 2026. Designed by Claude, generated
in Meshy. **Generated on a Meshy Premium plan, private licence, commercial use permitted.**

| File | What |
|---|---|
| `concept.png` | the image the model was made from: the pick redrawn by `meshy_image_to_image` (1200 × 896); the image model kept it as it was |
| `model.glb` | the textured model as `meshy_image_to_3d` returned it, **no skeleton**: 20,708 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, facing glTF +Z, its middle at the origin; 3.6 MB |

**No rig** (Han's brief: it hops as before, from its bind pose, with one squash posed in the pipeline): the pipeline
poses it from its bind pose (`tools/blender/tdt3d/posed.py`, the `posed` of its row in `tools/blender/creeps.py`).
Its eight legs stay.

## Meshy tasks (24 Oct 2026)

| Step | Task id | Credits | |
|---|---|---|---|
| Pose (image to image) | `01a16ca7-714a-71fa-8ec1-5d2d331f2cfe` | 9 | **kept**: the pick as it was |
| Model (image to 3D) | `01a16ca8-fec5-70d3-b3df-c1d8209a2780` | 30 | **kept**, attempt 1 of 1 |
| | | **39** | |

## Settings

`meshy_image_to_image`: `nano-banana-pro`, one reference (the pick, as Meshy returned it: it already faces the picture's left). `meshy_image_to_3d` from that task: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false (keeps the styling), `should_remesh` true, `target_polycount` 20000 (a creep is drawn at 4 px per world px, a third of a hero's screen size), `topology` triangle, no `pose_mode` (the concept's own pose), `target_formats` ["glb"]. 4:3.

## The prompt (image to image, reference: `hatchling-b.png`)

```text
Redraw exactly this creature: the same original design, proportions, colours and finish, a chibi risen bone hatchling of bone and ember, a stylised 3D game creature like a small collectible vinyl toy. Keep every mark: the round egg-shaped shell of bone, the two small round eye holes glowing ember-orange at its front, the jagged crack across its top glowing with the ember core inside, the dark band with ember seams round its middle, and the eight short jointed bone legs with ember at their joints.

Change only the stance, for a clean 3D model: standing still and level, the shell held just off the ground, the eight legs splayed out evenly all round it like a spider's, four on each side, every leg clearly separated from the next with space between them, each leg bent once at its knee and its pointed bone foot planted flat on the ground. Make the legs a little thicker, chunky toy bones that stay readable at a small size. Front three-quarter view, the creature turned slightly toward the left of the picture, as if about to walk that way.

The whole creature and every foot inside the frame with margin, all eight feet fully visible, plain flat mid-grey background, nothing else in the picture. No fur, no cloth, no skin, no tail. Flat cel colours in two tones per material, no bone texture, no cracks other than the glowing crack on top, no fine detail; even, readable lighting, no cast shadows, no motion blur, no text, no logo.
```

## The poses (`posed`, glTF metres of `model.glb`)

Its soles are the leg tips (y −0.62).

| State | Frames | Pose |
|---|---|---|
| walk | 6 | the hop, over 0.45 s: squashed (0.2: shorter and wider about the ground), the bind pose, lifted 0.22, 0.34 and 0.22 m (its contact shadow stays on the ground), the bind pose |
| stand | 1 | the bind pose |
| attack | 3 | a bite: drawn back and tipped up 14°, lunged 0.18 m forward and tipped down 20°, back |
| flinch | 1 | tipped back 14° |
| death | 3 | flipped onto its back about its middle (70°, 140°, 180°), its legs in the air |

## Paint

Meshy painted its legs' shadow side as dark as its charred band (one colour, `#191a1d`): off the shell (more than 0.53 m
from its axis, or below y −0.47) those faces are bone. Its eyes and the crack on top glow; the ember in its leg joints
is unlit. Its legs are a few world px thick, so its line is thinner than a walker's (0.8 world px outside, 0.25 inside;
the Archer's 1.0 and 0.3): at the walkers' 1.5 the line ate them to ink.

## What looks wrong

- From the match camera (3/4 front, 20° down) the crack on its top hardly shows; its two eyes and the round shell carry it.
