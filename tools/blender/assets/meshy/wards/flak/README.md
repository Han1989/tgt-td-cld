# The Flak tower (V-06l, the Spire's wards, batch 1)

Theme A, Han's pick of 24 Oct 2026 (`../../wards-concepts/flak-a.png`, `docs/art/wards-style.md`): a low square moon-stone emplacement, chunky merlons along its sides, dark iron caps and straps on its corners, a timber deck, a skyward six-sailed rotor in a dark iron housing on a post. The concept made into the game's tower in two Meshy models, its body and its turret (`Tower3DRig` turns the turret and steps its recoil; the base never turns), through `tools/blender/structures.py` (`docs/ART.md` §15, "The Spire's wards (V-06l), batch 1"). Designed by Claude, generated in Meshy on 24 Oct 2026. **Generated on a Meshy Premium plan, private licence, commercial use permitted.**

| File | What |
|---|---|
| `body.png` | the image the body was made from: the concept redrawn by `meshy_image_to_image` (1024 × 1024): the emplacement without its rotor: the timber deck empty, a gear-edged turntable plate at its centre (and a stray post the edit left on the deck: dropped in the pipeline) |
| `turret.png` | the image the turret was made from: the rotor alone on its post: six pale sails in timber frames round an iron hub, facing glTF +z (tilted 14° up), the barrel-shaped housing behind it, on a post with a geared foot (1024 × 1024) |
| `body.glb` | the body as `meshy_image_to_3d` returned it, **no skeleton**: 18,596 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, glTF Y up, its middle at the origin; 3.4 MB |
| `turret.glb` | the turret likewise: 8,036 triangles, a 2048 × 2048 JPEG base colour; 3.3 MB |

## Meshy tasks (24 Oct 2026)

| Step | Task id | Credits | |
|---|---|---|---|
| Body (image to image) | `01a16da6-9ca7-76b7-a1e5-c14a444683ed` | 9 | **kept**: `body.png` |
| Body (image to 3D) | `01a16da7-c4f3-75a4-a900-2885e02f863b` | 30 | **kept**, attempt 1 of 1 |
| Turret (image to image) | `01a16da6-9cf5-74cd-b7dc-23d0a9bd9284` | 9 | **kept**: `turret.png` |
| Turret (image to 3D) | `01a16da7-c51a-70e9-a984-48f6fc65c4bf` | 30 | **kept**, attempt 1 of 1 |
| | | **78** | |

## Settings

`meshy_image_to_image`: `nano-banana-pro`, 1:1, one reference (the theme-A concept as Meshy returned it). `meshy_image_to_3d` from that task: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false (keeps the styling), `should_remesh` true, `target_polycount` 20000 for a body and 8000 for a turret, `topology` triangle, no `pose_mode` (a building: its own pose), `target_formats` ["glb"]. The remesh is the image to 3D's own (`should_remesh`, as the creeps'), not a `meshy_remesh` task after it: the texture is then made on the final mesh, and a task and five credits a model are saved. Up axis checked: glTF Y, the ground level (the body stands on its lowest vertices, flat).

## The prompts (image to image, reference: `flak-a.png`)

**Body**

```text
Redraw exactly this building without its rotor: the same original design, proportions, colours and finish, a chibi moon-stone ward emplacement, a stylised 3D game model like a small collectible toy or a tabletop miniature. Keep every mark: the low square emplacement of pale moon-stone in the same big simple blocks, the chunky crenellations along its sides, the dark iron caps and straps on its corners, the dark timber band round it and the dark timber deck inside it.

Remove the rotor, its six sails, its hub and the dark iron housing it stands on: the timber deck inside the crenellations is empty and clearly visible from above, with only a low round dark iron turntable plate at its centre. Nothing stands above the crenellations.

Same three-quarter view from above as the picture, the camera high and looking down at about 55 degrees; the whole building inside the frame with margin, standing alone on a plain flat mid-grey ground, nothing else in the picture. Flat cel colours in two tones per material, no stone texture, no wood grain, no metal scratches, no moss, no fine detail; even, readable lighting, no cast shadows, no glow, no motion blur, no text, no logo.
```

**Turret**

```text
Show only this tower's skyward rotor, taken off the tower: the same original design, colours and finish. The six pale sails in dark timber frames radiating from the dark iron hub, the dark iron housing behind the hub, the rotor's face tilted up at the sky, and the round dark iron turntable the housing stands on. The sails broad, the hub big and round.

Chibi toy proportions, like a small collectible toy or a tabletop miniature: chunky, thick and simple, every part big enough to read at 40 pixels seen from straight above. The piece alone, nothing else: no tower, no wall, no roof, no floor, no ground details. Three-quarter view from above, the camera high and looking down at about 45 degrees, the piece pointing toward the left of the picture; the whole piece inside the frame with margin, on a plain flat mid-grey ground, nothing else in the picture. Flat cel colours in two tones per material, no wood grain, no metal scratches, no fine detail; even, readable lighting, no cast shadows, no glow, no motion blur, no text, no logo.
```

## Geometry (glTF metres of the model as Meshy made it: x, y up, z)

| Model | |
|---|---|
| Body | ground y −0.532; the deck at 0 (the plate 0.03), the merlons and the corner caps up to 0.33; a square 0.95 across its sides (r 1.33 at the corners); a stray post at x 0.30–0.40 up to y 0.5 (`drop`: over y 0.12 within r 0.62) |
| Turret | its post's foot at (−0.009, −0.101), y −0.951; the rotor's centre (0.06, 0.13, 0.42), its axis (−0.043, 0.237, 0.971), radius 0.8; the housing's trunnion at (0, −0.04, −0.15) |

## In the game

Body 31 / 33 / 35 world px per metre (half-width 29–33); the turret 25 / 27 / 28. The housing and the rotor (all over the post's yoke) are tilted 46° about the trunnion at rest, so the sails face 60° up: from above a disc of sails, blades radiating from a hub; turned to point +x. On a shot it kicks back 3 px and the sails turn 30° (half a step). Tier 2 and 3: two and four posts on the corner caps, their caps glowing teal; tier 3 the corner caps and the turret's iron in gold. Skyguard: the emplacement turned a quarter (a diamond), moon-glowing lenses on its points, two rotors side by side with moonlit sails. Hailstorm: four ammo drums against its sides (a cross), their bands violet, one rotor with a second set of sails turned 30° (twelve).

## Paint

The stone (five tones) to `mix(stone, snow, 0.3)`, its shade to `stone`; the caps and straps to `iron` (gold at tier 3); the deck to `woodDark` toward `ink`. The turret's iron to `steelDark`, the sails to `mix(steel, snow, 0.6)` (paler than V-05d's: from above they face away from the moon at rest), their frames to `woodDark` toward `ink`. Every colour Meshy painted is listed in the row (`tones`); an unexpected one stops the build.

## What looks wrong

- The image edit left a small post of the rotor's mount standing on the deck; the pipeline drops it (`drop`).
- The rotor is tilted in the pipeline (a pose of its vertices), not by Meshy: its post stays upright, the housing's back dips toward the deck.
