# Tower Defense Together: Art Direction ("Runelight")

> **The style guide for every art session.** Read it before drawing anything, together with `CLAUDE.md` (architecture and performance rules) and `docs/MOBILE.md` §7 (performance targets). If you make an art decision this guide doesn't cover, add it here and log it in `GAME_DESIGN.md` §13.

Art Track 0 chose style C, **"Runelight"**, from the art-direction spike (styles A/B/C, compared on phones). It is now the game's only look. The rule is that art is **made by scripts in the repo**. Most of it is **drawn in code** (Canvas 2D paths) and **baked once** into atlases at start-up. Since Han's decision of 14 Oct 2026, heroes, then creeps and towers, are **3D models rendered ahead of time by Blender scripts** into pictures and videos (§15): nothing 3D runs on the player's device. Since 16 Oct 2026 the models come from the **CC0 KayKit packs** (`tools/blender/assets/kaykit/`), with the packs' own clips, repainted in Runelight's tokens by the painter in the repo; nothing is modelled in code. Since 17 Oct 2026 the creeps and bosses are too (V-05c): the KayKit Skeletons and the Quaternius Ultimate Monsters (`tools/blender/assets/quaternius/`). Since 17 Oct 2026 **the map's ground is one picture rendered ahead of time** the same way (§16), with the painted ground (§4) as its fallback. Entities that have no art yet keep their Phase 1 shapes until an art session draws them.

## 1. The look in one paragraph

Twilight in a mossy forest clearing. Dark teal-green moss, packed-earth lanes worn pale in the middle, a few glowing motes. Every part has an **ink outline**, a body that **darkens downwards**, and a **cool moonlit rim** on its upper-left edge. Colour is used sparingly: materials are muted (wood, stone, iron, cloth), and the brightest things on screen are small **glowing accents**: runes, embers, eyes, gems. Creeps are warm (reds, oranges) against the cool ground so they are always the brightest thing on a lane; the player's side is cool and teal-lit; the enemy's portals are violet.

**Status (Art Tracks 1–3):** restyled: the ground, the forest (trees over the border and the safe zone) and a few props, build pads, portals (with a wave-start flare), the Heart (with damage states), **all three heroes** (Ranger, Warden, Arcanist, with walk, attack, cast, hit and death; Art Track 1; the Warden's melee reworked to read at phone size, §7), **every creep** (Grunt, Archer, Runner, Brute, Wisp, the Matriarch's Hatchlings) and **the three bosses** (Ironhorn, Matriarch, Shardback with both hides), **all five towers** (Arrow, Cannon, Frost, Arcane, Flak) at tiers 1–3 with **all ten branches** (Art Track 2), every effect colour (§8) and the whole UI (§12: HUD, radial menus, skill buttons, lobby, settings, end screen, code-drawn icons). **Projectiles and the Snare Trap** are restyled (§6): one carved body per shot, and the trap's coil plus its root ring. `?showcase` lists both, the UI icons and the sounds. **Sound** (§13): music and every effect, made in code. **The map plate** (§16, V-03): Spire's ground, lanes, pads, trees and props rendered in Blender as one picture.

## 2. Palette tokens

All art colours come from `RL` in `apps/client/src/render/art/tokens.ts`. **Never write a hex colour in an art file**; add a token instead (and a row here). Effect colours are separate (§6).

