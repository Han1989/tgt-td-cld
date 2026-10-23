# The Arcanist redesigned: two concepts (V-06e concepts)

**Han, 23 Oct 2026, 09:05:** the Arcanist is too beautiful next to the other two. The Ranger and the Warden have no face
(a masked hood with glowing eyes; a closed helm with glowing eyes), and she has a pretty anime face, so she reads as
another art style. Redesign her by the same rule: **face hidden, two glowing violet eyes, one silhouette piece.** Keep
everything else from round 2: chibi 2.5 heads, the violet and bone-white colours, the crescent staff with the violet
crystal, the bead-and-rune cord.

**Images only.** No image to 3D, rig, clips or Blender: Han picks a concept first. Designed by Claude, generated in
Meshy on 23 Oct 2026. **Han picked the Oracle (23 Oct 2026, 10:04), `oracle-a.png`, with its mask dark; V-06e made
her from it: `../arcanist/` (round 2's Arcanist, which these were drawn from, is now `../arcanist-r2/`).**
**Generated on a Meshy Pro plan, private licence, commercial use permitted.** Sheet for Han:
`docs/art/arcanist-redesign.png` (these four, the current concept, and all of them at phone size next to the Ranger and
the Warden).

| File | Concept | |
|---|---|---|
| `oracle-a.png` | 1, the Hooded Oracle | **picked of the pair** |
| `oracle-b.png` | 1, the Hooded Oracle | |
| `seer-a.png` | 2, the Bone-Masked Seer | |
| `seer-b.png` | 2, the Bone-Masked Seer | **picked of the pair** |

All four are 896 × 1200 PNG, as Meshy returned them.

## How they were made

`meshy_image_to_image`, `nano-banana-pro`, aspect 3:4, one image: **`../arcanist-r2/concept.png` mirrored left to right**
(Pillow's `ImageOps.mirror`; not kept, since it is the concept flipped, the input V-06a's bare-handed edit also started
from). The round-2 concept came out mirrored, with the staff in her left hand; Han's brief asks for the staff in her
right hand, so the image sent agrees with the words. Each prompt is the style sheet's paragraph and composition line
word for word (`docs/art/meshy-style.md`), with a reference line and the concept's brief between them (quoted below).
Two tasks with the same prompt make the two images of a concept, as V-06a's concepts a and b did.

The style paragraph still asks for "two small dot eyes, no nose, a small simple mouth" (it was written for round 2's
faces); each brief overrides it ("her face is completely hidden"), as the Ranger's and the Warden's briefs did.

## Meshy tasks (23 Oct 2026, Pro plan)

| Image | Task id | Credits |
|---|---|---|
| Oracle a | `01a16650-3b74-70c2-b791-5ae8ebdace46` | 9 |
| Oracle b | `01a16650-3fdd-7383-a47b-fb3473c69ea8` | 9 |
| Seer a | `01a16650-4417-7381-a1ac-5c1fcbfe2906` | 9 |
| Seer b | `01a16650-489f-71e0-a6fa-82bac20024b6` | 9 |
| | | **36** |

`meshy_check_balance`: **492 credits before, 456 after.** The Meshy MCP server (`@meshy-ai/meshy-mcp-server` 0.6.5)
was driven over stdio from a scratch client, with `MESHY_API_KEY` from the environment (never written to a file).

## The picks

**Oracle a over b.** Both have the tall violet peak, the bone half-mask and two violet eyes glowing in the hood's
shadow. In **a** the rune cord hangs from the hood's edge, as the brief asks, down the front to the waist with its
beads spaced apart, and one trailing end hangs behind her left arm to the hip. In **b** the beads bunch at the collar,
a second strip of hood cloth runs down the front of the coat, and the trailing end is longer and wider and flares to
the knee. b's peak is a little taller, with a curled tip: the one thing it does better.

**Seer b over a.** Both keep the hat and add the tattered mantle, with the rune cord hanging from the hat's band. In
**a** the mask has carved teeth and cheekbones, so it reads as a skull, and the game's four basic creeps (Grunt,
Runner, Archer, Brute) are skeletons: a hero must not look like what she fights. **b** is the smooth, mouthless mask
the brief asks for. Its long chin and almond eye slits lean a little alien, and its cord is two strands, not one.

