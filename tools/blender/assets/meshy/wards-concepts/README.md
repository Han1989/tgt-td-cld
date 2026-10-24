# The Spire's wards: seven kinds, two themes (V-06l concepts)

**Han, 24 Oct 2026:** the towers, the Heart and the portals are the last things in the game still from the CC0 KayKit
packs (V-05d); the heroes (V-06a–f) and every enemy (V-06h–j) are the game's own. The defenders' buildings come next,
designed **as one faction before any model is made**, in **two themes**, and Han picks one theme. The faction is
written down in `docs/art/wards-style.md`: **the Spire's wards**, moon-stone, dark timber and dark iron, lit by **teal
runelight** at the tiers and **violet** at the branches, gold only at tier 3; **nothing on a ward glows orange**
(ember is the host's). Theme A is medieval (a moon-stone keep's family), theme B East Asian (tiered eaves, lacquered
timber, paper lanterns, bronze bells; it matches the sound).

**Images only.** No image to 3D, no rig, no Blender: Han picks a theme first. The models follow in two batches (the five
towers with their turrets; then the ten branch turrets, the Heart and the portals), each through
`tools/blender/structures.py` as the enemies went through `creeps.py`. Designed by Claude, generated in Meshy on
24 Oct 2026. **Generated on a Meshy Pro plan, private licence, commercial use permitted.** Every design is original: no
real building, temple, castle or game copied. The sheet for Han is `docs/art/wards-redesign.png`: a row a kind (the
KayKit ward the game draws now, from its structures sheet on the map plate; theme A; theme B; for each tower a crop of
its roof, as its 3 × 3 pad shows it from above), then a strip a theme, `docs/art/wards-strip-a.png` and
`docs/art/wards-strip-b.png`: the theme's five towers, the Heart and a portal at a 412 × 839 phone's size (3× screen
pixels) beside the three heroes and a Grunt.

| Files | Kind | Aspect, size |
|---|---|---|
| `arrow-a.png`, `arrow-b.png` | Arrow | 1:1, 1024 × 1024 |
| `cannon-a.png`, `cannon-b.png` | Cannon | 1:1, 1024 × 1024 |
| `frost-a.png`, `frost-b.png` | Frost | 1:1, 1024 × 1024 |
| `arcane-a.png`, `arcane-b.png` | Arcane | 1:1, 1024 × 1024 |
| `flak-a.png`, `flak-b.png` | Flak | 1:1, 1024 × 1024 |
| `heart-a.png`, `heart-b.png` | The Heart | 3:4, 896 × 1200 |
| `portal-a.png`, `portal-b.png` | A portal | 4:3, 1200 × 896 |

`-a` is theme A (medieval), `-b` theme B (East Asian). All fourteen are PNG, as Meshy returned them. The brief asked for
the towers at 1200 × 1200; `meshy_text_to_image` takes an aspect ratio and no size, and returns 1:1 at 1024 × 1024.

**Han's pick, 24 Oct 2026, 18:51: theme A.** The five towers are made from the `-a` concepts in V-06l batch 1
(`../wards/<kind>/`, a README a kind); the Heart and the portal follow in batch 2.

## How they were made

