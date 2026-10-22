# The Ranger (Meshy, V-06a, round 1)

> **Round 1, kept for comparison** ([PR #127](https://github.com/Han1989/tgt-td-cld/pull/127), not merged). Han, 22 Oct 2026, 11:44: round 1's heroes came out as realistic humans; the game's heroes are chibi. Round 2 is `../ranger/`, and both rounds are on `docs/art/meshy-heroes.png`. These files are #127's `ranger/` folder, unchanged but for this note and the title. Since round 2, `docs/art/meshy-style.md` is round 2's style sheet (round 1's paragraph is kept in its last section) and `../README.md` indexes both rounds (the skeleton, the clip format and the weapon fix are there).

A lean forest scout of about thirty in a moss-green hood with a curled leaf peak, a cloth mask, a leather jerkin and
a short leaf-cut mantle, teal-fletched arrows in a quiver on his back and a tall recurve bow with bone tips in his
**left** hand. Brief and style paragraph: `docs/art/meshy-style.md`. Folder notes (clip format, skeleton, the weapon
fix): `../README.md`.

- **Generated:** 22 Oct 2026, through the Meshy MCP server (`@meshy-ai/meshy-mcp-server` 0.6.5), on a Meshy **Pro** plan.
- **Licence:** Generated on a Meshy Pro plan, private licence, commercial use permitted.
- **Credits:** 98 (two concept images 18, two image-to-3D attempts 60, rig 5, five actions 15).

## Files

| File | Size | What |
|---|---|---|
| `concept.png` | 1.10 MB | The concept (concept 1 of 2), 896 × 1200 |
| `model.glb` | 5.51 MB | Rigged and textured, bind pose (A-pose): 30,805 triangles, 33,262 vertices, one material, a 2048 × 2048 JPEG base colour embedded (no separate texture file), 24 joints, rigged at 1.75 m |
| `idle.glb` | 130 KB | Idle |
| `walk.glb` | 90 KB | Walk (the rig's free clip) |
| `run.glb` | 80 KB | Run (the rig's free clip) |
| `attack.glb` | 139 KB | Bow draw and release |
| `cast.glb` | 161 KB | Arrow from the quiver, nock, draw, release |
| `hit.glb` | 107 KB | Hit reaction |
| `death.glb` | 109 KB | Death |

## Tasks

| Step | Task id | Settings | Result |
|---|---|---|---|
| Concept 1 (**kept**) | `01a1619a-bbd5-72cf-bc8d-66715a152d3e` | `meshy_text_to_image`, `nano-banana-pro`, `pose_mode` a-pose, 3:4 | The bow upright in his left hand, clear of the body; the hood's peak a compact curl; the mantle short; every limb free |
| Concept 2 (rejected) | `01a1619a-bb5a-751e-9134-2f43942135e3` | same | A long leaf tail floating off the hood and a knee-length cape: thin flaps in 3D, the legs hidden (the brief says no cape) |
| 3D attempt 1 (rejected) | `01a1619b-bfef-711d-b6b8-ae0b4935fd3b` | `meshy_image_to_3d` from concept 1, `ai_model` latest (Meshy 7.1), textured, `pose_mode` a-pose, remeshed to 30,000 triangles, `image_enhancement` off | Re-posed into a symmetric A-pose and the bow **moved onto his back**, both hands empty; the hood's curl lost |
| 3D attempt 2 (**kept**) | `01a1619e-a57e-7323-b58c-fb4bd06d4744` | the same, **without `pose_mode`** (the concept is already an A-pose) | The bow in his left hand, the curled hood, the quiver: close to the concept |
| Rig | `01a1619f-b7e3-75bf-a869-545962fab241` | `meshy_rig`, `height_meters` 1.75 | `model.glb` (`Character_output.glb`), `walk.glb` and `run.glb` (the armature-only free clips) |
| Actions | `01a161a1-d832-72eb-8e65-9d4b6f472698` | `meshy_animate`, `action_ids` [0, 224, 222, 150, 189] | One bundled file, split into the five files below (`../README.md`) |

Attempt 2 is kept: it is the only one with the bow in his hand and the hood's mark. Both attempts are the same
concept; only `pose_mode` differs.

## Prompt

`docs/art/meshy-style.md`'s style paragraph, then this line, then its framing line, word for word:

> The Ranger: a lean, wiry forest scout of about thirty with long arms, a short dark beard, a moss-green cloth mask
> over the lower face and his eyes in the hood's shadow with a faint pale-green glint. A deep moss-green hood with a
> long leaf-shaped peak that curls back past the nape. Layered brown leather jerkin over a dark green tunic, a short
> leaf-cut mantle over the shoulders only (no cape), a diagonal chest strap, a leather bracer and fingerless gloves,
> dark trousers wrapped with leather bands from knee to ankle, soft flat leather boots. A quiver of teal-fletched
> arrows on his back. In his LEFT hand a tall recurve longbow of dark wood with pale bone tips and a bone grip, held
> upright at his side away from the body; his right hand open and empty. Accent colour: moss green on brown leather.

## Clips

| File | Meshy action (id) | Clip name in the file | Length | Notes |
|---|---|---|---|---|
| `idle.glb` | Idle (0) | `Idle` | 4.00 s | A calm stance with one look round over the shoulder (around 65%) |
| `walk.glb` | the rig's free walk | `Armature|walking_man|baselayer` | 1.07 s | One cycle, in place |
| `run.glb` | the rig's free run | `Armature|running|baselayer` | 0.67 s | One cycle, in place |
| `attack.glb` | Archery Shot (224) | `Archery_Shot` | 5.00 s | Bow raised in the left hand, the right hand draws to the face and looses (about 45–65%) |
| `cast.glb` | Draw and Shoot from Back (222) | `Draw_and_Shoot_from_Back` | 7.83 s | Reaches to the quiver, nocks, draws and shoots: Multishot |
| `hit.glb` | Hit Reaction with Bow (150) | `Hit_Reaction_with_Bow` | 1.97 s | A flinch with the bow raised |
| `death.glb` | Dying Backwards (189) | `dying_backwards` | 2.20 s | Falls flat on his back (the hips end 0.7 m back) |

All 30 fps. Picked by name: the library's preview GIFs are on `cdn.meshy.ai`, which this session's network refuses,
so every clip was checked instead by rendering it on the model at six moments.

## What looks wrong

- **The bow bends.** Its grip and middle are about 95% `LeftHand`, but its tips share `LeftShoulder` / `LeftArm`
  (top) and `LeftLeg` / `LeftUpLeg` (bottom), so in the walk, the run and the draw its limbs bend like rubber.
  Fix (tested in three.js, `../README.md`): every vertex with **x > 0.34 and y < 0.93 or y > 1.08**, and with
  **x > 0.44 for 0.93 ≤ y ≤ 1.08** (the grip), 100% `LeftHand` (`model.glb`'s bind pose, glTF metres). The bow then
  stays straight in the walk, the run and the death.
- **The bow string is welded and straight.** It is part of the mesh and does not flex: on the draw the right hand
  comes back to the face while the string stays put. V-05b drew its string from the bow's own shape key; here
  session 2 either draws the string as a line from the tips to the hand or accepts a straight string.
- **No fingers:** the draw hand is a mitt and never opens on the release.
- **The quiver's arrows** are a few chunky teal fletchings: fine at phone size.
- The face is the concept's mask and hood; the eyes' green glint is faint in the texture (the painter can make it
  glow, as it does for V-05b's eyes).
