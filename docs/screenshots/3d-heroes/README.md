# 3D heroes: screenshots

**V-06c (22 Oct 2026): three fixes on the stage loops** (Han's notes from his phone; `docs/ART.md` §15 "V-06c"). Each `v06c-stage-*` is the hero's stage on the home card of a 412 × 839 phone at 2.625×, the loop paused on one frame: V-06b's loop on the left, V-06c's on the right (the browser tests' Chromium plays the VP9 WebM; phones with H.264 play the MP4 of the same frames).

- `v06c-stage-warden-0000-412x839.webp` (frame 0, the poster) and `v06c-stage-warden-0100-412x839.webp` (frame 100, the shield up): no white sheen on the helm, the pauldrons and the bevels, the rim and the moonlit edge faint, the bevels a step from the plate. The soft teal light on the helm in both is one of the clearing's motes drifting in front of him.
- `v06c-stage-arcanist-0000-412x839.webp` (idle) and `v06c-stage-arcanist-0145-412x839.webp` (the staff raised): her hand on the staff, the shaft through her glove.
- `v06c-arcanist-staff.webp`: her hand and staff enlarged 3×, stage frames 0 (idle), 75 (the thrust, mid-swing) and 145 (the raise): V-06b on top, V-06c below.
- `v06c-stage-ranger-0120-412x839.webp` (the pull) and `v06c-stage-ranger-0150-412x839.webp` (held at the cheek): his draw hand in front of the hood with the arrow; V-06b's hand was behind it.
- `v06c-ranger-draw.webp`: every frame of the shipped loop from 94 to 162, the draw arm drawn over the hood on 96–160, cut to his head and arms, in order left to right, top to bottom.

**V-06b (22 Oct 2026): the Meshy heroes in the game** (the game's own designs, `docs/ART.md` §15 "Meshy heroes").

- `v06b-stage-<hero>-412x839.webp`: each hero's stage on the home card of a 412 × 839 phone at 2.625×, its poster (the loop's first frame, as reduced motion shows it): V-05b's KayKit hero on the left, the Meshy hero on the right.
- `v06b-match-3heroes-412x839.webp`, `v06b-match-3heroes-zoom.webp`: a three-player online match on a 412 × 839 phone (a local game server; the browser as the Ranger, bots as the Warden and the Arcanist), 40 s in, and the three heroes from it enlarged 3×.
- `v06b-arcanist-staff.webp`: her staff on her right hand (`hero.py`: at (−0.475, 0.95, 0.05) m of her bind pose, leaning 12° out, 0.85 of its size): the stage's frame 0 and the match's idle frame enlarged 4×. The crescent stands beside her shoulder, clear of the brim.
- `heroes-contact-sheet.png`: `python tools/blender/contact.py`, now V-06b's: each hero's stage moments (the fixture frames, from the shipped WebM, in the shared box), then the match poses at full size, at phone size and 50 px tall.

**V-05b round 2 (PR #109, 17 Oct 2026): a sharp stage, 2400 × 900.**

- `stage-<hero>-412x839.webp`: each hero's stage on the home card of a 412 × 839 phone at 3×, paused in his signature move (the Ranger at full draw, the Warden mid-slice, the Arcanist's gem raised as the summon begins) (the browser tests' Chromium plays the VP9 WebM; phones with H.264 play the MP4 of the same frames).
- `ranger-hood-eyes-300.webp`: `python tools/blender/edges.py`. The Ranger's hood top, hood edge and eyes in stage frame 0, decoded from each shipped MP4 and scaled as that stage is on a 3× screen, then enlarged 3× pixel for pixel: V-05b's first round (1200 × 450), round 2 (2400 × 900) and V-05a's Ranger (#106, 2400 × 900).
- `warden-slice-1x-2x.webp`, `ranger-string-1x-2x.webp`: why some stage frames are rendered at 2× (docs/ART.md §15). The Warden's slice (stage frame 127, a fast frame) and the Ranger's string in the follow-through (frame 196, which failed the fringe check at 1×), each rendered at 1× (24 samples) and at 2× (shipped), scaled as a 3× phone shows the stage and enlarged 3×: at 1× the motion-blurred blade breaks into specks and the string's light core into light dots.

**V-05b (PR #108, 16 Oct 2026): the three heroes from the KayKit models.** Its stage screenshots below show the 1200 × 450 loops (its `stage-<hero>-412x839.webp` are replaced by round 2's above).

- `stage-<hero>-desktop.webp`: each hero's stage on the home card, in his signature move.
- `match-3heroes-412x839.webp`, `match-3heroes-zoom.webp`: a three-player match on a 412 × 839 phone (Han as the Ranger, bots as the Warden and the Arcanist), and the three heroes cropped from it.
- `arcanist-idle-match-zoom.webp`: the Arcanist standing idle in a solo match, 3× pixel for pixel.
- `arcanist-stage-gem-in-moss.webp`: the Arcanist's stage idle (frame 0), and the summon's start (frame 94), where his staff's gem reaches the moss below his feet and sets the shared box's bottom (`stage.BOX` y 400).
- `heroes-contact-sheet.png` was V-05b's until V-06b replaced it (the KayKit heroes' sheet is in git history).
- `greyscale.webp`: one stage frame per hero in greyscale (the value check).
- `ranger-0151-fringe.webp`: the Ranger's stage frame 151.
  - Yellow: the flying arrow's box, left out of the fringe check.
  - Red: the 16 pixels the check counts there without that box, all on the arrow's streak over the rock (docs/ART.md §15).

**V-05a (PR #106, 14 Oct 2026): the code-modelled Ranger.** These are kept for the record:

- `stage-*-before/after`, `solo-pick-*`
- `match-*-before/after`, `match-2d-vs-3d.png`
- `ranger-contact-sheet.png`, `ranger-edges.png`
