# The Drummer: two concepts (V-05e concepts)

**Han, 13 Nov 2026:** the Drummer is the game's fourth hero (decided 17 Oct 2026): a support, a war-drummer whose
skills make towers fire faster and whose ultimate is War Drums. Han did not like the concept he made himself in Meshy
in October, so he is designed afresh here, as the other three heroes were, by the style sheet
(`docs/art/meshy-style.md`: chibi, 2.5 heads, a collectible vinyl toy, the moonlit-forest palette) and its face rule
(no face: two glowing eyes, here pale gold, and one silhouette piece). Two designs, two images each; **Han picks one**,
and the session after the pick makes his model, rig and clips.

**Images only.** No image to 3D, rig, clips or Blender. Designed by Claude, generated in Meshy on 13 Nov 2026.
**Generated on a Meshy Premium plan (it ends on 24 Dec 2026), private licence, commercial use permitted.** Sheet for
Han: `docs/art/drummer-concepts.png` (these four beside the Ranger's, the Warden's and the Oracle's concepts, every
figure cut from its background and scaled to the same height, then each at 40 px on the meadow's grass and that
picture at 2×).

| File | Design | |
|---|---|---|
| `rain-a.png` | 1, the Rain-drummer (silhouette piece: the straw hat) | made again once (below) |
| `rain-b.png` | 1, the Rain-drummer | **picked of the pair** |
| `herald-a.png` | 2, the War-herald (silhouette piece: the horsehair crest) | **picked of the pair**; made again once (below) |
| `herald-b.png` | 2, the War-herald | |

All four are 896 × 1200 PNG, as Meshy returned them.

## What both designs keep

