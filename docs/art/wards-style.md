# The Spire's wards: style sheet (V-06l)

**Han, 24 Oct 2026.** The heroes (V-06a–f, `meshy-style.md`) and every enemy (V-06h–j, `enemy-style.md`) are the game's
own designs now. The towers, the Heart and the portals are the last things still kitbashed from the CC0 KayKit packs
(V-05d, `docs/ART.md` §15). They come next, designed **as one faction before any model is made**, in **two themes**, and
Han picks one theme. The concepts, their Meshy tasks and the exact prompts are in
`tools/blender/assets/meshy/wards-concepts/`; the sheet for Han is `wards-redesign.png`, with each theme at phone
size beside the heroes and a Grunt in `wards-strip-a.png` and `wards-strip-b.png`. The models follow in two
batches (the five towers with their turrets; then the ten branch turrets, the Heart and the portals), each through
`tools/blender/structures.py` as the enemies went through `creeps.py`. Every design is original: no real building,
temple, castle or game copied, no writing, no crests and no real symbols.

**Han's pick, 24 Oct 2026, 18:51: theme A** (he liked theme B but chose A for the broad audience). Batch 1, the five towers, is in
the game (V-06l, `docs/ART.md` §15 "The Spire's wards (V-06l), batch 1", `tools/blender/assets/meshy/wards/`), and batch 2, the ten
branch turrets, the Heart and the portals (§15 "The Spire's wards (V-06l), batch 2").

## Who they are

**The Spire's wards:** what the heroes build to hold the Heart. Moon-stone, dark timber and dark iron, raised on the
build pads and lit by **teal runelight** as they grow. The Heart is the Spire itself; a portal is the gate the wards
raised over a rift, and the host comes through the violet light inside it. They are sturdy and toy-like, as the heroes
and the host are: squat, big roofs or caps, small doors, thick walls.

## The rule that ties them to the heroes

