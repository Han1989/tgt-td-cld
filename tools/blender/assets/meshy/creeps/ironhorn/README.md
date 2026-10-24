# The Ironhorn (V-06j, enemy batch 2)

A boss, the host's first warlord: a horned bulk of bone on four legs, plated in dark iron over its brow, shoulders and
back, its ember core in its chest. Han's pick **Ironhorn a** (`../../enemy-concepts/ironhorn-a.png`) **without its
dark tufts** (Han's note: the faction has no fur or rags), made into the game's Ironhorn on 24 Oct 2026. Designed by
Claude, generated in Meshy. **Generated on a Meshy Premium plan, private licence, commercial use permitted.**

| File | What |
|---|---|
| `concept.png` | the image the model was made from: the pick redrawn by `meshy_image_to_image` (1200 × 896), its tufts gone (its hindquarters bone, ribs and iron like its front), standing square |
| `model.glb` | the textured model as `meshy_image_to_3d` returned it, **no skeleton**: 30,843 triangles in one mesh, a 2048 × 2048 JPEG base colour embedded, facing glTF +Z, its middle at the origin; 4.5 MB |

**The rig: tried once, not used.** `meshy_rig` took the quadruped (Meshy's auto-rig is for bipeds) and gave it the
heroes' 24-joint skeleton, but its free walk stood it up on its hind legs, its front legs as arms. As the brief says for
that outcome, it is kept unrigged and posed from its bind pose in the pipeline (`tools/blender/tdt3d/posed.py`, the
`posed` of its row in `tools/blender/creeps.py`): a two-frame gallop and a rear-and-slam. The rig's files are not
kept.

## Meshy tasks (24 Oct 2026)

| Step | Task id | Credits | |
|---|---|---|---|
| Pose (image to image) | `01a16ca7-776a-7257-8678-838f4774e0ab` | 9 | **kept**: no tufts, standing square |
| Model (image to 3D) | `01a16ca9-0477-717e-9550-f08611422764` | 30 | **kept**, attempt 1 of 1 |
| Rig | `01a16cab-b934-7626-b94b-7209082e2404` | 5 | tried once, `height_meters` 1.2: its walk stands it on two legs (not used) |
| | | **44** | |

## Settings

`meshy_image_to_image`: `nano-banana-pro`, one reference (the pick, as Meshy returned it: it already faces the picture's left). `meshy_image_to_3d` from that task: `ai_model` latest (Meshy 7.1), `should_texture` true, `image_enhancement` false (keeps the styling), `should_remesh` true, `target_polycount` 30000 (a boss is drawn at 3 px per world px but three times a creep's size), `topology` triangle, no `pose_mode` (the concept's own pose), `target_formats` ["glb"]. 4:3.

## The prompt (image to image, reference: `ironhorn-a.png`)

```text
Redraw exactly this creature: the same original design, proportions, colours and finish, a chibi risen bull of bone and dark iron, a boss in a stylised 3D game like a small collectible vinyl toy. Keep every mark: the big heavy bone skull lowered forward with its eye socket glowing ember-orange, the two huge curved horns sweeping forward from its brow, the riveted plate of dark iron on its brow, the thick riveted plates of dark iron over its shoulders and back, the bone ribs and the ember core glowing in its chest between them, the four short thick bone legs with heavy iron cuffs and iron-shod hooves, and the short tail.

Remove the dark shaggy tufts on its flanks and hindquarters: there is no fur and no rags anywhere, its hindquarters are bone, ribs and dark iron plates like its front. Change only the stance, for a clean 3D model: standing square and still on all four legs, the body level, the head held forward and a little low, all four legs straight and clearly separated from each other with space between them, front legs apart and hind legs apart, every hoof flat on the ground. Front three-quarter view, the creature turned slightly toward the left of the picture, as if about to walk that way.

The whole creature, both horns, its tail and all four hooves inside the frame with margin, plain flat mid-grey background, nothing else in the picture. No fur, no tufts, no hair, no cloth, no skin, no rider, no saddle. Flat cel colours in two tones per material, no bone texture, no cracks, no scratches, no fine detail; even, readable lighting, no cast shadows, no motion blur, no text, no logo.
```

## The poses (`posed`, glTF metres of `model.glb`)

Its soles are its hooves (y −0.6); it pitches about its hind hooves (y −0.6, z −0.52). Three regions, each weighted
smoothly at its edge: the front legs (below y −0.12, fully below −0.3, z 0.03–0.5, |x| > 0.17 so the core hanging
between them stays) turning about the shoulders (y −0.1, z 0.27); the hind legs (z −0.68 to −0.26) about the hips
(y −0.1, z −0.42); the head and horns (z > 0.4, fully past 0.56) about the neck (y 0, z 0.45).

| State | Frames | Pose |
|---|---|---|
| walk | 2 | a gallop, over 0.9 s: gathered (front legs back 18°, hind forward 18°, nose down 3°), then reaching (front forward 22°, hind back 20°, nose up 3°, lifted 0.04 m) |
| stand | 1 | the bind pose |
| attack | 3 | a gore: the head raised 16° and drawn back, then driven down 22° and 0.12 m forward, then back |
| flinch | 1 | nose up 7°, the head thrown back 12°, 0.07 m back |
| death | 3 | its knees buckle (nose down 8°, lowered 0.08 m), then it tips over onto its left side (40°, then 82° about its left hooves), its belly and the core toward the camera |
| ability | 3 | the Stomp, a rear-and-slam: up on its hind legs (26°, the front legs reaching), slammed down (nose down 9°, squashed 0.13, the head driven down), settling |

## Paint

Bone (three tones), its plates and horns in dark iron (`#393d48` and the horns' `#151113` to `ironDark`, the lit
slab on its back and `#595b62` to `iron`), and its ember: the core in its chest (between its front legs, under its
jaw) and its eye sockets glow; the ember Meshy painted inside its ribs is unlit.

## What looks wrong

- A two-frame gallop rocks rather than runs (the brief's two frames: a boss under a tile a second changes frame about
  every 0.45 s).
- The Stomp's slam and settle frames are close to its stand at phone size; the rear carries it.
