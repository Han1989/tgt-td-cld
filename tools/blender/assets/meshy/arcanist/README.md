# The Arcanist: the Hooded Oracle (V-06e)

**Han, 23 Oct 2026, 10:04:** the Arcanist becomes the Hooded Oracle, concept a in `docs/art/arcanist-redesign.png`
(`../arcanist-concepts/oracle-a.png`): a tall peaked violet hood with one trailing end, no visible hair, two violet
glowing eyes in the hood's shadow, the rune cord from the hood's edge, the long violet coat, the crescent staff. One
change from the concept: the bone half-mask goes dark (bone in shadow, as the Ranger's mask is), so at phone size only
the eyes glow and no pale shape reads as a face. Her name, kit, icon and role text do not change. Round 2's Arcanist
(the hat, the braid, her face) is kept in `../arcanist-r2/`, round 1's in `../arcanist-r1/`.

Designed by Claude, generated in Meshy on 23 Oct 2026, through the Meshy MCP server (`@meshy-ai/meshy-mcp-server`
0.6.5, driven over stdio from a scratch client with `MESHY_API_KEY` from the environment, never written to a file).
**Generated on a Meshy Pro plan, private licence, commercial use permitted.**

| File | What |
|---|---|
| `concept.png` | the image the model was made from (896 × 1200): the bare-handed edit of the Oracle as Meshy returned it, flipped left to right (below: why) |
| `model.glb` | the rigged, textured model, bare-handed: 30,879 triangles in one mesh (27,015 vertices), a 2048 × 2048 base-colour texture embedded (JPEG; no separate file), Meshy's 24-joint skeleton, 1.80 m tall to the hood's top, Meshy's `Character_output.glb` unchanged; 4.3 MB |
| `idle.glb` … `death.glb` | the seven clips, one a file (the skeleton, Meshy's bone proxy, no texture; below) |
| `staff-concept.png`, `staff.glb` | her staff as a separate prop, **kept from round 2** (V-06a): 6,143 triangles, a 2048 × 2048 texture embedded; Y up, centred on the origin, 1.90 tall (the crescent at +Y), facing +Z; 2.7 MB |

## Meshy tasks (23 Oct 2026, Pro plan)

| Step | Task id | Credits | |
|---|---|---|---|
| Bare-handed edit a | `01a168bb-9f1f-72e3-a116-6408a47f0328` | 9 | **kept** (`concept.png`, flipped) |
| Bare-handed edit b | `01a168bb-a531-757d-ab8f-dfbf94f6ce7e` | 9 | rejected |
| Model 1 (from edit a) | `01a168bc-da85-76d9-9240-2dde5da7f3ec` | 30 | rejected: the peak hides from our cameras |
| Rig 1 | `01a168be-cabc-77d6-bebd-4ee55091b1e4` | 5 | rejected |
| Clips 1 | `01a168bf-2e07-76b1-95ad-1364b4b80063` | 15 | rejected |
| Model 2 (from edit a flipped) | `01a168c2-f32b-72de-9140-92b6bbfe0719` | 30 | **kept** |
| Rig 2 | `01a168c4-5929-7209-964e-a34e96af1fe7` | 5 | `model.glb`, `walk.glb`, `run.glb` |
| Clips 2 | `01a168c4-c217-73ae-ab5a-eaaf43ec43bc` | 15 | the other five clips |
| | | **118** | |

`meshy_check_balance`: **456 credits before, 338 after.**

## Attempts

1. **The edit** (`meshy_image_to_image`, `nano-banana-pro`, aspect 3:4, one image: `../arcanist-concepts/oracle-a.png`),
   two tasks with the same prompt, as V-06a's concepts a and b. Both removed the staff, opened her right hand, darkened
   the mask and swept the peak back as asked; they differ in small things. **a kept:** its mask is darker (a mean grey
   of 80 against b's 94, so closer to bone in shadow) and its right hand is open with the fingers apart (b's is a flat
   paddle). **The peak.** Han's rule for the stage: standing at the shared crown height, her hood's peak must not rise
   over the Warden's helm (the stage box's old top, y 308). The concept's peak rose about two thirds of a head over
   her crown, about 90 video px on the stage against the 35 that y 308 leaves; so the edit keeps it long but sweeps it
   far back behind her head instead of up, its tip no higher than the hood's round top (the prompt asks for at most a
   quarter of the head's height over it; Han's own limit, a head's height, holds with room to spare).
2. **Model 1 (rejected): the peak hides.** Meshy read the peak in the front three-quarter edit as sweeping back to her
   **left**. The stage camera looks from her front right (40° round), the match camera too (34°), so a peak back to
   her left points straight away from both and hides behind the hood: from them she wore a plain round hood, the
   Ranger's recipe in violet. Measured by projecting the model through each camera's angle; the same model mirrored
   showed the peak sweeping back behind her head.
3. **Model 2 (kept): the edit flipped left to right** (Pillow's `ImageOps.mirror`), as V-06a flipped round 2's concept:
   the peak now sweeps back to her right, behind her head from our cameras; the trailing end hangs behind her right
   arm and the rune cord down her right chest. Rig and clips as round 2. All seven clips play with nothing to bend;
   the free-hanging cloth is bound to her spine in the pipeline (below).

## The prompt

The edit (the only image: `../arcanist-concepts/oracle-a.png`). The style paragraph and the composition line are
`docs/art/meshy-style.md`'s, word for word; the edit's lines follow V-06a's bare-handed edit.

```text
Original chibi fantasy hero for a dark moonlit tower-defense game, a stylised 3D game character like a small collectible vinyl toy, not realistic. Chibi (super-deformed) proportions: the whole figure only 2.5 heads tall, the head about a third of the whole height and as wide as the shoulders, a big round skull, almost no neck, a short small stubby body, short stubby arms that reach only to the hips, short stubby legs, oversized hands and oversized feet, and the hero's signature piece oversized. Face: two small dot eyes, no nose, a small simple mouth, smooth skin with no texture. Flat cel colours in two tones per material (one lit tone, one shadow tone), no fabric weave, no metal grain or scratches, no fine detail, no realism: large clean shapes and a silhouette that reads at 40 pixels tall. Palette of a moonlit forest at night: muted materials (leather, dark cloth, iron, wood, bone), shadows leaning deep teal-black, moon-silver light from the upper left, one accent colour per hero and small glowing details only where something emits light. Even, readable lighting on the figure, no cast shadows across it, no motion blur, no text, no logo.

Edit this exact character and keep everything else the same: her chibi proportions, the deep-violet hood and its one long trailing end, the two glowing violet dot eyes in the hood's teal-black shadow, the cord of bone beads with its glowing violet rune beads hanging from the hood's front edge, the violet coat with its high collar, the bone-white collar, the dark leather corset, the vambraces with their bone plates, the big dark gloves, the dark leggings, the big dark boots, and all the colours. Her face stays completely hidden: no skin, no hair, no nose, no mouth. Change only three things. First, remove the staff completely: no staff, no crescent, no crystal, no weapon, nothing held; her right hand open and empty like her left. Second, the half-mask under the hood lies in the hood's shadow: the same shape, but dark, a dull deep grey-violet bone almost as dark as the inside of the hood, so the two glowing violet eyes are the only light thing on her head and no pale shape reads as a face. Third, the hood's peak is lower: the same long soft point, leaning back, but swept far back behind her head instead of rising up, so its tip rises above the round top of the hood by no more than a quarter of the head's height. Both arms in an A-pose, angled down and out away from the body, the hands well clear of the hips and the coat. Light from the upper left.

Full body, A-pose (arms angled down and away from the body, hands clear of the hips), front three-quarter view, standing straight, both feet flat and fully visible, the whole figure and weapon inside the frame with margin, plain flat mid-grey background, nothing else in the picture.
```

## Settings

As round 2. `meshy_image_to_3d`: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false,
`should_remesh` true, `target_polycount` 30000, `topology` triangle, no `pose_mode` (the concept's own pose), GLB; model 2
from the flipped image by `file_path`, model 1 by `input_task_id`. `meshy_rig`: `height_meters` 1.8. `meshy_animate`:
`action_ids` [0, 129, 125, 178, 189].

## Clips

The same actions as round 2, split the same way (each action's channels copied onto the same-named joints of the rig's
walk file, its own clip removed, the keyframe arrays as they are; the bone display's zero-length normals set to +Y):

| File | Meshy action | Clip in the file | Length |
|---|---|---|---|
| `idle.glb` | 0 Idle | `Idle` | 4.00 s |
| `walk.glb` | walking, free with the rig | `Armature\|walking_man\|baselayer` | 1.07 s |
| `run.glb` | running, free with the rig | `Armature\|running\|baselayer` | 0.67 s |
| `attack.glb` | 129 Mage Soell Cast | `mage_soell_cast` | 2.27 s |
| `cast.glb` | 125 Charged Spell Cast | `Charged_Spell_Cast` | 2.67 s |
| `hit.glb` | 178 Hit Reaction | `Hit_Reaction` | 1.63 s |
| `death.glb` | 189 Dying Backwards | `dying_backwards` | 2.20 s |

Root motion (the hips' travel over the ground from the clip's first key): `Hit_Reaction` steps 0.85 m sideways and
stays there, `dying_backwards` falls 0.75 m back (0.79 m at most); the rest stay within 15 cm (`Charged_Spell_Cast`)
and return. The pipeline pins the hips on both (`pin` in `tools/blender/hero.py`).

## The bind pose (glTF metres: x her left, y up, z forward; 0 at the soles)

- The hood's top (her crown) at y 1.80 over (−0.07, 0.07); the peak's tip at (−0.31, 1.53, −0.42), back to her right
  and 0.27 m under the top; the head joint at y 1.225, `head_end` at 1.747.
- Her right mitt (the faces `RightHand` moves alone) centred at (−0.506, 0.532, 0.224); round 2's at
  (−0.444, 0.493, 0.136). It is open, as asked (the fingers apart, side by side in one plane, the hand a slab about
  3.5 cm thick, leaning 17.8° out at the top). **V-06f:** the pipeline closes it into a fist round the staff's shaft
  in the bind pose (`tools/blender/tdt3d/gltf.py` `close_hand`, her row's `grip`) and places the staff on the
  fist's axis; `model.glb` is unchanged. V-06e placed the staff by an offset alone (V-06c's grip moved by as much as
  the mitt), its shaft through the open mitt.
- **Cloth the auto-rig skinned to the limbs near it**, rebound whole to `Spine02` in the pipeline (`rebind`), as the
  bow and the shield are rebound to a hand: the hood's trailing end below the shoulder, behind her right arm (584
  vertices: x < −0.22, y < 1.16, z < −0.04; skinned 38% `RightForeArm`, 35% `Head`, 20% `RightArm`), and the coat's
  flap behind her left arm (528 vertices: x > 0.22, 0.33 < y < 1.06, behind z 0.06, or −0.05 under y 0.5; skinned
  41% `LeftUpLeg`, 36% `LeftArm`). Their tips sway about 1 world px over the walk so bound, 14 as skinned.
- The rune cord lies on the coat, its weights the coat's under it at every height (the shoulder and `Head` at the
  top, `RightUpLeg` at the beads), so it moves with the coat and is left as skinned.

## The texture's colours

Found by k-means over the faces' texture colours (as `gltf.face_colours` reads them) and mapped to Runelight tokens in
`tools/blender/hero.py` (`paint`): the violet of hood and coat `#48235a` (59% of the area), dark leather `#1a1715`
(20%), the leggings `#0c1921` (6%), the hood's teal-black inside `#0b262d` (5.5%), bone `#f3f0e3` and its shade
`#d7d6cb` (3.9%), the mask's grey `#5a5d6d` (2.1%, 98% of it on `Head`), the vambraces `#76655b` (1.8%), the glowing
violet of the rune beads and the eyes `#af4bf8`, `#bf6df9` and their rim `#6a4b99` (0.8%).

## What looks wrong

- The mask in the texture is a mid grey (`#5a5d6d`), not as dark as asked; the pipeline paints it dark anyway (bone
  in the hood's shadow, `mask` in the row).
- The trailing end flares 0.5 m back from her shoulder, as in the concept: from the side (the walk) it trails behind
  her like a cape's tail.
- The rune glyphs on the beads are redrawn and flipped (the concepts' input was round 2's concept flipped, and this
  model's image is flipped again); at 40 px they are dots.
- In `Charged_Spell_Cast` (not used, as in round 2) she crouches and lifts her hands over the hood.
