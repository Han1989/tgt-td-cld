# V-07c look: the map in grass green, three options

**Han, 25 Oct 2026:** the match's ground reads as a grey dungeon floor. He wants it near grass green, with the match's light (V-07c) done at the same time. This session makes **three looks for Han to pick from on his phone**, each a whole look (the ground, its light, the pads). It is **images only: nothing in the game changes.** The committed plate, the tokens and the client are as they were. The next session renders the pick into the game and adds the light pools (see "For the session that renders the pick").

## Why it reads grey (measured)

Today's open ground comes out of the render as **#2e4943**: hue 167°, saturation 0.36, L\* 29. That is a dark blue-teal, not a green. The `moss` token (#2a473b, 155°) is already teal, and the cool moonlight wash and the 35% night vignette push it further toward blue-grey. The 26 blue-grey stone pads (#5b637a as rendered) cover about a third of the open ground. There is also a readability problem with it: **the Ranger's green (151° as his rig draws him) is only 16° from today's ground**, so he holds his own only by being lighter.

## The pictures

- **`docs/art/ground-options.png`**: the sheet. From top to bottom:
  - Today's ground and A, B and C as wave-10 match frames on a 412 × 839 phone. They are the same held moment, shot on each ground.
  - Under each frame, its readability checks.
  - The same four frames in Settings → Display → Bright.
  - The middle of each ground (the mid lane and four pads) at full quality, at the phone's 3× pixels.
  - The three heroes, a Grunt and a Brute (on the road and on the grass) standing on each ground, drawn by the match's own rigs at phone size. The upper left pad is tinted as yours and the upper right one as a teammate's.
- **`docs/art/ground-a.png`, `ground-b.png`, `ground-c.png`**: each look's frame on its own, 1236 × 2517, the phone's own pixels. Opened on a phone, each one fills the screen as the game does.

The frames use **drafts** (1×, 4 samples: the whole map in about 2 minutes); the middles are full quality. The light pools are mocked into the frames (see "The light pools").

## The three looks

| | A · Spring meadow | B · Moonlit meadow | C · Golden hour |
|---|---|---|---|
| The idea | Yellow-green grass under a warm afternoon sun from the upper left (the moon's direction, so every sprite's light still agrees) | Today's night and moon, with grass that is truly green (the hue moved from teal toward green, more saturated). The closest to Runelight today | Warm green under a low gold sun, long warm shadows, a faint gold haze over the top of the map |
| Asked for (mid-tone) | #5f8f3e | #3f6e36 | #6b8a3a |
| **Grass as rendered** (median of the open ground) | **#649440** (94°, L 56) | **#427438** (110°, L 44) | **#648237** (84°, L 51) |
| Road (L) / pads (L) | 53 / 65 | 40 / 53 | 51 / 58 |
| Sun / moon | Same direction and height as today (40° up), warm | Today's moon | The moon's bearing, **25° up** (shadows about 1.8× as long) |
| Wash / vignette | Cool wash replaced by a faint warm one (5%), vignette **12%** | Wash a touch less blue (6%), vignette **25%** | Gold wash (7%) plus a **gold haze** over the top 30% of the map (18%), vignette **18%** |
| Bright's wash | **12%** | **26%** | **16%** |

In all three:

