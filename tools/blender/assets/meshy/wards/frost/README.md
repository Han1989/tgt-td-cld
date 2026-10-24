# The Frost tower (V-06l, the Spire's wards, batch 1)

Theme A, Han's pick of 24 Oct 2026 (`../../wards-concepts/frost-a.png`, `docs/art/wards-style.md`): the palest round moon-stone tower, a frosted rounded rim, a small arched door, a six-sided ice column up its middle with an ice lance on a pivot across it. The concept made into the game's tower in two Meshy models, its body and its turret (`Tower3DRig` turns the turret and steps its recoil; the base never turns), through `tools/blender/structures.py` (`docs/ART.md` §15, "The Spire's wards (V-06l), batch 1"). Designed by Claude, generated in Meshy on 24 Oct 2026. **Generated on a Meshy Premium plan, private licence, commercial use permitted.**

| File | What |
|---|---|
| `body.png` | the image the body was made from: the concept redrawn by `meshy_image_to_image` (1024 × 1024): the tower without its lance: the ice column ending in a flat six-sided top with a small pivot plate |
| `turret.png` | the image the turret was made from: the ice lance alone on its pivot post: the long ice blade along glTF −x, its iron butt and collar, the pivot head on a short post (1024 × 1024) |
| `body.glb` | the body as `meshy_image_to_3d` returned it, **no skeleton**: 19,972 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, glTF Y up, its middle at the origin; 2.4 MB |
| `turret.glb` | the turret likewise: 6,856 triangles, a 2048 × 2048 JPEG base colour; 2.1 MB |

## Meshy tasks (24 Oct 2026)

| Step | Task id | Credits | |
|---|---|---|---|
| Body (image to image) | `01a16da6-9cc9-7159-b45c-b95f403c1f69` | 9 | **kept**: `body.png` |
| Body (image to 3D) | `01a16da7-c4e8-7683-9685-d5f469c8fb9b` | 30 | **kept**, attempt 1 of 1 |
| Turret (image to image) | `01a16da6-9cb6-75d3-a39a-364213956764` | 9 | **kept**: `turret.png` |
| Turret (image to 3D) | `01a16da7-c49c-762e-b3b6-ceb1fff64d1d` | 30 | **kept**, attempt 1 of 1 |
| | | **78** | |

## Settings

`meshy_image_to_image`: `nano-banana-pro`, 1:1, one reference (the theme-A concept as Meshy returned it). `meshy_image_to_3d` from that task: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false (keeps the styling), `should_remesh` true, `target_polycount` 20000 for a body and 8000 for a turret, `topology` triangle, no `pose_mode` (a building: its own pose), `target_formats` ["glb"]. The remesh is the image to 3D's own (`should_remesh`, as the creeps'), not a `meshy_remesh` task after it: the texture is then made on the final mesh, and a task and five credits a model are saved. Up axis checked: glTF Y, the ground level (the body stands on its lowest vertices, flat).

## The prompts (image to image, reference: `frost-a.png`)

**Body**

```text
Redraw exactly this building without its ice lance: the same original design, proportions, colours and finish, a chibi moon-stone ward tower, a stylised 3D game model like a small collectible toy or a tabletop miniature. Keep every mark: the round tower of the palest moon-stone in the same big simple blocks, its frosted rounded rim, the small dark timber door in its arched doorway, and the thick six-sided pale ice column standing up from the middle of its top.

Remove the ice lance, its blade, its dark iron pivot head and its pin from the top of the column: the ice column ends in a flat six-sided top with only a small low round dark iron pivot plate on it. Nothing stands on the column.

Same three-quarter view from above as the picture, the camera high and looking down at about 55 degrees; the whole building inside the frame with margin, standing alone on a plain flat mid-grey ground, nothing else in the picture. Flat cel colours in two tones per material, no stone texture, no wood grain, no metal scratches, no moss, no fine detail; even, readable lighting, no cast shadows, no glow, no motion blur, no text, no logo.
```

**Turret**

```text
Show only this tower's ice lance on its pivot, taken off the tower: the same original design, colours and finish. The long pale ice blade of the lance with its sharp point, its dark iron butt end and collar, and the dark iron pivot head with its pin that the lance rests across, on a short dark iron post with a round foot. The lance level, the pivot under its back third; the blade wide and thick, a simple faceted ice shape.

Chibi toy proportions, like a small collectible toy or a tabletop miniature: chunky, thick and simple, every part big enough to read at 40 pixels seen from straight above. The piece alone, nothing else: no tower, no wall, no roof, no floor, no ground details. Three-quarter view from above, the camera high and looking down at about 45 degrees, the piece pointing toward the left of the picture; the whole piece inside the frame with margin, on a plain flat mid-grey ground, nothing else in the picture. Flat cel colours in two tones per material, no wood grain, no metal scratches, no fine detail; even, readable lighting, no cast shadows, no glow, no motion blur, no text, no logo.
```

## Geometry (glTF metres of the model as Meshy made it: x, y up, z)

| Model | |
|---|---|
| Body | ground y −0.951; the frosted rim up to 0.47 (r 0.7–0.81); the ice column (r ≈ 0.2) up to 0.951; the widest r 0.912; centred |
| Turret | its post's foot at (0.416, 0), y −0.48; the blade at y 0.26–0.40, its tip at x −0.95 (1.37 m from the pivot), its butt to +0.95; the blade 0.16 m wide |

## In the game

Body 32 / 34 / 36 world px per metre (radius 29–33: the palest disc, its column under the lance's pivot); the lance 19 / 20 / 21 along, thickened 2.4 / 2.6 / 2.7× across (at its own width it was a line at phone size); on a shot it is driven back 3 px. Tier 2 and 3: two and four ice columns with frost caps standing on the rim (r 0.76); tier 3 four ice chunks between them and the pivot plate, the post and the collar in gold. Glacier: the tower in dark glacier ice, seven ice boulders round it (a jagged shelf), four columns, a lance 4.2× as thick in gold. Blizzard: the tower in snow, four columns, and for its turret the Flak's rotor alone (its sails, frames and hub) laid flat and painted in ice: on a pulse the sails turn 30°.

## Paint

The stone (four tones) to `mix(stone, snow, 0.55)`, the frosted rim to `snow`, the column to `ice`, the door to `woodDark` toward `ink`, the pivot plate to `iron`. The lance's blade to `ice` (metal 0.6), its iron to `iron`, the dark collar and grip to `ironDark`. Every colour Meshy painted is listed in the row (`tones`); an unexpected one stops the build.

## What looks wrong

- From straight down the column is under the lance's pivot: what reads is the pale disc, its rim and the lance.
