# The Arcanist (V-06a, round 2: chibi)

Designed by Claude, generated in Meshy on 22 Oct 2026, from the style sheet `docs/art/meshy-style.md` (round 2, Han's
note of 22 Oct 2026, 11:44: the same design as round 1, `../arcanist-r1/`, in chibi proportions, with the hat his note
names as her signature piece).
**Generated on a Meshy Pro plan, private licence, commercial use permitted.**

| File | What |
|---|---|
| `concept.png` | the concept as designed, with her staff (896 × 1200); it came out mirrored (staff in her left hand, braid on her right shoulder) |
| `concept-bare.png` | the concept the model was made from: `concept.png` flipped left to right (braid on her left shoulder, as the brief says) and edited bare-handed |
| `model.glb` | the rigged, textured model, bare-handed: 30,822 triangles in one mesh, a 2048 × 2048 base-colour texture embedded (JPEG; no separate file), Meshy's 24-joint skeleton; 4.4 MB |
| `idle.glb` … `death.glb` | the seven clips, one a file (the skeleton, Meshy's bone proxy, no texture; below) |
| `staff-concept.png`, `staff.glb` | her staff as a separate prop (not rigged): 6,143 triangles, a 2048 × 2048 texture embedded; Y up, centred on the origin, 1.90 tall (the crescent at +Y), facing +Z; 2.7 MB |

## Meshy tasks (22 Oct 2026, Pro plan)

| Step | Task id | Credits | |
|---|---|---|---|
| Concept a | `01a161c4-7c1a-7688-814c-4f1ab4474dc5` | 9 | **kept** (`concept.png`) |
| Concept b | `01a161c4-7d0b-746f-86b4-5249adf19e68` | 9 | rejected |
| Model 1 (with the staff) | `01a161c5-8667-77b4-9332-adfd2d47ca5b` | 30 | rejected |
| Rig 1 | `01a161c7-0ed9-77ee-b28d-090182725283` | 5 | rejected |
| Clips 1 | `01a161c7-d5ef-7433-ab94-9dce7084f5ec` | 15 | rejected |
| Bare-handed edit | `01a161cc-5669-7025-974b-851ae619a7d9` | 9 | **kept** (`concept-bare.png`) |
| Model 2 (bare-handed) | `01a161cd-2312-7761-aaf7-1934fc8a749f` | 30 | **kept** |
| Rig 2 | `01a161ce-41af-71c0-9779-113dc7b79069` | 5 | `model.glb`, `walk.glb`, `run.glb` |
| Clips 2 | `01a161ce-87d6-72e3-a9b8-ce30e1e91407` | 15 | the other five clips |
| Staff concept | `01a161cc-5e76-7726-8a3f-00d16fa9b43b` | 9 | `staff-concept.png` |
| Staff model | `01a161cd-2c09-772b-a474-b9389fae0f01` | 30 | `staff.glb` (remeshed to 6,000) |
| | | **166** | |

## Attempts

1. **Concept a kept:** clear dark eyes, a small mouth, the hat with its crescent clasp, the white braid with glowing
   beads, the crescent staff. **b** rejected: a bigger staff head and the sash, but her eyes almost vanish, which won't
   survive at 40 px. **Attempt 1's model, rig and clips (rejected): the staff rigs badly.** Each Meshy model is one
   welded mesh, and the auto-rig skinned the staff's foot to her leg and a piece of its crescent (a separate island of
   226 vertices) 97% to her `Head`: in the idle and the hit reaction the staff bends with her leg, and in
   `mage_soell_cast` it follows her head. Round 1's staff, held clear of her legs, bends the same way.
2. **Attempt 2 (kept), the brief's fallback for a weapon that rigs badly: bare-handed.** `concept.png` flipped left to
   right (the braid back on her left shoulder; the hand that takes the staff is her right) and edited with
   `meshy_image_to_image` to remove the staff and open her arms; model, rig and clips as before. All seven clips play
   with nothing to bend. Session 2 hangs a staff on `RightHand`: the pack's `staff` (as V-05b hangs it on
   `handslot.r`), or `staff.glb`, made from the concept's own staff so that her oversized crescent head (the signature
   piece Han's note names) survives.

## The prompts

Concept a. Image reference: `apps/client/public/stage/arcanist-poster.webp` (the hero in the game now, the proportion reference), converted to PNG and cropped to the hero, 640 × 600 from (880, 250).

```text
Original chibi fantasy hero for a dark moonlit tower-defense game, a stylised 3D game character like a small collectible vinyl toy, not realistic. Chibi (super-deformed) proportions: the whole figure only 2.5 heads tall, the head about a third of the whole height and as wide as the shoulders, a big round skull, almost no neck, a short small stubby body, short stubby arms that reach only to the hips, short stubby legs, oversized hands and oversized feet, and the hero's signature piece oversized. Face: two small dot eyes, no nose, a small simple mouth, smooth skin with no texture. Flat cel colours in two tones per material (one lit tone, one shadow tone), no fabric weave, no metal grain or scratches, no fine detail, no realism: large clean shapes and a silhouette that reads at 40 pixels tall. Palette of a moonlit forest at night: muted materials (leather, dark cloth, iron, wood, bone), shadows leaning deep teal-black, moon-silver light from the upper left, one accent colour per hero and small glowing details only where something emits light. Even, readable lighting on the figure, no cast shadows across it, no motion blur, no text, no logo.

The reference image is the current in-game hero: copy exactly its chibi proportions (the head as big as the rest of the body, the short stubby limbs, the big hands and feet) and its simple smooth toy-like finish. Do not copy its costume, its colours, its side-on pose or its forest background: the hero's costume and colours are described below.

The Arcanist, accent violet with bone-white: a battle-mage woman, slim, calm and determined, two dark dot eyes and a small mouth. An oversized deep-violet mage's hat with a wide brim and a soft pointed crown that leans back, a bone-white band and a small bone crescent clasp. Under it long bone-white hair in one thick braid over her LEFT shoulder and down the front of her coat to the waist, with three glowing violet rune beads along the braid. A fitted deep-violet battle-coat with a high stiff collar, a bone-white sash and clasp and a short dark leather corset; the coat split at the front from the hips, over dark leggings. Fitted sleeves, leather vambraces with small bone plates, big dark gloves. Big flat knee-high dark leather boots. In her RIGHT hand a tall staff of dark wood topped by a big bone-white crescent that cradles a glowing violet crystal, held upright out to her side and away from the body, the foot of the staff clear of the ground and her legs; her left hand open and empty. No cape, no long robe, no face marks, no floating particles or spell effects, not pink.

Full body, A-pose (arms angled down and away from the body, hands clear of the hips), front three-quarter view, standing straight, both feet flat and fully visible, the whole figure and weapon inside the frame with margin, plain flat mid-grey background, nothing else in the picture.
```