**Between the two concepts** (Han chooses): at phone size (a hero is about 40 px tall in a match; the sheet's bottom
row) only the **Oracle** keeps what the Ranger and the Warden have, a dark face with two glowing dots. The Seer's white
mask reads as a pale face under the same hat, so at 40 px she looks close to the Arcanist now. The Oracle's risk is the
one Han named: a hood, a lower-face mask and eyes in shadow is the Ranger's recipe. What separates them is the tall
peak (the Ranger's hood is round with a leaf), the trailing end, the bone-white mask and the violet; at 40 px the peak
is the clearest difference.

## What to watch

- **The Oracle's peak** leans back and is soft and open at the face, so it reads as a mage's hood; a straight,
  upright cone over a hidden face would read as something else. Keep the lean if she goes to 3D.
- **Only one trailing end shows** in both Oracles (behind her left arm); the brief asks for two. The second may be
  behind her; the front three-quarter view does not show it.
- **Cloth in Meshy's rig:** each Meshy model is one welded mesh, and the auto-rig skins a piece that hangs free like a
  limb (`../README.md`, "The one rig fault"). The Oracle's trailing end hangs beside her arm and would be skinned to
  it; the Seer's cord hangs beside her mask. The model would again be bare-handed with `../arcanist/staff.glb` on her
  right hand, so the chosen concept needs a bare-handed edit first, as `../arcanist-r2/concept-bare.png` had.
- **The rune glyphs** on the beads are mirrored or redrawn (the mirrored input); at 40 px they are dots.

## The prompts

Oracle a and b (the only image: `../arcanist-r2/concept.png` mirrored):

```text
Original chibi fantasy hero for a dark moonlit tower-defense game, a stylised 3D game character like a small collectible vinyl toy, not realistic. Chibi (super-deformed) proportions: the whole figure only 2.5 heads tall, the head about a third of the whole height and as wide as the shoulders, a big round skull, almost no neck, a short small stubby body, short stubby arms that reach only to the hips, short stubby legs, oversized hands and oversized feet, and the hero's signature piece oversized. Face: two small dot eyes, no nose, a small simple mouth, smooth skin with no texture. Flat cel colours in two tones per material (one lit tone, one shadow tone), no fabric weave, no metal grain or scratches, no fine detail, no realism: large clean shapes and a silhouette that reads at 40 pixels tall. Palette of a moonlit forest at night: muted materials (leather, dark cloth, iron, wood, bone), shadows leaning deep teal-black, moon-silver light from the upper left, one accent colour per hero and small glowing details only where something emits light. Even, readable lighting on the figure, no cast shadows across it, no motion blur, no text, no logo.

The reference image is the Arcanist's current concept: keep exactly its chibi proportions (the head as big as the rest of the body, the short stubby limbs, the big gloved hands and big boots), its simple smooth toy-like finish with clean outlines and flat two-tone colours, its deep violet and bone-white palette, her violet coat, corset, sash, vambraces, gloves, leggings and boots, and her crescent staff with its glowing violet crystal. Redesign only her head as described below: her pretty face and her hair must go, so that she matches the game's other two heroes, whose faces are hidden (a masked hood; a closed helm) and show only two glowing eyes.

The Arcanist as the Hooded Oracle, accent violet with bone-white. Her face is completely hidden: no skin on the head, no hair, no braid, no eyebrows, no lashes, no nose, no mouth. A deep, very tall peaked hood of deep-violet cloth takes the place of the hat: big and round over the big skull, its peak rising straight up and leaning slightly back to a soft point high above the head, taller than the head itself; from the back of the hood two long trailing cloth ends hang down behind her shoulders to the waist, their tips cut square. Under the hood a smooth bone-white half-mask covers her lower face from just under the eyes to the chin. In the hood's deep teal-black shadow, above the mask, only two glowing violet dot eyes. From the front edge of the hood, on her LEFT side, hangs a cord of bone beads with three glowing violet rune beads, down over her left shoulder to the chest. Keep the fitted deep-violet battle-coat with its high stiff collar, the bone-white sash and clasp, the short dark leather corset, the coat split at the front from the hips, the leather vambraces with small bone plates, the big dark gloves, dark leggings and big flat knee-high dark leather boots. In her RIGHT hand the tall staff of dark wood topped by the big bone-white crescent that cradles a glowing violet crystal, held upright out to her side and away from the body, the foot of the staff clear of the ground and her legs; her left hand open and empty. She must not look like a green archer's round hood recoloured purple: her peak is tall and upright, two cloth ends trail behind her, the mask is bone-white, and there is no leaf. No hat, no visible hair, no cape, no long robe, no face marks, no floating particles or spell effects, not pink.

Full body, A-pose (arms angled down and away from the body, hands clear of the hips), front three-quarter view, standing straight, both feet flat and fully visible, the whole figure and weapon inside the frame with margin, plain flat mid-grey background, nothing else in the picture.
```

Seer a and b (the same image):

```text
Original chibi fantasy hero for a dark moonlit tower-defense game, a stylised 3D game character like a small collectible vinyl toy, not realistic. Chibi (super-deformed) proportions: the whole figure only 2.5 heads tall, the head about a third of the whole height and as wide as the shoulders, a big round skull, almost no neck, a short small stubby body, short stubby arms that reach only to the hips, short stubby legs, oversized hands and oversized feet, and the hero's signature piece oversized. Face: two small dot eyes, no nose, a small simple mouth, smooth skin with no texture. Flat cel colours in two tones per material (one lit tone, one shadow tone), no fabric weave, no metal grain or scratches, no fine detail, no realism: large clean shapes and a silhouette that reads at 40 pixels tall. Palette of a moonlit forest at night: muted materials (leather, dark cloth, iron, wood, bone), shadows leaning deep teal-black, moon-silver light from the upper left, one accent colour per hero and small glowing details only where something emits light. Even, readable lighting on the figure, no cast shadows across it, no motion blur, no text, no logo.

The reference image is the Arcanist's current concept: keep exactly its chibi proportions (the head as big as the rest of the body, the short stubby limbs, the big gloved hands and big boots), its simple smooth toy-like finish with clean outlines and flat two-tone colours, its deep violet and bone-white palette, her violet coat, corset, sash, vambraces, gloves, leggings and boots, and her crescent staff with its glowing violet crystal. Redesign only her head as described below: her pretty face and her hair must go, so that she matches the game's other two heroes, whose faces are hidden (a masked hood; a closed helm) and show only two glowing eyes.

The Arcanist as the Bone-Masked Seer, accent violet with bone-white. Her face is completely hidden: no skin on the head, no hair, no braid, no eyebrows, no lashes, no nose, no mouth. The oversized deep-violet mage's hat stays as in the reference: the wide brim, the soft pointed crown that leans back, the bone-white band and the small bone crescent clasp. Under the brim, where her face was, a full smooth bone-white mask covers the whole face, one simple rounded shape with two carved eye slits that glow violet from inside, like two glowing violet eyes; deep teal-black shadow around the mask's edge under the brim, no hair anywhere. Over her shoulders a short tattered mantle of dark violet cloth with a ragged, cut hem, reaching only to the chest, not a cape. From the hat's bone band, on her LEFT side, hangs a cord of bone beads with three glowing violet rune beads, down beside the mask to her shoulder. Keep the fitted deep-violet battle-coat with its high stiff collar, the bone-white sash and clasp, the short dark leather corset, the coat split at the front from the hips, the leather vambraces with small bone plates, the big dark gloves, dark leggings and big flat knee-high dark leather boots. In her RIGHT hand the tall staff of dark wood topped by the big bone-white crescent that cradles a glowing violet crystal, held upright out to her side and away from the body, the foot of the staff clear of the ground and her legs; her left hand open and empty. No visible hair, no cape, no long robe, no face marks, no floating particles or spell effects, not pink.

Full body, A-pose (arms angled down and away from the body, hands clear of the hips), front three-quarter view, standing straight, both feet flat and fully visible, the whole figure and weapon inside the frame with margin, plain flat mid-grey background, nothing else in the picture.
```