`meshy_text_to_image`, `nano-banana-pro`, one image a task, no reference image, 14 tasks: each theme × (arrow, cannon,
frost, arcane, flak, heart, portal). Each prompt is four paragraphs, separated by a blank line: the **style paragraph**
from `docs/art/wards-style.md`, word for word; the **theme paragraph** from the same sheet, word for word; the kind's
**brief** (below); and the **composition line**, word for word. The aspect is 1:1 for the towers, 3:4 for the Heart and
4:3 for the portals. Every concept shows a tower's **tier-1 body with its turret, unlit, with no runes**: the tier
language (two runes, four runes and gold, a branch's outline and violet glow), the Heart's damage stages and the
portal's swirl are the kit's, added in `structures.py` after the model.

Meshy's queue holds ten tasks at a time on this plan: the first ten went in together, the last four after they
finished. None was refused. The Meshy MCP server (`@meshy-ai/meshy-mcp-server` 0.6.5) was driven over stdio from a
scratch client, with `MESHY_API_KEY` from the environment (never written to a file).

## Meshy tasks (24 Oct 2026, Pro plan)

| Image | Task id | Aspect | Credits |
|---|---|---|---|
| Arrow · a | `01a16d69-11a7-70bb-a86b-4c132997a49e` | 1:1 | 9 |
| Cannon · a | `01a16d69-279d-7257-943c-652c473cfa78` | 1:1 | 9 |
| Frost · a | `01a16d69-28df-7380-b5ba-459596478ac5` | 1:1 | 9 |
| Arcane · a | `01a16d69-2a29-734f-bd6b-0024be4f348c` | 1:1 | 9 |
| Flak · a | `01a16d69-2b84-75be-bb30-c5c765811e46` | 1:1 | 9 |
| The Heart · a | `01a16d69-2ccf-773b-a256-4a8c6cf745a8` | 3:4 | 9 |
| A portal · a | `01a16d69-2e24-7484-803f-1c5f31fc5223` | 4:3 | 9 |
| Arrow · b | `01a16d69-2f6f-73f6-b87f-09dc4c226797` | 1:1 | 9 |
| Cannon · b | `01a16d69-30a9-7051-9206-3b26c77a2a2f` | 1:1 | 9 |
| Frost · b | `01a16d69-31e8-71b8-ae53-23d73404cd52` | 1:1 | 9 |
| Arcane · b | `01a16d69-d819-749e-8de5-7ab8a74d552d` | 1:1 | 9 |
| Flak · b | `01a16d69-d973-734b-8ca1-36491f6beb16` | 1:1 | 9 |
| The Heart · b | `01a16d69-dab0-75f1-aa7a-e9f42068ae9f` | 3:4 | 9 |
| A portal · b | `01a16d69-dbf8-76b9-a5d1-576817c630de` | 4:3 | 9 |
| | | | **126** |

`meshy_check_balance`: **1,655 credits before** (1,635 monthly, 20 permanent), **1,529 after** (1,509 monthly, 20
permanent): the 126 the tasks report, and above the 1,300 floor kept for the models.

## What came out

Judged on the full image, on the roof crop and at phone size (the strips), against each kind's silhouette rule. No pick
here: Han picks a theme, not a concept a kind.

| Kind | Theme A, medieval | Theme B, East Asian |
|---|---|---|
| Arrow | A narrow round tower, twice as tall as wide, a timber gallery, a ballista on the flat top that overhangs the parapet: tall and thin, and from above a crossbow across a small disc. | A narrow square timber tower on a pale plinth, two stacked eaves with lanterns, a repeating crossbow with its tall magazine on the top floor. Its bow is shorter than the top is wide (the brief asked for longer). |
| Cannon | A low octagonal bastion, its stone a step toward teal, a timber stone-thrower with a pale boulder on the roof. The stone-thrower is small on its roof. | A low square plinth skirted by one deep eave with upturned corners, cloud and wave reliefs, a block of bronze tubes on a cart-frame. The battery is small on its roof, the plinth pale. |
| Frost | The palest tower, a frosted parapet, a six-sided ice column with the lance on a pivot across it. Reads as a well at a glance. | A wide pale plinth, a carved ice-stone column with a cloud, a bronze bell on its side in a timber yoke, its mouth out: the clearest turret of the fourteen. |
| Arcane | A round tower under a big slate dome like a mushroom cap, a staff on the dome with two prongs holding a pale crystal. | A paper-walled pavilion under a domed tile roof, an arm on the dome with a lantern-cage hanging from its end, the crystal inside it: the crystal hangs, not level. |
| Flak | A low crenellated square, a dark iron housing with a six-sailed rotor tilted at the sky. | A pale square terrace with capped corner posts, a wheel of six paper kites tilted at the sky round a bronze hub with a teal lens. Pale at phone size. |
| The Heart | A round keep with four capped corner turrets and a big gate, the Spire rising from its middle with teal slit windows and the rose-red crystal on its tip. | A four-tiered tower over a pale terrace with steps, upturned eaves with bells at the corners, the paper walls lit teal from within, the rose-red crystal on a bronze finial. |
| A portal | Two squat round towers with slate caps round a tall arch, a timber hoarding over it, the portcullis raised, two teal rune-stones on posts. Its background came out mid-grey. | Two square timber posts on tall wave-carved plinths, a tiled roof on the upper lintel, cloud fretwork between the lintels, bells and two teal lanterns. Close to a shrine gate (below). |

**At phone size** (the strips) theme A reads as one family of pale stone towers, each a tower; theme B's silhouettes
differ more from kind to kind (the bell on its column, the lantern on its arm, the gate) and match the sound. Both
keep the heroes and the Grunt the brightest figures: the wards are paler, larger and unlit.

## What to watch (for the model sessions)

- **Portal B is close to a shrine gate.** The brief asked for a gate of its own: two straight level lintels, a tiled roof
  on the upper one, cloud fretwork between them. Meshy ran the lower lintel through the posts and out past them, and
  swept the roof up at its ends, so the silhouette recalls one. If Han picks B, the model ends the lower lintel at the
  posts' inner faces and keeps the roof's ridge straight with only its corners turned up.
- **The turrets are small on their roofs** (both Cannons, Arrow B's crossbow): from above a turret should fill most of
  its roof. The kit scales a turret anyway (`structures.py`), and the image to 3D can take it as a separate piece.
- **The turret is a separate piece.** `Tower3DRig` turns the turret and steps its recoil; the base never turns. So each
  tower's model splits at its turntable (or the turret is generated alone, as the Arcanist's staff was): Meshy welds
  everything into one mesh.
- **Pale plinths.** Theme B's Cannon, Frost and Flak stand on white moon-stone and read pale at phone size; theme A's
  walls are pale too. The painter's tones (`stone`, `stoneDark`) bring them toward the pads' cool grey.
- **Lights.** The concepts' only lights are the Heart's teal windows and rose-red crystal, the portals' teal lamps and
  Flak B's small teal lens. Today's Cannon braziers, Flak caps and portal torches glow orange; under the rule they
  become teal in either theme (`docs/art/wards-style.md`, "What to watch").
- **Symbols.** Portal A's rune-stones carry rune-like marks; the style paragraph says no symbols. The model paints them
  plain (the glow is the kit's).

## The prompts

Every prompt is these four paragraphs, separated by a blank line: the style paragraph, the theme paragraph, the kind's
brief, the composition line.

The style paragraph (from `docs/art/wards-style.md`):

```text
Original chibi fantasy building for a dark moonlit tower-defense game, a stylised 3D game model like a small collectible toy or a tabletop miniature, not realistic. One of the Spire's wards, a building the heroes raise to hold their Heart: its body is pale moon-stone, dark timber and dark iron. Chibi (super-deformed) proportions: squat and chunky, walls that bulge a little, an oversized roof or cap bigger than the walls under it, a small door, thick walls, large clean shapes, toy-like. Flat cel colours in two tones per material (one lit tone, one shadow tone), no stone texture, no brick pattern, no wood grain, no metal scratches, no moss, no fine detail, no realism: a shape that reads at 40 pixels wide seen from straight above. Palette of a moonlit forest at night: pale cool moon-stone (light grey with a hint of lilac), near-black brown timber, dark blue-grey iron and roofs, shadows leaning deep teal-black, moon-silver light from the upper left. Unlit: no glow anywhere unless the brief below names a light, and then only small soft teal runelight; nothing glows orange, no fire, no flames, no torches, no candles, no warm light, no gold. No writing, no letters, no crests, no flags, no banners, no symbols. Even, readable lighting on the building, no cast shadows across it, no motion blur, no text, no logo.
```

The theme paragraph, theme A (from `docs/art/wards-style.md`):

```text
Theme: a medieval moon-stone keep's family, our own design, no real castle copied. Round and square towers of pale dressed moon-stone in big simple blocks, steep slate roofs and conical caps in dark blue-grey slate, dark timber galleries, hoardings and shutters, dark iron bands, hinges and studs, narrow arrow slits, chunky crenellations. Every building squat and toy-like: walls that bulge a little, roofs that overhang.
```

The theme paragraph, theme B (from `docs/art/wards-style.md`):

```text
Theme: an East Asian fortress family, our own design, no real temple, pagoda, shrine or castle copied. Dark lacquered timber, near-black brown, standing on heavy pale moon-stone plinths; tiered eaves with deep overhangs and upturned corners, roofs of dark blue-grey tiles in clean simple rows; round lanterns of cool pale paper in dark timber frames; small dark bronze bells; carved cloud and wave motifs in low relief on the beams and plinths. No red or vermilion paint, no gold leaf, no writing or characters on lanterns or boards, no dragons, no crests. Every building squat and toy-like: eaves bigger than the walls under them.
```

The composition line:

```text
Three-quarter view from above, the camera high and looking down at about 55 degrees, so the roof and whatever stands on top of the building read clearly; the whole building and everything on it inside the frame with margin, standing alone on a plain flat dark ground: no background, no landscape, no trees, no other buildings, no people, no creatures, no text.
```

The briefs:

**Arrow, theme A, medieval** (`arrow-a.png`, 1:1):

```text
The Arrow ward, the fastest shooter: tall and thin, the slimmest of the family. A narrow round tower of pale moon-stone, about twice as tall as it is wide, a dark timber gallery round its top under a short overhanging rim, two narrow arrow slits and dark iron bands, a small dark timber door at its foot; its top is flat, a round timber floor inside a low crenellated parapet, with no roof. On that floor, on a dark iron turntable, a big mounted crossbow of dark timber and dark iron like a small ballista, longer than the tower is wide, with wide bow arms, a taut pale string and one heavy bolt loaded, pointing out over the parapet toward the right of the picture. From above it reads as a long thin crossbow across a small round tower.
```

**Cannon, theme A, medieval** (`cannon-a.png`, 1:1):

```text
The Cannon ward, the heavy hitter: squat and wide, the lowest and broadest of the family. A low, wide, eight-sided bastion of pale moon-stone, much wider than it is tall, thick sloping walls with dark iron bands, a small dark timber door, a wide flat stone roof inside chunky crenellations. On that roof, on a dark timber turntable, a stone-thrower: a short heavy timber frame and a thick throwing arm of dark timber bound with dark iron, a sling-cup at its end holding one round boulder of pale stone, the arm laid back and aimed toward the right of the picture, ready to throw. From above it reads as a broad stone octagon with a heavy arm and a round stone on it.
```

**Frost, theme A, medieval** (`frost-a.png`, 1:1):

```text
The Frost ward, the one that slows: pale, with a column. A round tower of the palest moon-stone, of middle height, a band of white frost along its parapet, a small dark timber door; its top is flat, and from its middle rises one thick six-sided column of clear pale ice-blue crystal, half as tall as the tower, unlit; across the top of the column, on a dark iron pivot, a long ice lance of pale crystal with a dark iron haft, pointing toward the right of the picture. From above it reads as a pale disc with an ice column at its centre and a long lance across it.
```

**Arcane, theme A, medieval** (`arcane-a.png`, 1:1):

```text
The Arcane ward, the spell-caster: a crystal and a dome. A round tower of pale moon-stone, of middle height, a small dark timber door and a few small round windows, under a big round dome of dark blue-grey slate, wider than the tower under it like a mushroom cap; on the top of the dome a short dark iron post with a turning mount holding a dark timber staff laid level, its head two curved dark iron prongs cradling one big faceted crystal, clear and pale, unlit, pointing toward the right of the picture. From above it reads as a round dome with a crystal on a staff across it.
```

**Flak, theme A, medieval** (`flak-a.png`, 1:1):

```text
The Flak ward, the anti-air: a rotor on top. A low square emplacement of pale moon-stone walls, waist-high, chunky crenellations, dark iron corner posts and a dark timber floor inside; at its centre, on a dark iron turntable, a skyward rotor: a stout dark iron housing tilted up at the sky, carrying a big wheel of six broad blades, dark timber frames with pale canvas sails like a windmill's, the wheel aimed up at the sky toward the right of the picture, its hub capped with dark iron. From above it reads as a square with a big six-bladed fan on top.
```

**The Heart, theme A, medieval** (`heart-a.png`, 3:4):

```text
The Heart, what the wards hold: a keep with the Spire rising from it. A squat round keep of pale moon-stone, wide and heavy, ringed by four small round corner turrets with conical slate caps, chunky crenellations, a big dark timber gate with iron bands facing the viewer; from the middle of the keep rises the Spire, a tall slender round tower of pale moon-stone with a steep conical slate roof, about twice the keep's height, its narrow slit windows glowing soft teal, and on the tip of its roof one big faceted crystal glowing deep rose-red, not orange. The tallest building of the family, but still chunky and toy-like.
```

**A portal, theme A, medieval** (`portal-a.png`, 4:3):

```text
A portal, the gate the host comes through: a gatehouse arch. A wide gatehouse of pale moon-stone: two squat round towers with conical slate caps standing either side of one tall round arch, a dark timber hoarding along the wall over the arch, dark iron bands, the teeth of a raised dark iron portcullis showing at the top of the arch; the arch faces the viewer and its opening is empty, flat and dark, nothing inside it; before each tower a short moon-stone post topped by a small rune-stone glowing soft teal. Wider than it is tall.
```

**Arrow, theme B, East Asian** (`arrow-b.png`, 1:1):

```text
The Arrow ward, the fastest shooter: tall and thin, the slimmest of the family. A narrow square tower of dark lacquered timber on a pale moon-stone plinth, about twice as tall as it is wide, two small stacked eaves of dark tiles with upturned corners round its sides, a small dark door, two cool pale paper lanterns hanging under the lower eave, unlit; its top is flat, an open timber floor with a low railing, with no roof. On that floor, on a dark bronze turntable, a repeating crossbow of dark timber with a tall box magazine of bolts on top and a lever behind it, longer than the tower is wide, pointing out toward the right of the picture. From above it reads as a long thin crossbow across a small square top.
```

**Cannon, theme B, East Asian** (`cannon-b.png`, 1:1):

```text
The Cannon ward, the heavy hitter: squat and wide, the lowest and broadest of the family. A low, wide platform of pale moon-stone blocks, much wider than it is tall, its sides carved with a simple wave motif in low relief, a single deep eave of dark tiles with upturned corners running round its top edge like a skirt, a small dark timber door; its top is flat and open. On it, on a dark timber turntable, a fire-tube battery: a squat dark timber cart-frame holding a block of many short thick dark bronze tubes bundled side by side, tipped up a little and pointing toward the right of the picture, their mouths dark and empty, no fire and no smoke. From above it reads as a broad square with a heavy block of round tube mouths on it.
```

**Frost, theme B, East Asian** (`frost-b.png`, 1:1):

```text
The Frost ward, the one that slows: pale, with a column. A round plinth of the palest moon-stone, wide and low, with a band of white frost along its rim and a small dark door; from its middle rises one thick round column of pale ice-blue stone carved with a cloud motif, frosted white at the top; on top of the column, in a dark timber yoke that can turn, a big dark bronze bell hung on its side, its wide mouth facing toward the right of the picture like a horn, its lip rimed with white frost, a short timber striker beside it. No roof over the bell. From above it reads as a pale disc with a column at its centre and a bell mouth pointing out.
```

**Arcane, theme B, East Asian** (`arcane-b.png`, 1:1):

```text
The Arcane ward, the spell-caster: a crystal and a dome. A lantern shrine: a round pavilion of dark lacquered timber posts and cool pale paper walls on a pale moon-stone plinth, under a big round dome-shaped roof of dark tiles with a small upturned rim, wider than the walls under it; on the top of the dome a short dark bronze post with a turning mount holding a dark timber arm laid level, ending in a dark bronze lantern-cage that holds one big faceted crystal, clear and pale, unlit, pointing toward the right of the picture. From above it reads as a round dome with a crystal on an arm across it.
```

**Flak, theme B, East Asian** (`flak-b.png`, 1:1):

```text
The Flak ward, the anti-air: a fan on top. A low square terrace of pale moon-stone with a low dark timber railing and four short corner posts, each under a small tiled cap with upturned corners; at its centre, on a dark bronze turntable, a skyward kite-wheel: six big diamond-shaped kites of cool pale paper on dark timber frames, set round a dark bronze hub like the blades of a fan, the whole wheel tilted up at the sky toward the right of the picture. From above it reads as a square with a big six-bladed fan on top.
```

**The Heart, theme B, East Asian** (`heart-b.png`, 3:4):

```text
The Heart, what the wards hold: the Spire as a tall tiered tower. A wide terrace of pale moon-stone blocks with broad steps facing the viewer, its edges carved with a cloud motif; on it a tall tower of dark lacquered timber and cool pale paper walls in four stacked tiers, each tier a little smaller than the one below, each under a big eave of dark tiles with strongly upturned corners and a small dark bronze bell at each corner; the paper walls glow soft teal from within; on the top a tall dark bronze spire holding one big faceted crystal glowing deep rose-red, not orange. The tallest building of the family, but chunky and toy-like: wide eaves, short tiers.
```

**A portal, theme B, East Asian** (`portal-b.png`, 4:3):

```text
A portal, the gate the host comes through: a free-standing gate of its own shape, no walls. Two thick square posts of dark lacquered timber standing on tall pale moon-stone plinths carved with a wave motif; across the posts two straight level lintels of dark timber, the upper one carrying a long narrow roof of dark tiles with upturned corners along its whole length, the space between the two lintels filled with carved cloud fretwork; a small dark bronze bell hangs at each end of the lower lintel, and a cool pale paper lantern on each post glows soft teal. The opening between the posts faces the viewer and is empty and dark, nothing inside it. Wider than it is tall.
```
