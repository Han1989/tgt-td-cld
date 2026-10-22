# The Ranger (V-06a, round 2: chibi)

Designed by Claude, generated in Meshy on 22 Oct 2026, from the style sheet `docs/art/meshy-style.md` (round 2, Han's
note of 22 Oct 2026, 11:44: the same design as round 1, `../ranger-r1/`, in chibi proportions).
**Generated on a Meshy Pro plan, private licence, commercial use permitted.**

| File | What |
|---|---|
| `concept.png` | the concept the model was made from (896 × 1200) |
| `model.glb` | the rigged, textured model: 30,779 triangles in one mesh, a 2048 × 2048 base-colour texture embedded (JPEG; no separate file), Meshy's 24-joint skeleton; 4.8 MB |
| `idle.glb` … `death.glb` | the seven clips, one a file (the skeleton, Meshy's bone proxy, no texture; below) |

## Meshy tasks (22 Oct 2026, Pro plan)

| Step | Task id | Credits | |
|---|---|---|---|
| Concept, attempt 1, a | `01a161be-6e26-777a-8378-174e09106018` | 9 | rejected |
| Concept, attempt 1, b | `01a161be-72d6-75a5-a990-3fc39e203c29` | 9 | rejected |
| Concept, attempt 2, a | `01a161bf-7b7c-74ec-bd8e-0ecff1bfaa49` | 9 | **kept** (`concept.png`) |
| Concept, attempt 2, b | `01a161bf-7bb1-76b6-aad7-2879c1b30cb5` | 9 | rejected |
| Model 1 | `01a161c0-ae33-72e5-94fd-b2d3ea94b5f6` | 30 | rejected |
| Model 2 | `01a161c4-4b0a-7060-aeec-0ab45d7b88f1` | 30 | **kept** |
| Rig | `01a161c6-0bd6-77ae-bd12-77f69d6665be` | 5 | `model.glb`, `walk.glb`, `run.glb` |
| Clips | `01a161c6-aaaf-728e-9947-10e693033941` | 15 | the other five clips |
| | | **116** | |

## Attempts

1. **Concept attempt 1 (rejected).** `meshy_image_to_image` with two references, the in-game Ranger (proportions) and
   round 1's concept (the design): both images kept round 1's realistic proportions, about six heads tall, and only
   flattened the shading. Not chibi.
2. **Concept attempt 2.** The in-game Ranger as the only image (as Han's note says), the design in the words, and
   stronger proportion words (a vinyl toy, the head as wide as the shoulders, arms that reach only to the hips). Both
   images came out chibi. **a** kept: the bow upright at his side, his right hand open. **b** rejected: he holds the
   bow across his body in both hands, which would fuse with the torso and rig badly.
   - **Model 1 (rejected):** with `pose_mode` a-pose and no remesh, Meshy re-posed him, slung the bow across his back
     and left both hands empty; 769,342 triangles, 24.7 MB.
   - **Model 2 (kept):** the concept's own pose, remeshed to 30,000: the bow in his left hand, as designed.

## The prompt (concept attempt 2, a)

Image reference: `apps/client/public/stage/ranger-poster.webp` (the hero in the game now, the proportion reference), converted to PNG and cropped to the hero, 640 × 600 from (880, 250).

```text
Original chibi fantasy hero for a dark moonlit tower-defense game, a stylised 3D game character like a small collectible vinyl toy, not realistic. Chibi (super-deformed) proportions: the whole figure only 2.5 heads tall, the head about a third of the whole height and as wide as the shoulders, a big round skull, almost no neck, a short small stubby body, short stubby arms that reach only to the hips, short stubby legs, oversized hands and oversized feet, and the hero's signature piece oversized. Face: two small dot eyes, no nose, a small simple mouth, smooth skin with no texture. Flat cel colours in two tones per material (one lit tone, one shadow tone), no fabric weave, no metal grain or scratches, no fine detail, no realism: large clean shapes and a silhouette that reads at 40 pixels tall. Palette of a moonlit forest at night: muted materials (leather, dark cloth, iron, wood, bone), shadows leaning deep teal-black, moon-silver light from the upper left, one accent colour per hero and small glowing details only where something emits light. Even, readable lighting on the figure, no cast shadows across it, no motion blur, no text, no logo.

The reference image is the current in-game hero: copy exactly its chibi proportions (the head as big as the rest of the body, the short stubby limbs, the big hands and feet) and its simple smooth toy-like finish. Do not copy its costume, its colours, its side-on pose or its forest background: the hero's costume and colours are described below.

The Ranger, accent moss green on brown leather: a young forest scout, lean and light on his feet, a moss-green cloth mask over the lower face, so his face is two pale-green glinting dot eyes in the hood's shadow. An oversized deep moss-green hood, big and round over the big skull, its leaf-shaped peak curling back and up behind the head. A brown leather jerkin over a dark green tunic, a short leaf-cut mantle over the shoulders only, one diagonal chest strap, a quiver of teal-fletched arrows on his back. Leather bracers, big fingerless gloves. Dark trousers wrapped with leather bands, big soft flat leather boots. In his LEFT hand a recurve bow of dark wood with pale bone tips and a bone grip, held upright at his side away from the body; his right hand open and empty. No cape, no cloak, no hair or beard showing.

Full body, A-pose (arms angled down and away from the body, hands clear of the hips), front three-quarter view, standing straight, both feet flat and fully visible, the whole figure and weapon inside the frame with margin, plain flat mid-grey background, nothing else in the picture.
```

Attempt 1's prompt was the first version of the style paragraph (without the toy and the head-to-shoulder words) and
the line "The first image is the proportion and style reference … The second image is the design: keep its gear, its
shapes and its colours, redrawn in chibi proportions", with round 1's `concept.png` as the second image.

## Settings

`meshy_image_to_3d`: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false (keeps the concept's styling), `should_remesh` true, `target_polycount` 30000, `topology` triangle, no `pose_mode` (the concept's own pose), GLB. `meshy_rig`: `height_meters` 1.75. `meshy_animate`: `action_ids` [0, 224, 222, 150, 189].

## Clips

| File | Meshy action | Clip in the file | Length |
|---|---|---|---|
| `idle.glb` | 0 Idle | `Idle` | 4.00 s |
| `walk.glb` | walking, free with the rig | `Armature\|walking_man\|baselayer` | 1.07 s |
| `run.glb` | running, free with the rig | `Armature\|running\|baselayer` | 0.67 s |
| `attack.glb` | 224 Archery Shot | `Archery_Shot` | 5.00 s |
| `cast.glb` | 222 Draw and Shoot from Back | `Draw_and_Shoot_from_Back` | 7.83 s |
| `hit.glb` | 150 Hit Reaction with Bow | `Hit_Reaction_with_Bow` | 1.97 s |
| `death.glb` | 189 Dying Backwards | `dying_backwards` | 2.20 s |

All at 30 frames a second. In place: the hips travel at most 7 cm, except the death, which falls 0.7 m back.

## What looks wrong

- **The bow bends.** It is part of the mesh (each Meshy model is one welded mesh), and the auto-rig skinned its lower
  limb about 57% to `LeftLeg` / `LeftFoot` and its top partly to `headfront` (the big head is next to it), so its
  limbs kink in the run, the attack and the cast. Fix (tested in three.js on the walk, the run, the death, the
  attack, the cast and the hit; `../README.md`): every vertex with **x > 0.27, y < 1.12 and
  |z − (−0.275 + 0.711 × (y − 0.10))| < 0.045** (the bow leans in depth: its centre line runs from z −0.275 at
  y 0.10 to z 0.40 at y 1.05), 1,524 vertices, 100% `LeftHand` (`model.glb`'s bind pose, glTF metres). The bow then
  stays one rigid curve and nothing else moves.
- **The bow string is welded and straight**: on the draw the right hand comes back into the hood's dark face (the big
  head, the short arms) while the string stays put. Session 2 draws the string as a line from the tips to the hand,
  or deletes the bow and hangs the pack's `bow_withString` (its string a shape key) on `LeftHand`, as V-05b hangs it
  on `handslot.l`.
- **No fingers:** the hands are mitts.
- The hood's peak came out as a leaf sprout standing up behind the head rather than a peak curling back; it is his
  clearest mark at 40 px.
- The concept has a soft shadow under the feet (the concept only).
