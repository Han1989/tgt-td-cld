# The Arrow tower (V-06l, the Spire's wards, batch 1)

Theme A, Han's pick of 24 Oct 2026 (`../../wards-concepts/arrow-a.png`, `docs/art/wards-style.md`): a narrow round moon-stone tower, about twice as tall as wide, a dark timber gallery under its crenellated parapet, a ballista on its flat top. The concept made into the game's tower in two Meshy models, its body and its turret (`Tower3DRig` turns the turret and steps its recoil; the base never turns), through `tools/blender/structures.py` (`docs/ART.md` §15, "The Spire's wards (V-06l), batch 1"). Designed by Claude, generated in Meshy on 24 Oct 2026. **Generated on a Meshy Premium plan, private licence, commercial use permitted.**

| File | What |
|---|---|
| `body.png` | the image the body was made from: the concept redrawn by `meshy_image_to_image` (1024 × 1024): the tower without its ballista: the round timber floor inside the parapet empty, a small turntable plate on it |
| `turret.png` | the image the turret was made from: the ballista alone on its turntable: its dark timber stock, its bow 1.68 m across, the bolt laid in it, along glTF −x (1024 × 1024) |
| `body.glb` | the body as `meshy_image_to_3d` returned it, **no skeleton**: 17,635 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, glTF Y up, its middle at the origin; 3.9 MB |
| `turret.glb` | the turret likewise: 6,775 triangles, a 2048 × 2048 JPEG base colour; 2.7 MB |

## Meshy tasks (24 Oct 2026)

| Step | Task id | Credits | |
|---|---|---|---|
| Body (image to image) | `01a16da6-7ff2-7369-9bca-59c66017ea67` | 9 | **kept**: `body.png` |
| Body (image to 3D) | `01a16da7-c44a-77a4-9c8a-2805a46bc50c` | 30 | **kept**, attempt 1 of 1 |
| Turret (image to image) | `01a16da6-9d05-7669-992d-83dc1afde4c5` | 9 | **kept**: `turret.png` |
| Turret (image to 3D) | `01a16da7-c2de-7243-a477-48b18864c994` | 30 | **kept**, attempt 1 of 1 |
| | | **78** | |

## Settings

`meshy_image_to_image`: `nano-banana-pro`, 1:1, one reference (the theme-A concept as Meshy returned it). `meshy_image_to_3d` from that task: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false (keeps the styling), `should_remesh` true, `target_polycount` 20000 for a body and 8000 for a turret, `topology` triangle, no `pose_mode` (a building: its own pose), `target_formats` ["glb"]. The remesh is the image to 3D's own (`should_remesh`, as the creeps'), not a `meshy_remesh` task after it: the texture is then made on the final mesh, and a task and five credits a model are saved. Up axis checked: glTF Y, the ground level (the body stands on its lowest vertices, flat).

## The prompts (image to image, reference: `arrow-a.png`)

**Body**

```text
Redraw exactly this building without its ballista: the same original design, proportions, colours and finish, a chibi moon-stone ward tower, a stylised 3D game model like a small collectible toy or a tabletop miniature. Keep every mark: the narrow round tower of pale moon-stone in the same big simple blocks, about twice as tall as it is wide, the dark iron bands round it, the narrow arrow slits, the small dark timber door with its iron hinges, the dark timber gallery ringing the top, the chunky crenellated parapet and the dark timber floor inside it.

Remove the ballista, its bow, its string, its bolt and its mount from the top of the tower: the round timber floor inside the crenellations is empty and clearly visible from above, with only a small low round dark iron turntable plate at its centre. Nothing stands above the crenellations.

Same three-quarter view from above as the picture, the camera high and looking down at about 55 degrees; the whole building inside the frame with margin, standing alone on a plain flat mid-grey ground, nothing else in the picture. Flat cel colours in two tones per material, no stone texture, no wood grain, no metal scratches, no moss, no fine detail; even, readable lighting, no cast shadows, no glow, no motion blur, no text, no logo.
```

**Turret**

```text
Show only this tower's ballista, taken off the tower: the same original design, colours and finish. The small mounted crossbow with its dark timber stock, its curved dark blue-grey iron bow and its string, the bolt laid in it, the short dark timber mount under it and the round dark iron turntable the mount stands on. The bow wide, about as wide as the stock is long, its limbs thick.

Chibi toy proportions, like a small collectible toy or a tabletop miniature: chunky, thick and simple, every part big enough to read at 40 pixels seen from straight above. The piece alone, nothing else: no tower, no wall, no roof, no floor, no ground details. Three-quarter view from above, the camera high and looking down at about 45 degrees, the piece pointing toward the left of the picture; the whole piece inside the frame with margin, on a plain flat mid-grey ground, nothing else in the picture. Flat cel colours in two tones per material, no wood grain, no metal scratches, no fine detail; even, readable lighting, no cast shadows, no glow, no motion blur, no text, no logo.
```

## Geometry (glTF metres of the model as Meshy made it: x, y up, z)

| Model | |
|---|---|
| Body | ground y −0.952; the merlons up to 0.951 round a timber floor at 0.80 (the turntable plate on it, 0.82); the gallery under the parapet its widest, r 0.532; centred on (0, 0) |
| Turret | its turntable (pivot) at (x, z) (0.122, 0), its foot y −0.361; the bolt's tip at x −0.95 (1.07 m from the pivot), the bow's tips at z ±0.84; turned 180° in the game so it points +x |

## In the game

Body 45 / 48 / 50 world px per metre at tiers 1–3 (its radius 24–27 world px: the smallest footprint); the ballista 24 / 26 / 27 (its reach 26–29). Tier 2 and 3: two and four rune-capped pillars on the merlons (r 0.47 of the body); tier 3 the bands, the bow and the ballista's turntable in gold (the plate round its mount is the gold that shows from above). Sniper: the tower dark as a bastion, six rune pillars, the ballista 1.25× long in gold. Volley: four Builder wall corners round it, a rune-lit bartizan at each corner, three ballistas fanned 26° apart.

## Paint

The moon-stone (four painted tones) to `mix(stone, snow, 0.3)`, its painted shadow and the mortar between its blocks to `stone`; the timber (the gallery, the door, the frame) to `woodDark` and the floor darker, `woodDark` toward `ink` (from straight down the gallery's ring and the floor are what shows, and the ballista must read on the floor); the iron bands to `iron`. The ballista's stock to `wood` and its bow to `steel` (both lighter than the concept: dark on the timber floor they vanished at phone size), its turntable to `ironDark`, its string to `string`. Every colour Meshy painted is listed in the row (`tones`); an unexpected one stops the build.

## What looks wrong

- From straight down the tower is its top: the gallery's dark timber ring, the merlons' pale tops and the floor; its height (the arrow slits, the door) never shows.
- The bowstring is a hair at phone size; the bow and the bolt carry the aim.