Short and broad (apart from the slim Ranger, the tall-hooded Oracle and the armoured Warden); deep lacquer red with
straw gold (a main colour none of the three has); no face, two pale-gold eyes (yellower and paler than the Warden's
ember, nothing like the enemies' ember-orange sockets); one big round war drum on his back, part of the body so the
rig carries it, its rim wider than his shoulders; two short mallets in his belt; nothing in his hands (his clips are a
two-handed overhead slam and a drumming loop, and the pipeline puts the mallets in his hands); A-pose, front
three-quarter view, mid-grey background.

## How they were made

`meshy_image_to_image`, `nano-banana-pro`, aspect 3:4, one image: **`../warden/concept.png`** (as it is), so the
Warden's chibi proportions, his short broad build and the toy finish carry over; the reference line says what not to
copy (his armour, helm, sword, shield, pauldron and colours). Each prompt is the style sheet's paragraph and
composition line word for word, with that reference line and the design's brief between them (quoted below). Two
tasks with the same prompt make the two images of a design, as V-06e's concepts did.

The style paragraph still asks for "two small dot eyes, no nose, a small simple mouth" (written for round 2's faces);
each brief overrides it ("his face is completely hidden"), as every hero's brief since V-06e does.

## Meshy tasks (13 Nov 2026, Premium plan)

| Image | Task id | Credits | |
|---|---|---|---|
| Rain-drummer a, first | `01a1d5b2-8c1d-73c6-b36e-a9161d8848ce` | 9 | rejected: his right hand closes round a mallet's shaft at his hip |
| Rain-drummer b | `01a1d5b2-a330-7121-acbb-15ce7028a706` | 9 | `rain-b.png` |
| War-herald a, first | `01a1d5b2-a32d-733e-9d50-6ea0a9b13bd7` | 9 | rejected: his right hand grips a mallet's shaft |
| War-herald b | `01a1d5b2-a23f-7608-867d-06ce2099e329` | 9 | `herald-b.png` |
| Rain-drummer a, again | `01a1d5b4-5fc5-7399-91f2-feeba8a81b33` | 9 | `rain-a.png` |
| War-herald a, again | `01a1d5b4-6001-75ec-95d2-07774da61c1f` | 9 | `herald-a.png` |
| | | **54** | |

`meshy_check_balance`: **780 credits before, 726 after.** The Meshy MCP server (`@meshy-ai/meshy-mcp-server` 0.6.5)
was driven over stdio from a scratch client, with `MESHY_API_KEY` from the environment (never written to a file).
The two rejected first pictures are not kept. Each retry is the same prompt with one sentence longer: "Both hands empty
and open, nothing in his hands**: the mallets' handles stay behind his hips, well clear of both hands, and his hands
touch nothing**." No picture showed a face, lost the drum or drifted from 2.5 heads.

## The picks

**Rain-drummer b over a.** Both have the wide straw hat over a dark wrap with two pale-gold eyes, the straw cape, the
red jacket, the gold sash and the sandals. In **b** the drum lies across his back with a skin showing at each side, so
its rim stands out past both shoulders (the brief) and it reads as a drum from the front; its straw rope rim and the
rope over his chest read too. In **a** the drum shows only behind his right shoulder, and its mallets cross his sash at
the front. b's mallets hang in the sash at the front too, not behind as asked: the model session moves them.

**War-herald a over b.** Both have the round iron helm with a visor slot and two gold eyes, the red horsehair crest
and the red coat with gold trim. **a** is the sturdier figure, as broad as the Warden, with a quilted coat, the drum
across his back past both shoulders with its ring of iron studs, and bracers and boots that read; **b** stands
narrower and leggier (nearer three heads with the crest), his hands are tinted grey-green, his coat is striped rather
than padded, and his drum shows on one side only.

**Between the two designs** (Han chooses): at 40 px (the sheet's bottom row) the **Rain-drummer's hat** is the clearest
silhouette of all seven figures, a wide gold cone none of the others has, and the drum shows as two pale skins either
side; his risk is that a straw hat, a cloth wrap and sandals read as a wandering monk or a farmer before a drummer,
and his cape, hat and sash give three straw-gold pieces. The **War-herald** reads as one of the keep's own next to the
Warden (helm, eyes in a slot, the same build), and his crest gives him height; at 40 px his red crest runs into his red
coat and the drum, so he reads as one red shape with a grey helm, and the helm with eyes in a slot is the Warden's
recipe.

## What to watch (for the model session)

- **The drum lies across the back.** Both briefs ask for the drum's round face against his back; Meshy drew it lying
  across, its two skins facing left and right (all four pictures). That is what makes the rim reach past both
  shoulders, so it is kept; the model session decides whether the slam strikes a skin at his side or the drum is
  turned flat.
- **Bare hands.** All four show bare hands (the Ranger has fingerless gloves, the Warden gauntlets, the Oracle gloves).
  The face rule speaks of the face only; the bare-handed edit before image to 3D can add gloves (dark cloth for the
  Rain-drummer, dark leather for the Herald) if Han wants no skin at all.
- **The mallets** are tucked in the belt at his front in three of the four pictures, not behind him. Meshy welds them
  into the mesh and skins them like a limb (`../README.md`, "The one rig fault"): the model is best made without them
  (an edit: "remove the mallets") and the mallets made as a separate prop, as the Oracle's staff was, for the pipeline
  to put in his hands.
- **The Rain-drummer's cape** is straw fringes over the shoulders: the painter flattens them to two tones, and the auto
  rig will skin them to the arms, which is right for a short cape. **The Herald's crest** is a tall thin fan; skinned to
  `Head` whole (`gltf.rebind`), it nods with the head.

## The prompts

Rain-drummer a and b (the only image: `../warden/concept.png`; the retry of a adds the clause above):

```text
Original chibi fantasy hero for a dark moonlit tower-defense game, a stylised 3D game character like a small collectible vinyl toy, not realistic. Chibi (super-deformed) proportions: the whole figure only 2.5 heads tall, the head about a third of the whole height and as wide as the shoulders, a big round skull, almost no neck, a short small stubby body, short stubby arms that reach only to the hips, short stubby legs, oversized hands and oversized feet, and the hero's signature piece oversized. Face: two small dot eyes, no nose, a small simple mouth, smooth skin with no texture. Flat cel colours in two tones per material (one lit tone, one shadow tone), no fabric weave, no metal grain or scratches, no fine detail, no realism: large clean shapes and a silhouette that reads at 40 pixels tall. Palette of a moonlit forest at night: muted materials (leather, dark cloth, iron, wood, bone), shadows leaning deep teal-black, moon-silver light from the upper left, one accent colour per hero and small glowing details only where something emits light. Even, readable lighting on the figure, no cast shadows across it, no motion blur, no text, no logo.

The reference image is the Warden, another hero of the same game: copy exactly his chibi proportions (the head about a third of the whole height, the short stubby limbs, the big hands and big feet), his short, broad, sturdy build and his simple smooth toy-like finish with clean outlines and flat two-tone colours. Do not copy his armour, his helm, his sword, his shield, his horned pauldron or his colours: this hero's costume and colours are described below.

The Drummer as the Rain-drummer, a war-drummer and the team's support, accent deep lacquer red with straw gold. Short and broad: a sturdy, round little body, wider than a slim archer, no taller than the reference. His face is completely hidden: no skin on the head, no hair, no eyebrows, no nose, no mouth, no mask. An oversized wide conical straw hat, a shallow straw-gold cone much wider than his shoulders, pulled low so its brim hides the whole face; under the brim a dark charcoal cloth wrap covers the head and the face, and in its deep teal-black shadow only two small glowing pale-gold dot eyes (a pale yellow-gold light, not orange, not red). A short straw rain-cape over the shoulders and upper arms, layered straw fringes, reaching only to the chest. Under it a deep lacquer-red padded jacket crossed at the front, a wide straw-gold sash at the waist, dark loose short trousers, both forearms wrapped in dark cloth bands, big flat straw sandals over dark foot wraps. On his back, strapped flat against it, one big round war drum: a short, wide barrel of deep red lacquer, its skin pale parchment, a thick twisted straw-gold rope round its rim, its round face parallel to his back, so big that its rim stands out wider than his shoulders on both sides and shows above his shoulders behind the hat; one straw rope strap across his chest holds it. Two short, thick wooden drum mallets with round straw-gold heads tucked crosswise in his sash at the back, behind him. Both hands empty and open, nothing in his hands. No weapon, no sword, no spear, no staff, no shield, no cape, no long robe, no visible face, no bone mask, no floating particles or spell effects.

Full body, A-pose (arms angled down and away from the body, hands clear of the hips), front three-quarter view, standing straight, both feet flat and fully visible, the whole figure and weapon inside the frame with margin, plain flat mid-grey background, nothing else in the picture.
```

War-herald a and b (the same image; the retry of a adds the clause above):

```text
Original chibi fantasy hero for a dark moonlit tower-defense game, a stylised 3D game character like a small collectible vinyl toy, not realistic. Chibi (super-deformed) proportions: the whole figure only 2.5 heads tall, the head about a third of the whole height and as wide as the shoulders, a big round skull, almost no neck, a short small stubby body, short stubby arms that reach only to the hips, short stubby legs, oversized hands and oversized feet, and the hero's signature piece oversized. Face: two small dot eyes, no nose, a small simple mouth, smooth skin with no texture. Flat cel colours in two tones per material (one lit tone, one shadow tone), no fabric weave, no metal grain or scratches, no fine detail, no realism: large clean shapes and a silhouette that reads at 40 pixels tall. Palette of a moonlit forest at night: muted materials (leather, dark cloth, iron, wood, bone), shadows leaning deep teal-black, moon-silver light from the upper left, one accent colour per hero and small glowing details only where something emits light. Even, readable lighting on the figure, no cast shadows across it, no motion blur, no text, no logo.

The reference image is the Warden, another hero of the same game: copy exactly his chibi proportions (the head about a third of the whole height, the short stubby limbs, the big hands and big feet), his short, broad, sturdy build and his simple smooth toy-like finish with clean outlines and flat two-tone colours. Do not copy his armour, his helm, his sword, his shield, his horned pauldron or his colours: this hero's costume and colours are described below.

The Drummer as the War-herald, a war-drummer of the same keep as the iron knight in the reference and the team's support, accent deep lacquer red with straw gold. Short and broad: a sturdy, round little body, no taller than the reference. His face is completely hidden: no skin, no hair, no nose, no mouth. A closed, round, smooth dark-iron helm over the whole head, one narrow horizontal visor slot across its front, and in the slot's dark only two small glowing pale-gold dot eyes (a pale yellow-gold light, not orange, not red). On top of the helm a tall crest of red horsehair, a big upright brush running from the front of the helm to the back, deep lacquer red, the tallest thing on him. A padded, quilted deep lacquer-red coat to mid-thigh with straw-gold trim on its collar, front edges and hem, a thick dark leather belt, broad dark leather bracers on the forearms, big dark leather boots. On his back, strapped flat against it, one big round war drum: a short, wide barrel of deep red lacquer, its skin pale parchment, a ring of round dark-iron studs round its rim, its round face parallel to his back, so big that its rim stands out wider than his shoulders on both sides and shows above his shoulders behind the helm; two leather straps across his chest hold it. Two short, thick wooden drum mallets with round straw-gold heads tucked crosswise in his belt at the back, behind him. Both hands empty and open, nothing in his hands. No weapon, no sword, no shield, no spear, no horned pauldron, no plate armour on the body, no cape, no long robe, no floating particles or spell effects.

Full body, A-pose (arms angled down and away from the body, hands clear of the hips), front three-quarter view, standing straight, both feet flat and fully visible, the whole figure and weapon inside the frame with margin, plain flat mid-grey background, nothing else in the picture.
```
