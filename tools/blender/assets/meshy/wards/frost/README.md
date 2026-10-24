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

Body 32 / 34 / 36 world px per metre (radius 29–33: the palest disc, its column under the lance's pivot); the lance 19 / 20 / 21 along, thickened 2.4 / 2.6 / 2.7× across (at its own width it was a line at phone size); on a shot it is driven back 3 px. Tier 2 and 3: two and four ice columns with frost caps standing on the rim (r 0.76); tier 3 four ice chunks between them and the pivot plate, the post and the collar in gold. Glacier: the tower in dark glacier ice, seven ice boulders round it (a jagged shelf), four columns, a lance 4.2× as thick in gold. Blizzard: the tower in snow, four columns, and for its turret the Flak's rotor alone (its sails, frames and hub) laid flat and painted in ice: on a pulse the sails turn 30°. Batch 1 composed both branches' turrets from the tier-1 one as described here; since batch 2 each branch has its own turret (below), on the same bodies.

## Paint

The stone (four tones) to `mix(stone, snow, 0.55)`, the frosted rim to `snow`, the column to `ice`, the door to `woodDark` toward `ink`, the pivot plate to `iron`. The lance's blade to `ice` (metal 0.6), its iron to `iron`, the dark collar and grip to `ironDark`. Every colour Meshy painted is listed in the row (`tones`); an unexpected one stops the build.

## What looks wrong

- From straight down the column is under the lance's pivot: what reads is the pale disc, its rim and the lance.

## Batch 2: the branch turrets (V-06l, 24 Oct 2026)

Each branch has its own turret since batch 2 (batch 1 composed the tier-1 ice lance for both). Each is one image edit of `turret.png` (the ice lance as batch 1 made it, `meshy_image_to_image`, `nano-banana-pro`, 1:1, the file as the reference) that turns it into the branch, then `meshy_image_to_3d` from that task with batch 1's settings and the remesh inside the task at 8,000 triangles. Both came out right the first time (no retry). The branch's body (its outline, the kit's additions) is batch 1's, unchanged.

| File | What |
|---|---|
| `glacier.png` | the image the Glacier's turret was made from: the lance frozen into one thick six-sided ice column laid level on the same pivot post, a blunt faceted point, a broad iron collar with a pale violet stud (1024 × 1024) |
| `blizzard.png` | the image the Blizzard's turret was made from: six short ice lances round a round iron hub on the post, like a wheel's spokes, a pale violet stud on the hub (1024 × 1024) |
| `glacier.glb` | the Glacier's turret as `meshy_image_to_3d` returned it, **no skeleton**: 6,148 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, glTF Y up; 2.2 MB |
| `blizzard.glb` | the Blizzard's turret as `meshy_image_to_3d` returned it, **no skeleton**: 7,319 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, glTF Y up; 2.8 MB |

| Step | Task id | Credits | |
|---|---|---|---|
| Glacier (image to image) | `01a16de3-a7f1-725b-a205-3efd252976cf` | 9 | **kept**: `glacier.png` |
| Glacier (image to 3D) | `01a16de4-f57e-7322-8cd0-f6de0edb23e3` | 30 | **kept**, attempt 1 of 1 |
| Blizzard (image to image) | `01a16de3-a8c4-70e5-88e9-3a06f5d6fa75` | 9 | **kept**: `blizzard.png` |
| Blizzard (image to 3D) | `01a16de4-f5d1-7315-8cd3-683543defa14` | 30 | **kept**, attempt 1 of 1 |
| | | **78** | |

### The prompts (image to image, reference: `turret.png`)

Each is one paragraph naming the branch, then the turret prompt's composition and finish paragraph (above) with "as in the picture" after "pointing toward the left of the picture":

**Glacier**

```text
Redraw this tower's ice lance as its Glacier: the same original design, colours and finish, the lance frozen into one thick column of ice, laid level on the same dark iron pivot post. A massive six-sided column of pale ice-blue crystal as thick as a tree trunk, about as long as the lance was, its front end a blunt faceted point toward the left, its back end flat; a broad dark iron collar round its middle holds it on the post, a small pale violet crystal set in the collar. From above it reads as one thick ice log with a point.
```

**Blizzard**

```text
Redraw this tower's ice lance as its Blizzard: the same original design, colours and finish, a ring of ice lances on the same dark iron pivot post. Six short ice lances of pale ice-blue crystal, each a chunky faceted blade, set round a round dark iron hub on top of the post like the spokes of a wheel, all laid level and pointing outward, evenly spaced, one of them pointing toward the left; a small pale violet crystal stud on the top of the hub. From above it reads as a six-pointed star of ice on a dark iron hub.
```

The composition and finish paragraph, word for word:

```text
Chibi toy proportions, like a small collectible toy or a tabletop miniature: chunky, thick and simple, every part big enough to read at 40 pixels seen from straight above. The piece alone, nothing else: no tower, no wall, no roof, no floor, no ground details. Three-quarter view from above, the camera high and looking down at about 45 degrees, the piece pointing toward the left of the picture as in the picture; the whole piece inside the frame with margin, on a plain flat mid-grey ground, nothing else in the picture. Flat cel colours in two tones per material, no wood grain, no metal scratches, no fine detail; even, readable lighting, no cast shadows, no glow, no motion blur, no text, no logo.
```

### Geometry (glTF metres of the model as Meshy made it: x, y up, z)

| Model | |
|---|---|
| Glacier | its post's foot at (−0.399, 0), y −0.546 (near the column's back end, as the tier-1 lance's post); the column x −0.95..+0.95, y 0.19..0.48, 0.49 m across (z ±0.245), its point at +x; the stud in the collar at x 0 |
| Blizzard | its post's foot at (0, 0), y −0.557; the lances at y 0.18..0.37, their tips at r 0.95, one along +x; the stud on the hub, y 0.44..0.53 |

### In the game

**Glacier.** On the Glacier's dark ice (body 31, seven boulders, four frost columns, batch 1's): 22 world px per metre along, widened 1.6× across (35) so from straight down it reads as a column, not another lance (its reach 30 world px, 17 across); not turned (its point is already +x); on a shot it is driven back 3 px. Its iron gold, the stud glowing violet.

**Blizzard.** On the Blizzard's snowfield (body 34, four frost columns, batch 1's): 27 world px per metre (reach 26); on a pulse the ring turns 30° (half a step) about the pivot, as batch 1's rotor did. Its iron gold, the stud glowing violet.

### Paint

**Glacier.** The iron's tones to `frIron` (gold), the ice to `frLance` (`ice`, metal 0.6), its shade to `iceDark`, the stud's violet to `frCharge` (`arcane`). Every colour Meshy painted is listed in the row (`GLACIER_TURRET`); an unexpected one stops the build.

**Blizzard.** The post's and hub's iron to `frIron` and the hub's dark to `frCollar` (both gold), the ice to `frLance`, the stud to `frCharge`. Every colour Meshy painted is listed in the row (`BLIZZARD_TURRET`); an unexpected one stops the build.

### What looks wrong

- **Glacier:** Meshy tapered both ends a little; the front is the narrower one.
- **Blizzard:** From straight down the post is hidden under the hub: the star of lances is the turret.