| Token | Hex | Use |
|---|---|---|
| **Line and light** | | |
| `ink` | `#100c16` | Every outline; lane edges |
| `moon` | `#cfe6ff` | Rim light (mixed 60% into a part's colour); neutral pad rims |
| `night` | `#000008` | Contact shadows, vignette |
| **Ground** | | |
| `moss` / `mossDark` / `mossLight` | `#2a473b` / `#1d3329` / `#3b5f4d` | Open ground, blotches, speckle |
| `fern` | `#12241c` | Fern tufts |
| `lane` / `laneLight` / `pebble` | `#5a4c3a` / `#bcab85` / `#7f6d53` | Lanes, their worn centre, flagstones |
| `forest` / `tree` | `#172416` / `#21381f` | Forest floor under the trees; leaf ticks |
| **Props** | | |
| `canopy` / `canopyLight` | `#2e5a3c` / `#4a7a4e` | Oak and bush canopies, their lit clumps |
| `pine` | `#1f4a3e` | Pine canopies |
| `mushroom` | `#d8c6ae` | Mushroom caps (their spots glow `rune`) |
| **The lobby's clearing** (rendered ahead of time, §15) | | |
| `sky` / `skyLow` | `#070c12` / `#183531` | The night sky, deep at the top; its haze down at the tree line |
| `mist` | `#5f8c84` | Mist along the far tree line and depth fog (darkened in the render) |
| **UI icons** (they also use the tower tokens below: `ice`, `amethyst`, `arcane`…) | | |
| `mana` | `#4a8cff` | The mana drop (Clarity Aura icon) |
| **Pads** | | |
| `padStone` / `padStoneDark` / `padGroove` | `#6b7189` / `#3c4052` / `#2a2d3b` | Build pads: cool stone, lighter than moss and lanes |
| **Materials** | | |
| `wood` / `woodDark` | `#8f5d38` / `#5c3a22` | Decks, stocks, carts, clubs |
| `stone` / `stoneDark` | `#8f8ba2` / `#58556d` | Keeps, pedestals, portal rims |
| `iron` / `ironDark` | `#444b5b` / `#262b36` | Armour, barrels, crossbow arms |
| `gold` | `#e8b94a` | Tier-3 trim, buckles, tips (gold = upgraded / valuable) |
| `snare` | `#c8a165` | Root / snare rope (same hex as `COLORS.root`) |
| `bone` | `#e6dac0` | Horns, tusks, fletching |
| `string` | `#dfe8f0` | Bow and crossbow strings |
| `hole` | `#0d0a10` | Barrel mouths, visor slits |
| `ice` / `iceDark` / `snow` | `#a9d8f0` / `#4f7fa6` / `#e8f4fb` | Frost towers: crystal, shaded facets and ice floors, snow caps |
| `arcaneStone` / `amethyst` | `#4b3f63` / `#6a4a8c` | Arcane towers: violet-grey stone, the tier-1 orb (unlit) |
| `crystal` / `obsidian` | `#d8e4f4` / `#1e1a2a` | Prism's pale crystal; Void's black stone |
| `steel` / `steelDark` / `sandbag` | `#6c7a8a` / `#3a4452` / `#a08e66` | Flak towers: gun metal (lighter and bluer than `iron`), plates, sandbags |
| **Heroes** | | |
| `leaf` / `leafDark` | `#2fb06c` / `#165c3a` | Ranger's cloak and hood; tier-3 pennants |
| `cloth` | `#2a8a8a` | Accents on cloth (fletching) |
| `hoodShadow` / `gloveDark` | `#13201a` / `#3a2a22` | Face lost in the hood; gloves |
| `wardenBlue` / `wardenBlueDark` | `#3a6fc0` / `#1d3a6e` | Warden's tabard, shield, crest; cape |
| `plate` / `plateDark` | `#a7b3c7` / `#5f6a80` | Warden's plate (bright steel, the player's side; `iron` is the enemy's, `steel` the Flak towers' gun metal); sabatons, gauntlet |
| `robe` / `robeDark` | `#b9508c` / `#5a1f45` | Arcanist's robe and hat; sash, brim, boots |
| `skin` | `#e2b996` | Bare faces and hands (Arcanist) |
| **Creeps** | | |
| `grunt` / `gruntBelly` | `#e0503f` / `#e8a070` | Grunt (a darker `grunt` is the Runner's scarf) |
| `brute` | `#8c3440` | Brute's skin |
| `archer` | `#e8893a` | Archer's skin |
| `runner` | `#f2c247` | Runner's skin |
| `wisp` | `#b98cff` | Wisp: a violet spirit (enemy magic); its core glows |
| `ironhorn` | `#6f3a8e` | Ironhorn's hide |
| `matriarch` / `egg` | `#c2477f` / `#f3e3c3` | Matriarch's shell; her clutch of eggs |
| `shardback` | `#4d6a86` | Shardback's slate skin |
| `hideStone` / `hideStoneDark` | `#c9b58a` / `#8a7a58` | Shardback's Stone hide: slabs and cracks (`HIDE_COLORS.stone`) |
| `hideEther` | `#9f7bff` | Shardback's Ether hide: crystal plates, glowing seams and shards (`HIDE_COLORS.ether`) |
| **Glow accents** (drawn with `p.accent`) | | |
| `rune` | `#7ffcd8` | Player-side magic: tower runes, pad studs, sighting crystals |
| `ember` | `#ffa24a` | Fire: cannon runes, fuses, mortar, the Heart's core |
| `frost` | `#9fe8ff` | Frost tower runes and cores |
| `arcane` | `#d68cff` | Arcane tower runes and orbs |
| `voidGlow` | `#ff5fd2` | The Void branch's rim and needle |
| `flare` | `#ff6a3d` | Flak runes and breeches (redder than `ember`) |
| `multishot` | `#e6ff7a` | Ranger Multishot vanes (same hex as the skill) |
| `eye` | `#ffd24a` | Creature eyes |
| `heroEye` | `#b6ff9e` | Hero eyes under a hood or behind a visor |
| `staffGem` | `#ff9be0` | The Arcanist's staff gem and its flare |
| `visorEye` | `#ff5a3a` | Eyes behind armour |
| `heart` / `heartFacet` | `#ff3a60` / `#5a0a20` | The Heart's gem and its runes |
| `portal` / `portalLight` / `void` | `#8a4fe0` / `#7ffcd8` / `#0a0616` | Portals (enemy side = violet) |

**Display (Settings → Display).** `LIGHTING` in `tokens.ts` has two modes. **Normal** is the look above. **Bright** (for playing outdoors) lifts the ground with a `screen` wash of `#9fb8c8` at 32% (dark colours rise most, so shadows open up without washing out the lanes), softens the vignette (35% → 12%), lightens contact shadows (60% → 38%) and makes bodies darken less towards the bottom (42% → 28%). Switching re-bakes the atlas and repaints the ground in place (a one-off cost, nothing per frame). Draw for Normal and check Bright in `?showcase`: nothing may vanish in either.

## 3. Painter, outlines and lighting

Art files describe **shapes** (a `Path2D` and a base colour). The painter (`art/paint.ts`) renders them:

| Call | Result | Use for |
|---|---|---|
| `p.part(c, path, color, box, opts)` | Body gradient (base +6% at the top → darkened by `bodyDarken` at the bottom), moonlit rim on the upper left, ink outline | Every body part (torso, head, deck, barrel) |
| `p.detail(c, path, color, outline?)` | Flat colour, thin ink outline | Small things on a part: eyes, rivets, belts, planks |
| `p.accent(c, path, color)` | Coloured glow (7 px blur at the atlas's 2×) with a hot core | Runes, gems, embers, glowing eyes: **only** things that emit light |
| `p.line(c, path, color, width, alpha?)` | Round-capped stroke | Strings, seams, cracks, facets |
| `p.shadow(c, x, y, rx, ry)` | Soft radial contact shadow | Under anything standing on the ground |

- **Outline weights** (world px, `LINE` in `paint.ts`): body parts **2.4** (`opts.line` scales it: 0.6–0.8 for small parts such as feet, hands and bolts, up to 1.2 for the Heart); details **1.1**; lines 1–2.4. Inner parts that sit on an outlined part may skip the outline (`noOutline`).
- **A drawing at another size** (the lobby's hero stage, §12) makes its own painter: `createPainter(lighting, glow, weight)`. `glow` is the drawing's scale ÷ the atlas's, because a canvas blur ignores the drawing's scale; `weight` scales the ink outlines (0.5 on the stage: at five times the size the full weight swallows the shapes). The atlas and the icons use 1 for both.
- **Light comes from the upper left** (the moon). Never light a part from another side, and never add a specular highlight elsewhere. Gems may have one white shine on their upper-left facet.
- **Glow is rare.** A character gets at most its eyes and one accent; a tower gets 2–4 rune studs (more for higher tiers). Glow marks what matters: upgrades, magic, fire, eyes.
- **Rounding** is modest (corner radius ~0.6× what a toy look would use): Runelight is carved, not puffy.
- **Materials read by colour and texture**: plank seams on wood, radial joints on stone, rivets on iron.

## 4. The ground

**In a match the ground is the map plate (§16)**: one picture rendered in Blender from the map's data, drawn as one sprite. The painted ground below is its **fallback** (until the plate has decoded, or if it fails) and what the plate is built to match: the same lane widths, the same prop spots (`scatter.ts`), the same safe-zone shade, the same values.

Painted once by `art/ground.ts` into one canvas (2 px per world px) and shown as one sprite:

- Moss: soft blotches, 2,400 specks, 200 dark fern tufts, 70 glowing motes (teal and amber).
- Lanes: smooth strokes along the waypoints: ink edge (lane + 6 px), packed earth, a moon-worn centre at 10%, sparse low-contrast flagstones. **Lanes stay low-contrast so creeps are the brightest thing on them.**
- A cool moonlight wash near the top, a vignette at the edges; forest (blocker tiles) is dark forest floor under trees.
- **Props** (category `prop`, one file each in `entities/`: `tree`, `rock`, `mushrooms`, `runestone`) are **painted into the ground canvas** with the painter at spots picked by `art/scatter.ts` (pure, tested): no sprites, no cost per frame. `where: 'forest'` props (trees: oak, bush, pine, from above, shadow down-right) cover the blocker tiles: small ones centred on the cliff border so they lean off the map and never reach a lane or pad, and a dense hex-packed canopy over the **safe zone** (rows from `safeFromY`), which then sinks into a deep shade (night, 0 → 62% over four tiles) so the touch controls over it stay readable. `where: 'clearing'` props (rocks, glowing mushrooms, rare runestones) go on ~10% of open tiles that aren't next to a lane, 3 tiles clear of the Heart and hero spawn; `weight` picks between props. Props are **never mirrored or rotated** (that would move the moonlit rim), keep low contrast and cool or neutral colours (a warm prop reads as a creep: the first stump was dropped for that), and stay small.
- **Build pads** (`entities/pad.ts`) are sprites on top of the ground, not painted into it: a slab of cool carved stone, lighter than both moss and lanes, with a moonlit edge, an inset groove, calm flagstone seams, a faint build ring and four dim rune studs. A white `rim` and `wash` are **tinted at runtime**: solo and open pads get a faint moonlit rim (35%); in multiplayer each pad gets its owner's zone colour (`PLAYER_COLORS`: blue, orange, violet by seat; a match holds at most 3 players), bright on your own pads (rim 95%, wash 20%) and dim on teammates' (50%, 8%).

Scatter decorations with `hash()` (deterministic), never `Math.random()`: the art must bake the same every time (a test checks art files).

## 5. Camera rules

- **Characters (heroes, creeps) are seen from the front**, in a 3/4 view, **facing right** (+x). The rig flips them to face left. Feet at the bottom; draw the frame so the rig's pivot (the feet) is a known `feet` offset below the frame centre. Give them a contact shadow under the feet.
- **Towers and buildings are seen from above.** A tower's platform (`base*`) is a top-down plan; its turret (`top*`) points **+x** with its pivot at the frame centre, so the rig can rotate it towards a target. Shadows fall down-right.
- **The Heart** mixes both: a pedestal from above, the gem in 3/4 view floating over it. **Portals** are from above.
- **Projectiles** point **+x** with the pivot at the frame centre (the renderer turns them along their path). No contact shadow. **Traps** are from above, like a building; the coil has a contact shadow.
- Frames are drawn in **world px around (0, 0)** (1 tile = 32 px); the atlas bakes them at 2×.

## 6. Size and readability at phone size

On the reference phone (412 × 839, Spire's 26 tiles across the width) a tile is **15.85 px**. Units are drawn larger than their map size so they stay readable, each kind with its own scale (`render/entityScale.ts`, `entityScales(tilePx)`, a pure function of the tile size, unit-tested). **Where a tile is 25 px or more (desktop, tablet) every scale is 1.** The camera is not part of it: the whole Spire map stays on screen and the camera stays still on phones (`docs/MOBILE.md` §4; Han, 14 Oct 2026, V-04).

- **Base scale** = `clamp(25 / tilePx, 1, 1.6)`: what every unit had before V-04 (1.58 on the reference phone, 1.6 from a 15.6 px tile down).
- **Towers** = the base scale, at most 1.2 (unchanged: they must stay inside their pad).
- **Creeps** (bosses and flyers with them, so a boss keeps its size relative to other creeps) = base × `CREEP_BOOST` (1.2); **heroes** = base × `HERO_BOOST` (1.4). The boost grows linearly as tiles shrink from 25 px and is whole at 16 px, so nothing jumps between a tablet and a phone. Largest: heroes 2.24, creeps 1.92 (a 360 px wide phone, 13.85 px tiles).
- Everything that follows a unit's drawn size uses its scale: HP bars and their offsets (they are children of the unit), hit flashes, the contact shadow and the hero's ground ring, hit and death effects (`fx.bitScale` = the creep scale; a hero's death passes its own), meteors (`meteors.bitScale`), where damage numbers start, the Iron Vow ring's reach, and where a tap lands on a creep (`WorldRenderer.drawnCreepRadius`, so a tap hits what is drawn). Shots and the Snare Trap's coil follow the creeps. **Nothing that shows a game rule changes size:** tower ranges, aura radii (the Bulwark Aura's true radius), rain and skill areas, the trap's root ring, pads and the Heart stay at their true size.

| Thing | World px → phone px (412 wide) | Example |
|---|---|---|
| Heroes | × 1.09 (was × 0.78) | a hero ~25 px tall, weapon and all → ~35 px |
| Creeps, bosses | × 0.94 (was × 0.78) | a Grunt frame 32 × 36 → 30 × 34 px |
| Towers | × 0.59 | an 84 px tower frame → 50 px |
| Heart, portals, pads | × 0.50 | a 96 px pad → 48 px |
| Projectiles, trap coil | × 0.94 | a bolt ~28 px long → ~26 px; same scale as creeps |
| Trap root ring | × 0.50 | the root radius in tiles, not scaled up with creeps |

Checked by eye at 412 × 839 and 360 × 640 in `/?stress=300` and in a Quick match at wave 12 with towers built (`docs/screenshots/bigger-units/`): lanes (2 tiles wide) still read as lanes, a Brute (radius 0.5) fills its lane and no more, and HP bars stay clear. A boss (Shardback, radius 0.95) edges onto the neighbouring pad's border, as it did a little at the old size.

Rules:
- **Silhouette first.** Each entity must be recognisable from its outline alone at phone size (`?showcase` shows each at that size, bottom right of its card). Different creeps need different silhouettes, not just different colours.
- **Body size follows the sim:** a creep's or hero's body spans about 2 × its `radius` (tuning.ts, in tiles × 32); weapons, horns and shadows may stick out. A tower fits its 84 px frame and stays inside its pad (3 tiles = 96 px) at × 1.2.
- **Smallest detail:** 2.5 world px for characters (~2 px on a phone), 3.5 for towers. Anything smaller is texture, not information.
- **Contrast hierarchy:** creeps (warm, bright) > heroes > towers > pads > lanes > moss. Creeps must stay distinct from the lane (`#5a4c3a`) and the moss; tower tiers must be told apart by shape (ring size, merlons, second crossbow, gold trim), not only by colour.
- Leave the HP bar zone clear: bars sit ~7 px above a creep's radius and 12 px above a hero's.

### Projectiles and traps

Shots and the Snare Trap are their own categories (`projectile`, `trap` in `registry.ts`). They are baked sprites, not per-frame `Graphics`.

**Projectiles** are one `body` frame, drawn pointing **+x** around (0, 0), with no ground shadow (they are in flight). The renderer rotates that sprite to the direction of travel and scales the whole shot with the creep scale (`entityScales`, §6), the same as creeps, so a bolt does not shrink to a dot when a phone's tiles are ~16 px. One frame per snapshot style. Branch shots keep their tower's body; the trail colour (`shotColor`) still marks the branch. At most one glow. The Archer's arrow does not glow (warm wood and bone); player shots may.

| Style | Silhouette |
|---|---|
| `arrow` | Short iron quarrel, bone vanes, a rune on the head |
| `cannon` | Round iron ball, one ember |
| `frost` | Long ice diamond |
| `arcane` | Four-point amethyst star |
| `flak` | Stubby steel slug, tracer at the tail |
| `ranger` | Long arrow, leaf vanes, bone head, no glow |
| `crit` | That arrow with a gold head and a spark above the shaft |
| `multishot` | Wider barbed head, yellow-green vanes (`multishot`) |
| `arcanist` | Narrow pink crystal |
| `fireball` | Coal with three tongues |
| `archer` | Short crude arrow, orange vanes, no glow |

**The Snare Trap** is seen from above. `idle` is a closed wooden coil (stakes inside the outline, no glow) while it arms. `armed` springs four stakes outward, so the outline becomes a star, and lights one rune. `ring` is the root-radius rope in `snare` (the root colour). The renderer scales the ring to the snapshot radius (`ringRadius` is the circle's radius in the frame) and does **not** apply the unit scale to it, so the rooted area stays true to tuning. Arming only changes alpha.

### Falling meteors (Meteor, Meteor Rain, Shockwave)

The sim's rains pulse on a fixed schedule (start tick + one pulse interval, again until the end tick: 0.75 s for Meteor and Shockwave, 0.35 s for Meteor Rain) and only report a strike when it lands, so a meteor drawn from the strike alone could fall for ~0.1 s and nobody saw it. Instead the client launches its meteors **ahead of each pulse** (`render/fx/meteors.ts`, pure and tested): 0.6 s before a Meteor or Shockwave pulse, 0.5 s before a Meteor Rain one, it guesses the pulse's strikes the way the sim picks them (lane by lane, the creep whose circle covers most of its lane, `predictStrikes`) and drops one meteor on each, **tracking its creep** as it falls so it lands on the pulse tick. When the pulse's `aoe` events arrive, each strike lands the meteor falling onto it (`matchStrike`: same rain, due, nearest within 2.6 tiles) and the impact plays at the real spot; a strike with no meteor gets the old fast streak (`fx.rainImpact` / `fx.comboImpact`); a meteor whose creep died lands where it was heading with a small burst (`fx.meteorLand`); a rain fused away before its pulse lets its meteors go out. Kills, damage and timing are the sim's alone.

| Part | Look | Where |
|---|---|---|
| Head | a lumpy rock (`rock` frame in the effects atlas, grey, tinted `METEOR_COLORS.rock`) in a fire glow, a white-hot core on its leading edge, a long additive trail and a hotter inner one, falling from the upper right (7 tiles up, 0.55 across per tile of fall), speeding up and growing from 55% to full size as it nears the ground; smoke and embers behind it | `MeteorShow` (`render/fx/meteorShow.ts`), `fx.meteorWake` |
| Warning circle | the strike radius on the ground in the rain's fire colour, appearing when the meteor launches; an inner ring closes from the rim to the centre as it falls (the old aimed Meteor's drawing) | `MeteorShow` |
| Impact | white-hot flash and a flash in the rain's comet colour, a shock ring and a ring, debris, embers and smoke, all in the comet colours of `COMET` (`effects.ts`, PR #83), a scorch mark (ink burn with the fire still glowing in it) that fades over ~2.6 s, the rain's shake (Shockwave 0.34, as its comet). A Shockwave meteor also gets #83's own mark on top (the gold band at the pull radius, the ring closing in, dust rushing in) | `fx.meteorStrike` (+ `fx.comboMark` for a Shockwave) |
| Cast | a red wash over the map (above units, under the meteors and effects, never the HUD; `washAt`: in over 0.15 s, out over the rain) and three large faint meteors crossing the sky behind the action | `MeteorShow.wash`, `castSky` |
| Finale | the rain's last pulse: meteors and impacts × 1.35, shake × 1.7 | `FINALE_SIZE` |
| Sound | a falling whistle once a pulse launches (`meteorFall`, lower on the finale), ending as they land | `GameAudio.meteorFall` |

Colours: Meteor red fire (`#ff5a1f`), Meteor Rain amber (`#ffb13d`), Shockwave gold (`#ffd24a`), all in `METEOR_COLORS` (palette.ts). At most **16 meteors fall at once** (`MAX_IN_FLIGHT`, shared between the pulses that fall together: a Meteor pulse may use all 16, a Meteor Rain pulse 8), each a pooled slot. **Low quality** keeps the head, trail, circle, flashes and scorch; only the smoke, embers and debris particles go. **Reduced motion** draws no fall and no shake: the circle, then the flash and the scorch.

**Tower tiers and branches** (Art Track 2) all speak one language, so a player reads a tower's tier from its glow at a glance:

| | Materials | Glow (`tierRunes` in `parts.ts`, in the tower's colour) | Shape |
|---|---|---|---|
| Tier 1 | Humble: wood, fieldstone, sandbags | **None** (a tier-1 orb or crystal is unlit) | Small, plain |
| Tier 2 | Dressed stone or steel ring | **2** studs (2.8 px) + a small core on the weapon | Bigger ring, a longer or extra weapon part |
| Tier 3 | + **gold** trim | **4** studs (3.2 px) + a glowing core / tip | Outward features (merlons, icicles, standing stones, crates, cannonballs) |
| Branch | Its own material mood | 3–8 accents, may use its own colour | **Its own base outline** and weapon silhouette |

Tower colours: Arrow `rune`, Cannon `ember`, Frost `frost`, Arcane `arcane`, Flak `flare`. Kinds read by material at a distance: wood (Arrow), grey stone and iron (Cannon), blue ice (Frost), violet stone (Arcane), square steel (Flak). Branch outlines, no two alike: Sniper hexagon, Volley square fort with bartizans, Mortar octagon, Shrapnel saw ring, Glacier jagged ice shelf, Blizzard snow disc with spiral vanes, Prism triangle, Void thorned black sun, Skyguard diamond, Hailstorm cross. Tops are smaller frames than bases (e.g. 84 × 56): they only need the weapon plus its glow.

## 7. Animation conventions

Styled entities are **rigs**: a few atlas sprites animated by **position, rotation, scale, tint and alpha only** (`art/rigs.ts`; heroes build their own rig in their art file).

- **Creeps:** one sprite each (shadow and weapon baked in). Walk = rock around the feet + hop each step, flipped to the walking direction. Gaits (`GAITS`): `waddle` (Grunt, Archer: 105 ms steps, 0.15 rad rock, 2.2 px hop), `scurry` (Runner, Hatchling: 62 ms, 0.08 rad, 2.6 px), `stomp` (Brute, Ironhorn, Shardback: 190 ms, 0.07 rad, 1.2 px, 5% squash), `crawl` (Matriarch: 120 ms, 0.03 rad, 0.7 px, 6% squash), `hover` (Wisp: a smooth 260 ms bob of 2.4 px and a gentle sway). Rooted or stunned creeps stand still. Pick a gait or add one to `GAITS`.
- **Flyers** (the Wisp) are the one exception to "one sprite": their shadow is a second, static sprite (`shadow` frame) on the ground, `feet` px below the body's centre, so the body can bob over it; the rig pivots at the shadow. Flyers are few (a handful per lane), so the extra sprite is free. The body is drawn larger than a walker of the same radius, with a thicker ink silhouette and two bone wings above the head (a badge, so a phone and a CrazyGames frame can pick it out of a lane). The renderer scales that sprite by `FLYER_DRAW_SCALE` (1.28); the sim radius does not change.
- **Variants:** a creep whose look changes with its state lists other `body`-sized frames in `variants` and a `pick(creep)` that says which to show (Shardback: `body` = Stone hide, `ether` = Ether hide, read from its magic resist). The rig swaps the texture only when the pick changes; `?showcase` shows a card per variant.
- **3D creeps** (V-05c, §15): once a kind's sheet is in, `Creep3DRig` (`render/art3d/creepRig.ts`) draws it on the same terms as `CreepRig` (`CreepRigView` in `registry.ts`: the renderer, its pool and its death queue treat both alike), its frame sprite the body as the 2D rig's (the Shardback's body holds its hide's glow too). The frames carry the motion the 2D rig made with transforms; a frame swaps only when it changes:
  - **walk**: the clip's cycle in 8 frames (the Hatchling's hop in 6), stepped so a planted foot holds the ground (`creepCadence`: the creep's speed in the rig's own px over the clip's stride, from 0.5 to 4 cycles a second); the Wisp's beat and the Hatchling's hop at their clip's pace, scaled by the creep's speed (slowed creeps step slower).
  - **stand**: rooted or stunned (it stands still, as in 2D), or between blows.
  - **attack**: a creep that stops (creeps stop only to fight) plays its attack frames every attack cooldown, over 420 ms or half the cooldown, the stand between; an Archer's from its shot (the renderer finds who fired, as it does to aim the arrow). The Wisp never attacks.
  - **the hit flash**: a hit shows the flinch frame, and its white twin's alpha is the flash (`HIT_FLASH`: 60%, 60 ms, at most every 300 ms). No squash: the frame is the flinch. The flinch is the only frame with a twin (the sheets' budget, §15).
  - **death**: the flinch while the death's flash fades (the first 20%), the three death frames over the next 40%, the last one held, faded out from 55% (`creepDeathFrame`): 480 ms, bosses 1,000 ms, longer than the 2D collapse so the fall reads.
  - **ability**: a boss's three frames over 660 ms on the event the client already gets (`stomp`: the nearest Ironhorn; `hatch` and `hideShift` by creep id).
  - The **Wisp** keeps the 2D Wisp's `shadow` frame on the ground and bobs over it (the hover gait: 2.4 px over 260 ms); the **Shardback**'s spines and horn light up (an additive mask tinted `hideEther`, 85%) while the Ether hide is up; the knockback from a melee blow is the 2D rig's (`knockPose`).
  - The **HP bar** clears the figure's head: 5 px over the idle frame's top (`barY`), never lower than its 2D place.
  - A creep drawn in 2D when its kind's sheet comes in is swapped for its 3D rig at once (and a pooled 2D one is dropped), so creeps already on the map change too. The 2D rigs stay the fallback and in `?showcase`, which lists both.
- **Towers:** the turret turns towards the target at **7 rad/s** (towards its last shot for 0.9 s, else the nearest creep it can hit); on a shot the gun **recoils** back along the barrel (140 ms, up to ~5 px); a new or upgraded tower pops in (260 ms overshoot). Every tower turns (`turret: true`). An all-round blast with no projectile (the Blizzard pulse) doesn't recoil: on its `aoe` event the whole tower **swells** and settles (220 ms, up to +12%, the same in every direction).
- **Heroes** build their rig on `HeroRigBase` (`rigs.ts`), which gives them the `mine` ring and shadow, walk speed and phase, the facing flip, hit flash, cast clock and death fall; the hero file poses its parts. Walk bob and stepping feet from their speed; a weapon aimed along `facing` (ranged) or swung in the facing direction (melee); an **attack** keyed to `shot()` (called on the hero's `heroAttack` event, emitted by the sim on every auto-attack, melee or ranged) and the attack cooldown, with anticipation over the cooldown: the Ranger draws the string back and releases on the shot, the Arcanist's gem charges and the staff thrusts at the target with a flare, the Warden swings (below). `shot(now, aim)` gets the target's direction and returns how long until the blow visibly lands (0 for a release).
- **Melee (the Warden), built to read at phone size:** a **wind-up** of 180 ms (sword up and far back to −2.5 rad, body leaning back) that plays *before* the hit: the rig starts it when the next swing is due (attack cooldown − 180 ms) while an enemy it can hit is within reach + 0.6 tiles (`HeroPose.engaged`, from the renderer); a hit that comes before the wind-up finished finishes it in ≤ 110 ms first. A wind-up held 350 ms with no blow sinks back. Then a **150 ms swing** (to +1.0 rad, the arm up to 30% bigger), turned 60% of the way towards the target, with a **5 px lunge** towards it; the blade passes the front at 47% of the swing (≈ 70 ms), which is when the renderer plays the **impact** (`fx.meleeImpact`: a white-hot flash, a star and sparks along the blow, essential) and the creep's **knockback** (`CreepRig.knock`, `knockPose`: pushed 4 px away and back with a tilt that rings out over 260 ms; bosses half). A **slash smear** (the `slash` frame: a moonlit crescent, faint where the swing began and thick at the end, additive) builds up to the impact and fades over 200 ms. The swing holds 90 ms and returns over 260 ms. `?showcase` has a "melee vs Grunt" card with the impact and knockback.
- **Casts** (`cast(now, slot)`, from the `cast` event): a 480 ms pose that eases in, holds and eases out (`hold()`), different per skill where it's cheap. Ranger: the bow swings up (Multishot, Arrow Storm) or down at the ground (Snare Trap) at full draw and looses. Warden: Cleave is a wide sweep from high behind to low in front, Taunt thrusts the shield out with the sword raised, Last Stand braces low with the sword high. Arcanist: Fireball is a big thrust, Frost Nova lifts the staff and slams it down, Meteor raises staff and hand to the sky (700 ms). The spell effects themselves stay in `render/fx`.
- **Your own hero** is drawn where the client predicts it while you steer it (`predict.ts`), so rigs see smooth, immediate walking; its facing comes from the predicted path while it walks.
- **Hit reaction:** a white **silhouette** of the body (`flash` on the frame; every hero part has one) whose **alpha** goes up to **0.6** (a partial whitening, never a white blob) for **60 ms**, at most **once every 300 ms** per creep or hero (`HIT_FLASH`), and a **flinch**: the body squashes by up to 9% (bosses 4.5%) with the flash. Under steady fire a creep is flashing at most a fifth of the time, and even then its colours and silhouette read. Shapes use the same numbers (tint towards white, or a white overlay for bosses). Creeps flash when their HP drops, heroes when theirs does. Frost tints the whole rig icy (`#bfeaff`). Art keeps its own colours; nothing is re-coloured by a tint except frost.
- **Death reaction** (`DEATH`, `deathPose()` in `rigs.ts`): the body flashes (the hit flash's 60%, fading over the first 25%), pops 12% bigger, then falls around its feet and fades out over the second half. **Creeps** (340 ms) tip back 0.35 rad and flatten into the ground (squash 72%, widen 20%; a flyer's squash pulls it down onto its shadow). **Bosses** (800 ms) tip only 0.12 rad, shudder (±1.6 px) and sink 6 px as they flatten. **Heroes** (560 ms) fall over backwards (1.45 rad; their shadow is separate, so it stays flat) and are hidden until they respawn. The particles (`fx.death`) play on top. A creep's sprite waits frozen for up to 160 ms after it leaves the snapshots, for its `kill` event (due one snapshot later), so the fall starts where it stood; a leak or no event releases it at once. At most 48 death reactions play at once.
- **The Heart** beats (lub-dub, faster below 30% HP), floats ±2.5 px, flashes and wobbles when hit. **Damage states** (`art/damage.ts`): under 60% HP the `cracks1` overlay shows ink cracks leaking ember light; under 30% `cracks2` splits it open, an additive heart-red blaze pulses with the beat, embers rise and the warning ring pulses. Crossing a threshold throws ruby shards, a flash and a small shake (not on a rejoin). Overlays are alpha 0 / 1, set only when the stage changes.
- **Portals** turn their swirl; at each wave start the additive `flare` frame (rune rays and a ring) swells and fades over 1.1 s (35% bigger on boss waves, which also get a red shock ring), with a rune ring and sparkles.
- Idle motion is subtle (≤ 0.5 px breathing); big motion is for things that matter (moving, shooting, being hit).

## 8. Effect colours

Effects (`render/fx/`) are client-only particles and sprites; their colours live in `render/palette.ts` (`COLORS`, `FX`, `AOE_COLORS`…), shared with the shapes and the HUD, and reuse the `RL` tokens where a meaning is shared (the Heart, portals, embers, runes, Grunt and Brute). **Never write a hex colour in an effect recipe (`fx/effects.ts`) or an effect call**: name it in `FX`. Rules for the dark ground:

- **Light** is warm (`FX.spark`, embers) or cool (`FX.moon`, moonlight); plain white only for white-hot cores (`FX.hot`).
- **Dust and smoke** are lighter than the moss (`FX.dust` `#9a8566`, `FX.smoke` `#6e6a80`, `FX.soot`), or they vanish on it; only burn marks are dark (`FX.scorch` = ink).
- **Damage numbers** are warm white (`FX.number`), crits pale gold (`FX.crit`), bounties gold; the glyphs carry a thick ink outline and a slight downward shade, so they hold over bright effects.

Keep these meanings:

| Meaning | Colour | Where |
|---|---|---|
| Gold, upgrades, level-ups | `#ffd24a` | `COLORS.gold`, tier pips, bounty numbers |
| Danger to you, leaks, taunt | `#ff5b5b` | `COLORS.bad`, Heart hit |
| Good / valid | `#5bff9c` | `COLORS.good` |
| Slow / frost | `#8fd3ff`, `#bfeaff`, Frost Nova `#9fe3ff`, Blizzard `#cff4ff` | `COLORS.slow`, ICE, `AOE_COLORS` |
| Root / snare | `#c8a165` | `COLORS.root`, `RL.snare` (the trap ring) |
| Stun | `#ffe066` | `COLORS.stun` |
| Shield / Iron Vow | `#ffd24a` | `COLORS.shield`, `AOE_COLORS.ironVow` |
| Fire (Fireball, Meteor) | `#ff8a3d`, `#ff5a1f` | `AOE_COLORS`, `ZONE_COLORS` |
| Ranger skills (Multishot, Arrow Storm) | `#e6ff7a` | `PROJECTILE_COLORS.multishot`, `ZONE_COLORS.arrowStorm` |
| Portals, enemy magic | `#8a4fe0`, Wisp `#b98cff` | `COLORS.portal` = `RL.portal`, `CREEP_COLORS.wisp` = `RL.wisp` (its hit sparks and death burst match its art) |
| Player-side magic, wave starts | `#7ffcd8` | `FX.rune` = `RL.rune` |
| Tower shots (muzzle flash, trail) | the tower's glow token: Arrow `rune`, Cannon `ember`, Frost `frost`, Arcane `arcane`, Flak `flare`; branches with their own glow override it (Void `voidGlow`, Prism `crystal`, Glacier `ice`, Hailstorm `snow`, Sniper / Skyguard `moon`, Mortar fire, Shrapnel ember light) | `SHOT_COLORS`, `BRANCH_SHOT_COLORS`, `shotColor(kind, branch)` |
| Blizzard pulse | `#cff4ff` shockwave, frost-light inner ring, flakes whirled out | `fx.blizzardPulse` (the tower swells too, §7) |
| Rain strikes (Arrow Storm, Meteor, Meteor Rain) | a volley of arrows `#e6ff7a`, a comet `#ff8a3d` with a white-hot head, a smaller quicker one for Meteor Rain `#ffb13d`, falling onto the strike; a ring at the strike radius, a flash, embers and a burn mark; faint sky streaks while a rain runs | `fx.rainImpact`, `fx.rainSky`; flights, thumps and the sky in `render/fx/rain.ts`. Streaks are short (60 to 120 ms): the sim says a strike landed, not that one is coming. Reduced motion keeps only the ring, flash and burn mark |
| Stun Storm and Shockwave strikes | Stun Storm `#c9a7ff`: a denser volley of violet arrows from higher, a violet ring and flash, a white-violet crackle (`FX.stunLight`) and stun stars floating up, a light thump; violet arrows in its sky. Shockwave `#ffd24a`: a gold comet from higher than a Meteor, white-hot flash, gold embers and debris, a gold band at the pull radius, a `FX.goldLight` ring closing in and dust rushing in (`pullMotes`), the hardest thump of the rains (0.34); slow heavy gold streaks in its sky | `fx.comboImpact` (on top of its own `fx.rainImpact` fall: `COMET` and `arrowRain` in `effects.ts` / `rain.ts`), `fx.rainSky`. Rings, flashes and the closing ring are essential (they stay at Low and under reduced motion); arrows, comets, crackle, stars and dust go |
| Falling meteors (Meteor, Meteor Rain, Shockwave) | rock, fire trail and smoke falling from the upper right onto a warning circle whose inner ring closes; flash, shock ring, debris, embers, a glowing scorch; red wash and sky meteors at the cast | `MeteorShow`, `fx.meteorStrike`; launched ahead of each pulse (§6, Falling meteors). Arrow Storm, Stun Storm and a meteor strike that had no meteor falling still use the short streaks above (a Shockwave one #83's gold comet) |
| Iron Vow ring (every living ally) | `#ffd24a` dashed ring that turns, `FX.goldLight` thin ring, `FX.goldDeep` glow, under the body | `vowLook` in `render/fx/vow.ts`, three sprites per hero in `world.ts`: blooms in, blinks over its last 1.5 s, dims out over the last 0.3 s. Reduced motion: steady, no bloom, turn or blink |
| Meteor Rain fuse (Arrow Storm + Meteor) | an amber `#ffb13d` flash and ring at the fused rain's mark and a smaller pair at each caster, a few rising embers; in the HUD a fire band across the middle of the screen: the two skills' names (`FUSE_COPY`), **Meteor Rain** large, both casters in their seat colours, about 2 s | `fx.rainFuse` (world, essential: it stays at Low), `CoopStage.fuse` and `#fuse-ribbon` (DOM), the beat from `readCues` (`beat.fuse`, from the protocol 16 `combo` event alone, so it shows even when a caster fell first and no `syncCast` came). No shake: the twin ribbon owns that. Reduced motion: the band fades instead of unrolling, no embers |
| Stun Storm and Shockwave fuse | the same rings and flashes in the combo's colour (Shockwave's first ring a double band), then each its own burst: Stun Storm crackles outward with stun stars rising (`FX.stunLight`, `FX.stunDeep`), Shockwave's gold dust rushes in to the mark before a few embers rise; in the HUD a violet / gold band (`#fuse-ribbon[data-combo]`) | `fx.rainFuse`, `CoopStage.fuse`. Reduced motion and Low: rings, flashes and the band only |
| The Heart; its blaze under 30% | `#ff3a60`; `#ff5a4a` | `COLORS.heart` = `RL.heart`, `FX.heartBlaze` |
| Zones by seat | `#4f9dff`, `#ff9f43`, `#b56cff`, `#3ddc84` | `PLAYER_COLORS` |

Light (glows, sparks, trails, muzzle flashes) uses **additive** blending; dust, debris and shadows use normal blending. A new effect reuses these meanings before inventing a colour.

## 9. Performance rules

The 300-creep stress scene (`?stress=300`) must stay **≥ 30 FPS** (MOBILE §7; `perf.spec.ts` checks the JavaScript per frame).

- **Bake, don't draw.** Everything is drawn once into the art atlas (`art/atlas.ts`: 1024 px pages at 2 px per world px, shelf-packed, tallest first) or the ground canvas; the map plate (§16) is one texture of the same size as that canvas (1664 × 3200, 21 MB of GPU memory, as the canvas was), so it costs one sprite and nothing per frame. Never create or redraw a `Graphics` per frame.
- **One sprite per creep** (shadow and weapon baked in; flyers add their shadow); rigs for heroes and towers use a handful of sprites. Dying creeps are pooled sprites too, capped at 48.
- **No per-frame visibility toggles.** In Pixi v8, changing `visible` (or adding / removing children) rebuilds the draw list. Hide parts with `alpha = 0`, flash with alpha, and only toggle `visible` when something really appears or disappears (culling, a pooled sprite coming back).
- **Tints are quantised** and set only when they change (a creep that isn't hit or slowed costs nothing).
- **Frames stay small:** at most 200 × 200 world px (the registry refuses bigger); size a frame to its drawing plus the glow (~8 px). Every page is 4 MB of GPU memory, so prefer reusing a frame (tint, flip, scale) over a near-copy. With every tower drawn (50 tower frames) the atlas is **2 pages**. The bake is timed as `tdt:art-bake` (a `performance` measure) and the first screen as `tdt:ready`: going from 1 page to 2 took the bake from ~10 to ~19 ms (median; ~52 → ~94 ms at 4× CPU throttling) and open → lobby from ~204 to ~214 ms (~663 → ~717 ms at 4×), Pixel 7 emulation, cold.
- **Busy pooled sprites go in their own render group, sorted by blend.** Falling meteors come and go several times a second: their two layers (`MeteorShow.ground`, `.air`) are render groups, so showing or hiding one rebuilds only their own draw list, and each head's sprites sit in three layers by blend mode (additive glows and trails, rocks, additive cores), so 16 meteors draw in three batches rather than about 50. Without both, the stress scene's JavaScript per frame rose by about a quarter.
- Pool sprites that come and go (creeps, projectiles, traps); rigs are pooled with their creep sprite. Projectiles and traps are atlas sprites (rotation, scale, alpha), not redrawn `Graphics`.

## 10. Adding a new entity (checklist)

1. **Read** this guide and look at `?showcase` (dev server: `npm run dev`, then `/?showcase`).
2. **Create one file** `apps/client/src/render/art/entities/<id>.ts`, named after its registry id (e.g. `archer.ts`, `frostTower.ts`). It draws its frames and calls `registerArt({...})` at the end. **Don't edit shared files**: `load.ts` imports every file in `entities/`, the renderer picks the art up by kind, and `?showcase` lists it.
3. Pick the category and its required frames (`REQUIRED_FRAMES` in `registry.ts`):
   - **creep**: `body` with contact shadow and weapon baked in, `flash` set (the silhouette without the shadow), `feet`, a `gait` from `GAITS`. A flyer draws its shadow as its own `shadow` frame instead (the registry refuses a flyer without one). Other looks go in `variants` (frames the size of `body`, each with a flash).
   - **tower**: `base1..3` and `top1..3` (top points +x), optional `<branch>.base` / `<branch>.top` for its two branches (`TOWER_BRANCHES`), `turret`.
   - **hero**: any frames (each with `flash: true` for the hit flash), `feet`, a `stand(to, now)` (the rig's rest pose as plain placements, for the lobby's hero stage, §12: the same parts, order and offsets as `pose()` standing still, breathing with `breath(now)`; `test/stand.test.ts` checks it) plus a `rig(kit, mine)` returning a `HeroRig`: extend `HeroRigBase`, make parts with `this.part(frame)` and pose them in `pose()` (walk, attack from `shotAt`, cast from `casting()`); see `ranger.ts`, `warden.ts`, `arcanist.ts`.
   - **projectile**: `body`, pointing +x, no shadow. `kind` is the snapshot style. The renderer rotates it along its travel and scales it with creeps (the creep scale). See §6.
   - **trap**: `idle`, `armed` and `ring`, from above, plus `ringRadius` (the ring circle's radius in world px). The ring is scaled to the snapshot radius; the coil uses the creep scale. See §6.
4. Use **tokens only** (`k.<token>`; add new ones to `RL` and to §2), the **painter** calls (§3), light from the upper left, glow only on emitters.
5. Follow the **camera** (§5) and **size** (§6) rules; check the phone-size copy in `?showcase` in both Normal and Bright.
6. Animate with transforms, tint and alpha only (§7, §9).
7. Run `npx vitest run --project client` (the art tests check ids, frames, sizes and packing), `npm test` and `npm run build`. Then two browser tests, from `apps/client` after `npm run build:e2e -w @tdt/client`: `npx playwright test e2e/art.spec.ts --project=pixel` (the showcase test finds your file by name) and `npx playwright test --project=perf --no-deps` (the stress test keeps ≥ 30 FPS). CI runs the rest (`CLAUDE.md`, Session rules).
8. Update §1's status line and, if you decided something new, this guide and the Decision Log.

A **prop** (category `prop`) is a file too: frames are its variants, `where` says forest or clearing, `weight` how often it is picked; the ground painter places it (§4). Check it in the real map as well as `?showcase` (it must not look like a creep or something to tap).

A **new category** is the one case that touches shared files: add its type and required frames to `registry.ts`, its use to `render/world.ts`, its cards to `showcase.ts`, and a section here. Projectiles and traps are that case (§6).

## 11. Files

```
apps/client/src/render/art/
  tokens.ts        RL palette tokens, Display, LIGHTING, liftColor
  paint.ts         The painter (part / detail / accent / line / shadow), LINE weights, path helpers, hash
  parts.ts         Shared drawing helpers (planks, stone blocks, rune rings, tower tier runes)
  registry.ts      registerArt, entry types by category, REQUIRED_FRAMES, lookups (creepArt, towerArt, projectileArt, trapArt…)
  stand.ts         A hero's standing pose as placements, its box, and the fit into an area (pure, tested); drawn by lobby/heroStage.ts
  load.ts          Imports common.ts and every file in entities/ (import.meta.glob)
  common.ts        Shared frames (contact shadow)
  atlas.ts         Bakes every frame into 1024 px pages (+ flash silhouettes); re-bakes on Display change
  kit.ts           ArtKit: the atlas, sprite(id, frame), setDisplay
  rigs.ts          CreepRig, TowerRig, HeroRigBase, GAITS, HIT_FLASH, DEATH / deathPose (hit and death reactions), breath
  ground.ts        The ground painter
  scatter.ts       Where props go (pure, tested)
  damage.ts        The Heart's damage stages (pure, tested)
  icons.ts         UI icons (§12): drawn with the painter, baked to CSS images
  entities/        One file per entity (ranger, warden, arcanist, grunt, archer, runner, brute, wisp, hatchling, ironhorn,
                   matriarch, shardback, arrowTower, cannonTower, frostTower, arcaneTower, flakTower, heart, portal, pad,
                   tree, rock, mushrooms, runestone; projectiles: arrowShot, cannonShot, frostShot, arcaneShot, flakShot,
                   rangerArrow, critArrow, multishotArrow, arcanistBolt, fireball, archerArrow; traps: snareTrap)
apps/client/src/render/art3d/ 3D heroes rendered ahead of time (§15): <hero>.json (layouts), <hero>-match.png (sheet),
                              layout.ts (types, cycleFrame / drawStep / progressFrame / walkCadence / fitStage),
                              sheet.ts (loading), heroRig.ts (Hero3DRig, one rig for all three), index.ts (heroRig3d)
apps/client/src/lobby/stageBackdrop.ts  The stage's rendered clearing, poster and video (§12, §15)
apps/client/public/stage/     The stage files (§15): <hero>.mp4 / .webm, <hero>-poster.webp, clearing.webp
apps/client/public/map/       The map plate (§16): spire.webp, spire-extra.webp (the extra pads' patches)
apps/client/src/render/plate/ The plate's layout (spire.json), layout.ts (types, pure rules), load.ts (decode, textures); card.* (the
                              link card's plate, dev only)
tools/blender/                The 3D pipeline (§15): hero.py (the hero table), tdt3d/, assets/kaykit/ (CC0 source models);
                              mapdata.ts and tdt3d/map.py, the map plate (§16)
apps/client/src/showcase.ts   ?showcase dev page (entities, variants, the 3D heroes, creeps and stage loops, UI icons, sounds)
apps/client/src/lobby/heroStage.ts  The home card's hero stage (§12): the picked hero drawn large with Canvas 2D
apps/client/src/ogCard.ts     ?ogcard: the link-preview card's frame (§14); scripts/ogImage.ts writes public/og-card.png
apps/client/src/audio/        Sound (§13): synth, sound bank, mix, score, engine, music, game events → sounds
apps/client/src/style.css     The Runelight UI (§12)
```

## 12. UI

The DOM UI follows the same look (`style.css`, variables at the top of `:root`):

- **Panels** (top bar, popups, team, settings, lobby card, end card, chips): mossy dusk darkening to ink (`--panel`), an ink outline, a moonlit hairline on the upper-left inside edge and a soft night shadow (`--panel-shadow`). The phone top bar adds a thin gold trim underneath.
- **Buttons** are carved stone (`--stone`, `--stone-rim`); the main action (`.btn.big`: Play, Ready, Got it) glows rune-teal; selected choices get a rune outline and a teal-tinted stone; "value" is gold (costs, gold, skill ranks, learn buttons).
- **Titles** (logo, banner, end title, headings, stat labels) use the carved serif stack `--title-font` (Palatino / Book Antiqua / Georgia: system fonts, no downloads); body text stays system sans.
- **Radial menus and skill buttons** are stone medallions: radial buttons rimmed in rune-teal (gold while a build button is held for its preview), skill buttons in moonlight, with a code-drawn icon, the key letter as a small badge, pips and a conic cooldown.
- **Icons** are drawn in code (`render/art/icons.ts`) with the painter and tokens, in a 40 × 40 box, bold enough for 20–32 CSS px: a tower icon per kind, a skill icon per hero and slot, a hero emblem per hero, and HUD glyphs (coin, Heart, cracked Heart, wave, timer, gear, upgrade, sell, target, level). `installIcons()` bakes them once at start-up to PNG data URLs published as `--icon-<id>`; an element shows one with `class="ico" style="--ico: var(--icon-<id>)"` (or `background-image`). No icon packs, fonts of symbols or image files. A new tower, hero or skill needs its icon (a test checks).
- **The 3D stage** (`lobby/stageBackdrop.ts`, V-05a, V-05b, §15): the clearing is a picture rendered ahead of time in Blender, and every hero (all three are made in 3D) stands in it as an 8 s video loop. The poster (the loop's first frame) shows at once; the video loads after the first screen is up and fades in over it; under reduced motion, data saver, blocked autoplay (iPhone Low Power Mode) or an error the poster stays. Only the live stage's video plays, and it pauses when the stage stops or is hidden, off screen, or the page is hidden. All three share one clearing, framed the same (one fit, `fitStage`), so picking another hero swaps the hero and never moves the ground: the empty clearing shows while the next poster decodes, then the poster, then that hero's video. A hero with no 3D stage would be drawn as below over the empty clearing. The CSS clearing below shows only until the pictures load.
- **The home card's hero stage** (`lobby/heroStage.ts`, V-01): the first thing a player sees is the picked hero, large, on a moonlit clearing under the title. The clearing is CSS (`.hero-stage`: night sky, two tree lines, lit moss, moonlight behind the hero, a few motes, night closing in at the edges). The hero is a canvas drawn from its own art: each frame is drawn once at the stage's size (vector paths: sharp at any size, with room around it so a glow is not cut), then placed by the hero's standing pose (`HeroArt.stand`) 30 times a second, on a pool of the hero's colour and a contact shadow. Every hero gets the same scale (`standRoom`, `fitStand`), feet on one ground line, clear of the title. A newly picked hero steps in (220 ms). Nothing is drawn while the stage is hidden, and under reduced motion it is one still drawing with no entrance. A new hero needs `feet` and `stand` (§10). Look at it on a phone and a desktop: the Ranger's bow is held further out than in a match so the string clears its face, the Warden's sword is lower than at rest so the figure is not all blade.
- **One screen per card** (Han, 17 Oct 2026; V-02 before it): the home card and the room card each fit a 412 × 839 phone with no scrolling. **The home card** carries the mode: under the hero buttons, the role and one line comes **Mode**, one segmented stone row (`.segmented`: a carved trough, a stone segment per choice, Full 30 waves / Quick 15 waves, the pick rune-outlined and teal-tinted, as a selected hero button; remembered in `tdt.mode`), then Play solo, which starts the match with that hero and mode at once (there is no solo pick, no Difficulty and no modifiers; every match is Normal). Play with friends follows under the fold; for a friend who came by an invite link the nickname and Join come first and Mode and Play solo after them. A build with no game server shows the same card without the friends' controls. **The room card** leads with the code, large, and **Copy invite link** beside it; the players are seats, one per lane (the hero's emblem from `icons.ts`, the name, the hero, then **Host**, **Ready**, **Not ready** or **reconnecting…**, in the hero's colour along the seat's edge), each empty seat a dashed "Open seat: send the invite link"; then your hero (the hero buttons, the role and one line; no stage, so the seats stay near the top) and Mode as on the home card, the host's pick, greyed for a guest with "(the host picks)". On a phone each label sits over its control; on a wider card it sits to its left, on the line of the control's first text. With three seats filled the card fits 412 × 839 for the host and a guest. On a desktop the home card's stage is a little shorter on screens under 850 px tall, so the whole card still fits 1280 × 800. **One stage draws** (the home card's); it stops whenever its card is hidden, and under reduced motion it is one still drawing.
- **One main button per lobby screen**, the only rune-teal one on it. On the home card it is Play solo, under Mode; for a friend who opened an invite link it is Join room. On the room card it is **Ready** (a guest) or **Start match** (the host), **docked** at the bottom of the card (`.pick-dock`, sticky, over the card's own bottom colour) with Leave in stone beside it, so it stays on screen at 390 × 664 too. "New here? **Learn to play**" (a link-style button, `.learn-link`) is one quiet line under Play solo on the home card, only before a player's first solo match. Everything else on the card is carved stone.
- **End screen:** the Heart emblem, whole and beating on a victory, split on a defeat, over a gold-trimmed card.
- The e2e layout tests check the UI stays clear of the map; keep panel sizes as they were when restyling (a heading one pixel taller moved the desktop tower panel under a test's wheel point).

## 13. Sound

Sound follows the same rules as the art: **made in code** (Web Audio API, no sound packs) and **baked once**, with one addition: **any piece can be replaced by a recorded file** without touching code (`docs/SOUND_FILES.md`). The code lives in `apps/client/src/audio/` (`index.ts` lists the files).

**The theme.** The **lobby is a Japanese garden**: koto, shakuhachi, a slow soft taiko. **Matches are a Three Kingdoms war epic**: war drums, gongs, war horns, the erhu and the dizi, the guzheng, bowstrings and clashing steel. Everything original: our own synth models and our own tunes, no samples or melodies from any game. Pitched effects use the match music's scale, **D yu** (D F G A C, the Chinese minor pentatonic), so they never clash with it; the lobby is in the D **in** scale (D E♭ G A B♭). Nothing harsh: saws always go through a filter, noise is always filtered, and a unit test checks every sound's brightness (RMS of the first difference over the RMS; ≤ 0.9, about a pure sine at 3.5 kHz).

- **Synth** (`synth.ts`, pure, tested): a sound is data (`SynthDef`): layers of tone, string or noise, each with an attack, a hold, an exponential decay, a pitch glide (which can start late: a string pressed after the pluck), a delayed vibrato, partials, a filter that sweeps or **opens with the envelope** (brass and bows brighten as they swell), soft saturation and a detuned copy, plus an echo. The instrument models:
  - **plucked strings** (koto, guzheng, bowstrings): Karplus-Strong with a **fractional delay** (so a string stays in tune, bends and shakes: a test checks the pitch), the pick's hardness, where it's plucked and a loop filter, plus the pick's click and the wooden body;
  - **drums** (taiko, war drums, tanggu): the head's inharmonic membrane modes whose pitch **drops as the skin relaxes**, the shell's low boom, the stick's slap and the air pushed out; a **roll** builds strokes that speed up and grow, the hands alternating;
  - **gongs**: inharmonic partials in close pairs that beat (the **shimmer**), the upper ones **blooming in** after the strike, a felt thud and a wash of air; big gongs sag in pitch, the small opera gong rises;
  - **steel on steel**: a strike and two blades' inharmonic rings; **war horns**: a scooped, saturated saw pair whose filter opens as it's blown, breath in the bore; **erhu**: a bowed saw, nasal, a late vibrato; **dizi**: a bright, slightly buzzy flute with breath and a tongued start; **shakuhachi**: breathier, bending up into the note.
  `renderSound` renders at **24 kHz**, normalised to a 0.9 peak, deterministic. The hot loops run partials one at a time as rotation oscillators (re-aimed every 16 samples when the pitch moves), so the whole bank (~140 buffers, ~160 s of audio) bakes in ~0.7–0.9 s of CPU in Node, ~1.5 s in headless Chromium, in the worker.
- **Bank** (`sounds.ts`): every effect with its **volume**, **cooldown** (ms between two plays; yours and others' count apart), **most voices at once**, **priority** (0 frequent and skippable, 1 normal, 2 must be heard), **group** (the combat background: `shot` for every tower's shots and the Blizzard pulse, `fall` for creeps falling, `coin` for bounty coins), **variants** (4 for frequent sounds, 3 or 2 for longer ones, 1 for the end fanfares), **wet** (reverb send) and **pitch** spread (±3% for hits, ±0.6% for tunes); and the music's instruments (koto, shakuhachi, taiko, shime; guzheng, erhu, dizi, war drum, tanggu, rim, gong, small gong), pitched ones baked at several roots so no note plays more than 6 semitones from its sample. A new tower, hero or skill needs its sounds here (a test checks every tower kind, hero attack and Q / W / R) and a row in `public/sfx/README.md` (a test checks that too).
- **Every play is a new take** (`Takes` in `mix.ts`, tested): another baked **variant** (never the same twice in a row; variants move each layer a few ms, a little louder or softer, a hair sharper or flatter, and use their own noise, so a string's pick and a drum's skin differ), the pitch within the sound's spread, ±1.5 dB, 0–14 ms late (warnings and the UI 0–5 ms), and the **room reverb** send ±20%. The room is a code-made impulse (`roomImpulse`: early reflections and a 1.1 s tail that gets darker, a wooden hall) in one ConvolverNode that effects and the code-made music send into. The impulse is **scaled to unit energy**, so the room is as loud at every sample rate, and comes back at `ROOM_RETURN` (1.55): a frequent sound's room (a send of 0.2) is about **10 dB under the sound**. Until the 8 Oct playtest the impulse was unscaled (+19 dB at 48 kHz, +16 dB at 24 kHz: its samples keep their size and a longer tail has more of them) and came back 4 dB *over* the sound that fed it, so every shot left a second of wash, fifteen times a second. A big moment that needs more hall gets more through its own send, never by raising the room. The code-made music's send (`MUSIC_ROOM`) makes up the difference, so the score keeps the room it was mixed with (the recorded music files play dry).
- **Baking:** after the first tap a Web Worker (`bake.worker.ts`) bakes the lobby's instruments first (the music starts at once), then the UI, the match's instruments, every effect's first variant, then the other variants; a sound asked for before it is baked is skipped (a variant falls back to the first).
- **Events → sounds** (`gameAudio.ts`, tested with a fake sink): only from what the client already gets: events (kills, leaks, waves, casts, level-ups, tower builds / upgrades / branches / sales, rejections, the end) and two facts the renderer derives (`onTowerShot` when a tower's projectile appears, `onMeleeImpact` when the Warden's blade visibly lands). Ranged attacks sound on their `heroAttack` event, melee ones on the impact. Branch shots play their tower's sound at another pitch (`BRANCH_RATE`: Sniper, Mortar, Void lower; Volley, Prism, Hailstorm higher); upgraded towers a touch lower; small creeps fall higher, big ones lower. A wave starts with a **war horn**; a boss wave with a **drum roll into a great gong**; the Heart's warning is a low alarm gong struck twice.
- **Mixing** (`mix.ts`, pure, tested): **the music leads, the combat background sits under it, and your hero and the moments that matter stay on top** (ultimates, wave and boss starts, the Heart, level up, build, upgrade, repair). Your hero, towers and kills play at full level, a teammate's at 50%; on-screen sounds at full level panned a little to their side, off-screen ones from 60% fading out over 8 tiles and then skipped (yours never are). Voices are capped at 12 for priority 0, 20 for priority 1 (yours get +1, except the combat background), 26 for warnings, and each sound has its cooldown and most-at-once, so 300 creeps never make noise. The **combat background** also shares **one budget per group**, whoever's it is (`GROUP_BUDGETS`, on top of each sound's cooldown): one tower shot every 140 ms and three ringing at once over every tower kind, a creep's fall every 200 ms, a coin every 450 ms. Its levels: tower shots at half what they were before the 8 Oct playtest, falls and coins at 0.7; your hero's attacks and Q / W a quarter up, each attack louder than any tower's shot. The brightest frequent sounds were softened: the Frost shot has no bell, the coin is one soft low clink, the Warden's hit is a thud with a short dull ring. Measured on waves 10–14 of a solo Quick match (Ranger, casual bot, seed 1; `battleSound.test.ts` repeats it at the default sliders): 7.4 effects a second (15 before), tower shots 4.6 (11), the effects 11 dB under the music dry (3 dB under before) and 10 dB under with the room (4 dB over before). A compressor on the master bus catches the rest. **Muted or at 0% nothing is even considered.**
- **Music** (`score.ts` + `music.ts`), code-made when there's no file: the **lobby** (66 bpm, 16 bars): koto patterns strummed over a low string, a shakuhachi tune with room for the koto to answer, one soft taiko stroke a bar and a double one into each phrase; the **match** (104 bpm, 16 bars) whose layers follow the match: `base` (a rolling guzheng pattern that sweeps up the scale every fourth bar, a low erhu drone, a distant war drum) while building, `pulse` (the war drums, the erhu's tune and its bass line) during waves, `boss` (a great gong every four bars, the small gong, the tanggu's sixteenths, extra war drum strokes and the dizi above) on a boss wave or while a boss lives; layers fade in over ~1.5 s. Every note is **humanised** (`humanize`: early or late within its player's looseness, drums ±4–6 ms, the shakuhachi ±30 ms, downbeats tighter; velocity −10…+10%; different on every pass of the loop), chords are strummed, and sustained notes (shakuhachi, erhu, dizi) are held to their length and faded. **Levels** (the offline `mixdown`, tested): lobby about −16 dB, build −20, waves −15, boss −14 (the old lobby was −21.6, now as loud as the match). A victory or defeat fanfare plays in 4.5 s of quiet, then the lobby. A look-ahead scheduler queues notes 0.3 s ahead on the audio clock every 80 ms, so music never depends on the frame rate.
- **Recorded files** (`files.ts`, `fileList.ts`, docs/SOUND_FILES.md): the build lists `public/music/{lobby,match,boss}.mp3` and `public/sfx/<sound id>.mp3` (the `tdt-sound-files` Vite plugin; unknown names and oversized files get a build warning), so a file plays after the next deploy with no code change. A **music** file replaces its scene's code-made music (`boss` falls back to `match`, then to code); the code-made music plays while a file downloads and if it can't be loaded; only the lobby's, or the match's and boss's, are kept decoded (a decoded two-minute loop is ~45 MB). An **effect** file replaces its synth sound, levelled to it, and still gets a take (pitch, level, timing; a third of the reverb). Every file has the **encoder's silence trimmed** at both ends (below −66 dBFS, at most 1 s each; music loops between those points, so a loop cut on the beat has no gap) and its **loudness measured** (gated like a broadcast meter) and evened out: music to −15 dB (the code-made match's level), effects to the sound they replace, within ±12 dB and never into clipping. The **service worker never precaches** them: each is cached the first time it plays (`tdt-media`, kept across deploys; the URL carries the file's hash, so a new upload replaces the old copy).
- **Mobile** (`engine.ts`): the AudioContext is created on the first tap or key press (iOS needs a gesture; a silent buffer is played in it for older iOS); on iPhone the audio session is **ambient** (`navigator.audioSession`, Safari 16.4+), so the silent switch mutes the game and other apps' music keeps playing. Hidden page (another app, screen locked) → the context is suspended; back → resumed, or on the next tap if the browser insists. A sound that fails to start never breaks the game.
- **Settings:** ⚙ → Sound: a mute button and Music / Effects sliders (defaults 50% / 80%, 5% steps, squared to gain so the slider feels even), saved in `tdt.settings`; the lobby has a speaker button that mutes too.
- **Check:** `?showcase` → Sounds plays every effect at its in-game level, a new take each tap (**×4** plays four in a row to hear that no two match), marks effects that come from files, and plays each music scene, saying whether it's code-made or a file; `docs/MOBILE_TESTING.md` §8 is the real-device sound check; `battleSound.test.ts` keeps a late wave calm (effects a second, their level against the music, the room, your attack over the towers).

## 14. Social card and boot splash

Two first impressions sit outside the match and follow the same rules.

**The social card** (`apps/client/public/og-card.png`, 1200 × 630, the `og:image` / `twitter:image` in `index.html`) is what Reddit, Discord, X and chat apps show under a shared link. It is the game's own art, never a separate illustration: `src/ogCard.ts` (the `?ogcard` page, dev server only) builds a small landscape map (30 × 16 tiles, `src/ogMap.ts`: three lanes sweeping from violet portals into the Heart, stone pads tinted in their zone's seat colour) with `buildMap`, draws its ground as that map's own rendered plate (§16; `src/render/plate/card.webp`, dev only), and poses the real atlas sprites and rigs at fixed times: towers at tiers 1–3 and one branch, creeps and the Ironhorn on the lanes (runners tinted by frost), the three heroes one per lane (the Ranger mid-shot, the Arcanist mid-cast), projectiles and glows from the fx atlas, the logo from the lobby (`.logo`, the title font) on the forest shade at the bottom. Units are drawn larger than their tiles (heroes ×1.8, creeps ×1.45) so they still read in a 500 px wide preview. Moonlight from the upper left, ink outlines and glow only on emitters come for free from the painter; the vignette is a CSS scrim over the canvas.

- **Generate:** `npm run og -w @tdt/client` (`scripts/ogImage.ts`) starts the Vite dev server, screenshots `?ogcard` at 2× in headless Chromium, averages each 2 × 2 block (supersampled, like the icons), quantizes to 176 colours with a light dither (`scripts/quantize.ts`; ~910 KB → ~290 KB: since V-03 the card's ground is its map plate, §16, whose moss has more fine detail than the painted ground's, and 256 colours came out at 335 KB) and writes the palette PNG. The frame is deterministic: two runs on one machine write the same bytes. The wordmark uses the machine's fonts (Palatino, else Book Antiqua, Georgia, then the system serif), so look at the result before committing.
- **Check:** at full size and as a ~500 px and ~240 px thumbnail; the logo stays inside the middle 600 px, so a square crop (some chat apps) still shows the whole title. Keep it under ~300 KB (a test checks the size and the 1200 × 630 header).
- **Change the art → regenerate the card.** Crawlers cache an image by URL for days to weeks, so a new card needs a new file name (`og-card-2.png`, and update both tags) to show on links already shared (docs/PRESS.md §4).
- The service worker does **not** precache it (`PREVIEW_FILES` in `platform/swSource.ts`): only crawlers fetch it, and a player's phone would download it on every deploy for nothing.

**The boot splash** (`#boot`, inline in `index.html`: markup and a small `<style>`) paints as soon as the HTML and the stylesheet arrive, before the app's script has loaded, so a phone on a slow network shows the title instead of a bare HUD while the bundle loads. It copies the lobby's background (the same radial gradients as `.lobby`) and its logo (white "Tower Defense", rune-teal "Together" with its glow), with three rune diamonds that pulse in turn and a "Loading…" line. Under `prefers-reduced-motion` the runes stand still. `main.ts`'s `ready()` (every screen: the lobby, the no-server home card, showcase, progress, stress) adds `done`, which stops it taking taps at once and fades it out in 0.25 s, then removes it. If `main()` throws, the line reads "The game could not start. Refresh to try again." The **start-up watchdog** (`startup/boot.ts`; docs/ANALYTICS.md "Start-up reasons") changes the line when the game is not ready after 15 s of the page being on screen ("Still loading. This can take longer on a slow connection.": start-up keeps going and `ready()` still removes the splash) or when WebGL cannot start at all or is lost ("This browser could not start the game's graphics."); each shows the splash's **Reload** button (`#boot-reload`, hidden in the markup, shown by `startup/splash.ts`). Two Pixi 8.21 start-up hangs are closed in `GameView.create`: WebGL only (`isWebGLSupported()` once, `preference: ['webgl']`: Pixi would otherwise wait on a WebGPU adapter request with no timeout), and `startup/glGuard.ts` (a lost context made Pixi's texture-limit probe loop for ever, a frozen page no timer can reach; the guard makes the call throw while `app.init()` runs). The splash has no art of its own and no JavaScript; keep it that way (it must paint with only the HTML).

## 15. 3D heroes and creeps, rendered ahead of time

**Han, 14 Oct 2026.** Heroes, then creeps and towers, are **3D models rendered ahead of time** into pictures and videos by Blender scripts in the repo. **Nothing 3D runs on the player's device**: no three.js, no glTF, no second WebGL context, no model file loaded by the client (`test/art3d.test.ts` checks the source and the shipped files). Three throwaway trials led here: the Ranger built from three.js primitives looked toy-like; the Ranger made in Blender and shown live with three.js looked clearly better, but live 3D crashed Chrome's graphics on a Pixel 10 Pro now and then and took the whole game's graphics with it; the same Blender Ranger rendered ahead of time never crashed.

**Han, 16 Oct 2026: the models come from packs, not from code.** V-05a modelled the Ranger in code (cages, lathes, a skeleton with IK, proportion rules): every round was slow, the figure looked wrong, and the renders ran at four times the display size. The heroes are now the **CC0 KayKit models** in `tools/blender/assets/kaykit/` (`README.md` there: Knight = the Warden, Mage = the Arcanist, Rogue_Hooded = the Ranger) with **the packs' own clips**. What V-05a built and works stays: the painter (`npr.py`) that turns Cycles passes into Runelight's cel bands, moonlight, teal rim and ink; the clearing; one picture of hero and scene; the fringe check; the stage video and match sheet formats; the rigs on `HeroRigBase`; the encode. V-05b (PR #108) brought all three heroes in this way, V-05c every creep and the three bosses (below: creeps and bosses); V-05d the towers, the Heart and the portals follow. **Han, 17 Oct 2026 (Pixel 10 Pro): V-05b's 1200 × 450 stage was blurry next to V-05a's Ranger** (soft edges, weak eye glow, thin ink), so its round 2 (PR #109) put the stage back at 2400 × 900 with V-05a's pixel sizes: why, below (the stage loop).

### The pipeline

```
tools/blender/
  build.py         the entry: import heroes and creeps, render their outputs, write their layouts (npm run art:3d)
  art3d.mjs        npm run art:3d: finds a Python with bpy and scipy, checks ffmpeg, runs build.py
  hero.py          the hero table: one row a hero (model, props, colour map, clips, stage loop, match frames)
  creeps.py        the creep table: one row a creep kind (model, props, colour map, clips per state, frames)
  contact.py       the contact sheet: the three heroes side by side, from the shipped files
  edges.py         the edge sheet: 300% crops of a hero's edges as a 3× phone shows the stage, before and after
  requirements.txt bpy 4.5.14 and scipy, for Python 3.11
  assets/kaykit/   the CC0 source models, props and clips (glTF only; never shipped to the client)
  assets/quaternius/ the CC0 Ultimate Monsters the Wisp and the bosses come from (glTF, their own clips)
  tdt3d/
    palette.py     the Runelight tokens, read from render/art/tokens.ts (a colour is never copied by hand)
    gltf.py        importing a character (its Rig_Medium armature, scaled, facing +X), its props on the hand
                   slots, every face repainted from its palette cell to a token; the clip packs
    figure.py      a hero from its table row: clips read by bone name at any time, poses blended, the bow's
                   string (the bow's own shape key) drawn as far as the hand comes back, the arrow nocked or flying
    motion.py      the stage loop (the idle with the signature move eased over it) and the match frames' moments
    bake.py        a posed loop written into f-curves (motion blur needs them)
    shading.py     materials: a white diffuse body for the moon's light plus AOVs (albedo, glow, AO, rim, moonlit
                   edge, fill, sheen, height, id); each material's line weight and flags
    scene.py       Cycles on the CPU, the moon (a sun lamp in its own light group), cameras placed to the pixel,
                   rendering a frame (or a whole-pixel box of it) into numpy passes
    npr.py         the painterly look in numpy: cel bands, AO, rim and moonlit edge, sheen, glow, tinted ink lines
    geom.py        the clearing's smooth meshes: quad cages under a subdivision surface (lofts, tubes, lathes, blobs)
    clearing.py    the lobby's moonlit clearing (shared by every hero), in near, middle and far layers
    stage.py       the stage loop: the plate at 2×, the hero at 1×, one picture made of them, the air, the grade, the check
    fringe.py      the fringe check (scripts/fringe.ts is the same, for the unit test)
    match.py       the match sheet: the layers with white twins, and their layout
    creep.py       a creep's match sheet: its states' frames, trimmed and packed 2048 wide, the fringe check on each
                   (over the lane), its contact shadow, the Shardback's hide masks; the two-page budget check
    encode.py      ffmpeg: the MP4, the WebM, the WebP poster and stills, each searched to its size budget
    imageio.py     PNG writing (deterministic) and reading
```

**Run it.** `npm run art:3d -- heroes` builds all three heroes and writes everything (one render of the clearing, shared); `-- warden` one hero, `-- ranger,arcanist` several; `-- creeps` the nine creeps and bosses (match sheets only, about 3 minutes), `-- grunt,wisp` some of them; `-- warden match` or `-- warden stage` one part; `-- ranger plate --scale 0.5` the empty clearing alone; `--draft` renders the stage at half size with no supersampling, fewer samples and no motion blur; `--frames 0,120 --out DIR` writes single stage frames (with their fringe check) to look at; `--work DIR` keeps every finished frame and the plate, so a render cut short resumes where it stopped (`--plate-cache FILE` keeps only the plate); `--layout-only` prints each hero's loop box against the shared one without rendering. It needs **Python 3.11 with `tools/blender/requirements.txt`** (`python3.11 -m venv .venv-blender && .venv-blender/bin/pip install -r tools/blender/requirements.txt`, or `TDT_BLENDER_PYTHON` pointing at one) and **ffmpeg with libx264, libvpx-vp9 and libwebp** on the PATH. On a headless Linux box Blender's module also wants `libegl1`. Then `python tools/blender/contact.py` writes the contact sheet (`docs/screenshots/3d-heroes/`). **CI never runs Blender**: the outputs are committed, and `test/art3d.test.ts` checks the layout data against the images and runs the fringe check on the committed fixtures.

**Importing a hero** (`gltf.py`, `hero.py`). The character's `.glb` is imported with the glTF importer (Blender bone heuristic, no bone shapes), its armature turned a quarter so the figure faces +X (the pack's figures face glTF +Z, Blender −Y) and scaled so it stands as tall as its 2D rig, crown to soles (`render/art/entities/<hero>.ts`: the Ranger 26.5 world px, the Warden 32 to the helm, the Arcanist 28 to the hat). With that heuristic a bone's rest frame is exactly its glTF node's frame turned Y-up to Z-up, so **a prop hangs on the pack's own attachment bones** (`handslot.r` and `handslot.l`, children of the hands in the Rig_Medium skeleton) as an engine attaches it, and only where a prop sits wrong for the game does the table turn it: the bow (`bow_withString`) on `handslot.l`, turned round its limbs so its string faces the archer, the arrow (`arrow_bow`) placed every frame from the string's nock through the bow hand, the quiver on `chest`, on his back; the sword (`sword_1handed`) on `handslot.r` and the shield (`shield_round`) on `handslot.l`, as the pack places them; the staff on `handslot.r`, as the pack places it (an upright staff in the near hand held the gem over the face).

**Runelight on top.** The pack's palette texture is a grid of 8 × 4 colour cells; each face's cell (the mean of its UVs) names a material the table maps to a token, per hero and, where one cell means two things, per mesh (`colours`, `overrides`). A face in a cell the table doesn't map stops the build, so **no pack colour reaches a frame**. The flags come out as they did for the code-built Ranger: `emit` for the eyes (the Ranger's under his hood and mask, the Warden's inside his helm, which is dark as the 2D Warden's visor) and the staff's gem, `metal` for steel and gold, `shade`, `rim` and `fill` for the faces and leathers. The Ranger in the 2D Ranger's leaf greens and leathers, his face in the hood's shadow behind a dark mask; the Warden in moonlit steel (`plate`) under a blue cape (`wardenBlueDark`), a blue shield with a gold boss; the Arcanist in a plum robe and hat (`robe`, `robeDark`), with silver hair (`stone`, a step darker than the face so the two read apart), a gold hat band and the staff's pink gem (`staffGem`). Same moon, same rim, same ink weight for hero and scenery. Checked as a greyscale frame (`docs/screenshots/3d-heroes/greyscale.webp`): the Warden's steel, the Arcanist's gem and the Ranger's eyes and lit hood are the lightest things on their stages but for the moon, level with the glowing mushrooms and the motes, and each hero reads from the clearing by value alone.

**Clips by name.** The animation packs (`animations/rig_medium/`) share the Rig_Medium skeleton with the characters, so a clip is read by bone name (`figure.Figure.sample`: the action's keys evaluated at any time) and played on any character; nothing is retargeted by hand and no pose is edited. The idle is `Idle_A`, the walk `Walking_B`, the flinch `Hit_A`, the death `Death_A`; the Ranger's shot `Ranged_Bow_Draw`, `Ranged_Bow_Aiming_Idle` and `Ranged_Bow_Release` (his sky casts `Ranged_Bow_Draw_Up`); the Warden's swing `Melee_1H_Attack_Slice_Horizontal` and his block `Melee_Block` (held with `Melee_Blocking` on the stage); the Arcanist's summon `Ranged_Magic_Summon`. Where a clip's pose hid the face at match size another from the same pack took its place: `Ranged_Magic_Spellcasting` holds the gem over the Arcanist's face, so Frost Nova lifts the staff with `Ranged_Magic_Raise` and Fireball is the attack's thrust from `Ranged_Magic_Shoot`; Meteor is the raise at the end of `Ranged_Magic_Summon`.

**Why Cycles and numpy.** Eevee needs a GPU context; on a headless container it falls back to software GL at ~50 s for a thumbnail. Cycles on the CPU renders the passes in seconds. Every surface is a white diffuse body, so the moon's light-group pass is exactly the light that reaches it (Lambert and cast shadows, 0..1); what it is made of goes out as AOVs; `npr.py` paints the frame from those, in display values, as the 2D painter mixes them. That gives the look exact control and outlines exact pixel widths at any output size. Three traps: a material declared again keeps its number, or its id and its flags part ways; a pixel on the edge between two parts carries the average of their ids, which names some other material, so `npr.ids_of` gives such pixels the id of the nearest clean pixel; and the sky dome, the stars and the moon's disc cast no shadow (`visible_shadow` off), or the dome shades the whole clearing from the moon.

**Determinism.** The scripts use no randomness (scattered scenery uses a hash; noise textures and the film grain are fixed), Cycles uses a fixed seed, PNGs are written byte for byte the same. ffmpeg's encoders are run with bit-exact flags. A re-render on the same machine and Blender version gives the same picture, but not quite every pixel: Cycles' threads can flip a few hundred edge pixels, and the x264 and libvpx encoders are threaded, so a re-encoded video may differ in a few bytes (and its hash, so the service worker fetches it again).

### The quality bar

Han's notes come first: **one picture** (the hero and the clearing read as one picture, not a drawing put in front of a 3D scene), **no fringe** (no white or light fringe round the hero's edges), **nothing thin vanishes** (the bow string, the blade, the staff stay visible against whatever is behind them), **the hero stands out** (from the dim clearing, by his steel, his glow, his lit hood). Then: chunky, readable, lit like a painting, in Runelight's palette and moonlit mood, and not recognisable as the pack's figures.

| Bar | How the heroes meet it |
|---|---|
| One picture | Hero and clearing lit by the same moon and moonbeam, painted by the same look with the same ink, then one haze, depth of field, mist, bloom, grade, vignette and grain over the finished frame, a little of the scene's light wrapped round his edges, his contact shadows on the moss (below) |
| No fringe | The silhouette's line covers the anti-aliased rim the render leaves outside the figure, every part on the outline is lined, and the fringe check runs on every frame of every hero (below) |
| Nothing thin vanishes | The bow string: a light core with a dark edge of its own in the flat ink (line weight 0.7, `tint=0`) on the stage, a bare light thread at match size (`flags`); the bow's wood less shaded at match size; the sword's blade in full metal; the staff's gem glowing |
| The hero stands out | The heroes' flat tokens toned for the night (saturation 0.72, value 0.8) in a gentle moonbeam (0.52), so each is the brightest thing in the clearing without looking spot-lit: the Warden's steel, the Arcanist's gem, the Ranger's eyes and hood |
| Not the pack's | Every colour a Runelight token by the table, the painter's cel bands, rims and ink: the Ranger a green-hooded archer with glowing eyes over a dark mask, the Warden a steel knight with darkness and two glowing eyes inside his helm, the Arcanist a plum-robed mage with silver hair |
| Light | Moonlight from the upper left in soft cel bands, AO in the creases, a soft sky fill, the moonlit edge from the moon behind on the left on hero and scenery alike, a faint rune-teal rim on the right |
| Ink | The local colour darkened, the same weight on hero and scenery: 2.4 px round silhouettes, 1 px inside, on the 2400 px stage (V-05a's weights; V-05b's first round scaled them to 1.2 and 0.5 with its 1200 px frame, and on a phone the ink looked thin); in a match 1.5 world px round the figure, 0.42 inside |
| Face | Both eyes show in every match frame: the 3/4 view is 34° round from the front; the Ranger's head is its own layer over his bow; clips that hid a face were swapped for others from the pack |

### One picture: how hero and scene become one

The clearing doesn't move, so it is rendered once (the plate) for all three heroes; each frame renders only the hero, in the box of the frame he, his shadow and his glows reach (a whole-pixel border render, cropped), with the ground as a shadow catcher (his moon shadow) and the props in front of him as holdouts (a fern still hides a boot). The layers stay, for render time, but nobody can tell:

- **The same light and look.** One moon (a sun lamp) and one moonbeam (a spot) light both; both are painted by `npr.shade` with one look; the scenery is only a value step darker (`dim`), and the haze does the rest of the depth.
- **The plate at 2×, the hero at 1×, his fast frames at 2×.** The plate is rendered once for all three at 4800 × 1800 (20 samples a pixel) and averaged down to 2400 × 900, so every edge of the clearing is anti-aliased from four times the pixels. The hero is rendered at the output size, 2400 × 900, with 24 samples a pixel (`stage.SS`, `HERO_SAMPLES`): at 2× (4800 × 1800, as V-05a) a frame took 20 s on 4 cores, over the 15 s a frame Han allowed (17 Oct 2026), so his rule's fallback holds for most of the loop. Measured side by side at a 3× phone's scale, the 1× hero's outline is as crisp as the 2× one's but shows a slight stair-step on a slanting edge (the hood's) and on the lines inside the figure (the brim, the hair) that 2× smooths (`docs/screenshots/3d-heroes/ranger-hood-eyes-300.webp`). Two kinds of frame are rendered at 2× instead (`SAMPLES_2X`, V-05a's samples; each frame's notes say which): **the fast frames** (`fast` in `hero.py`: the Ranger's draw, the Warden's slice, the Arcanist's summon swings; about one frame in seven), at 18 samples, because at 1× a part blurred by its motion breaks into specks (its coverage is noisy at 24 samples and the painter turns thinly covered pixels to ink one by one: the Warden's slice was a dotted trail); and **a frame that fails the fringe check at 1×**, rendered again at 10 samples and kept, because fine detail can alias there (the Ranger's string, blurred as the follow-through swings the bow down, its light core between its own ink breaking into light dots). A resumed render (`--work`) re-renders both at 2× if an earlier run made them at 1×. Every pixel size of the look (lines, bloom, light wrap, haze bands, mist, depth of field) is V-05a's, for the 2400 px frame, not scaled down with it.
- **Premultiplied, with a line that covers the rim.** The hero layer is premultiplied colour and coverage; its silhouette line spreads from the outermost covered pixels as far out as in, at least 0.7 of a full line, wide enough to cover the partly covered pixels the render leaves outside the figure. Every part on the outline is lined, except glowing parts (a glow is its own edge). A part blurred by its motion spreads wider than the line reaches, so his thinly covered pixels take the line's colour too: a motion trail is a faint ink trail, never a lit one past the line (`npr.ink_smear`). Over a prop in front of him the line stops.
- **Lines on the scene too.** The plate is lined by the same rule and weights.
- **The air over everything.** On the finished frame: a depth haze towards the mist colour (the hero gets the haze of his own depth, the same as the moss at his feet); depth of field on the far trees and the sky; the mist drifting along the tree line; the moon's halo.
- **Contact.** His moon shadow from the shadow catcher, in the cel look; under each foot a soft contact shadow (heel to toe tip, from the skeleton's `foot` and `toes` bones) and under the whole figure a wider, fainter one; a lifted foot's shadow fades. Where he covers part of a pixel the catcher sees less of the ground and reads less shadow, so round his edge the shadow is the darkest of the pixels round it: otherwise a lit line of moss shows under his soles (it was most of the fringe pixels in the first full render).
- **Light wrap.** Round his edges a little of the scene behind him, blurred, brightens the edge towards it: never past it, nor past the scene right behind the edge.
- **One bloom, one grade, one grain.** The glows of hero and scene bloom together; then one grade, a vignette and a fixed film grain.

### The fringe check

`tdt3d/fringe.py` (and `apps/client/scripts/fringe.ts`, the same check line for line) reads a finished frame and the hero mask pass (his layer's coverage as composited, line included, plus where his glow lights the frame: his glowing parts, their bloom, the motes). Along the silhouette (partly covered pixels, or either side of a step with nothing between) it walks the coverage's normal up to 4 px each way to a clean hero pixel and a clean scene pixel, without the coverage dipping on the way in (a thin part apart from the body is not the rim). A pixel more than 12 luma levels brighter than both is a fringe pixel. **A frame passes with at most 1% fringe pixels and at most 5% hard alpha steps** (neighbours either side of half cover with nothing between); silhouette pixels within 8 px of the hero's glow are left out (a glow's halo is light the scene really gets), and so is the streak of an arrow in flight after the loose (a projectile's motion blur, not the hero's silhouette): only in the Ranger's frames with the arrow flying, only the box its points cover over the shutter (the points the camera sees, in front of it, clipped to the frame), padded 3 px. Each such frame is measured both ways in the build's notes (`strict`). A frame that fails at 1× is rendered again at 2× and checked again (above); the check itself is the same for both.

The build runs it on every stage frame of every hero and stops after the encode if any frame fails, or if a hero's loop leaves the box the three share. Three key frames a hero (idle, the move, after it: `checks` in `hero.py`) are kept as fixtures, cut to the silhouette's band (`apps/client/test/fixtures/stage-fringe/`), and `test/art3d.test.ts` checks that they pass, that #105's frames (`before-105/`) fail, and that the TypeScript check gives the pipeline's numbers.

The V-05b round 2 render (240 stage frames a hero, every one passing):

| Hero | Worst fringe (limit 1%) | Worst hard steps (limit 5%) |
|---|---|---|
| Ranger | 0.77% (frame 198: 15 of 1,953 pixels) | 1.94% (frame 158) |
| Warden | 0.58% (frame 79: 11 of 1,888) | 2.14% (frame 124) |
| Arcanist | 0.35% (frame 209: 5 of 1,439) | 1.52% (frame 151) |

Measured without the flying arrow left out, the Ranger's frames 151 and 152 read 2.38% (37 of 1,557) and 1.39% (23 of 1,650); with it, 0 and 0.23%. Every other frame passes either way. All 37 of frame 151's pixels lie in a band 4 px high on the arrow's streak (x 1501–1571, y 570–573), about 170 px clear of him, as V-05b's first round found at 1200 (`docs/screenshots/3d-heroes/ranger-0151-fringe.webp`). Two Ranger frames failed at 1× and were rendered again at 2×: 196 and 197, as the follow-through swings the bow down (1.31% and 1.59% at 1×, every pixel on the blurred string's light core; 0 at 2×).

### The stage loop (the first screen)

The whole stage is rendered in Blender: the moonlit clearing with the hero in it, **8 s at 30 frames a second**, seamless: the idle (`Idle_A`, played at the rate that fits whole cycles in the loop, so it has no seam), then the signature move eased in over it (`hero.py` `stage`: each move a clip from one time to another, eased in over the one before it, eased out into the idle), and back. The Ranger draws (`Ranged_Bow_Draw`), holds (`Ranged_Bow_Aiming_Idle`) and looses (`Ranged_Bow_Release`; the arrow flies off along its line and the string snaps back); the Warden raises his shield (`Melee_Block`, held with `Melee_Blocking`) and swings (`Melee_1H_Attack_Slice_Horizontal`); the Arcanist summons (`Ranged_Magic_Summon`). A little motion blur (shutter 0.42).

- **One frame for every stage size, 2400 × 900, for 3× phones**, feet on the ground line at y = 735. The fit (`fitStage`) crops the frame to the room between the title and the ground, so a stage never shows the whole frame: a 412 px phone's home card (378 × 321) shows about 750 of its pixels across, on a 3× screen 1140 device px, so each video pixel is drawn 1.5 device px wide. V-05b's first round rendered 1200 × 450, which that stage magnifies 3×, before H.264 halves its colour detail again: on a Pixel 10 Pro the hero's edges went soft, the eyes' glow weak and the ink thin (Han, 17 Oct 2026). At 2400 the same stage magnifies 1.5×, as V-05a's Ranger did. **One camera, one clearing and one box for all three** (`stage.BOX`, x 956–1440, y 308–800): the box every hero's loop stays inside, ink included, so `fitStage` places every hero's video the same and switching heroes swaps the hero, never the ground. The Warden's helm is its top, his slice its left edge; the Arcanist's staff its bottom, its gem swung down into the moss in front of his feet as the summon starts (y 785, below the ground line; `fitStage` fits by the top, the sides and the ground line, so the bottom moves nobody); the Ranger stands a little smaller in it, as he does in a match.
- **Render time** (V-05b round 2's build, 4 CPU cores, no GPU):
  - A 1× frame takes 12.9 s for the Ranger and 15.1 s for the Arcanist on average, each measured with nothing else running (the Warden's 15.8 s median was measured beside other renders). Cycles is most of it; the painting in numpy the rest.
  - A 2× frame takes 36–47 s. 89 of the 720 frames are rendered at 2×: the 87 fast frames (35 of the Ranger's, 19 of the Warden's, 33 of the Arcanist's) and the Ranger's 196 and 197, which failed the fringe check at 1×.
  - The plate takes 6.6 min, once (4800 × 1800); a hero's encode about 4.5 min (the MP4, the WebM and the poster, each searched to its budget); his match sheet 40–50 s.
  - `--work DIR` keeps every finished frame, so a render cut short resumes where it stopped.
- **Outputs** (`apps/client/public/stage/`): `<hero>.mp4` (H.264 high profile, level 4.2, yuv420p, `-tune animation`, one keyframe a loop, faststart, muted; every iPhone), `<hero>.webm` (VP9, for browsers without H.264: open-source Chromium builds and the browser tests), `<hero>-poster.webp` (the loop's first frame) and `clearing.webp` (the empty clearing, the same for all three). Each is searched to the best quality under its budget: **1.2 MB a video, 60 KB a poster or still**. Their sizes and a hash of their bytes go into `src/render/art3d/<hero>.json`; the client asks for `?v=<hash>`.
- **In the lobby** (`lobby/stageBackdrop.ts`, §12): the poster shows at once; the video loads after the first screen is up (600 ms and an idle moment later), playing from its URL, and fades in over the poster once it plays. Picking another hero drops the last hero's video: the empty clearing (the same in all three, in the same place) shows for the moment the next poster takes to decode, then that poster, then that hero's own video, loaded the same way. Under reduced motion or data saver no video loads; when autoplay is blocked (iPhone Low Power Mode) or it fails, the poster stays. Only the live stage's video plays; it pauses when its stage stops, is hidden or scrolled away, or the page is hidden.
- **The service worker** (`platform/swSource.ts`) stores a stage video whole the first time it plays (it fetches the file without the Range header: a 206 can't be stored, a 200 can) and answers every range request from the stored file with a 206, its Content-Range and Content-Length (a 416 for a range past the end, the whole file for a request it can't answer as one range): iPhones play a video only from proper range answers. The posters and the empty clearing are part of the shell; the videos are never precached.

### The match frames

One sheet per hero at **4 px per world px** (`src/render/art3d/<hero>-match.png`, PNG, RGBA), rendered at 8 and averaged down, with its layout in `<hero>.json`. Each frame is a clip's pose at one moment (`hero.py` `match.frames`), timed by the hero's 2D rig; every frame has its **white twin** (the hit flash: the same alpha, white), every layer is cropped to one box so frames swap without moving.

| Layer | View | Frames | Anchor |
|---|---|---|---|
| Body | 3/4 from the front right (34° round from the front, so both eyes show), 20° down | idle 8 (one `Idle_A` cycle, played over the 2D breath, π s), walk 12 (one `Walking_B` stride), the flinch 1 (`Hit_A`'s recoil); the Ranger's sky cast 1; the Warden's wind-up 4, swing 6, way back 3 and shield 2; the Arcanist's thrust 3 and back 3, staff lifted 4 and raised 4 | the feet |
| Head (the Ranger) | the same | one per body frame | the feet |
| Arm (the Ranger: both arms, the bow, the arrow) | profile, the bow broadside | the string drawn in 8 steps (0 to the clip's full draw, by how far the hand has come back), loosed 1 | the bow shoulder (`upperarm.l`) |
| Fall | the body's | `Death_A` in 6 frames | the feet |

The Ranger's body leaves out his arms (the pack's figures have their arms as separate meshes, so the layers need no cutting), and his head is drawn over the arm layer, so the bow never covers the face; the body and head renders hold each other out, so together they are exactly the whole figure. The Warden and the Arcanist are whole in every frame. The layout gives each body frame its points: the shoulder the arm layer (the Ranger) or the slash (the Warden) hangs at, the gem (the Arcanist), in world px from the feet. **The Warden's swing** keeps `WARDEN_SWING` and `wardenStrike` exactly (their tests unchanged): its six frames are spaced by the 2D swing's progress (the blade's angle from wound to struck), the clip's moment the blade passes the front placed on the 2D contact (`1 − (1 − contact)²` of the way), so the impact the renderer plays lands on that frame.

**`Hero3DRig`** (`src/render/art3d/heroRig.ts`, on `HeroRigBase`) is one rig for all three, driven by the layout: its `style` names the 2D rig whose timing it keeps (`bow`, `melee`, `staff`), its layers and frame kinds what to show. The Ranger: the draw over the attack cooldown, the 110 ms release, the cast aims and loose, the arm layer turned at the shoulder towards the target and drawn 1.2× (the bow reads as a bow). The Warden: the wind-up over the 180 ms before a blow is due (from the cooldown, while an enemy is in reach), the swing, the hold on the impact, the way back, the lunge and the 2D rig's moonlit slash over it (flattened, as the slice sweeps across the body); Cleave is the swing at the cast's pace, Taunt and Last Stand raise the shield. The Arcanist: the thrust at the shot and back (`arcanistThrust`), Fireball a thrust at the cast's pace, Frost Nova the staff lifted, Meteor raised high, the 2D rig's gem flare charging over the cooldown at the gem's point. Every hero shows its flinch frame on a hit while it stands or walks, and its fall frames when it dies (instead of the base's tip-over; the base's fade and flash stay); its jog steps at the cadence that makes the planted foot hold the ground (`walkCadence`, from the clip's measured stride). The base gives the ring, shadow, hit flash and fade. The sheets load one second after the first screen (`loadHeroSheets`, `main.ts`; `<html data-hero-sheets>` once they are in); a hero created before that, or if a sheet fails, gets its 2D rig, which also stays in `?showcase`. The hero's size on the map is unchanged (V-04's scales).

**In `?showcase`:** the 2D hero cards (labelled "hero 2D") are followed by **Heroes in 3D (rendered ahead of time)**, a card per hero played from its match sheet by `Hero3DRig` (after `loadHeroSheets`), large and at phone size, cycling idle, walk (turning round), its attacks, each active skill, a hit and the fall, switched by Normal / Bright as the 3D creeps are; then **Stage**, a card per hero with the lobby's own backdrop (`StageBackdrop`) on a stage the size of a 412 × 839 phone's home card (378 × 319), so the loop is cropped and scaled as the lobby shows it: the poster at once, the video muted, looping and inline over it once it plays, the poster when it can't (each card says which).

### Sizes (V-05b round 2, 17 Oct 2026)

| Hero | Stage MP4 | Stage WebM | Poster | Match sheet |
|---|---|---|---|---|
| Ranger | 1,158 KB | 1,173 KB | 59.3 KB | 323 KB (1024 × 1127) |
| Warden | 1,071 KB | 1,157 KB | 59.9 KB | 570 KB (1024 × 1946) |
| Arcanist | 1,157 KB | 1,133 KB | 59.8 KB | 473 KB (1024 × 1418) |

- **The empty clearing** is 59.2 KB.
- **The match sheets** are V-05b's, not re-rendered (4 px per world px).
- **Encoding:** H.264 at CRF 19 (the Ranger) and 21 (the Warden, the Arcanist), VP9 at CRF 25, 29 and 31, the posters at quality 63–66, the clearing at 74. Each file is the best quality under its budget (1.2 MB a video, 60 KB a still). V-05a's Ranger loop at 2400 × 900 was 1.14 MB; V-05b's first round, at 1200 × 450, 556–690 KB.
- **When the files load:**
  - The three sheets load a second after the first screen and are part of the precached shell.
  - A video loads only when its stage plays it.

**Re-render:** `npm run art:3d -- heroes` (about 4 hours for all three on 4 CPU cores, worked out from the frame times above: V-05b round 2's build ran in resumed parts; after a change, render only the heroes it touches, about 1 h 15 min a hero, in a fresh working folder: `--work` reuses every frame it finds, changed or not). The renders and the PNG sheets are repeatable (fixed Cycles seed and samples, no time or random input; numpy on the same machine), up to a few hundred edge pixels Cycles' threads can flip; the video encoders run threaded, so a re-encode can differ by a few bytes while looking the same. The hashes in `<hero>.json` always come from the bytes written, so the client's `?v=` follows whatever was committed.

### Adding a 3D hero

1. Put the pack's model, props and clips under `tools/blender/assets/` (glTF only, with the pack's licence) and add a row to `tools/blender/hero.py`: the model and its meshes by layer, the props and the bones they hang on, the materials (`shading.define` keywords: tokens, line weight, flags) and the colour map from palette cells to them (the build stops on a cell it doesn't map), the stage loop's moves, the match frames (clip moments timed by the hero's 2D rig), the points the rig needs, the fringe-check frames.
2. `npm run art:3d -- <hero> stage --frames … --out DIR --work DIR`, look at the frames and their fringe check (and `--layout-only` for the box), iterate; then the full render and `python tools/blender/contact.py`; judge them against the quality bar, Han's notes first.
3. Client: the hero's layout and sheet in `HERO_3D` and `SHEETS`, its rig style in `Hero3DRig`, `test/art3d.test.ts` (it reads `HERO_3D`), the lobby browser tests.

### Creeps and bosses (V-05c, 17 Oct 2026)

**Han, 17 Oct 2026.** Every creep and boss is a pre-rendered 3D model, as the heroes are: a model from a CC0 pack in the repo, posed by the pack's own clips, repainted in Runelight's tokens by the painter, rendered ahead of time into a match sheet and played by a rig on the device (§7, 3D creeps). The game's numbers don't change: every creep keeps its radius, speed, HP and behaviour; only how it is drawn changes. One table, `tools/blender/creeps.py`, in the shape of `hero.py`; `tdt3d/creep.py` renders a row; `npm run art:3d -- creeps` renders all nine. Creeps have no stage loop: match sheets only.

| Kind | Model (pack) | Props, palette | Clips: walk · stand · attack · flinch · death · ability |
|---|---|---|---|
| Grunt | Skeleton_Minion (KayKit Skeletons) | the pack's blade on `handslot.r`; cloak `grunt` red | Skeletons_Walking · Skeletons_Idle · Melee_1H_Attack_Chop · Hit_A · Death_A |
| Runner | Skeleton_Rogue | hood and cape `runner` yellow | Running_A · Idle_A · Melee_Unarmed_Attack_Punch_A · Hit_A · Death_A |
| Archer | Skeleton_Minion | the crossbow on `handslot.r`, turned a quarter so it aims along the forearm; cloak `archer` orange | Skeletons_Walking · Skeletons_Idle, both under Ranged_2H_Aiming's upper body (crossbow up) · Ranged_1H_Shoot · Hit_A · Death_A |
| Brute | Skeleton_Warrior | axe on `handslot.r`, large shield on `handslot.l`; horned helm in iron; cloak `brute` crimson | Skeletons_Walking · Melee_Blocking · Melee_1H_Attack_Chop · Hit_A · Death_A |
| Wisp | Ghost (Ultimate Monsters) | `wisp` violet, eyes pale ether over a `void` mouth | Fast_Flying · Flying_Idle · (none: it never attacks) · HitReact · Death |
| Hatchling | Mushnub | the Matriarch's own row of the atlas: cap `matriarch`, body `egg` | Walk (a hop) · Idle · Bite_Front · HitRecieve · Death |
| Ironhorn | BlueDemon | hide `ironhorn`, the club in iron, a gold plate | Walk · Idle · Punch · HitReact · Death · Jump then Jump_Land (the Stomp) |
| Matriarch | MushroomKing | cap `matriarch`, body `egg`, the mushroom staff, a gold plate | Walk · Idle · Weapon · HitReact · Death · Wave (the Hatch) |
| Shardback | Dino | skin `shardback`, belly between it and `hideStone`, spines and horn `hideStone` | Walk · Idle · Punch · HitReact · Death · Duck (the hide shift) |

- **Palette.** Skeletons in `bone`, dark iron (`iron`, `ironDark`, the blades in `steel`), moss for belts and straps, and each kind's cloth in its own warm creep token, so players still know a Grunt by its red and an Archer by its orange. The monsters in the creep and boss tokens; never a pack colour (a face in a cell the table doesn't map stops the build). The Dino's tan cell paints its spines, its horn and its belly at once: `regions` in the table splits it by face (turned to its back, or up on its head: the shards).
- **Glow.** Creature eyes glow (the `eye` token, as the 2D creeps' eye accents): the skeletons' eye sockets, the monsters' pupils. The Wisp's ether is its pale violet body; it has no bloom. The bosses' gold is a plate of it (the pack's loincloth, `gold` metal, unlit), as the 2D bosses' gold trim.
- **Layered poses.** The Archer walks and stands with the upper body of Ranged_2H_Aiming over Skeletons_Walking and Skeletons_Idle (the spine, chest and arms; the head stays the walk's, since the aiming clip turns the skull to profile): with the walk's own arms its crossbow hangs at its feet, a dark clump at phone size. Its attack is Ranged_1H_Shoot from 0.25 s, the crossbow already up. The pack's poses are combined by bone, as an engine layers them, never edited (`upper` in the table, `_pose` in `creep.py`).
- **Alternates** (Han: by silhouette at phone size): the primary picks stand. Cactoro, the Shardback's alternate, wears a sombrero (the cell its spikes share), so the Dino stays: from the 3/4 front its back spines hide behind it, so the hide's glow shows on its horn and the spine tips in a walk, and on all its spines in the hide shift (it ducks under them). Death_A replaces the Special pack's Skeletons_Death: that clip drops the body at once and leaves a shin standing apart, which reads as a broken frame at phone size.
- **Camera, light and look:** the heroes' match frames' (3/4 from the front right, 34° round, 20° down; the same moon, rim and ink), with lighter shadows (`creep.LOOK`: a skeleton's big skull would leave its whole body in shadow) and less of the player side's teal rim. Rendered at **1× with 24 samples** a pixel (#109's rule for the heroes' stage frames), never supersampled; every frame goes through the **fringe check** (`fringe.py`), composited over the lane it walks on with its shadow: **all 152 frames pass with no fringe pixel and no hard alpha step**. Two frames a kind (the stand and the first step) are kept as fixtures (`test/fixtures/creep-fringe/`) and `test/art3d.test.ts` checks them with the TypeScript check.

**Size.** Each figure is scaled so its **rendered radius** is its radius in the game (tuning × 32 world px; the sheet is 4 px per world px, the bosses' 3): the radius of the disc with the area of its idle silhouette, props left out. For the round 2D creeps that is their radius; for the slim skeletons matching their width would stand a Grunt ~45 world px tall, over the Warden (32) and through its HP bar, while the area rule keeps a Grunt 22 wide and 32 tall (its width is still twice its radius). V-04's bigger creep sizes are the renderer's scale on top (§6), and the feet stand where the 2D art has them (`CreepArt.feet`).

| Kind | Radius (tuning) | Idle silhouette (world px) | Sheet px / world px | Sheet | PNG | Frames | Render |
|---|---|---|---|---|---|---|---|
| Grunt | 11.2 | 21.8 × 31.5 | 4 | 2048 × 171 | 182 KB | 17 | 14 s |
| Runner | 9.6 | 14.5 × 28.0 | 4 | 2048 × 134 | 125 KB | 17 | 11 s |
| Archer | 10.6 | 19.5 × 32.5 | 4 | 2048 × 250 | 166 KB | 17 | 16 s |
| Brute | 16.0 | 28.8 × 50.0 | 4 | 2048 × 432 | 371 KB | 17 | 21 s |
| Wisp | 9.6 | 27.3 × 29.8 | 4 | 2048 × 133 | 88 KB | 13 | 7 s |
| Hatchling | 8.0 | 16.5 × 18.5 | 4 | 2048 × 95 | 64 KB | 14 | 6 s |
| Ironhorn | 28.8 | 72.7 × 71.7 | 3 | 2048 × 760 | 556 KB | 19 | 28 s |
| Matriarch | 30.4 | 64.7 × 78.3 | 3 | 2048 × 808 | 635 KB | 19 | 29 s |
| Shardback | 32.0 | 85.0 × 89.7 | 3 | 2048 × 974 | 692 KB | 19 | 31 s |

- **Frames** (the 2D creep rig's states): walk 8 (the Hatchling's hop 6), stand 1, attack 4 (bosses and the Hatchling 3, the Wisp none), flinch 1, death 3, a boss's ability 3. Walk is one whole cycle of its clip; the attack runs from the wind-up to the blow; the death skips the clip's first moment (the stand again). Render times on 4 CPU cores, no GPU: 2 min 45 s for all nine (2 min 48 s with Blender's start), each frame a second or two. The renders are repeatable: rendering again gives the same bytes.
- **The budget: two 2048 × 2048 pages.** Every sheet is 2048 wide, so the nine stack into two pages (the build checks it, and `test/art3d.test.ts` packs them again): 7.69 M px, 29.4 MiB as RGBA. To fit: frames are trimmed to what they cover (a 1 px pad: bilinear sampling reads half a texel past it) and packed tightly (skyline, best of four orders), only the flinch has a white twin (a death opens on the flinch while its flash fades), the Shardback's hide masks skip its deaths, and **the bosses are 3 px per world px**, not 4: at their radius they are 70–90 world px, and at 4 px their three sheets alone would fill the two pages. A boss is drawn ~0.94 CSS px per world px on a 412 px phone (V-04), 2.8 device px on a 3× screen, so 3 px still never magnifies.
- **Loading.** After the hero sheets and the map plate (both a second after the first screen: a 2D creep is a fine stand-in, the painted ground less so, so the creeps never share a slow line with the plate), one kind after another in the order they first come in the waves (Grunt, Runner, Archer, Brute, Wisp, Ironhorn, Matriarch, Hatchling, Shardback), so the early creeps are 3D first on a slow line (`loadCreepSheets`, `<html data-creep-sheets>` and the `tdt:creep-sheets` mark once all are in). Their layouts (`creepData.ts`, the nine JSON files) come with them in a chunk of their own, so the first screen carries only the rig and loader code; the rig code stays in the first chunk, because a lazy chunk that shares Pixi with it makes the bundler (Rolldown) split Pixi's renderers off into a chunk loaded at start, a round trip more on a slow line. 2.88 MB of PNG in all, part of the precached shell like the hero sheets. A texture reaches the GPU when its kind is first drawn.
- **Cost** (measured 17 Oct 2026, after V-03): the 300-creep stress scene's textures go from 7 (33.3 MiB) to 13 (42.8 MiB: the six walker sheets it draws; all nine kinds on screen would add 29.4 MiB). Its JavaScript per frame under 4× throttling rose 3–7 ms on the session container (2D 30.7–32.6 ms, 3D 34.0–38.1 ms, against the test's 33.3 ms budget, which main itself only just meets there; CI measures main at 15.8 ms). In a CPU profile the creep rig and renderer account for about 1.3 ms of that and WebGL calls for 0.4 ms; the rest is not in any function of ours (software GL). Mipmaps on the sheets did not change it. The rig swaps a frame only when it changes and skips a still creep's transform. First load: +3 KB (the rig and loader code), the first screen's timings unchanged; on throttled Slow 4G every creep sheet is in 46 s after the page opens (the hero sheets at 21 s, the plate at 23 s).

**Adding a 3D creep.** A row in `tools/blender/creeps.py` (model, parts by mesh, materials and colour map, props, clips per state and frame counts; `regions` for a cell that paints two things), `npm run art:3d -- <kind>`, look at the frames; then the kind in `CREEP_3D` (`render/art3d/creepData.ts`, in wave order) and `CREEP_SHEETS` (`creepSheet.ts`), and its counts in `test/art3d.test.ts`.

## 16. The map plate (V-03)

**Han, 17 Oct 2026.** The Spire map is **one rendered picture**: the ground, the lanes, the cliffs, the trees, the rocks, the moss, the worn road and the build pads get real depth, light and shadow from the same moon as the 3D heroes (§15), so a match reads as a little world instead of flat tiles. It is a picture: **nothing 3D runs on the phone**, and the layout, the pads and where taps land stay exactly as they were (`docs/MOBILE.md` §4; the layout and gesture tests are unchanged). The Heart, the portals, the towers, the heroes and the creeps stay sprites drawn over it.

### How it is built

`npm run art:3d -- map` (`tools/blender/build.py map`, `tools/blender/tdt3d/map.py`) builds a Blender scene **from the map's data, never from typed coordinates**: `tools/blender/mapdata.ts` (run with tsx) writes what the game's own code says, `getMap()` (the 26 × 50 tile grid, the lanes' waypoints, every pad with its zone, the Heart and hero spawn, the safe zone from row 40), which pads every match has (`padLayout` for 1, 2 and 3 players in both modes) and the prop spots the 2D ground painter picks (`propSpots` over the registered props, in `load.ts`'s order). One Blender unit is one world px; Blender y is the map's y turned over.

- **The camera** looks straight down, orthographic, the whole map exactly in frame, +y down as the client draws it, at 4 px per world px; the frame is painted at that size and averaged down to **2 px per world px: 1664 × 3200**, the size of the 2D ground's canvas.
- **The moon** is a sun lamp from the upper left, 40° up (`MOON`), so shadows fall down-right as everywhere in Runelight; Cycles on the CPU, 20 samples, the same passes and the same painter as the heroes (`npr.py`: cel bands, AO, the moonlit edge, a faint rune-teal rim on the lower right, tinted ink: 2 world px round a form, 0.8 inside). Seen from straight above most surfaces face the moon at all, so the map's terminator sits higher than the stage's (`band` 0.32, more continuous `form` light): a slope turned away from the moon, a road's upper-left bank or a canopy's far side, falls into shade and reads.
- **Strips.** The whole frame at 4 px per world px would need about 10 GB for its passes, so it is rendered in strips of 1,024 rows (48 more above and below for the outlines and blurs), painted and averaged down one by one. The subdivision's exact limit surface is off for the map: on hundreds of small blobs it took 13 GB and 40 s to evaluate; its approximation takes 1 GB and a second.
- **Finish** (on the plate, as the 2D ground finishes its canvas): the glows' bloom, the 2D ground's cool moonlight wash round the upper middle and its vignette (night at 35% at the edges), the safe zone's shade (night 0 → 62% over four tiles from row 39.4).
- **Out:** `apps/client/public/map/spire.webp` (the best WebP quality under **700 KB**: 670 KB at quality 94), `spire-extra.webp` (the patches, under 60 KB: 30 KB) and the layout `apps/client/src/render/plate/spire.json`: the files' sizes and hashes (the client asks for `?v=<hash>`), and what the build **measured in its own render**: each pad's square (from the object pass) and each lane's middle line (the middle of the road's sunken floor in the depth pass, at points along it), in plate px, and the prop spots it used. `test/plate.test.ts` checks them against the map's tiles, `padLayout` and `propSpots`, and the picture's size against the map.

### What it shows, by tile kind

| Tiles | In the plate |
|---|---|
| Open ground | The clearing's moss: a painted albedo (moss in soft patches, darker hollows, a mottle and specks, as the 2D ground's blotches and speckle), gentle mounds a few tiles across (flat round the pads and the road), tufts of grass splayed from their roots (a blade standing up shows nothing from above), moss cushions, ferns, leaf litter and a few glowing motes, all hash-scattered (deterministic). At the 2D ground's **prop spots** (`propSpots`): rocks and pebbles, glowing mushroom rings and runestones (a rough stone, its rune glowing dimly), from the clearing's library (`clearing.py`) |
| Lanes | A worn earth road along the waypoints, `LANE_W` 2.15 tiles wide as the 2D lanes, **sunk 6 world px**: its upper-left bank in shade, its lower-right one catching the moon; packed earth mottled with pebble, worn pale down the middle (`laneLight`, 12%), a few low-contrast flagstones (the 2D ground's scatter), a soft dark rim where it meets the moss, and the edge broken by moss cushions and pebbles. It stays low-contrast, so creeps are the brightest thing on it |
| Pads | Flat stone squares **exactly the pad's 3 × 3 tiles** (the slab's foot is the tiles' edge), **8 world px high** with a bevelled top edge that catches the moon and a shadow down-right, an inset groove (its lower-right wall lit), the 2D pad's flagstone seams and faint build ring in the albedo, four dim rune studs. Flat shaded (smooth normals across the top and the groove would shade the top in a slope). The zone tints (`rim`, `wash`: yours, a teammate's) are drawn over them at runtime, as before; the 2D slab sprite is not |
| Blockers: the border | A rocky ledge (6 world px) along the border's blocker tiles, rocks on it, and the 2D ground's border trees at their spots: small, low (their shadows must not reach the pads beside them), centred on the edge so they lean off the map, never over a lane or pad |
| Blockers: the safe zone | The 2D ground's dense canopy at its spots (oaks, bushes and pines from above: two star-shaped skirts of needles, as the 2D pine), over forest floor, sinking into the deep shade so the touch controls over it stay readable |
| Not painted | The Heart, the portals and the hero spawn: sprites, as before |

**Pads only some matches have** (the extra pads of 3-player teams: three with today's tuning) are not in the plate, so a solo player never sees a pad they can't build on. Each is rendered as a **patch**: the plate round it with its pad in, 16 world px past its edge and faded over the last half, packed in `spire-extra.webp`; the renderer draws a pad's patch under the zone tints only in a match that has it. A pad no render had (a tuning change after the last render) gets the 2D slab sprite.

### In the client

- `render/plate/` loads the plate a second after the first screen (with the heroes' sheets; `<html data-plate="ready">`): fetched (the service worker precaches it with the shell, so a match has it at once; it is not media), decoded off the main thread (`createImageBitmap`; `tdt:decode:spire.webp` is the decode's performance measure), one texture (1664 × 3200, under every phone GPU's 4096 px limit).
- `WorldRenderer` makes the ground on a match's first frame: **the plate** if it has decoded, drawn as one sprite at 1 / 2 under everything, where the painted ground was. Until then **the painted ground** (`art/ground.ts`) stays as the fallback and is swapped for the plate when it decodes; it also stays in the code for `?showcase`'s pads and props and for a plate that fails to load.
- **Settings → Display.** The plate is rendered for Normal. **Bright** is applied at runtime as the same `screen` wash the painted ground bakes in (`LIGHTING.bright.groundLift`, `#9fb8c8` at 32%): one white sprite the size of the map, tinted and blended `screen` over the plate, shown only in Bright. One picture serves both, and switching is instant (nothing re-bakes for the ground).
- Nothing per frame: one sprite (and one more in Bright), three patch sprites at most. The 300-creep stress scene's JavaScript per frame did not rise (two runs each, 4× throttling: `main` 26.5 and 26.5 ms, the plate 28.1 and 23.8 ms). On a cold Slow 4G load (`npm run first-load`, docs/PRESS.md §5) the lobby is usable a second sooner (the ground is no longer painted at start-up) and the plate decodes in 0.16 s at 4× CPU.
- **Checked:** `test/plate.test.ts` (the pad squares, measured in the render, within 0.5 plate px of their tiles; the lane lines within 0.65 plate px; the size; the budget; the prop spots; the precache), `e2e/platform.spec.ts` (the screen shows the plate's own pixels in Normal and the plate under the wash in Bright, on the iPhone and Pixel projects), the layout and gesture tests unchanged.

### The link card

The link card (§14) draws its own small landscape map (`src/ogMap.ts`), so the build renders that map's plate too (`npm run art:3d -- map card`, `src/render/plate/card.webp`: dev only, imported by `?ogcard`, never shipped to players). Change the map art → re-render both plates, then `npm run og -w @tdt/client`.

### Re-render

**Time** (4 CPU cores, no GPU): Spire's scene builds in 20 s and renders in about 10.5 min (seven strips of about 97 s each, then the three patches in about 25 s and the WebP search), about 11.5 min in all; the link card's plate (1920 × 1024) about 6 min.

`npm run art:3d -- map` renders both plates (`-- map spire`, `-- map card` one); `--draft` renders at 1× with 4 samples (about 2 minutes for Spire: a quick look at the whole map); `TDT_PLATE_BOX=x0,y0,x1,y1` (plate px) renders just that part at full quality into `--out` (a look at the real thing in a couple of minutes). Needs the same Python and ffmpeg as §15 (bpy, scipy, libwebp). The render is repeatable (fixed seeds, hashes for every scatter), up to a few edge pixels Cycles' threads can flip.
