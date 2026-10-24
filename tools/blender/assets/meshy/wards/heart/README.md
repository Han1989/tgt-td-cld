# The Heart (V-06l, the Spire's wards, batch 2)

Theme A, Han's pick of 24 Oct 2026 (`../../wards-concepts/heart-a.png`, `docs/art/wards-style.md`): a squat round keep of pale moon-stone ringed by four round corner turrets under conical slate caps, chunky merlons round its walk, a big arched timber gate with iron straps, and the Spire rising from its middle, a slender round tower with teal slit windows under a steep slate roof, the rose-red crystal on its tip. One Meshy model, the game's Heart in its three damage stages through `tools/blender/structures.py` (`docs/ART.md` §15, "The Spire's wards (V-06l), batch 2"; `Heart3DView` plays them). Designed by Claude, generated in Meshy on 24 Oct 2026. **Generated on a Meshy Premium plan, private licence, commercial use permitted.**

| File | What |
|---|---|
| `body.png` | the image the model was made from: the concept redrawn by `meshy_image_to_image` on a plain mid-grey ground (the concept's near-black ground would have merged with its dark slate caps), nothing else changed (896 × 1200) |
| `body.glb` | the model as `meshy_image_to_3d` returned it, **no skeleton**: 19,567 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, glTF Y up, its middle at the origin, the gate facing glTF +z; 3.7 MB |

## Meshy tasks (24 Oct 2026)

| Step | Task id | Credits | |
|---|---|---|---|
| Image to image | `01a16de6-0b56-7762-9fe8-5be76867fb48` | 9 | **kept**: `body.png` |
| Image to 3D | `01a16de7-7cfc-7704-9098-dd358e5caf7d` | 30 | **kept**, attempt 1 of 1 |
| | | **39** | |

## Settings

`meshy_image_to_image`: `nano-banana-pro`, 3:4, one reference (`heart-a.png`). `meshy_image_to_3d` from that task: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false, `should_remesh` true, `target_polycount` 20000, `topology` triangle, no `pose_mode`, `target_formats` ["glb"], as batch 1's bodies. Up axis checked: glTF Y, the keep standing level on its lowest vertices.

## The prompt (image to image, reference: `heart-a.png`)

```text
Redraw exactly this building on a plain flat mid-grey ground: the same original design, proportions, colours and finish, a chibi moon-stone keep, a stylised 3D game model like a small collectible toy or a tabletop miniature. Keep every mark: the squat round keep of pale moon-stone in the same big simple blocks, the four small round corner turrets with their conical dark blue-grey slate caps, the chunky crenellations, the big arched dark timber gate with its dark iron bands facing the viewer; the tall slender round Spire rising from the middle of the keep with its steep conical slate roof, its narrow slit windows painted soft teal, and on the tip of its roof the one big faceted crystal painted deep rose-red, not orange.

Same three-quarter view from above as the picture, the camera high and looking down at about 55 degrees; the whole building inside the frame with margin, standing alone on a plain flat mid-grey ground, nothing in front of it, nothing else in the picture. Flat cel colours in two tones per material, no stone texture, no wood grain, no metal scratches, no moss, no fine detail; even, readable lighting, no cast shadows, no glow, no motion blur, no text, no logo.
```

## Geometry (glTF metres of the model as Meshy made it: x, y up, z)

| Part | |
|---|---|
| The keep | ground y −0.952, centred; its wall r 0.57, up to the merlons' tops at −0.30, its walk at −0.41; 1.18 m across with the turrets (x ±0.59, z ±0.57) |
| The turrets | at (±0.42, ±0.42), r 0.16, their caps' tips at y 0.0 |
| The merlons | round the walk at r ≈ 0.51; the front ones at x −0.19, −0.03, +0.19 (z 0.47), the side ones at x ±0.51 |
| The gate | x ±0.19, y −0.95..−0.45, at z ≈ 0.55 |
| The Spire | r 0.15 from the walk to its eaves at y 0.16, its slit windows at y 0.0..0.1; its roof's tip at 0.71 |
| The crystal | y 0.71..0.95, its centre (0, 0.83, 0) |

## In the game

71 world px per metre across (84 world px: the KayKit castle's footprint) and 78 up (1.1 times: seen from the south at 55° the Spire rises over its keep as the concept's lower view showed it; the crystal's top 85 world px over the Heart's point, just under the ring round the feet of a hero standing at the spawn, 3 tiles north, which reaches down to 86: at 1.2 times the crystal's top, at 93, was under it). A hero elsewhere on the Heart is drawn over it, as over V-05d's castle. Seen from the south as the KayKit Heart was, standing where it stood. The three stages are this one model:

- **Whole.**
- **Cracked** (under 60%): dark cracks (`htCrack`) painted where the south camera sees stone, down both front turrets, beside the gate and down the Spire, and across the walk (zigzags in the camera's picture plane, `HT_CRACKS`); two merlons knocked askew (`posed` regions): the front-right one tipped out over the wall's edge, the next on the right side fallen in onto the walk; a half pile of rubble at the front-right.
- **Ruined and burning** (under 30%): the cracks and merlons, and the top third gone: the Spire broken off below its roof along a jagged line, and the caps of the front-left and back-right turrets; **the crystal hovers where it was** (the Heart still beats until it falls: the client's light, its shards and its flash stay where the crystal is at every stage); rubble round the base; the kit's flames on the broken Spire, on the walk and in the two open turrets.

White twins of each stage (the hit flash); the Heart's light (`heart/glow`: the crystal's and the windows' light, pulsed with the beat); the rubble and flame frames are the kit's (`rubble_large`, `rubble_half`, the lit torch's flame), as V-05d's.

## Paint

The moon-stone (three tones) to `mix(stone, snow, 0.3)`, its painted shadows and mortar (four tones) to `stone`; the slate (two tones) to `mix(steelDark, steel, 0.2)`; the gate's timber to `woodDark` toward `ink`, its iron straps (painted in the walls' shadow tones: `_gate_iron`) to `iron`; the windows (five teal tones) to the `rune` glow; the crystal to the **`heart` glow** (`#ff3a60`, rose-red, as the concept; far from the host's `ember`, so not stepped toward crimson: `docs/GAME_DESIGN.md` §13). Every colour Meshy painted is listed in the row (`HEART_BODY`); an unexpected one stops the build.

## What looks wrong

- From the south the Spire's roof is foreshortened: the model stands 1.1 times taller than Meshy made it so the Spire reads.
- The crystal hovers over the broken Spire in the ruined stage (by design, above); Han judges it on his phone.
- The cracks are painted on Meshy's faces (about two faces wide): at phone size they read as dark streaks, not fine lines.
