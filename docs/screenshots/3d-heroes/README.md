# 3D heroes: screenshots

**V-05b (PR #108, 16 Oct 2026): the three heroes from the KayKit models.**

- `stage-<hero>-412x839.webp`, `stage-<hero>-desktop.webp`: each hero's stage on the home card, in his signature move.
- `match-3heroes-412x839.webp`, `match-3heroes-zoom.webp`: a three-player match on a 412 × 839 phone (Han as the Ranger, bots as the Warden and the Arcanist), and the three heroes cropped from it.
- `arcanist-idle-match-zoom.webp`: the Arcanist standing idle in a solo match, 3× pixel for pixel.
- `arcanist-stage-gem-in-moss.webp`: the Arcanist's stage idle (frame 0), and the summon's start (frame 94), where his staff's gem reaches the moss below his feet and sets the shared box's bottom (`stage.BOX` y 400).
- `heroes-contact-sheet.png`: `python tools/blender/contact.py`. The stage's key moments, then the match poses at full size, at phone size and 50 px tall.
- `greyscale.webp`: one stage frame per hero in greyscale (the value check).
- `ranger-0151-fringe.webp`: the Ranger's stage frame 151.
  - Yellow: the flying arrow's box, left out of the fringe check.
  - Red: the 16 pixels the check counts there without that box, all on the arrow's streak over the rock (docs/ART.md §15).

**V-05a (PR #106, 14 Oct 2026): the code-modelled Ranger.** These are kept for the record:

- `stage-*-before/after`, `solo-pick-*`
- `match-*-before/after`, `match-2d-vs-3d.png`
- `ranger-contact-sheet.png`, `ranger-edges.png`
