# The Arcanist (Meshy, V-06a)

A battle-mage woman of about thirty (Han, 17 Oct 2026: the Arcanist becomes a woman), athletic and calm, in a
high-collared deep-violet battle-coat with a bone-white sash, a leather corset and knee boots; a long bone-white braid
with glowing violet rune beads over her **left** shoulder, a thin bone circlet, faint violet rune marks under her eyes,
and a tall dark staff topped by a bone-white crescent that cradles a violet crystal in her **right** hand. Brief and
style paragraph: `docs/art/meshy-style.md`. Folder notes (clip format, skeleton, the weapon fix): `../README.md`.

- **Generated:** 22 Oct 2026, through the Meshy MCP server (`@meshy-ai/meshy-mcp-server` 0.6.5), on a Meshy **Pro** plan.
- **Licence:** Generated on a Meshy Pro plan, private licence, commercial use permitted.
- **Credits:** 68 (two concept images 18, one image-to-3D attempt 30, rig 5, five actions 15).

## Files

| File | Size | What |
|---|---|---|
| `concept.png` | 1.01 MB | The concept (concept 1 of 2, **mirrored**: below), 896 × 1200 |
| `model.glb` | 5.44 MB | Rigged and textured, bind pose (A-pose): 30,856 triangles, 31,669 vertices, one material, a 2048 × 2048 JPEG base colour embedded (no separate texture file), 24 joints, rigged at 1.8 m |
| `idle.glb` | 130 KB | Idle |
| `walk.glb` | 90 KB | Walk (the rig's free clip) |
| `run.glb` | 79 KB | Run (the rig's free clip) |
| `attack.glb` | 110 KB | Staff cast |
| `cast.glb` | 114 KB | Charged spell, the hand thrown to the sky |
| `hit.glb` | 103 KB | Hit reaction |
| `death.glb` | 109 KB | Death |

## Tasks

| Step | Task id | Settings | Result |
|---|---|---|---|
| Concept 1 (**kept**, mirrored) | `01a161a8-61c1-7184-91c0-c5507f61efd6` | `meshy_text_to_image`, `nano-banana-pro`, `pose_mode` a-pose, 3:4 | The staff held well out from the body, its foot clear of the boots; the long braid and its beads; the circlet |
| Concept 2 (rejected) | `01a161a8-6226-724e-b78a-3415e0f4729a` | same | Crisper beads and a fiercer face, but the staff stands close by her foot (its weights would go to the leg) and no circlet |
| 3D attempt 1 (**kept**) | `01a161a9-5f8f-732b-84eb-0bb437dc9c35` | `meshy_image_to_3d` from `concept.png` (the mirrored file), `ai_model` latest (Meshy 7.1), textured, no `pose_mode`, remeshed to 30,000 triangles, `image_enhancement` off | A faithful build of the concept |
| Rig | `01a161aa-485b-73de-8828-720b38ef85da` | `meshy_rig`, `height_meters` 1.8 | `model.glb` (`Character_output.glb`), `walk.glb` and `run.glb` |
| Actions | `01a161ad-3896-71ab-82bb-dd139c1be35d` | `meshy_animate`, `action_ids` [0, 129, 125, 178, 189] | One bundled file, split into the five files below |

**The concept is mirrored.** Both images came back with the staff in her left hand and the braid over her right
shoulder, the opposite of the prompt. Concept 1 was flipped left to right (ffmpeg `hflip`) before image to 3D, which
puts the staff in her right hand and the braid over her left shoulder, as the brief says; `concept.png` is the flipped
image (the task id above gives the original). One attempt: the model and the rig were good the first time.

## Prompt

`docs/art/meshy-style.md`'s style paragraph, then this line, then its framing line, word for word:

> The Arcanist: a battle-mage woman of about thirty, athletic, slim and strong, straight-backed, calm and determined,
> with sharp clear features, light skin and faint glowing violet rune marks under her eyes. Long bone-white hair in
> one thick braid falling over her LEFT shoulder and down the front of her coat to the waist, with three glowing
> violet rune beads along the braid; a thin bone circlet, no hat. A fitted deep-violet battle-coat with a high stiff
> collar, a bone-white sash and clasp and a short dark leather corset over it; the coat is split at the front and
> sides from the hips so her legs show, over dark leggings; fitted sleeves, leather vambraces with small bone plates,
> dark gloves; knee-high dark leather boots, flat. In her RIGHT hand a tall staff of dark wood topped by a bone-white
> crescent that cradles a glowing violet crystal, held upright out to her side and away from the body, the foot of
> the staff above the ground and clear of her legs; her left hand open and empty. No cape, no long robe, no hat, no
> floating particles or spell effects. Accent colours: violet with bone-white.

## Clips

| File | Meshy action (id) | Clip name in the file | Length | Notes |
|---|---|---|---|---|
| `idle.glb` | Idle (0) | `Idle` | 4.00 s | A wide stance with one look round |
| `walk.glb` | the rig's free walk | `Armature|walking_man|baselayer` | 1.07 s | One cycle, in place |
| `run.glb` | the rig's free run | `Armature|running|baselayer` | 0.67 s | One cycle, in place |
| `attack.glb` | Mage Spell Cast (129, `Mage_Soell_Cast` in the library) | `mage_soell_cast` | 2.27 s | Lifts the staff high (45%) and brings it down: the auto-attack and Fireball |
| `cast.glb` | Charged Spell Cast (125) | `Charged_Spell_Cast` | 2.67 s | A crouched charge (25–45%), then the free hand thrown to the sky (65–85%): Meteor |
| `hit.glb` | Hit Reaction (178) | `Hit_Reaction` | 1.63 s | A recoil that **steps 0.8 m sideways** (root motion) |
| `death.glb` | Dying Backwards (189) | `dying_backwards` | 2.20 s | Falls flat on her back (the hips end 0.7 m back) |

All 30 fps. Picked by name (the preview GIFs are on a host this session cannot reach) and checked by rendering each
clip on the model at six moments.

## What looks wrong

- **The staff bends like a rope.** Above her hand it is about 60% `RightHand` and 40% `RightForeArm`; below it, down
  to the foot beside her right boot, 85–100% her right thigh and shin (`RightUpLeg`, `RightLeg`), so in the walk and
  the run the staff's lower half follows her leg. Fix (tested in three.js, `../README.md`): every vertex with **x < −0.255 and y < 0.95**, **x < −0.40 for
  0.95 ≤ y ≤ 1.28** (the grip) and **x < −0.30 and y > 1.28** 100% `RightHand` (`model.glb`'s bind pose, glTF metres;
  the staff leans in towards its foot, and her coat never reaches past x −0.24 below the hand). The staff then stays
  a straight rod in the walk and the run; one walk frame showed a small spur at the grip (a few finger vertices),
  for session 2 to trim.
- **Root motion** in `hit.glb` (0.8 m sideways): pin the hips where a frame must stay on its spot.
- The coat's front split reads in 3D, and its hem swings with the legs without tearing in the run.
- The violet glows (crystal, beads, rune marks) are colour in the texture, not light; the painter's glow can make
  them emit, as it does for V-05b's staff gem.