**Cool runelight is ours, ember is theirs: nothing on a ward glows orange.** The heroes glow teal and violet (the
Ranger's pale green, the Arcanist's violet); the host glows ember from its sockets and its core. A ward glows **teal**
(`RL.rune`, toward the Ranger's `heroEye`) at its tiers and **violet** (`RL.arcane`, `RL.violet`) at its branch, and
nothing else: no fire, no torches, no candles, no warm light. Two things on our side are not teal or violet and are
named here so they stay the only ones: **gold**, only at tier 3, and **the Heart's crystal, rose-red** (`RL.heart`), as
the Heart has always been (the HUD's heart, the 2D gem, V-05d's chest). Fire on a ward is the host's doing: the ruined
Heart's blaze is ember because it is damage, not the ward's own light.

## Palette

| | Token (`render/art/tokens.ts`) | Where |
|---|---|---|
| Moon-stone | `stone` (lit), `stoneDark` (shadow) | walls, plinths, terraces: pale cool grey with a hint of lilac |
| Dark timber | `woodDark` toward `ink` | galleries, shutters, floors, posts, beams, frames, lacquered timber |
| Dark iron | `iron`, `ironDark` | bands, hinges, studs, turntables, mounts |
| Roofs | `steelDark` toward `iron` | slate (theme A) and roof tiles (theme B): dark blue-grey |
| Ice | `ice`, `iceDark`, `snow` | the Frost ward's column, lance and rime |
| Dark bronze (theme B) | between `woodDark` and `iron` | bells, turntables, lantern cages: near brown, never shiny (a new token in the model session if needed) |
| Paper (theme B) | `snow` toward `moon` | lanterns and paper walls: a cool pale, not the host's warm `bone` |
| Teal runelight | `rune`, `heroEye` | the tiers' runes (tier 2 two, tier 3 four); the Spire's windows |
| Violet | `arcane`, `violet` | a branch's glow; the portal's swirl (the kit's) |
| Gold | `gold` | tier 3 only |
| Rose-red | `heart` | the Heart's crystal only |

**Not used:** `ember`, `flare`, `eye` and any warm light (the host's); `bone` (the host is bone); red or vermilion
paint; moss green (the Ranger) and the Warden's red-brown as paint. Two tones a material, shadows toward teal-black,
moonlight from the upper left, the same painter as the heroes and the host.

## Chibi, read from above

A ward is a toy fort: squat and chunky, walls that bulge a little, a roof or cap bigger than the walls under it, a door
smaller than a hero, large clean shapes and no fine detail. The game sees a tower **straight down** on its pad (3 × 3
tiles, about 48 px on a 412 px phone), and the Heart and the portals **from the south, 55° up** (`docs/ART.md` §5). So a
tower's roof and turret carry its whole identity: the turret is the piece that points, and the roof under it is the
shape that tells one kind from another.

## The tier language is the kit's

`docs/ART.md` §6 and §15: **tier 1 no glow, tier 2 two runes, tier 3 four runes and gold, a branch its own outline and
violet glow**, all added by the kit (`structures.py`) after the model. In theme A the tier's runes are **braziers of teal
runelight** on the rim; in theme B they are **paper lanterns lit teal**, and tier 3's gold is the ridge ornaments and
the bands. **A concept shows the tier-1 body with its turret, unlit, with no runes.** The Heart's three damage stages
(whole, cracked under 60%, ruined and burning under 30%) and the portal's swirl, glow and wave-start flare inside its
opening are the kit's too: a concept shows the whole Heart and the empty gate.

## Every tower keeps a base and a turret

`Tower3DRig` turns the turret towards its target and steps it through three recoil frames on a shot; the base never
turns. So every tower, in both themes, is a base and one piece on a turntable that points (+x at rest) and kicks.

| Kind | Theme A: the turret, and what moves | Theme B: the turret, and what moves |
|---|---|---|
| Arrow | a mounted crossbow, a small ballista; kicked back, the string snapping forward | a repeating crossbow with a box magazine; kicked back, the lever rocking |
| Cannon | a stone-thrower, its arm holding a boulder in a sling-cup; the arm thrown up | a fire-tube battery, a block of bronze tubes on a cart-frame; the block kicks back and tips up |
| Frost | an ice lance on a pivot at the top of the ice column; driven back | a frost bell hung on its side in a yoke on the column, its mouth out; the bell rocks back as the striker hits |
| Arcane | a level staff holding a crystal, on the dome; kicked back | a level arm holding a crystal in a lantern-cage, on the dome; the cage swings back |
| Flak | a skyward rotor of six sails, tilted at the sky; kicks back, the sails turn | a skyward kite-wheel of six paper kites, tilted at the sky; kicks back, the wheel turns a step |

## One silhouette rule per kind (each must read from straight above at 40 px)

| Kind | Range role | The silhouette from above |
|---|---|---|
| Arrow | fast single shots | **tall and thin**: the smallest footprint, a long thin bow across it |
| Cannon | splash on the ground | **squat and wide**: the biggest, lowest footprint, a heavy arm or tube block on it |
| Frost | slows | **pale with a column**: the palest disc, a column at its centre |
| Arcane | magic damage | **a crystal and a dome**: a round dome, a crystal held out from it |
| Flak | anti-air | **a rotor or fan on top**: blades radiating from a hub |
| The Heart | what the team holds | the tallest building, the only rose-red light |
| A portal | where the host enters | wider than tall, an empty opening facing south down its lane |

## The style paragraph

Every ward concept prompt starts with this paragraph, word for word. The theme paragraph comes next (below, word for
word), then the kind's brief (quoted in the concepts' README), then the composition line.

> Original chibi fantasy building for a dark moonlit tower-defense game, a stylised 3D game model like a small
> collectible toy or a tabletop miniature, not realistic. One of the Spire's wards, a building the heroes raise to hold
> their Heart: its body is pale moon-stone, dark timber and dark iron. Chibi (super-deformed) proportions: squat and
> chunky, walls that bulge a little, an oversized roof or cap bigger than the walls under it, a small door, thick
> walls, large clean shapes, toy-like. Flat cel colours in two tones per material (one lit tone, one shadow tone), no
> stone texture, no brick pattern, no wood grain, no metal scratches, no moss, no fine detail, no realism: a shape that
> reads at 40 pixels wide seen from straight above. Palette of a moonlit forest at night: pale cool moon-stone (light
> grey with a hint of lilac), near-black brown timber, dark blue-grey iron and roofs, shadows leaning deep teal-black,
> moon-silver light from the upper left. Unlit: no glow anywhere unless the brief below names a light, and then only
> small soft teal runelight; nothing glows orange, no fire, no flames, no torches, no candles, no warm light, no gold.
> No writing, no letters, no crests, no flags, no banners, no symbols. Even, readable lighting on the building, no cast
> shadows across it, no motion blur, no text, no logo.

**The composition line:**

> Three-quarter view from above, the camera high and looking down at about 55 degrees, so the roof and whatever stands
> on top of the building read clearly; the whole building and everything on it inside the frame with margin, standing
> alone on a plain flat dark ground: no background, no landscape, no trees, no other buildings, no people, no
> creatures, no text.

The camera is high because the game sees a tower straight down; 55° is the Heart's and the portals' match camera, and
it still shows a tower's walls enough to model them.

## Theme A, medieval

A moon-stone keep's family: the look V-05d has, but ours. Round and square towers, slate roofs and conical caps, timber
galleries, arrow slits, iron bands; the tier's runes are braziers of teal runelight; the Heart is a keep with the Spire
rising from it, a portal a gatehouse arch.

**The theme paragraph** (word for word in every theme A prompt):

> Theme: a medieval moon-stone keep's family, our own design, no real castle copied. Round and square towers of pale
> dressed moon-stone in big simple blocks, steep slate roofs and conical caps in dark blue-grey slate, dark timber
> galleries, hoardings and shutters, dark iron bands, hinges and studs, narrow arrow slits, chunky crenellations.
> Every building squat and toy-like: walls that bulge a little, roofs that overhang.

| Kind | Theme A, in one line |
|---|---|
| Arrow | a narrow round moon-stone tower with a timber gallery, a small ballista on its flat top |
| Cannon | a low wide octagonal bastion, a stone-thrower on its roof |
| Frost | the palest round tower, frost on its rim, an ice column on its top carrying an ice lance |
| Arcane | a round tower under a big slate dome, a staff holding a crystal on the dome |
| Flak | a low square stone emplacement, a skyward six-sailed rotor in the middle |
| The Heart | a squat round keep with four corner turrets, the Spire rising from its middle, the rose-red crystal at its tip |
| A portal | a gatehouse: two squat round towers round a tall arch, the portcullis raised, two teal rune-lamps |

## Theme B, East Asian

Tiered eaves with upturned corners, lacquered dark timber, stone plinths, paper-and-rune lanterns, bronze bells, carved
cloud and wave motifs; the tier's runes are paper lanterns lit teal; the Heart is the Spire as a tall tiered tower over a
stone terrace, lit from within; a portal is a free-standing gate of two posts and a double lintel with the violet light
between (the kit's), a shape of its own and not a shrine gate copied. **Theme B matches the sound** (`docs/ART.md` §13):
the lobby is a Japanese garden (koto, shakuhachi, soft taiko) and a match is a Three Kingdoms war epic (war drums,
gongs, horns, the erhu), so its bells and eaves would be heard as well as seen. It is also the bigger step from the packs:
theme A is the family V-05d already shows, made ours.

**The theme paragraph** (word for word in every theme B prompt):

> Theme: an East Asian fortress family, our own design, no real temple, pagoda, shrine or castle copied. Dark lacquered
> timber, near-black brown, standing on heavy pale moon-stone plinths; tiered eaves with deep overhangs and upturned
> corners, roofs of dark blue-grey tiles in clean simple rows; round lanterns of cool pale paper in dark timber frames;
> small dark bronze bells; carved cloud and wave motifs in low relief on the beams and plinths. No red or vermilion
> paint, no gold leaf, no writing or characters on lanterns or boards, no dragons, no crests. Every building squat and
> toy-like: eaves bigger than the walls under them.

| Kind | Theme B, in one line |
|---|---|
| Arrow | a narrow timber tower on a stone plinth, two small stacked eaves, a repeating crossbow on its flat top |
| Cannon | a low wide stone platform skirted by one deep eave, a fire-tube battery on top |
| Frost | a pale plinth with a carved ice-stone column, a frost bell hung on its side in a yoke on top |
| Arcane | a lantern shrine: a round paper-walled pavilion under a domed tile roof, an arm holding a crystal in a lantern-cage on the dome |
| Flak | a low square stone terrace with capped corner posts, a skyward wheel of six paper kites in the middle |
| The Heart | the Spire as a four-tiered tower of timber and paper over a stone terrace, lit teal from within, the rose-red crystal on its finial |
| A portal | two square timber posts on carved stone plinths, two straight lintels, a narrow tile roof on the upper one, cloud fretwork between them, teal paper lanterns |

## What to watch

- **Three things glow warm today.** V-05d's Cannon burns ember braziers at its tiers, the Flak's caps glow `flare` and
  the portals have two lit torches. Under the rule all of them become teal runelight in the model session, whichever theme
  Han picks, so the Cannon and the Flak are told apart by shape, not by a warm glow.
- **Bone and paper.** Theme B's unlit paper is pale; at 40 px a pale shape on a wall could read as the host's bone. The
  paper is a cool pale (`snow` toward `moon`) and sits in dark frames, and the lit lanterns are teal.
- **From above, a roof hides its turret.** Both themes put the turret on top, uncovered (no roof over the crossbow, the
  bell or the kites), so turning it turns what the player sees. A concept that tucks a turret under an eave is read
  for its body only.
- **Bronze is not gold.** Theme B's bells and mounts are dark bronze, near brown; tier 3's gold must still read as the
  one bright metal.
- **The Heart's crystal is the exception.** Rose-red, the Heart's colour on the HUD; if it reads orange next to the
  host's ember on Han's phone, it goes a step toward crimson in the model session.
