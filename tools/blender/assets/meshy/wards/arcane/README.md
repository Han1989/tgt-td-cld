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

Body 31 / 33 / 35 world px per metre (radius 30–34: a round dome); the staff 23 / 25 / 26 along, 1.8× across; on a shot it is driven back 3 px. The crystal unlit at tier 1, glowing arcane violet from tier 2. Tier 2 and 3: two and four candles burning violet on the eaves (r 0.86); tier 3 the dome's cap and the prongs in gold. Prism: a pale dome, three crystal pillars round it (a triangle), a crystal on the staff. Void: an obsidian dome with eight blades for thorns round its eaves, a black staff with a magenta crystal. Batch 1 composed both branches' turrets from the tier-1 one as described here; since batch 2 each branch has its own turret (below), on the same bodies.

## Paint

The stone to `mix(stone, snow, 0.3)`, its shade to `stone`; the dome (five tones) to slate, `mix(steelDark, arcaneStone, 0.5)` (half way to the Arcane's violet, so its dome is told from a roof), its rim light a third (the painter's rune-teal rim lit the big dome as a wide crescent); the band, posts and door to `woodDark` toward `ink`; the cap at the tip `iron` (gold at tier 3). The staff's shaft to `wood` (lighter than the concept: dark on the dark dome it vanished), its iron to `iron`, the crystal to `crystal`. Every colour Meshy painted is listed in the row (`tones`); an unexpected one stops the build.

## What looks wrong

- Meshy made the post under the staff's ring a stub, so the staff floats a little over the cap (from straight down it never shows).

## Batch 2: the branch turrets (V-06l, 24 Oct 2026)

Each branch has its own turret since batch 2 (batch 1 composed the tier-1 crystal staff for both). Each is one image edit of `turret.png` (the crystal staff as batch 1 made it, `meshy_image_to_image`, `nano-banana-pro`, 1:1, the file as the reference) that turns it into the branch, then `meshy_image_to_3d` from that task with batch 1's settings and the remesh inside the task at 8,000 triangles. Both came out right the first time (no retry). The branch's body (its outline, the kit's additions) is batch 1's, unchanged.

| File | What |
|---|---|
| `prism.png` | the image the Prism's turret was made from: the same staff with one big round many-faced crystal, clear with a hint of violet, held in three curved iron prongs (1024 × 1024) |
| `void.png` | the image the Void's turret was made from: the same staff, near-black, its head a dark iron claw of four talons gripping a round near-black orb with a violet sheen (1024 × 1024) |
| `prism.glb` | the Prism's turret as `meshy_image_to_3d` returned it, **no skeleton**: 7,417 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, glTF Y up; 2.7 MB |
| `void.glb` | the Void's turret as `meshy_image_to_3d` returned it, **no skeleton**: 7,477 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, glTF Y up; 2.8 MB |

| Step | Task id | Credits | |
|---|---|---|---|
| Prism (image to image) | `01a16de3-a814-7521-a107-318c67de61a7` | 9 | **kept**: `prism.png` |
| Prism (image to 3D) | `01a16de4-f58a-7041-b359-19975b234ecc` | 30 | **kept**, attempt 1 of 1 |
| Void (image to image) | `01a16de3-a7e9-74d4-83e4-59877116be61` | 9 | **kept**: `void.png` |
| Void (image to 3D) | `01a16de4-f5bb-7144-853e-8405472e8630` | 30 | **kept**, attempt 1 of 1 |
| | | **78** | |

### The prompts (image to image, reference: `turret.png`)

Each is one paragraph naming the branch, then the turret prompt's composition and finish paragraph (above) with "as in the picture" after "pointing toward the left of the picture":

**Prism**

```text
Redraw this tower's crystal staff as its Prism: the same original design, colours and finish, the same dark timber staff with its dark iron ring and knob, laid level. Its head holds one big many-faced crystal instead of the long one: a round cut gem with many flat facets like a jewel, clear and pale with a hint of violet, as wide as the prongs, held in three curved dark iron prongs. The crystal big and round, the staff chunky.
```

**Void**

```text
Redraw this tower's crystal staff as its Void: the same original design, finish and proportions, the same staff with its ring and knob, laid level, its shaft near-black. Its head is a dark iron claw of four thick curved talons gripping one round orb, the orb near-black with a deep violet sheen, as big as a fist on a chibi toy. The claw and the orb chunky and simple; the orb dark, unlit.
```

The composition and finish paragraph, word for word:

```text
Chibi toy proportions, like a small collectible toy or a tabletop miniature: chunky, thick and simple, every part big enough to read at 40 pixels seen from straight above. The piece alone, nothing else: no tower, no wall, no roof, no floor, no ground details. Three-quarter view from above, the camera high and looking down at about 45 degrees, the piece pointing toward the left of the picture as in the picture; the whole piece inside the frame with margin, on a plain flat mid-grey ground, nothing else in the picture. Flat cel colours in two tones per material, no wood grain, no metal scratches, no fine detail; even, readable lighting, no cast shadows, no glow, no motion blur, no text, no logo.
```

### Geometry (glTF metres of the model as Meshy made it: x, y up, z)

| Model | |
|---|---|
| Prism | held at its ring, (−0.10, 0), the shaft's underside y −0.12 there; the crystal x 0.52..0.95 (r 0.21), the knob at x −0.95 |
| Void | held at its ring, (−0.10, 0), the shaft's underside −0.13; the orb x 0.60..0.95 (r 0.17), the claw's talons x 0.35..0.89 |

### In the game

**Prism.** On the Prism's pale dome (body 33, three crystal pillars, batch 1's): 24 world px per metre along, 1.5× across (36) (reach 25); not turned (the crystal at +x); on a shot it is driven back 3 px. Its prongs gold, the crystal glowing (`acPrism`, `crystal`).

**Void.** On the Void's obsidian dome (body 33, eight blades, batch 1's): 25 world px per metre along, 1.5× across; driven back 3 px on a shot. The shaft obsidian, the claw gold, the orb glowing violet (`acOrb`, `violet`).

### Paint

**Prism.** The iron to `acIron` (gold), the shaft to `wood` (`acShaft`, lighter than the model: on a dark dome it vanished), the crystal's tones to the glow. Every colour Meshy painted is listed in the row (`PRISM_TURRET`); an unexpected one stops the build.

**Void.** The shaft to `acObsidian`, the claw's iron to gold, the orb's eight dark violet tones to `acOrb`. Every colour Meshy painted is listed in the row (`VOID_TURRET`); an unexpected one stops the build.

### What looks wrong

- **Prism:** The edit put the crystal at +x where the tier-1 staff's is at −x (Meshy's own choice of axes): the row turns it 0° instead of 180°.
- **Void:** On the obsidian dome the black shaft barely shows from above; the gold claw and the glowing orb carry it.