- **The pads** become warmer weathered stone: sand-grey, not blue-grey (there is no `stoneLight` token: the pick's pad tones become the pad tokens). They stay lighter than the ground and stay exactly 3 × 3 tiles, with the bevel that catches the light. Moss and grass grow into their seams, and moss creeps in over one edge and half of the next. Each pad is turned a quarter at random, so it is a different edge on each pad. Moss cushions sit over the bevel on those edges, and three tufts of grass grow from the seams. The pads' squares and the lanes' lines, as the render measures them, are the same to the hundredth of a pixel in all three.
- **The road** is a warm packed earth at about the grass's own lightness (ΔL −1 to −4), so it stays low-contrast and the creeps stay the brightest thing on it.
- **The trees and the canopy** are greener to match. The safe zone's shade is kept as it is (night 0 → 62% over four tiles), so the touch controls stay readable.

## Readability checks (measured by the sheet's script)

The checks are measured on the full-quality middles and on the figures as the match's rigs draw them at phone size:

- the grass, road and pad medians;
- the Ranger's hue (his green pixels);
- the Warden's metal (pixels with low saturation that are lit);
- the Grunt's bone (its light, low-saturation pixels);
- the Brute (its median);
- the HP bar (`COLORS.hpHigh`);
- the zone tints, as `world.ts` lays them on a pad: yours rim 95% / wash 20%, a teammate's rim 50% / wash 8%.

ΔL is the difference in CIELAB lightness; ΔE is the colour difference (CIE76).

| Check | Now | A | B | C |
|---|---|---|---|---|
| The Ranger's green (151°) against the grass | **16° ✗** | 56° ✓ | 41° ✓ | 67° ✓ |
| The Warden's metal on the grass, ΔL | +60 | +33 | +45 | +39 |
| Grunt (bone-white), ΔL on the road / on the grass | +50 / +61 | +37 / +33 | +49 / +46 | +39 / +39 |
| Brute (dark), ΔL on the road / on the grass | −20 / **−9 ✗** | −34 / −37 | −21 / −25 | −31 / −31 |
| HP bar on the grass, ΔE | 83 | 37 | 50 | 47 |
| Pads lighter than the grass, ΔL | +14 | +9 | +9 | +8 |
| Zone tint, yours (rim / wash), ΔE | 46 / 10 | 70 / 16 | 64 / 15 | 75 / 17 |
| Zone tint, a teammate's (rim / wash), ΔE | 43 / 7 | **26 / 4** | 32 / 5 | **25 / 4** |

What the table shows:

- **Every option passes the Ranger's rule** (his green at least 25° from the grass). In C the grass is pushed yellowest; he is never repainted.
- **Every option fixes the Brute on the grass.** Today the Brute is nearly lost on the dark teal ground (ΔL −9).
- **The HP bar** loses contrast as the grass gets lighter (A: ΔE 37), but it still reads: the bar has its own dark backing and sits over the unit.
- **A teammate's orange rim** at 50% loses about 40% of its contrast on the sand pads of A and C (ΔE 43 → 25). Yours, in blue, gains. If Han picks A or C, the next session should raise a teammate's rim to about 65% (`world.ts`, `syncPads`), or check that it still reads in a 2-player match.
- **The Air chip, the HUD and the touch controls** were checked by eye in the frames. The top bar sits above the map and the chip has its own dark plate, so both read on every ground. The controls sit over the safe zone's kept shade, and their rune-teal rims read on all three.

## The light pools (V-07c, mocked in the frames)

The pools are a soft glow on the ground: rose round the Heart (`RL.heart`, 3.4 tiles), violet round each portal (`RL.portal`, 2.6 tiles, centred a tile below its first waypoint, where the client draws it) and teal under every tier-3 tower (`RL.rune`, 2.4 tiles). Each is a radial falloff (1, 0.72 at 30%, 0.3 at 60%, 0.08 at 82%, 0 at the edge). The peak alphas are 0.36 (the Heart), 0.38 (a portal) and 0.3 (a tower), times each look's strength: **A 1.3, B 1.0, C 1.15**. A lighter ground needs more for the same glow.

**Found while making them:** on green grass, a pool of light that is only *added* turns rose into gold and violet into grey: red added to green is yellow. So each pool is two layers. First a tint is laid over the ground (`source-over`, half the alpha), then a glow is added on it (`lighter`, 0.7 of the alpha). The client should do the same with two sprites per pool (a normal one under an `add` one), in the map layer over the plate and under the pads' tints. They would be made once and animated by alpha only, like every persistent effect.

## Exact numbers, so the pick renders without guessing

These are the rows of `tools/blender/tdt3d/ground_options.py`. Today's values are in the first column.

**Tokens** (`apps/client/src/render/art/tokens.ts`, as the map build reads them):

| Token | Today | A | B | C |
|---|---|---|---|---|
| `moss` | #2a473b | #63a046 | #417b32 | #6ca247 |
| `mossDark` | #1d3329 | #498035 | #2d5923 | #4f7d34 |
| `mossLight` | #3b5f4d | #87bd60 | #57963f | #8fc260 |
| `fern` | #12241c | #33632a | #1c4018 | #325a25 |
| `lane` | #5a4c3a | #8a7252 | #5f4e3a | #857055 |
| `laneLight` | #bcab85 | #cbb48a | #bba57e | #c9b48e |
| `pebble` | #7f6d53 | #a18b68 | #816c51 | #9c8664 |
| `forest` | #172416 | #223a1c | #172a15 | #26351a |
| `tree` | #21381f | #2e4e24 | #22401f | #34502a |
| `canopy` | #2e5a3c | #3f7634 | #30633a | #4b7633 |
| `canopyLight` | #4a7a4e | #66a248 | #4d8b4b | #7ca249 |
| `pine` | #1f4a3e | #2c5e3a | #205038 | #34593a |
| `padStone` | #6b7189 | #c2bba6 | #9b927c | #b3aa92 |
| `padStoneDark` | #3c4052 | #847d6a | #5e5647 | #7a705a |
| `padGroove` | #2a2d3b | #4e4a3b | #39352b | #4c4535 |
| `sun` (new) | none | #fff0c8 | none | #ffd890 |
| `sky` (new) | none | #c4dcff | none | #d8c8e8 |

**The painter's light** (`npr.LOOK`, merged with `map.LOOK`):

| | Today | A | B | C |
|---|---|---|---|---|
| `shadow` (the albedo × this in shade) | (0.44, 0.47, 0.68) | (0.62, 0.58, 0.58) | (0.46, 0.50, 0.66) | (0.62, 0.53, 0.52) |
| `lit` | (1.08, 1.08, 1.09) | (1.12, 1.07, 0.96) | (1.08, 1.08, 1.06) | (1.14, 1.05, 0.90) |
| `fill`, `fill_amount` | `moon`, 0.07 | `sky`, 0.10 | `moon`, 0.07 | `sky`, 0.08 |
| `mrim` (the lit edge) | `moon` | `sun` | `moon` | `sun` |
| `rim`, `rim_amount` (lower right) | `rune`, 0.45 | `sky`, 0.20 | `rune`, 0.45 | `sun`, 0.18 |

**The sun and the finish** (`tools/blender/tdt3d/map.py`):

| | Today | A | B | C |
|---|---|---|---|---|
| `MOON` (towards the light) | (−0.503, 0.578, 0.643): 40° up | the same | the same | (−0.595, 0.684, 0.423): 25° up |
| `WASH.cool`, `cool_alpha` | (160, 200, 255)/255, 0.06 | (1.0, 0.94, 0.80), 0.05 | (180, 208, 240)/255, 0.06 | (1.0, 0.86, 0.58), 0.07 |
| `WASH.vignette` | 0.35 | 0.12 | 0.25 | 0.18 |
| `HAZE` (new) | none | none | none | colour (1.0, 0.84, 0.52), alpha 0.18, over the top 30% of the map's height |
| `SAFE_SHADE` | start −0.6, 4 tiles, 0.62 | kept | kept | kept |

**The pads' moss** (`map.PAD_MOSS`, the same in all three looks):

- `seams` 0.55: the seams grown toward `mossDark` where a noise lets it, and widened there.
- `edge` 1.0: the creep 4–13 world px in from the pad's edge (its top starts 2.4 px in) over the east edge and the east half of the south one (texture-local), broken by noise.
- `cushions` 4 on the first edge and 2 on the second: moss cushions over the bevel, kept off the corners.
- `tufts` 3: grass tufts from the seams.
- Each pad shows its top a quarter turn of its own (`pad_turn`: the pad id hashed), so the mossy edges differ from pad to pad.

**Bright** (`LIGHTING.bright.groundLift.alpha`, today 0.32). The same `#9fb8c8` `screen` wash on a lighter ground lifts less and costs more colour: on A, 32% would take the grass from L 56 to 66 and drop its chroma from 50 to 37 (minty). Each look's alpha brings its grass to about **L 55–60** in Bright, against today's Bright at L 46:

- **A 12%**: L 60, chroma 45
- **B 26%**: L 55, chroma 32
- **C 16%**: L 56, chroma 38

The painted ground's vignette (`LIGHTING.normal.vignette` 0.35, `bright` 0.12) follows the pick's `WASH.vignette`.

## How to render them again

```
npm run art:3d -- map spire --draft --ground a --out <dir>/a                          # and b, c (about 2 min each)
TDT_PLATE_BOX=448,704,1216,1216 npm run art:3d -- map spire --ground a --out <dir>/a  # the middle at full quality (about 1 min)
npm run build:e2e -w @tdt/client && npm run ground-options -w @tdt/client -- <dir>    # the frames and the sheet (about 75 s)
```

`--ground` is refused without `--out`, so the committed plate is never overwritten. Without `--ground`, the build renders today's plate exactly as before: a draft rendered before and after these hooks measures the same pad squares and lane lines, and differs only in a few edge pixels.

`npm run ground-options` (`apps/client/scripts/groundOptions.ts` and `src/groundOptions.ts`, dev only) plays one match and holds it at one moment. For each ground, it uploads that ground's plate (with the pools) over the match's plate texture in place, so the four frames are the same moment. The Bright frames turn the game's own wash off (by a route on the bundle) and wash each ground in the page at its own alpha.

## For the session that renders the pick

1. **Move the pick's numbers in**, then drop `ground_options.py` and the `--ground` flag:
   - the tokens into `tokens.ts`;
   - the light and finish into `map.py`'s `LOOK`, `WASH`, `MOON` and `HAZE`;
   - `PAD_MOSS` as the default.

   The ground tokens are not the map's alone. Before changing them, decide: either they get map-only names (for example `grass`, `grassDark`, `road`), or the other places are rendered again and checked. The other users are:
   - `moss*`, `lane` and `pebble`: the creeps' fringe backdrop and their sheets' checks (`tdt3d/creep.py`, `creeps.py`), the structures' render (`tdt3d/structure.py`) and the HUD's frames (`tdt3d/ui.py`);
   - `padStone*`: the HUD's frames (`tools/blender/ui.py`);
   - most of them: the lobby's clearing (`tdt3d/clearing.py`: the stage videos, rendered ahead of time);
   - the client: the painted ground and the share card (`mossDark`).
2. **Render the plate again** (`npm run art:3d -- map`, about 11.5 min, with the link card's plate), keep it under the 700 KB budget, and run `test/plate.test.ts`. Then `npm run og -w @tdt/client`.
3. **For C only:** check that the border trees' longer shadows (25° up) do not reach the pads beside them (§16).
4. **The 2D fallback ground** (`render/art/ground.ts`) follows the tokens. Bring its wash and vignette in step with the pick. The pad slab sprite (`entities/pad.ts`) gets the warm stone, and the moss if it is wanted there. Check `?showcase` in Normal and Bright.
5. **Bright:** set `LIGHTING.bright.groundLift.alpha` to the pick's value. `e2e/platform.spec.ts` checks the plate under the wash.
6. **The light pools** in `WorldRenderer`: two sprites a pool (a tint under a glow), for the Heart, the portals and every tier-3 tower, made once and animated by alpha only. Add the colours to `FX` in `render/palette.ts`. Mark them non-essential (they disappear at Low). Keep the stress budget (`e2e (perf)`).
7. **If A or C:** raise a teammate's zone rim (see the checks).
