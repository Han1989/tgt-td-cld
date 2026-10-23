# The Meshy heroes: style sheet (V-06a)

The style sheet for the three heroes designed by Claude and generated in Meshy (**Han, 22 Oct 2026**: the CC0 pack
heroes are generic and the game lost its identity; the heroes are original characters in the Runelight look,
`docs/ART.md`). Every concept prompt starts with the **style paragraph** below, word for word; then the reference
line, the hero's brief and the composition line. The files and the Meshy tasks are in
`tools/blender/assets/meshy/` (one folder per hero; `README.md` there is the index, each hero's README quotes its
prompts exactly).

**Round 2 (Han, 22 Oct 2026, 11:44).** Round 1's heroes came out as realistic humans (a head about a sixth of the
body, skin, cloth and metal texture); the game's heroes are **chibi**. Same three designs, chibi proportions. Round 1
is kept for comparison in `tools/blender/assets/meshy/<hero>-r1/`, and both rounds are on the contact sheet,
`docs/art/meshy-heroes.png`.

## The face rule (V-06e, Han, 23 Oct 2026)

**No hero shows a face.** Each hero's face is hidden, by a hood and a mask in its shadow or by a closed helm, and
shows only **two glowing eyes** in the dark, in the hero's own eye colour (the Ranger's pale green, the Warden's
ember, the Arcanist's violet); nothing round them is pale enough to read as a face at phone size (a mask is bone or
cloth in the hood's shadow, painted dark). Each hero has **one silhouette piece** that reads at 40 px (the Ranger's
leaf peak, the Warden's horned pauldron and kite shield, the Arcanist's peaked hood swept back). Round 2's Arcanist
broke it (a pretty anime face, white hair and a braid under the hat) and read as another art style next to the
other two, so she was redesigned as the Hooded Oracle. The style paragraph's "Face: two small dot eyes, no nose, a
small simple mouth" was written for round 2's faces; a new hero's brief overrides it ("her face is completely hidden:
no skin, no hair, no nose, no mouth"), as every brief here does.

## The style paragraph

> Original chibi fantasy hero for a dark moonlit tower-defense game, a stylised 3D game character like a small
> collectible vinyl toy, not realistic. Chibi (super-deformed) proportions: the whole figure only 2.5 heads tall, the
> head about a third of the whole height and as wide as the shoulders, a big round skull, almost no neck, a short
> small stubby body, short stubby arms that reach only to the hips, short stubby legs, oversized hands and oversized
> feet, and the hero's signature piece oversized. Face: two small dot eyes, no nose, a small simple mouth, smooth skin
> with no texture. Flat cel colours in two tones per material (one lit tone, one shadow tone), no fabric weave, no
> metal grain or scratches, no fine detail, no realism: large clean shapes and a silhouette that reads at 40 pixels
> tall. Palette of a moonlit forest at night: muted materials (leather, dark cloth, iron, wood, bone), shadows leaning
> deep teal-black, moon-silver light from the upper left, one accent colour per hero and small glowing details only
> where something emits light. Even, readable lighting on the figure, no cast shadows across it, no motion blur, no
> text, no logo.

## How a concept is made

`meshy_image_to_image` (`nano-banana-pro`, 3:4), **one image**: the current in-game hero,
`apps/client/public/stage/<hero>-poster.webp`, converted to PNG and cropped to the hero (640 × 600 from x 880, y 250).
It gives the chibi body, the head size and the toy-like finish; the costume comes from the words. The prompt is the
style paragraph, then the **reference line**:

> The reference image is the current in-game hero: copy exactly its chibi proportions (the head as big as the rest of
> the body, the short stubby limbs, the big hands and feet) and its simple smooth toy-like finish. Do not copy its
> costume, its colours, its side-on pose or its forest background: the hero's costume and colours are described below.

then the hero's brief (below, written from round 1's design) and the **composition line**:

> Full body, A-pose (arms angled down and away from the body, hands clear of the hips), front three-quarter view,
> standing straight, both feet flat and fully visible, the whole figure and weapon inside the frame with margin,
> plain flat mid-grey background, nothing else in the picture.

**What didn't work:** round 1's concept as a second image (the design) next to the poster. Meshy kept the second
image's realistic proportions, about six heads tall, and only flattened its shading (the Ranger's first attempt), so
the design goes in the words. A first version of the paragraph without "a small collectible vinyl toy", "as wide as
the shoulders", "almost no neck" and "arms that reach only to the hips" was used for that attempt.

