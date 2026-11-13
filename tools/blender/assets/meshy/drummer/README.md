# The Drummer: the Rain-drummer (V-05e files)

**Han's pick of 14 Nov 2026** (pull request #184): the Rain-drummer b, `../drummer-concepts/rain-b.png`, the game's
fourth hero (a support, War Drums). Kept as picked: the wide conical straw hat, the dark wrap with two pale-gold eyes,
the straw cape over the shoulders, the red jacket and the gold sash, the wrapped forearms and shins, the sandals, the
bare hands, the red drum lying across his back with a pale skin at each side, its straw rope rims and the rope across
his chest. One change, as the Oracle's staff: the two mallets leave his sash and are a separate prop.

Designed by Claude, generated in Meshy on 13 Nov 2026 (UTC), through the Meshy MCP server
(`@meshy-ai/meshy-mcp-server` 0.6.11, driven over stdio from a scratch client with `MESHY_API_KEY` from the
environment, never written to a file). **Generated on a Meshy Premium plan, private licence, commercial use permitted**
(13 Nov 2026; the plan ends on 24 Dec 2026).

**Assets only.** No Blender, no row in `tools/blender/hero.py`, nothing under `apps/`. Sheet for Han:
`docs/art/drummer-model.png`.

## One change from the brief: the drum is a prop too

Meshy's auto-rig **placed his skeleton inside the drum.** Rigged with the drum (twice, from the same model: rig 1 and
rig 2 below came out within a centimetre of each other), the hips, the spine and the head joints all sat inside the
drum: in `model.glb`'s frame the hips at z −0.32 (rig 3: 0.01), `Spine02` at −0.41 (0.21), `Head` at −0.70 (0.10),
the drum's front at 0.04; the head bone only 5 cm long, and the thighs slanting 35 cm forward to the knees in the bind
pose.
Every clip then pulled the hips 30 cm forward and 12–20 cm up to stand him straight: the jacket and the legs stretched,
the drum squashed and tilted, in the idle as in the walk (the other three heroes' idles keep their hips within 2 cm of
the bind in depth). Nothing in the rig call controls joint placement (`height_meters` only).

So the drum was cut out of the image to 3D's mesh as its own prop, **`back-drum.glb`**, and the drumless body was rigged
from a GLB data URI (as the Archer's mirrored model was, `../creeps/archer/README.md`). The rig is then sound: the hips
1 cm from the body's centre in depth, the walk's and the run's hips within 8 cm of the bind height and 5 cm in depth,
like the other heroes'. The pipeline was going to rebind the drum and its rope whole to `Spine02` anyway (the brief's
list); now it hangs `back-drum.glb` on `Spine02` instead, as it hangs the Oracle's staff on her hand. The drum is the
model's own geometry and texture, unchanged: not turned flat, not recoloured. It was not named `drum.glb`, which is
the drumming clip's name.

