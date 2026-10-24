# The Cannon tower (V-06l, the Spire's wards, batch 1)

Theme A, Han's pick of 24 Oct 2026 (`../../wards-concepts/cannon-a.png`, `docs/art/wards-style.md`): a low wide octagonal moon-stone bastion (its stone a step toward teal), a dark iron band with studs, chunky crenellations round a flat roof, a stone-thrower on it. The concept made into the game's tower in two Meshy models, its body and its turret (`Tower3DRig` turns the turret and steps its recoil; the base never turns), through `tools/blender/structures.py` (`docs/ART.md` §15, "The Spire's wards (V-06l), batch 1"). Designed by Claude, generated in Meshy on 24 Oct 2026. **Generated on a Meshy Premium plan, private licence, commercial use permitted.**

| File | What |
|---|---|
| `body.png` | the image the body was made from: the concept redrawn by `meshy_image_to_image` (1024 × 1024): the bastion without its stone-thrower: the flat roof inside the merlons empty, the round turntable plate at its centre |
| `turret.png` | the image the turret was made from: the stone-thrower alone on its turntable: its timber frame bound in iron, its arm resting back with the sling-cup and a pale boulder at glTF −x, throwing along +x (1024 × 1024) |
| `body.glb` | the body as `meshy_image_to_3d` returned it, **no skeleton**: 16,837 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, glTF Y up, its middle at the origin; 3.4 MB |
| `turret.glb` | the turret likewise: 5,841 triangles, a 2048 × 2048 JPEG base colour; 2.4 MB |

## Meshy tasks (24 Oct 2026)

| Step | Task id | Credits | |
|---|---|---|---|
| Body (image to image) | `01a16da6-9c59-774d-bc61-2bb771e272d2` | 9 | **kept**: `body.png` |
| Body (image to 3D) | `01a16da7-c4a2-733a-8d98-665ed13f91d8` | 30 | **kept**, attempt 1 of 1 |
| Turret (image to image) | `01a16da6-9b5b-7273-979b-7bb41d2c06d4` | 9 | **kept**: `turret.png` |
| Turret (image to 3D) | `01a16da7-c50d-702c-b4bc-cc18bf06b3b8` | 30 | **kept**, attempt 1 of 1 |
| | | **78** | |

## Settings

`meshy_image_to_image`: `nano-banana-pro`, 1:1, one reference (the theme-A concept as Meshy returned it). `meshy_image_to_3d` from that task: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false (keeps the styling), `should_remesh` true, `target_polycount` 20000 for a body and 8000 for a turret, `topology` triangle, no `pose_mode` (a building: its own pose), `target_formats` ["glb"]. The remesh is the image to 3D's own (`should_remesh`, as the creeps'), not a `meshy_remesh` task after it: the texture is then made on the final mesh, and a task and five credits a model are saved. Up axis checked: glTF Y, the ground level (the body stands on its lowest vertices, flat).

## The prompts (image to image, reference: `cannon-a.png`)

**Body**

```text
Redraw exactly this building without its stone-thrower: the same original design, proportions, colours and finish, a chibi moon-stone ward bastion, a stylised 3D game model like a small collectible toy or a tabletop miniature. Keep every mark: the low wide octagonal bastion of pale moon-stone in the same big simple blocks, its sloped stone foot, the dark iron band with studs round it, the small dark timber door, the chunky crenellations round the flat roof.

Remove the stone-thrower, its timber frame, its throwing arm and its boulder from the roof: the flat stone roof inside the crenellations is empty and clearly visible from above, with only the low round dark iron turntable plate at its centre. Nothing stands above the crenellations.

Same three-quarter view from above as the picture, the camera high and looking down at about 55 degrees; the whole building inside the frame with margin, standing alone on a plain flat mid-grey ground, nothing else in the picture. Flat cel colours in two tones per material, no stone texture, no wood grain, no metal scratches, no moss, no fine detail; even, readable lighting, no cast shadows, no glow, no motion blur, no text, no logo.
```

**Turret**

```text
Show only this tower's stone-thrower, taken off the tower: the same original design, colours and finish. Its chunky dark timber frame bound with dark iron, its thick throwing arm resting back with the sling-cup at its end holding the pale round boulder, and the round dark iron turntable the frame stands on. The boulder big and round, the frame square and sturdy.

Chibi toy proportions, like a small collectible toy or a tabletop miniature: chunky, thick and simple, every part big enough to read at 40 pixels seen from straight above. The piece alone, nothing else: no tower, no wall, no roof, no floor, no ground details. Three-quarter view from above, the camera high and looking down at about 45 degrees, the piece pointing toward the left of the picture; the whole piece inside the frame with margin, on a plain flat mid-grey ground, nothing else in the picture. Flat cel colours in two tones per material, no wood grain, no metal scratches, no fine detail; even, readable lighting, no cast shadows, no glow, no motion blur, no text, no logo.
```

## Geometry (glTF metres of the model as Meshy made it: x, y up, z)

| Model | |
|---|---|
| Body | ground y −0.558; the merlons up to 0.556 round a flat roof, the turntable plate's top 0.36; 0.95 across its flats (the sloped foot's corners r 1.03); centred |
| Turret | its turntable at (0.219, 0), foot y −0.548; the arm runs from the axle at the frame's front, (x, y) (0.6, −0.2) across z, back to the cup at x −0.62 (its boulder to −0.95, y 0.26–0.55); the frame z ±0.73 |

## In the game

Body 37 / 39 / 41 world px per metre (half-width 35–39: the biggest footprint); the thrower 30 / 32 / 33. On a shot the thrower kicks back 2 px and its arm (with the cup and the boulder: a region of the vertices near the arm's line, `posed`) swings 50° up over the frame about the axle. Tier 2 and 3: two and four braziers of teal runelight on the merlons (r 0.82); tier 3 the iron band, the thrower's bands and its turntable in gold (the band is on the walls; from above the gold is the plate round the frame). Mortar: the bastion in iron, four violet braziers, the thrower 1.12× long with a charged shot glowing violet, its arm swinging 60°. Shrapnel: eight powder kegs round it (the saw-toothed outline), their bands violet, an iron bomb in the cup.

## Paint

The stone (seven painted tones, the roof's blue-grey patches Meshy painted as shadow included) to `mix(stone, snow, 0.25)`, its darkest seams to `stone`; the band to `iron`; the door to `woodDark` toward `ink`. The frame to `woodDark`, the turntable to `ironDark`, the bands to `iron`, the boulder to the moon-stone. Every colour Meshy painted is listed in the row (`tones`); an unexpected one stops the build.

## What looks wrong

- The arm is a soft region, not a separate part: at its full swing it passes through the frame's crossbar (two pixels at phone size).
- The boulder sits at the back, the frame toward the target: a catapult rests with its cup behind it.
