# The Warden (V-06a, round 2: chibi)

Designed by Claude, generated in Meshy on 22 Oct 2026, from the style sheet `docs/art/meshy-style.md` (round 2, Han's
note of 22 Oct 2026, 11:44: the same design as round 1, `../warden-r1/`, in chibi proportions).
**Generated on a Meshy Pro plan, private licence, commercial use permitted.**

| File | What |
|---|---|
| `concept.png` | the concept the model was made from (896 × 1200) |
| `model.glb` | the rigged, textured model: 30,595 triangles in one mesh, a 2048 × 2048 base-colour texture embedded (JPEG; no separate file), Meshy's 24-joint skeleton; 5.4 MB |
| `idle.glb` … `death.glb` | the seven clips, one a file (the skeleton, Meshy's bone proxy, no texture; below) |

## Meshy tasks (22 Oct 2026, Pro plan)

| Step | Task id | Credits | |
|---|---|---|---|
| Concept a | `01a161c0-c647-77ad-87bd-7440e3501fb5` | 9 | **kept** (`concept.png`) |
| Concept b | `01a161c0-c73c-70ef-aae3-abc16350b3f8` | 9 | rejected |
| Model | `01a161c4-53fd-77d3-befa-6173961a8e60` | 30 | **kept** |
| Rig | `01a161c6-1c1a-72dc-ad66-a5dbc0e8dbdd` | 5 | `model.glb`, `walk.glb`, `run.glb` |
| Clips | `01a161c6-b0cb-70d4-91a2-d2fdb052363a` | 15 | the other five clips |
| | | **68** | |

## Attempts

One attempt (the Ranger's attempt 2 recipe). **a** kept: the rounder, truer 2.5-head figure (a round great-helm,
stubby legs, the head a third of the height). **b** rejected: it follows the brief's horn side (the sword arm) and has
flatter colours, but stands about three heads tall under a tall bucket helm. In **a** the ram-horn pauldron is on his
left (shield) shoulder, the side round 1's prompt asked for.

## The prompt (concept a)

Image reference: `apps/client/public/stage/warden-poster.webp` (the hero in the game now, the proportion reference), converted to PNG and cropped to the hero, 640 × 600 from (880, 250).

```text
Original chibi fantasy hero for a dark moonlit tower-defense game, a stylised 3D game character like a small collectible vinyl toy, not realistic. Chibi (super-deformed) proportions: the whole figure only 2.5 heads tall, the head about a third of the whole height and as wide as the shoulders, a big round skull, almost no neck, a short small stubby body, short stubby arms that reach only to the hips, short stubby legs, oversized hands and oversized feet, and the hero's signature piece oversized. Face: two small dot eyes, no nose, a small simple mouth, smooth skin with no texture. Flat cel colours in two tones per material (one lit tone, one shadow tone), no fabric weave, no metal grain or scratches, no fine detail, no realism: large clean shapes and a silhouette that reads at 40 pixels tall. Palette of a moonlit forest at night: muted materials (leather, dark cloth, iron, wood, bone), shadows leaning deep teal-black, moon-silver light from the upper left, one accent colour per hero and small glowing details only where something emits light. Even, readable lighting on the figure, no cast shadows across it, no motion blur, no text, no logo.

The reference image is the current in-game hero: copy exactly its chibi proportions (the head as big as the rest of the body, the short stubby limbs, the big hands and feet) and its simple smooth toy-like finish. Do not copy its costume, its colours, its side-on pose or its forest background: the hero's costume and colours are described below.

The Warden, accent ember orange on dark iron: an old shield-captain, the broadest hero, a round barrel chest, thick stubby arms and legs, standing wide and immovable; no face shows, only two ember-orange glowing dot eyes in the dark of his visor. A big rounded dark-iron great-helm with a T-shaped visor slit. A dark iron cuirass with a heavy gorget, a dark red-brown surcoat from the belly to mid-thigh, a thick leather belt. A huge curled ram-horn pauldron on his RIGHT shoulder (the sword arm), a big round iron pauldron on the left, big plate gauntlets. Short plate legs over dark mail at the knee, big flat iron sabatons. In his RIGHT hand a broad one-handed sword with a short cross-guard, held out to the side and angled away from the body. On his LEFT forearm an oversized tall dark-iron kite shield with one glowing ember-orange rune in its centre, held out from the body so the torso stays visible and the shield does not touch the legs. No cape, no plume.

Full body, A-pose (arms angled down and away from the body, hands clear of the hips), front three-quarter view, standing straight, both feet flat and fully visible, the whole figure and weapon inside the frame with margin, plain flat mid-grey background, nothing else in the picture.
```

## Settings

`meshy_image_to_3d`: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false (keeps the concept's styling), `should_remesh` true, `target_polycount` 30000, `topology` triangle, no `pose_mode` (the concept's own pose), GLB. `meshy_rig`: `height_meters` 1.9. `meshy_animate`: `action_ids` [0, 219, 101, 178, 189].

## Clips

| File | Meshy action | Clip in the file | Length |
|---|---|---|---|
| `idle.glb` | 0 Idle | `Idle` | 4.00 s |
| `walk.glb` | walking, free with the rig | `Armature\|walking_man\|baselayer` | 1.07 s |
| `run.glb` | running, free with the rig | `Armature\|running\|baselayer` | 0.67 s |
| `attack.glb` | 219 Right-hand Sword Slash | `Right_Hand_Sword_Slash` | 1.50 s |
| `cast.glb` | 101 Sword Shout | `Sword_Shout` | 6.17 s |
| `hit.glb` | 178 Hit Reaction | `Hit_Reaction` | 1.63 s |
| `death.glb` | 189 Dying Backwards | `dying_backwards` | 2.20 s |

All at 30 frames a second. Root motion: `Hit_Reaction` steps 0.91 m sideways and stays there, `Sword_Shout` ends 0.53 m forward, the death falls 0.8 m back; the slash moves the hips 17 cm and returns; the rest stay within 5 cm.

## What looks wrong

- **The shield's top bends.** The sword is 93–100% `RightHand` and stays rigid, and the shield's lower half is
  `LeftHand`, but its top is shared with `LeftForeArm` and `LeftArm`, so it curls in the run. Fix (tested in three.js
  on the walk, the run, the death, the attack, the cast and the hit; `../README.md`): every vertex with **x > 0.80**,
  1,776 vertices, 100% `LeftHand` (`model.glb`'s bind pose, glTF metres). The shield then keeps its shape and nothing
  else moves.
- His big helm dips well forward in `Right_Hand_Sword_Slash`, and `Hit_Reaction` throws the head back and tips the
  shield flat like a tray: pick the frames with care.
- The concept and the texture keep a little metal grain and a few scratches the style sheet asked to leave out; the
  painter's cel bands flatten them.
- At 1.94 m across (sword to shield) he is wider than he is tall (1.9 m): session 2 scales him by his height.