**How the drum was cut** (a scratch script, not kept; in the image to 3D's own coordinates, metres, y up, centred):
the drum is a cylinder found from its two parchment skins (the faces whose texture colour is parchment beyond |x| 0.55:
a plane fitted to each, its centre and the 98th percentile of their distance from it): skin centres (0.646, 0.070,
−0.262) and (−0.644, 0.068, −0.390), radius 0.398. A face was the drum's when it lay within 8 cm outside that cylinder
and either on its shell (within 7 cm inside the radius) or on a skin, red, parchment, or straw only near the rims
(within 12 cm of a skin's plane), and not in front of the body (forward of the axis by more than 15 cm within 0.5 m of
the middle). Then each **UV island** (Meshy's texture charts) went whole to the drum or to the body by the area of its
faces so classed (over half; or over 60% and below the drum's top), so the cut runs along Meshy's own seams. 8,541 of
the 30,955 triangles are the drum; the body keeps 22,414, including its jacket's back under the drum. The drum's
positions were then put into `model.glb`'s frame by the map Meshy's rig applied to the body (× 0.945981, then
+ (0.05023, 0.90052, −0.16190): it scales to 1.8 m and centres the body's box), checked against the rigged mesh
(every body vertex within 0.0000002 m).

## Files

| File | What |
|---|---|
| `concept.png` | the pick, `../drummer-concepts/rain-b.png`, copied (896 × 1200) |
| `concept-bare.png` | the picture the model was made from: the bare-handed edit a (896 × 1200, below) |
| `model.glb` | the rigged, textured body, Meshy's `Character_output.glb` unchanged: 22,414 triangles in one mesh (26,266 vertices), a 2048 × 2048 base-colour texture embedded (JPEG), Meshy's 24-joint skeleton, 1.80 m to the hat's top, facing glTF +Z, Y up, 0 at the soles; no drum; 4.9 MB |
| `back-drum.glb` | the drum, cut from the same mesh (above): 8,541 triangles, the same texture embedded, in `model.glb`'s bind-pose frame (so it sits where it was when its node is put under `Spine02` with the bind's offset); unrigged; its side against his back is open (it was inside the jacket); 3.3 MB |
| `idle.glb`, `walk.glb`, `run.glb`, `attack.glb`, `slam.glb`, `drum.glb`, `hit.glb`, `death.glb` | the eight clips, one a file (the skeleton, Meshy's bone display, no texture; below) |
| `mallet-concept.png`, `mallet.glb` | one mallet as a prop, as the Oracle's staff: 5,184 triangles (4,273 vertices), a 2048 × 2048 texture embedded; Y up, centred on the origin, 1.90 tall (the head at +Y), facing +Z; Meshy's output unchanged; 2.1 MB. The pipeline puts one in each hand |

## Meshy tasks (13 Nov 2026, Premium plan)

| Step | Task id | Credits | |
|---|---|---|---|
| Bare-handed edit a | `01a1d5ca-c03c-743c-a20c-5f694bb7b4cf` | 9 | **kept** (`concept-bare.png`) |
| Bare-handed edit b | `01a1d5ca-c022-70a8-9720-5ae33c04fc99` | 9 | rejected |
| Model (image to 3D, from edit a) | `01a1d5cc-4c35-7503-8c32-0f6a509c65a0` | 30 | **kept**, attempt 1 of 1 |
| Rig 1 (with the drum) | `01a1d5cd-ec8b-7371-ba4e-262477b71813` | 5 | rejected: the skeleton inside the drum (above) |
| Clips 1 | `01a1d5ce-ac61-705f-a813-e4ca26192612` | 30 | rejected (on rig 1; the ten actions below) |
| Rig 2 (with the drum, again) | `01a1d5d1-9244-75f9-abfe-5259bf070f82` | 5 | rejected: the same joints as rig 1 |
| Rig 3 (the body, from a GLB data URI) | `01a1d5d5-9ae0-718e-9700-970716c609cb` | 5 | **kept**: `model.glb`, `walk.glb`, `run.glb` |
| Clips 3 | `01a1d5d6-0922-7307-859b-d6f1d67f9462` | 30 | **kept**: ten actions tried, six kept (below) |
| Mallet edit | `01a1d5cc-4c56-744e-b705-2687c907afa6` | 9 | `mallet-concept.png` |
| Mallet model | `01a1d5cd-70e7-7714-a49a-4de06faa5c38` | 30 | `mallet.glb` |
| | | **162** | |

`meshy_check_balance`: **726 credits before, 564 after.**

## Attempts

1. **The edit** (`meshy_image_to_image`, `nano-banana-pro`, aspect 3:4, one image: the pick), two tasks with the same
   prompt. Both removed the mallets and left the sash plain, and kept the hat, the eyes, the drum and the proportions.
   **a kept:** his right hand opens with the fingers apart and hangs further from the body. In **b** both hands stay
   curled as in the pick. Neither turned the arms far out to an A-pose; both hands are clear of the jacket, the sash
   and the drum (a band of background between them), which the rig needs.
2. **The model** passed the look on the first attempt: the hat one wide cone, the eyes two pale dots in the dark wrap,
   the drum reaching past both shoulders with a skin each side, the hands open and empty.
3. **The rig** (above): rigs 1 and 2 with the drum rejected; rig 3, the body alone, kept.
4. **The clips.** Meshy's library has no drumming, percussion, club or mace action, and its preview GIFs could not be
   reached from the session, so ten candidates were animated in one bundle and looked at frame by frame:
   0 Idle, 178 Hit Reaction, 189 Dying Backwards; for the attack 128 Heavy Hammer Swing and 219 Right-hand Sword Slash;
   for the slam 127 Charged Ground Slam and 237 Charged Axe Chop (and 128); for the drumming 88 Chest Pound Taunt,
   87 Boxing Practice and 65 Bass Beats.
   - **attack: 219 Right-hand Sword Slash** (the Warden's): one hand strikes across; his body turns with it.
   - **slam: 128 Heavy Hammer Swing**: both hands go up overhead together, then smash down, the body folding forward
     to the ground in front of him; it ends with a small hop, 28 cm on. 127 Charged Ground Slam winds up with one arm
     only; 237 Charged Axe Chop is 7.7 s with a long wind-up.
   - **drum: 88 Chest Pound Taunt, the closest two-handed alternating strike**: facing front, he beats his chest with
     one fist and then the other, at chest height, between a turned-away start and end (about 1.3–3.6 s is the beat);
     no action beats a drum in front of him. 87 Boxing Practice turns all round; 65 Bass Beats is a dance.
5. **The mallet** (an edit of the pick, then image to 3D at 5,000): a short dark-wood handle, a big round straw-gold
   head; first attempt kept.

## The prompts

The bare-handed edit (the only image: the pick). The style paragraph and the composition line are
`docs/art/meshy-style.md`'s, word for word.

```text
Original chibi fantasy hero for a dark moonlit tower-defense game, a stylised 3D game character like a small collectible vinyl toy, not realistic. Chibi (super-deformed) proportions: the whole figure only 2.5 heads tall, the head about a third of the whole height and as wide as the shoulders, a big round skull, almost no neck, a short small stubby body, short stubby arms that reach only to the hips, short stubby legs, oversized hands and oversized feet, and the hero's signature piece oversized. Face: two small dot eyes, no nose, a small simple mouth, smooth skin with no texture. Flat cel colours in two tones per material (one lit tone, one shadow tone), no fabric weave, no metal grain or scratches, no fine detail, no realism: large clean shapes and a silhouette that reads at 40 pixels tall. Palette of a moonlit forest at night: muted materials (leather, dark cloth, iron, wood, bone), shadows leaning deep teal-black, moon-silver light from the upper left, one accent colour per hero and small glowing details only where something emits light. Even, readable lighting on the figure, no cast shadows across it, no motion blur, no text, no logo.

Edit this exact character and keep everything else the same: his chibi proportions, the oversized wide conical straw hat, the dark charcoal cloth wrap over the head and the face with only two glowing pale-gold dot eyes in its teal-black shadow, the straw rain-cape over the shoulders, the deep lacquer-red jacket, the wide straw-gold sash, the dark loose trousers, the dark cloth bands on the forearms and shins, the straw sandals, his bare hands, the big red war drum lying across his back with a pale skin at each side and its thick straw rope rim, the straw rope across his chest, and all the colours. His face stays completely hidden: no skin, no hair, no nose, no mouth. Change only two things. First, remove the two mallets from his sash completely: no mallets, no sticks, no handles, nothing tucked in the sash, the sash plain and smooth where they were. Second, both hands empty and open with the fingers apart, nothing held, both arms in an A-pose, angled down and out away from the body, the hands well clear of the hips, the sash and the drum. Light from the upper left.

Full body, A-pose (arms angled down and away from the body, hands clear of the hips), front three-quarter view, standing straight, both feet flat and fully visible, the whole figure and weapon inside the frame with margin, plain flat mid-grey background, nothing else in the picture.
```

The mallet (the only image: the pick; 3:4), with the prop paragraph of `docs/art/meshy-style.md`:

```text
Original prop for a chibi fantasy hero in a dark moonlit tower-defense game, a stylised 3D game prop like a small collectible vinyl toy, not realistic. Flat cel colours in two tones per material (one lit tone, one shadow tone), no wood grain, no scratches, no fine detail: large clean shapes that read at 40 pixels. Palette of a moonlit forest at night: muted materials, shadows leaning deep teal-black, moon-silver light from the upper left, small glowing details only where something emits light. Even lighting, no cast shadows, no text, no logo.

Draw only one of the Drummer's two drum mallets from this picture, on its own, with no character, no hand and no drum: a short, thick, straight wooden handle of dark wood about as long as a forearm, a little wider at its grip end, and on top of it one big round pale straw-gold ball head, smooth and solid, about three times as wide as the handle. Standing perfectly upright and vertical, the round head at the top, seen from the front, the whole mallet inside the frame with margin, plain flat mid-grey background, nothing else in the picture.
```

## Settings

As the heroes'. `meshy_image_to_3d` (the character, by `file_path` from `concept-bare.png`): `ai_model` latest
(Meshy 7.1), `should_texture` true, `image_enhancement` false, `should_remesh` true, `target_polycount` 30000,
`topology` triangle, no `pose_mode`, GLB. The mallet: the same with `target_polycount` 5000. `meshy_rig`:
`height_meters` 1.8 (rig 3 by `model_url`, the body as a `data:model/gltf-binary;base64,…` URI). `meshy_animate`
(rig 3): `action_ids` [0, 178, 189, 128, 219, 127, 237, 88, 87, 65].

## Clips

Split as the other heroes' (`../README.md`, "How the five action clips were split"): each kept action's channels copied
onto the same-named joints of rig 3's walk file, its own clip removed, the keyframe arrays as they are, the bone
display's zero-length normals set to +Y; the walk and the run rewritten the same way. All 30 frames a second.

| File | Meshy action | Clip in the file | Length | Root motion (the hips over the ground from the first key) |
|---|---|---|---|---|
| `idle.glb` | 0 Idle | `Idle` | 4.00 s | sways up to 20 cm and returns |
| `walk.glb` | walking, free with the rig | `Armature\|walking_man\|baselayer` | 1.07 s | in place (4 cm) |
| `run.glb` | running, free with the rig | `Armature\|running\|baselayer` | 0.67 s | in place (6 cm) |
| `attack.glb` | 219 Right-hand Sword Slash | `Right_Hand_Sword_Slash` | 1.50 s | 35 cm during the turn, returns |
| `slam.glb` | 128 Heavy Hammer Swing | `Heavy_Hammer_Swing` | 1.83 s | ends 28 cm on; the hips rise 22 cm (a hop) |
| `drum.glb` | 88 Chest Pound Taunt | `Chest_Pound_Taunt` | 4.83 s | 35 cm in the turned start and end, returns |
| `hit.glb` | 178 Hit Reaction | `Hit_Reaction` | 1.63 s | steps 55 cm sideways and stays |
| `death.glb` | 189 Dying Backwards | `dying_backwards` | 2.20 s | falls 26 cm back |

Not kept (in clips 3's bundle, which Meshy keeps for three days): 127 Charged Ground Slam, 237 Charged Axe Chop,
87 Boxing Practice, 65 Bass Beats.

## The measurements (`model.glb`'s bind pose, glTF metres: x his left, y up, z forward; 0 at the soles)

- **The hat:** its top at (0.007, 1.800, −0.023); the brim's radius from that axis 0.62 m, its rim at y ≈ 1.43; it
  spans x −0.59 … 0.61 and z −0.60 … 0.60 (it is the model's widest part, front to back too).
- **The hands** (the vertices whose strongest bone is the hand): left centred at (0.512, 0.487, 0.074), right at
  (−0.512, 0.461, −0.035); both open, the fingers apart.
- **The drum** (`back-drum.glb`): centre (0.051, 0.966, −0.470); axis (0.995, 0.001, 0.099), level and turned 5.7°
  about the vertical (his right skin further back); skin centres (0.662, 0.966, −0.409) on his left and
  (−0.559, 0.965, −0.531) on his right, 1.23 m apart; skin radius 0.377 (the rope rims about 4 cm more); it spans
  x −0.63 … 0.73, y 0.52 … 1.39, z −0.92 … 0.04. Rig 3's `Spine02` is at (−0.051, 0.765, 0.212).
- **The eyes:** 8 vertices about (−0.017, 1.338, 0.161), texture colour `#e4dfc3` (a pale cream rather than gold: the
  painter makes them glow pale gold).

## What the auto-rig skinned to the wrong bones (rig 3)

Measured on `model.glb`'s weights (vertex counts; the regions picked by texture colour and height):

- **The hat** (5,181 vertices above y 1.22: the straw and the brim's dark underside): 77% `head_end`, 16%
  `RightShoulder`; 4,009 of them carry more than 10% off the head chain (26% on average), 2,736 of those on his right
  side. **Rebind whole to `Head`** (or `head_end`), as the brief expected.
- **The sash** (1,532 straw vertices at y 0.45–0.75): 26% `RightHand`, 25% `LeftHand`, 14% `LeftUpLeg`, 10% `Hips`;
  553 of them carry over 20% on the legs. It would follow his hands: **rebind whole to `Hips`** (or `Spine02`).
- **The cape's fringes** (4,171 straw vertices at y 0.85–1.22): 82% on the shoulders and arms, which suits a short
  cape (`../drummer-concepts/README.md`); its lower fringe (815) also takes 22% `Spine02`. Leave, or blend the lowest
  fringe toward `Spine`.
- **The chest rope** (about 1,243 vertices): 32% `LeftShoulder`, 29% `Spine02`, 8% `RightArm`, 7% `head_end`: the
  `head_end` share is wrong (it would lift with a nod); rebind to `Spine02` and `Spine`.
- **Behind the shoulders** (765 straw vertices: the rope's two ends where the drum was cut and the cape's back): 42%
  `RightArm`, 32% `RightShoulder`, 16% `head_end`; the drum covers them. Rebind with the rope.
- **The drum** has no weights (a prop for `Spine02`).
- **The cut:** a few ragged red flaps of the barrel stay on the body at the backs of the shoulders, inside the drum's
  shell; `back-drum.glb` covers them at rest.

## Clipping, checked on every clip

Each clip played on `model.glb` with `back-drum.glb` on `Spine02` (three.js in headless Chromium), every frame: the
hat's and the limbs' vertices tested against the drum's cylinder, the hands against the hat's cone. The depth is how
far inside the cylinder the deepest vertex goes.

| Clip | The hat in the drum | Arms in the drum | Hands through the brim | Legs |
|---|---|---|---|---|
| bind pose | 3 cm (the brim's back rests on the drum's top) | 4 cm (the shoulders' fronts) | none | none |
| idle | 17 cm | 24 cm (the upper arms into the drum's ends) | none | none |
| walk | 21 cm | 5 cm | none | none |
| run | 35 cm | 9 cm | none | none |
| attack | 25 cm | 19 cm | 4 frames | none |
| slam | 37 cm | none | 9 frames (overhead) | none |
| drum | 29 cm | 4 cm | none | none |
| hit | 34 cm | 12 cm | 13 frames | none |
| death | 18 cm | none | 21 frames | none |

**So the idle, the walk and the run are not clean:** the back of the brim dips into the drum's top whenever his head
tips forward or his spine leans (the drum rides the lean; the head counter-turns). From the front and the match's camera
the hat hides it; from behind the drum covers the brim. Seated **15 cm lower** on `Spine02` the drum clears the idle to
3.5 cm and the walk to 7 cm, but not the run (28 cm; 30 cm also 5 cm further back); `Spine01` or `Spine` as its bone
is worse (25 and 35 cm in the idle). The build session decides: a lower seat, a lean taken off the drum on the run's
frames, or the brim drawn over the drum.

## What looks wrong

- The concept's arms hang close to the body (the edit did not open them to an A-pose); the rig took them anyway.
- The mallet's head has a highlight painted into its texture, and the model's texture keeps soft painted shading; the
  painter's two-tone bands flatten both.
- The attack turns his whole body (the drum swings to face the camera mid-strike), and the slam's fold throws the drum
  up over his back: pick the frames with care.
- The drumming clip beats his chest, not a drum in front of him: the pipeline can bring the fists forward or put the
  beat on the mallets' path.
