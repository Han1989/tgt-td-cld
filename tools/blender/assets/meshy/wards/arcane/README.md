# The Arcane tower (V-06l, the Spire's wards, batch 1)

Theme A, Han's pick of 24 Oct 2026 (`../../wards-concepts/arcane-a.png`, `docs/art/wards-style.md`): a round moon-stone tower with a dark timber band and posts, a round window, a small door, under a big dark slate dome like a mushroom cap, a staff holding a crystal on the dome. The concept made into the game's tower in two Meshy models, its body and its turret (`Tower3DRig` turns the turret and steps its recoil; the base never turns), through `tools/blender/structures.py` (`docs/ART.md` §15, "The Spire's wards (V-06l), batch 1"). Designed by Claude, generated in Meshy on 24 Oct 2026. **Generated on a Meshy Premium plan, private licence, commercial use permitted.**

| File | What |
|---|---|
| `body.png` | the image the body was made from: the concept redrawn by `meshy_image_to_image` (1024 × 1024): the tower without its staff: the dome ending in a small iron cap at its tip |
| `turret.png` | the image the turret was made from: the staff alone: its timber shaft with iron bands, two curved iron prongs holding the pale crystal at glTF −x, a round knob at the back, a small ring over it (where it is held) (1024 × 1024) |
| `body.glb` | the body as `meshy_image_to_3d` returned it, **no skeleton**: 18,693 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, glTF Y up, its middle at the origin; 2.8 MB |
| `turret.glb` | the turret likewise: 7,493 triangles, a 2048 × 2048 JPEG base colour; 2.7 MB |

## Meshy tasks (24 Oct 2026)

| Step | Task id | Credits | |
|---|---|---|---|
| Body (image to image) | `01a16da6-9ca2-7119-847c-a312306fb03f` | 9 | **kept**: `body.png` |
| Body (image to 3D) | `01a16da7-c4a0-7512-8f66-79adcc021e0c` | 30 | **kept**, attempt 1 of 1 |
| Turret (image to image) | `01a16da6-9cb8-71c1-9852-e885380cb6b8` | 9 | **kept**: `turret.png` |
| Turret (image to 3D) | `01a16da7-c488-76da-b906-fadc5877d9d1` | 30 | **kept**, attempt 1 of 1 |
| | | **78** | |

## Settings

`meshy_image_to_image`: `nano-banana-pro`, 1:1, one reference (the theme-A concept as Meshy returned it). `meshy_image_to_3d` from that task: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false (keeps the styling), `should_remesh` true, `target_polycount` 20000 for a body and 8000 for a turret, `topology` triangle, no `pose_mode` (a building: its own pose), `target_formats` ["glb"]. The remesh is the image to 3D's own (`should_remesh`, as the creeps'), not a `meshy_remesh` task after it: the texture is then made on the final mesh, and a task and five credits a model are saved. Up axis checked: glTF Y, the ground level (the body stands on its lowest vertices, flat).

## The prompts (image to image, reference: `arcane-a.png`)

**Body**

```text
Redraw exactly this building without its staff: the same original design, proportions, colours and finish, a chibi moon-stone ward tower, a stylised 3D game model like a small collectible toy or a tabletop miniature. Keep every mark: the round tower of pale moon-stone in the same big simple blocks, the dark timber band and posts, the small round window, the small dark timber door, and the big dark blue-grey slate dome over it like a mushroom cap, overhanging the walls.

Remove the staff, its crystal, its two prongs, its knob and the short post and ring it stands on from the top of the dome: the dome ends in a small low round dark iron cap at its tip. Nothing stands on the dome.

Same three-quarter view from above as the picture, the camera high and looking down at about 55 degrees; the whole building inside the frame with margin, standing alone on a plain flat mid-grey ground, nothing else in the picture. Flat cel colours in two tones per material, no stone texture, no wood grain, no metal scratches, no moss, no fine detail; even, readable lighting, no cast shadows, no glow, no motion blur, no text, no logo.
```

**Turret**

```text
Show only this tower's crystal staff, taken off the dome: the same original design, colours and finish. The level dark timber staff with its dark iron bands, the two curved dark iron prongs at its front end holding the pale six-sided crystal, the round knob at its back end, and the short dark iron post with a ring that holds the staff level. The crystal pale and cool, unlit, big; the staff thick.

Chibi toy proportions, like a small collectible toy or a tabletop miniature: chunky, thick and simple, every part big enough to read at 40 pixels seen from straight above. The piece alone, nothing else: no tower, no wall, no roof, no floor, no ground details. Three-quarter view from above, the camera high and looking down at about 45 degrees, the piece pointing toward the left of the picture; the whole piece inside the frame with margin, on a plain flat mid-grey ground, nothing else in the picture. Flat cel colours in two tones per material, no wood grain, no metal scratches, no fine detail; even, readable lighting, no cast shadows, no glow, no motion blur, no text, no logo.
```

## Geometry (glTF metres of the model as Meshy made it: x, y up, z)

| Model | |
|---|---|
| Body | ground y −0.952; the dome's eaves its widest (r 0.963 at y 0.16), its cap at the tip (y 0.84–0.95, r < 0.16); centred |
| Turret | held at its ring, (0.09, 0); the shaft's underside y −0.1 there; the crystal's tip at x −0.95 (1.04 m from the hold), the knob at +0.95; the prongs z ±0.17. Meshy left the short post under the ring out: the staff is held over the dome's cap |

## In the game

Body 31 / 33 / 35 world px per metre (radius 30–34: a round dome); the staff 23 / 25 / 26 along, 1.8× across; on a shot it is driven back 3 px. The crystal unlit at tier 1, glowing arcane violet from tier 2. Tier 2 and 3: two and four candles burning violet on the eaves (r 0.86); tier 3 the dome's cap and the prongs in gold. Prism: a pale dome, three crystal pillars round it (a triangle), a crystal on the staff. Void: an obsidian dome with eight blades for thorns round its eaves, a black staff with a magenta crystal.

## Paint

The stone to `mix(stone, snow, 0.3)`, its shade to `stone`; the dome (five tones) to slate, `mix(steelDark, arcaneStone, 0.5)` (half way to the Arcane's violet, so its dome is told from a roof), its rim light a third (the painter's rune-teal rim lit the big dome as a wide crescent); the band, posts and door to `woodDark` toward `ink`; the cap at the tip `iron` (gold at tier 3). The staff's shaft to `wood` (lighter than the concept: dark on the dark dome it vanished), its iron to `iron`, the crystal to `crystal`. Every colour Meshy painted is listed in the row (`tones`); an unexpected one stops the build.

## What looks wrong

- Meshy made the post under the staff's ring a stub, so the staff floats a little over the cap (from straight down it never shows).