Two concepts a hero; the better one goes to `meshy_image_to_3d` (textured, the latest model, remeshed to 30,000
triangles, **no `pose_mode`**: with `a-pose` Meshy re-posed the Ranger and slung his bow on his back), then `meshy_rig`
(walk and run come with it) and `meshy_animate` (idle, attack, cast, hit, death in one bundle).

**A weapon that rigs badly.** Every Meshy model is one welded mesh, so a weapon is skinned by the auto-rig like a limb.
The Ranger's bow and the Warden's sword and shield hold their shape; the Arcanist's staff bent with her leg and its
crescent followed her head, in both rounds. So she is generated **bare-handed** (her concept edited: "Remove the staff
completely … Both hands empty and open"), and **her staff on its own as a prop**, from her concept, with the **prop
paragraph** in place of the style paragraph:

> Original prop for a chibi fantasy hero in a dark moonlit tower-defense game, a stylised 3D game prop like a small
> collectible vinyl toy, not realistic. Flat cel colours in two tones per material (one lit tone, one shadow tone), no
> wood grain, no scratches, no fine detail: large clean shapes that read at 40 pixels. Palette of a moonlit forest at
> night: muted materials, shadows leaning deep teal-black, moon-silver light from the upper left, small glowing
> details only where something emits light. Even lighting, no cast shadows, no text, no logo.

Session 2 hangs it (or the pack's staff) on her right hand.

## The heroes

Each brief keeps round 1's gear and colours; what is oversized and the two identity marks are what must survive at
phone size (a hero is about 40 px tall in a match).

### The Ranger: moss green and leather

- **Who:** a young forest scout, lean, light on his feet; a moss-green cloth mask over the lower face, so his face is
  two pale-green glinting dot eyes in the hood's shadow.
- **Head (oversized):** a deep moss-green hood, big and round over the big skull, its leaf-shaped peak curling back
  and up behind the head.
- **Torso:** a brown leather jerkin over a dark green tunic, a short leaf-cut mantle over the shoulders only, one
  diagonal chest strap, a quiver of teal-fletched arrows on the back.
- **Arms:** leather bracers, big fingerless gloves.
- **Legs and feet:** dark trousers wrapped with leather bands, big soft flat leather boots.
- **Weapon:** in his LEFT hand a recurve bow of dark wood with pale bone tips and a bone grip, held upright at his side
  away from the body; his right hand open and empty.
- **Identity marks:** the oversized hood with its peak; the mask with the two glinting eyes.
- **Avoid:** a cape or long cloak (round 1's first concept had one: it hides the legs), hair or beard showing, a pile
  of small arrows and straps, the bow held across the body (it fuses with the torso).

### The Warden: iron and ember

- **Who:** an old shield-captain, the broadest of the three: a round barrel chest, thick stubby arms and legs,
  standing wide and immovable; no face shows, only two ember-orange glowing dot eyes in the dark of his visor.
- **Head:** a big rounded dark-iron great-helm with a T-shaped visor slit.
- **Torso:** a dark iron cuirass with a heavy gorget, a dark red-brown surcoat from the belly to mid-thigh, a thick
  leather belt.
- **Arms (oversized):** a huge curled ram-horn pauldron on one shoulder (the prompt asks for the sword arm, as round
  1's concept had it; the kept round-2 concept has it on the shield side, which reads as well), a big round iron
  pauldron on the other; big plate gauntlets.
- **Legs and feet:** short plate legs over dark mail at the knee, big flat iron sabatons.
- **Weapon:** in his RIGHT hand a broad one-handed sword with a short cross-guard, held out to the side and angled
  away from the body; on his LEFT forearm an oversized tall dark-iron kite shield with one glowing ember-orange rune in
  its centre, held out from the body so the torso stays visible.
- **Identity marks:** the horned pauldron; the big kite shield with its ember rune.
- **Avoid:** a cape, a plume, rivets and plate seams everywhere (the painter flattens them), the blade or the shield
  touching the legs, a tall bucket helm (it makes him three heads tall).

### The Arcanist: violet and bone-white

**V-06e (Han, 23 Oct 2026):** she is redesigned by the face rule (above), keeping the rest of round 2 (2.5 heads,
violet and bone-white, the crescent staff, the rune cord). Two concepts, images only (the Hooded Oracle and the
Bone-Masked Seer, `tools/blender/assets/meshy/arcanist-concepts/`, sheet `docs/art/arcanist-redesign.png`); **Han
picked the Hooded Oracle** (10:04), with its bone half-mask dark, and V-06e made her model
(`tools/blender/assets/meshy/arcanist/`). Her brief now:

- **Who:** a battle-mage, a woman, calm and determined; no face shows, only two violet glowing eyes in the dark of
  her hood.
- **Head (oversized):** a deep, big violet hood round the big skull, its long soft peak swept far back behind her head
  (its tip no higher than the hood's round top, so she stands no taller than the others on the first screen: a peak
  rising up would rise over the Warden's helm), one long trailing end hanging from its back behind her right arm;
  under it a half-mask over the lower face, bone in the hood's teal-black shadow, as dark as the hood's inside but
  for a step; the rune cord of bone beads with glowing violet rune beads from the hood's front edge down her chest.
- **Torso, arms, legs, feet:** as round 2 (below).
- **Weapon:** the crescent staff as round 2, a separate prop on her right hand.
- **Identity marks:** the peaked hood swept back; the crescent staff head with its crystal.
- **Avoid:** a pale mask or any skin, hair or a hat, a peak that rises straight up (over the others) or sweeps back to
  her left (the stage and match cameras look from her front right, so it hides behind the hood: V-06e's first model).

Round 2's brief, for the record (`tools/blender/assets/meshy/arcanist-r2/`):

- **Who:** a battle-mage, a woman (Han, 17 Oct 2026), slim, calm and determined; two dark dot eyes and a small mouth.
- **Head (oversized):** a big deep-violet mage's hat with a wide brim and a soft pointed crown that leans back, a
  bone-white band and a small bone crescent clasp (round 2: Han's note names the hat as her signature piece; it takes
  the place of round 1's bone circlet); under it long bone-white hair in one thick braid over her LEFT shoulder and
  down the front of her coat to the waist, with three glowing violet rune beads along it.
- **Torso:** a fitted deep-violet battle-coat with a high stiff collar, a bone-white sash and clasp, a short dark
  leather corset; the coat split at the front from the hips.
- **Arms:** fitted sleeves, leather vambraces with small bone plates, big dark gloves.
- **Legs and feet:** dark leggings, big flat knee-high dark leather boots.
- **Weapon (oversized head):** in her RIGHT hand a tall staff of dark wood topped by a big bone-white crescent that
  cradles a glowing violet crystal, held upright out to her side and away from the body, its foot clear of the ground
  and her legs; her left hand open and empty. The model is bare-handed and the staff a separate prop (above).
- **Identity marks:** the white braid with its violet rune beads; the crescent staff head with its crystal.
- **Avoid:** a cape or a long robe (it hides the legs and the walk), glowing face marks, floating particles or spell
  effects, the pink of the pack's witch, eyes so faint they vanish at 40 px.

## Round 1 (22 Oct 2026, 03:14–03:35 UTC), for the record

Round 1 (PR #127, not merged; its files are in `tools/blender/assets/meshy/<hero>-r1/`) used `meshy_text_to_image`
with no image, and this paragraph, word for word, before each hero's line and the same composition line:

> Original fantasy hero character for a dark moonlit tower-defense game. Stylised hand-painted 3D game character,
> not realistic: slightly chunky heroic proportions (head about one sixth of the body), large clean shapes, chunky
> readable gear, a silhouette that reads at 40 pixels tall. Palette of a moonlit forest at night: muted materials
> (worn leather, dark cloth, iron, wood, bone), shadow colours leaning deep teal-black, moon-silver key light from the
> upper left, a cool silver rim on the upper-left edges, one strong accent colour per hero and small glowing details
> only where something emits light. Even, readable lighting on the figure, no harsh cast shadows across it, no
> motion blur, no text, no logo.

Meshy drew adults with skin, cloth weave and worn metal, which the painter would flatten and which do not read as the
game's heroes at 40 px. Round 2 changes the proportions, the face and the finish, keeps the gear, the colours and
round 1's weapon hands (the sword and the staff in the right hand, the bow in the left: every archery clip draws with
the right hand), and adds the Arcanist's hat. Each hero's line is in `tools/blender/assets/meshy/<hero>-r1/README.md`.
