# The Shardback (V-06j, enemy batch 2)

A boss, the oldest of the host: a tortoise of bone and ash-grey stone on four short legs, its back one ridge of smoky
crystal shards lit ember from inside. Han's pick **Shardback b** (`../../enemy-concepts/shardback-b.png`), made into the
game's Shardback on 24 Oct 2026. Designed by Claude, generated in Meshy. **Generated on a Meshy Premium plan, private
licence, commercial use permitted.**

| File | What |
|---|---|
| `concept.png` | the image the model was made from: the pick redrawn by `meshy_image_to_image` (1200 × 896), standing square |
| `model.glb` | the textured model as `meshy_image_to_3d` returned it, **no skeleton**: 30,960 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, facing glTF +Z, its middle at the origin; 4.2 MB |

**The rig: tried once, not used.** `meshy_rig` gave it the heroes' 24-joint skeleton, but its free walk reared it up on
its hind legs, its tail flipping over. It is kept unrigged and posed from its bind pose in the pipeline
(`tools/blender/tdt3d/posed.py`, the `posed` of its row in `tools/blender/creeps.py`). Its shards are one with its
back in the model, so they move whole with it (what the brief's rebind to the spine would have done).

## Meshy tasks (24 Oct 2026)

| Step | Task id | Credits | |
|---|---|---|---|
| Pose (image to image) | `01a16ca7-81ba-70d5-b16c-cf0b5e048ced` | 9 | **kept**: standing square, the shards lit |
| Model (image to 3D) | `01a16ca9-09de-7787-92d8-07e5c3255eee` | 30 | **kept**, attempt 1 of 1 |
| Rig | `01a16cab-c6d6-74f7-bc1d-cca22b02f5f4` | 5 | tried once, `height_meters` 1.0: its walk rears it up (not used) |
| | | **44** | |

## Settings

`meshy_image_to_image`: `nano-banana-pro`, one reference (the pick, as Meshy returned it: it already faces the picture's left). `meshy_image_to_3d` from that task: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false (keeps the styling), `should_remesh` true, `target_polycount` 30000 (a boss is drawn at 3 px per world px but three times a creep's size), `topology` triangle, no `pose_mode` (the concept's own pose), `target_formats` ["glb"]. 4:3.

## The prompt (image to image, reference: `shardback-b.png`)

```text
Redraw exactly this creature: the same original design, proportions, colours and finish, a chibi risen tortoise of bone and ash-grey stone, a boss in a stylised 3D game like a small collectible vinyl toy. Keep every mark: the broad low bone head with its heavy jaw and its eye sockets glowing ember-orange, the plates of ash-grey stone round its body, the whole back one dense ridge of big jagged crystal shards of dark smoky glass glowing ember-orange from inside, the biggest along its spine, the four short thick legs of stone with thick bone claws, and the short heavy tail ending in a few small shards.

Change only the stance, for a clean 3D model: standing square and still on all four legs, the body level and held a little off the ground, the head forward, all four legs straight down and clearly separated from each other with space between them, front legs apart and hind legs apart, every foot flat on the ground with its claws spread. Front three-quarter view, the creature turned slightly toward the left of the picture, as if about to walk that way.

The whole creature, every shard, its tail and all four feet inside the frame with margin, plain flat mid-grey background, nothing else in the picture. No shell pattern, no wings, no rider, no fur, no cloth, no skin. Flat cel colours in two tones per material, no bone texture, no stone cracks, no fine detail; even, readable lighting, no cast shadows, no motion blur, no text, no logo.
```

## The poses (`posed`, glTF metres of `model.glb`)

Its soles are its claws (y −0.5); its middle over the anchor is (x 0, z 0.05). Regions: each leg (below y −0.16, fully
below −0.3, the front pair at z 0.28–0.74 and the hind at z −0.34 to 0.08, |x| > 0.17 so the head between the front legs
stays) turning about its shoulder or hip; all four legs together (`legs`, scaled about the ground); the body above the
legs (`body`); the head (z > 0.5, fully past 0.62) about its neck (y −0.05, z 0.56).

| State | Frames | Pose |
|---|---|---|
| walk | 2 | a trot, over 1 s: the diagonal legs together (front left with hind right, ±14–16°), a sway of ±2.5° |
| stand | 1 | the bind pose |
| attack | 3 | a bite: the head drawn in and up 12°, thrust 0.1 m out and down 14°, back |
| flinch | 1 | nose up 5°, the head thrown back 10° |
| death | 3 | slumping flat: its legs giving way (0.75, 0.5, 0.35 of their height) as its body sinks 0.16 m, its head dropping to the ground (34°) |
| ability | 3 | the hide shift: its rest pose hunkered a little under its shards (the body 0.025, then 0.045 m lower, then rising), while the rig changes the hide |

## Paint and the hide

Stone in two tones (the stone tokens a step toward bone: `stone` leans violet, and the shards alone must turn violet
with the Ether hide), bone for its head, claws and spikes, the shards' smoky glass (`glass`: `ironDark` toward ink),
and their ember: the bright cores glow (`shard`, emitting at 0.6, under the walkers' eyes' 1.0), the deeper reds are
ember unlit (`shardDeep`). **The shards are ember at rest** (Han); the `hide` layer carries the coverage of all three
shard materials, frame by frame, and the rig lights it violet while the Ether hide is up, as before (additive, 0.85):
over the ember it reads violet with white-hot cores. Its eyes glow ember and the dark red round them is its sockets,
not glass, so the hide never lights its eyes.

## What looks wrong

- A two-frame trot rocks rather than walks (the brief's two frames).