The bare-handed edit (the only image: `concept.png` flipped):

```text
Original chibi fantasy hero for a dark moonlit tower-defense game, a stylised 3D game character like a small collectible vinyl toy, not realistic. Chibi (super-deformed) proportions: the whole figure only 2.5 heads tall, the head about a third of the whole height and as wide as the shoulders, a big round skull, almost no neck, a short small stubby body, short stubby arms that reach only to the hips, short stubby legs, oversized hands and oversized feet, and the hero's signature piece oversized. Face: two small dot eyes, no nose, a small simple mouth, smooth skin with no texture. Flat cel colours in two tones per material (one lit tone, one shadow tone), no fabric weave, no metal grain or scratches, no fine detail, no realism: large clean shapes and a silhouette that reads at 40 pixels tall. Palette of a moonlit forest at night: muted materials (leather, dark cloth, iron, wood, bone), shadows leaning deep teal-black, moon-silver light from the upper left, one accent colour per hero and small glowing details only where something emits light. Even, readable lighting on the figure, no cast shadows across it, no motion blur, no text, no logo.

Edit this exact character and keep everything else the same: her chibi proportions, face, big violet hat with its bone band and crescent clasp, the white braid with its glowing violet rune beads over her LEFT shoulder, the violet coat, corset, sash, vambraces, gloves, leggings and boots, and the colours. Remove the staff completely: no staff, no weapon, nothing held. Both hands empty and open, both arms in an A-pose, angled down and out away from the body, the hands well clear of the hips and the coat. Light from the upper left.

Full body, A-pose (arms angled down and away from the body, hands clear of the hips), front three-quarter view, standing straight, both feet flat and fully visible, the whole figure and weapon inside the frame with margin, plain flat mid-grey background, nothing else in the picture.
```

The staff (the only image: `concept.png`; 9:16):

```text
Original prop for a chibi fantasy hero in a dark moonlit tower-defense game, a stylised 3D game prop like a small collectible vinyl toy, not realistic. Flat cel colours in two tones per material (one lit tone, one shadow tone), no wood grain, no scratches, no fine detail: large clean shapes that read at 40 pixels. Palette of a moonlit forest at night: muted materials, shadows leaning deep teal-black, moon-silver light from the upper left, small glowing details only where something emits light. Even lighting, no cast shadows, no text, no logo.

Draw only the Arcanist's staff from this picture, on its own, with no character and no hand: a straight, chunky staff of dark wood with a bone-white binding below the head, topped by an oversized bone-white crescent that cradles a big glowing violet crystal, the crescent's two horns curving up round the crystal. Standing perfectly upright and vertical, seen from the front, the whole staff inside the frame with margin, plain flat mid-grey background, nothing else in the picture.
```

## Settings

`meshy_image_to_3d`: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false (keeps the concept's styling), `should_remesh` true, `target_polycount` 30000, `topology` triangle, no `pose_mode` (the concept's own pose), GLB. `meshy_rig`: `height_meters` 1.8. `meshy_animate`: `action_ids` [0, 129, 125, 178, 189]. The staff: the same `meshy_image_to_3d` settings with
`target_polycount` 6000.

## Clips

| File | Meshy action | Clip in the file | Length |
|---|---|---|---|
| `idle.glb` | 0 Idle | `Idle` | 4.00 s |
| `walk.glb` | walking, free with the rig | `Armature\|walking_man\|baselayer` | 1.07 s |
| `run.glb` | running, free with the rig | `Armature\|running\|baselayer` | 0.67 s |
| `attack.glb` | 129 Mage Soell Cast | `mage_soell_cast` | 2.27 s |
| `cast.glb` | 125 Charged Spell Cast | `Charged_Spell_Cast` | 2.67 s |
| `hit.glb` | 178 Hit Reaction | `Hit_Reaction` | 1.63 s |
| `death.glb` | 189 Dying Backwards | `dying_backwards` | 2.20 s |

All at 30 frames a second. Root motion: `Hit_Reaction` steps 0.81 m sideways and stays there, the death falls 0.7 m back; the rest stay within 15 cm and return.

## What looks wrong

- In `mage_soell_cast` and `Charged_Spell_Cast` her raised hand goes into the hat's brim (the big hat, the short arms);
  in `Hit_Reaction` the hat tips far over.
- The rune glyphs on her braid beads are mirrored (the flip); at 40 px they are dots.
- The staff's shaft came out gnarled, not straight as the prompt asked; its crystal is part of its texture (session 2
  makes it glow, as it does the KayKit staff's gem).
