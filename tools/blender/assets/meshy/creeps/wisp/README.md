# The Wisp (V-06j, enemy batch 2)

The host's flyer, a floating skull-lantern: the skull held in a band of dark iron with a ring on top, an ember flame
rising through the ring, ember in its sockets and its open jaw, a curl of ash-grey smoke for a body. Han's pick **Wisp
b** (`../../enemy-concepts/wisp-b.png`), made into the game's Wisp on 24 Oct 2026. Designed by Claude, generated in
Meshy. **Generated on a Meshy Premium plan, private licence, commercial use permitted.**

| File | What |
|---|---|
| `concept.png` | the image the model was made from: the pick redrawn by `meshy_image_to_image` (896 × 1200) for a clean model (the band and ring close and solid, the flame one shape, the smoke a short thick curl) |
| `model.glb` | the textured model as `meshy_image_to_3d` returned it, **no skeleton**: 20,748 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, facing glTF +Z, its middle at the origin; 2.8 MB |

**No rig** (Han's brief: a Wisp has no limbs; its bob over its shadow is the rig's, as before). The pipeline poses it
from its bind pose (`tools/blender/tdt3d/posed.py`, the `posed` of its row in `tools/blender/creeps.py`).

## Meshy tasks (24 Oct 2026)

| Step | Task id | Credits | |
|---|---|---|---|
| Pose (image to image) | `01a16ca7-6b37-752c-a41d-d60b3cfa8195` | 9 | **kept**: every mark of the pick, the parts made solid |
| Model (image to 3D) | `01a16ca8-f8f1-7405-93b9-25990781d5ac` | 30 | **kept**, attempt 1 of 1 |
| | | **39** | |

## Settings

`meshy_image_to_image`: `nano-banana-pro`, one reference (the pick, as Meshy returned it: it already faces the picture's left). `meshy_image_to_3d` from that task: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false (keeps the styling), `should_remesh` true, `target_polycount` 20000 (a creep is drawn at 4 px per world px, a third of a hero's screen size), `topology` triangle, no `pose_mode` (the concept's own pose), `target_formats` ["glb"]. 3:4.

## The prompt (image to image, reference: `wisp-b.png`)

```text
Redraw exactly this creature: the same original design, proportions, colours and finish, a chibi floating skull-lantern of bone and ember, a stylised 3D game creature like a small collectible vinyl toy. Keep every mark: the big hollow bone skull with its two round eye sockets and its open jaw glowing ember-orange from the flame inside, the band of dark iron round the skull with the round iron ring on top, the tall teardrop flame of ember-orange rising from the top of the skull through the ring, and below the skull the short tail of pale ash-grey smoke curling to a point.

Change only what makes it clean for a 3D model: the skull level and upright, its jaw open, the iron band and the ring close round the skull and thick enough to read as solid iron, the flame one solid teardrop shape, the smoke tail short, thick and solid like a curled vinyl tail, hanging down under the skull and curling a little, touching nothing. It floats in the air, nothing under it. Front three-quarter view, the creature turned slightly toward the left of the picture.

The whole creature, the top of the ring and the tip of the smoke tail inside the frame with margin, plain flat mid-grey background, nothing else in the picture. No wings, no arms, no body, no cloth, no skin. Flat cel colours in two tones per material, no bone texture, no cracks, no scratches, no fine detail; even, readable lighting, no cast shadows, no motion blur, no text, no logo.
```

## The poses (`posed`, glTF metres of `model.glb`)

Its soles are the smoke's tip (y −0.952), so the rig bobs it from there over its shadow, as the pack's Ghost. Two
regions: the flame (the faces painted ember above y 0.38, inside |x| < 0.3: not the iron ring it rises through) and
the smoke (the faces painted smoke, fading in below y −0.05). The smoke below y −0.37 is cut into the weapon layer, left
out of the size: the skull, its ring and its flame are the figure the radius measures (16.8 × 28.2 world px at rest).

| State | Frames | Pose |
|---|---|---|
| walk | 4 | the flame's flicker (leaning ±6°, stretched to 1.14 and squat to 0.9) and the smoke's sway (±7°), over 0.64 s |
| stand | 1 | the bind pose |
| attack | 3 | its flare: the flame 1.55, 1.95, then 1.25 times as tall, the skull tipped back 6–10° (a Wisp never strikes, but a Taunt holds it at the Warden: there it flares) |
| flinch | 1 | tipped back 14°, the flame blown low and back |
| death | 3 | the ember goes out: the flame 0.55, 0.25, 0.04 of its size while the skull tips forward and over (to 75°, rolled 35°) and sinks, the smoke thinning |

## What looks wrong

- From the match camera its iron ring frames the skull: at 40 px it reads as a dark halo round the bone.
- The flame and the eyes glow hot yellow with the bloom, not orange (as every ember glow does).
