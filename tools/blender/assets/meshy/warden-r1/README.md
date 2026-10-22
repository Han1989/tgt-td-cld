# The Warden (Meshy, V-06a, round 1)

> **Round 1, kept for comparison** ([PR #127](https://github.com/Han1989/tgt-td-cld/pull/127), not merged). Han, 22 Oct 2026, 11:44: round 1's heroes came out as realistic humans; the game's heroes are chibi. Round 2 is `../warden/`, and both rounds are on `docs/art/meshy-heroes.png`. These files are #127's `warden/` folder, unchanged but for this note and the title. Since round 2, `docs/art/meshy-style.md` is round 2's style sheet (round 1's paragraph is kept in its last section) and `../README.md` indexes both rounds (the skeleton, the clip format and the weapon fix are there).

An old shield-captain of about forty-five, broad and heavy, in dark iron plate under a red-brown surcoat: a rounded
great-helm whose T-visor glows ember from inside, a curled ram-horn pauldron, a broad arming sword in his **right**
hand and a tall kite shield with one ember rune on his **left** forearm. Brief and style paragraph:
`docs/art/meshy-style.md`. Folder notes (clip format, skeleton, the weapon fix): `../README.md`.

- **Generated:** 22 Oct 2026, through the Meshy MCP server (`@meshy-ai/meshy-mcp-server` 0.6.5), on a Meshy **Pro** plan.
- **Licence:** Generated on a Meshy Pro plan, private licence, commercial use permitted.
- **Credits:** 68 (two concept images 18, one image-to-3D attempt 30, rig 5, five actions 15).

## Files

| File | Size | What |
|---|---|---|
| `concept.png` | 0.85 MB | The concept (concept 2 of 2), 896 × 1200 |
| `model.glb` | 5.51 MB | Rigged and textured, bind pose (A-pose): 30,746 triangles, 36,005 vertices, one material, a 2048 × 2048 JPEG base colour embedded (no separate texture file), 24 joints, rigged at 1.9 m |
| `idle.glb` | 130 KB | Idle |
| `walk.glb` | 90 KB | Walk (the rig's free clip) |
| `run.glb` | 79 KB | Run (the rig's free clip) |
| `attack.glb` | 102 KB | Sword slash |
| `cast.glb` | 151 KB | War cry with the sword raised |
| `hit.glb` | 103 KB | Hit reaction |
| `death.glb` | 109 KB | Death |

## Tasks

| Step | Task id | Settings | Result |
|---|---|---|---|
| Concept 1 (rejected) | `01a161a4-19fc-769c-be2d-ee86a5e97ff7` | `meshy_text_to_image`, `nano-banana-pro`, `pose_mode` a-pose, 3:4 | Strong, but the blade crosses in front of his left knee: the rig would weight it to the leg |
| Concept 2 (**kept**) | `01a161a4-19e1-750f-8dd5-f977b5896d1e` | same | The sword held out level, clear of the body; the shield at his side, clear of the legs; the T-visor lit |
| 3D attempt 1 (**kept**) | `01a161a4-efe8-747d-b35a-3ca39d9d1b62` | `meshy_image_to_3d` from concept 2, `ai_model` latest (Meshy 7.1), textured, no `pose_mode`, remeshed to 30,000 triangles, `image_enhancement` off | Close to the concept; the sword reconstructed pointing forward (the concept's three-quarter view read in depth) |
| Rig | `01a161a6-30f7-73c4-bd4e-69501b8d5e98` | `meshy_rig`, `height_meters` 1.9 | `model.glb` (`Character_output.glb`), `walk.glb` and `run.glb` |
| Actions | `01a161a7-03de-7336-be15-8b638d2c0b33` | `meshy_animate`, `action_ids` [0, 219, 101, 178, 189] | One bundled file, split into the five files below |

One attempt: the model and the rig were good the first time, so the second was not spent.

## Prompt

`docs/art/meshy-style.md`'s style paragraph, then this line, then its framing line, word for word:

> The Warden: an old shield-captain of about forty-five, heavy, broad and barrel-chested with thick arms and legs,
> standing wide and immovable. A rounded dark-iron great-helm with a T-shaped visor slit; inside the visor only
> darkness and two ember-orange glowing eyes. Dark iron plate cuirass with a heavy gorget, a dark red-brown surcoat
> from the belly to mid-thigh, a thick leather belt. One huge curled ram-horn pauldron on his LEFT shoulder, a plain
> round iron pauldron on the right, plate gauntlets, plate legs over dark mail at the knee, heavy flat iron sabatons.
> In his RIGHT hand a broad one-handed arming sword with a short cross-guard, held out to the side and angled away
> from the body, the blade well clear of his legs. On his LEFT forearm a tall dark-iron kite shield with one glowing
> ember-orange rune in its centre, held out from the body at his side so the torso stays visible and the shield does
> not touch the legs. No cape. Accent colour: ember orange on dark iron.

## Clips

| File | Meshy action (id) | Clip name in the file | Length | Notes |
|---|---|---|---|---|
| `idle.glb` | Idle (0) | `Idle` | 4.00 s | A calm stance with one look round (around 65%) |
| `walk.glb` | the rig's free walk | `Armature|walking_man|baselayer` | 1.07 s | One cycle, in place |
| `run.glb` | the rig's free run | `Armature|running|baselayer` | 0.67 s | One cycle, in place |
| `attack.glb` | Right-hand Sword Slash (219) | `Right_Hand_Sword_Slash` | 1.50 s | Sword up and back (25%), the cut across (45%), back to guard |
| `cast.glb` | Sword Shout (101) | `Sword_Shout` | 6.17 s | Sword thrust at the sky (25%), then levelled and held over the shoulder: Taunt / Iron Vow. Ends 0.5 m forward |
| `hit.glb` | Hit Reaction (178) | `Hit_Reaction` | 1.63 s | A recoil that **steps 0.9 m sideways** (root motion) |
| `death.glb` | Dying Backwards (189) | `dying_backwards` | 2.20 s | Falls flat on his back (the hips end 0.8 m back) |

All 30 fps. Picked by name (the preview GIFs are on a host this session cannot reach) and checked by rendering each
clip on the model at six moments.

## What looks wrong

- **The shield bends in big poses.** Its weights are split between `LeftArm`, `LeftForeArm` and `LeftHand`, so when
  the elbow and wrist bend far (the run, the slash's wind-up, the hit, the death) the kite warps and its rune twists.
  Fix (tested in three.js, `../README.md`): every vertex with **x > 0.62 and y < 1.45** 100% `LeftForeArm` (the
  shield is strapped to the forearm; `model.glb`'s bind pose, glTF metres). The **sword is already rigid** (100%
  `RightHand`).
- **The horned pauldron is on his right shoulder** (the sword side) in both concepts and so in the model; the brief
  asked for the left. The mark reads either way; it was not worth a third image.
- **Root motion** in `hit.glb` (0.9 m sideways) and `cast.glb` (0.5 m forward): pin the hips where a frame must stay
  on its spot.
- The ember eyes are a dim orange in the texture inside a dark visor; the painter's glow can lift them, as it does
  for V-05b's Warden.
