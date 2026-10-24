# A portal (V-06l, the Spire's wards, batch 2)

Theme A, Han's pick of 24 Oct 2026 (`../../wards-concepts/portal-a.png`, `docs/art/wards-style.md`): a wide gatehouse of pale moon-stone, two squat round towers under conical slate caps either side of a tall round arch, a dark timber hoarding along the wall over it under a slate roof, dark iron bands, the teeth of a raised portcullis at the top of the arch, and before each tower a short rune-stone. One Meshy model, the game's portals through `tools/blender/structures.py` (`docs/ART.md` §15, "The Spire's wards (V-06l), batch 2"; `Portal3DView` draws it with the client's swirl and wave-start flare in the arch). Designed by Claude, generated in Meshy on 24 Oct 2026. **Generated on a Meshy Premium plan, private licence, commercial use permitted.**

| File | What |
|---|---|
| `body.glb` | the model as `meshy_image_to_3d` returned it from the concept itself (no image edit: `portal-a.png` already stands alone on a plain mid-grey ground), **no skeleton**: 19,991 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, glTF Y up, centred, the arch facing glTF +z; 4.4 MB |

## Meshy tasks (24 Oct 2026)

| Step | Task id | Credits | |
|---|---|---|---|
| Image to 3D (from `../../wards-concepts/portal-a.png`) | `01a16de6-0b6b-70fb-b68a-42ff8b5afa88` | 30 | **kept**, attempt 1 of 1 |

## Settings

`meshy_image_to_3d` from the concept file: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false, `should_remesh` true, `target_polycount` 20000, `topology` triangle, no `pose_mode`, `target_formats` ["glb"]. Up axis checked: glTF Y, standing level on its lowest vertices.

## Geometry (glTF metres of the model as Meshy made it: x, y up, z)

| Part | |
|---|---|
| The whole | ground y −0.701, centred; x ±0.95 (the towers' eaves), z ±0.47 |
| The towers | at (±0.66, 0.05), r 0.24; Meshy squared off their backs (z −0.47..−0.1), hidden from the south |
| The arch | a passage open through, x ±0.3, up to y −0.05, its floor dark, its front at z 0.22; the portcullis's teeth hang from its top |
| The rune-stones | x ±(0.45..0.62), z 0.36..0.47, y −0.70..−0.38 |

## In the game

54 world px per metre (102 world px across: the KayKit gatehouse's width), standing on the lane's first point, seen from the south as V-05d's gatehouse was: the arch faces down its lane and the lane leaves from under it. The client draws its swirl, its glow and the wave-start flare in the arch's opening (`portal.points.opening`: the passage's front, half way up, 17 world px up and 12 south of the portal's point, where V-05d's was). The rune-stones' upper parts glow teal (`rune`): the portal's lights, which the client flickers (`portal/glow`), V-05d's torches under the wards' rule (nothing on a ward glows warm).

## Paint

The moon-stone (six tones, the rune-stones and their marks among them) to `mix(stone, snow, 0.25)`, its mortar and painted shadow to `stone`; the hoarding's timber to `woodDark` toward `ink`; the slate (three tones) to `mix(steelDark, steel, 0.2)`; the iron bands to `iron`; the passage's dark to `ink` toward `night`, unlined; the rune-stones' upper parts (`_rune_top`) to the `rune` glow. Every colour Meshy painted is listed in the row (`PORTAL_BODY`); an unexpected one stops the build.

## What looks wrong

- The concept's rune-stones carry rune-like marks; the style sheet allows no symbols, so they are painted plain and the light is the stones' glowing tops (as `wards-concepts/README.md` said).
- The towers' backs are square (Meshy's guess at what the concept hid); the south camera never sees them.
