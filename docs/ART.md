# Tower Defense Together: Art Direction ("Runelight")

> **The style guide for every art session.** Read it before drawing anything, together with `CLAUDE.md` (architecture and performance rules) and `docs/MOBILE.md` §7 (performance targets). If you make an art decision this guide doesn't cover, add it here and log it in `GAME_DESIGN.md` §13.

Art Track 0 chose style C, **"Runelight"**, from the art-direction spike (styles A/B/C, compared on phones). It is now the game's only look. The rule is that art is **made by scripts in the repo**. Most of it is **drawn in code** (Canvas 2D paths) and **baked once** into atlases at start-up. Since Han's decision of 14 Oct 2026, heroes, then creeps and towers, are **3D models made by Blender scripts and rendered ahead of time** into pictures and videos (§15): nothing 3D runs on the player's device. Entities that have no art yet keep their Phase 1 shapes until an art session draws them.

## 1. The look in one paragraph

Twilight in a mossy forest clearing. Dark teal-green moss, packed-earth lanes worn pale in the middle, a few glowing motes. Every part has an **ink outline**, a body that **darkens downwards**, and a **cool moonlit rim** on its upper-left edge. Colour is used sparingly: materials are muted (wood, stone, iron, cloth), and the brightest things on screen are small **glowing accents**: runes, embers, eyes, gems. Creeps are warm (reds, oranges) against the cool ground so they are always the brightest thing on a lane; the player's side is cool and teal-lit; the enemy's portals are violet.

**Status (Art Tracks 1–3):** restyled: the ground, the forest (trees over the border and the safe zone) and a few props, build pads, portals (with a wave-start flare), the Heart (with damage states), **all three heroes** (Ranger, Warden, Arcanist, with walk, attack, cast, hit and death; Art Track 1; the Warden's melee reworked to read at phone size, §7), **every creep** (Grunt, Archer, Runner, Brute, Wisp, the Matriarch's Hatchlings) and **the three bosses** (Ironhorn, Matriarch, Shardback with both hides), **all five towers** (Arrow, Cannon, Frost, Arcane, Flak) at tiers 1–3 with **all ten branches** (Art Track 2), every effect colour (§8) and the whole UI (§12: HUD, radial menus, skill buttons, lobby, settings, end screen, code-drawn icons). **Projectiles and the Snare Trap** are restyled (§6): one carved body per shot, and the trap's coil plus its root ring. `?showcase` lists both, the UI icons and the sounds. **Sound** (§13): music and every effect, made in code.

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

- **Bake, don't draw.** Everything is drawn once into the art atlas (`art/atlas.ts`: 1024 px pages at 2 px per world px, shelf-packed, tallest first) or the ground canvas. Never create or redraw a `Graphics` per frame.
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
                              layout.ts (types, cycleFrame / drawStep / walkCadence / fitStage), sheet.ts (loading),
                              rangerRig.ts (Ranger3DRig), index.ts (heroRig3d)
apps/client/src/lobby/stageBackdrop.ts  The stage's rendered clearing, poster and video (§12, §15)
apps/client/public/stage/     The stage files (§15): <hero>.mp4 / .webm, <hero>-poster.webp, clearing.webp
tools/blender/                The 3D pipeline (§15)
apps/client/src/showcase.ts   ?showcase dev page (entities, variants, UI icons, sounds)
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
- **The 3D stage** (`lobby/stageBackdrop.ts`, V-05a, §15): the clearing is now a picture rendered ahead of time in Blender, and a hero made in 3D (the Ranger) stands in it as an 8 s video loop. The poster (the loop's first frame) shows at once; the video loads after the first screen is up and fades in over it; under reduced motion, data saver, blocked autoplay (iPhone Low Power Mode) or an error the poster stays. Only the live stage's video plays, and it pauses when the stage stops or is hidden, off screen, or the page is hidden. The Warden and the Arcanist (2D until V-05b) are drawn as below over the empty clearing, placed by the same fit (`fitStage`), so the ground never moves when the hero changes. The CSS clearing below shows only until the pictures load.
- **The home card's hero stage** (`lobby/heroStage.ts`, V-01): the first thing a player sees is the picked hero, large, on a moonlit clearing under the title. The clearing is CSS (`.hero-stage`: night sky, two tree lines, lit moss, moonlight behind the hero, a few motes, night closing in at the edges). The hero is a canvas drawn from its own art: each frame is drawn once at the stage's size (vector paths: sharp at any size, with room around it so a glow is not cut), then placed by the hero's standing pose (`HeroArt.stand`) 30 times a second, on a pool of the hero's colour and a contact shadow. Every hero gets the same scale (`standRoom`, `fitStand`), feet on one ground line, clear of the title. A newly picked hero steps in (220 ms). Nothing is drawn while the stage is hidden, and under reduced motion it is one still drawing with no entrance. A new hero needs `feet` and `stand` (§10). Look at it on a phone and a desktop: the Ranger's bow is held further out than in a match so the string clears its face, the Warden's sword is lower than at rest so the figure is not all blade.
- **The second screen** (V-02): the solo pick and the room card in the home card's look. **The solo pick** has the hero on its own stage, shorter than the home card's (`.hero-stage.compact`: the title on one line), with a stone **‹** at its top left (back to the home card; a build with no game server opens on the solo pick and has none), the short hero buttons (`.hero-tabs`), the role and one line, then **Mode** and **Difficulty** as two compact rows, one segmented stone control each (`.segmented`: a carved trough, a stone segment per choice, the pick rune-outlined and teal-tinted, as a selected hero button) with one line under it for the picked choice, and the modifiers made compact to match (chips on a wrapping line, small stone buttons; the gold names line only when there are none). On a phone each label sits over its control; on a wider card it sits to its left, on the line of the control's first text. **Practice Meteor Rain** is carved stone. **The room card** leads with the code, large, and **Copy invite link** beside it; the players are seats, one per lane (the hero's emblem from `icons.ts`, the name, the hero, then **Host**, **Ready**, **Not ready** or **reconnecting…**, in the hero's colour along the seat's edge), each empty seat a dashed "Open seat: send the invite link"; then your hero (the hero buttons, the role and one line; no stage, so the seats stay near the top) and the host's picks as on the solo pick, greyed for a guest with "(the host picks)". **At most one stage draws at a time**: starting one stops the other (`data-live` marks the one running), and each still stops whenever its card is hidden; under reduced motion each is one still drawing.
- **One main button per lobby screen**, the only rune-teal one on it. On the home card it is Play solo, under the hero; for a friend who opened an invite link it is Join room. On the solo pick it is **Play**; on the room card **Ready** (a guest) or **Start match** (the host). On the second screen it is **docked** at the bottom of the card (`.pick-dock`, sticky, over the card's own bottom colour): it stays on screen with no scrolling at 412 × 839 and 390 × 664 while the picks scroll under it, with Leave in stone beside Ready / Start. "New here? **Learn to play**" (a link-style button, `.learn-link`) is one quiet line under the main button on the home card and the solo pick, only before a player's first solo match. Everything else on the card is carved stone.
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

**The social card** (`apps/client/public/og-card.png`, 1200 × 630, the `og:image` / `twitter:image` in `index.html`) is what Reddit, Discord, X and chat apps show under a shared link. It is the game's own art, never a separate illustration: `src/ogCard.ts` (the `?ogcard` page, dev server only) builds a small landscape map (30 × 16 tiles, three lanes sweeping from violet portals into the Heart, stone pads tinted in their zone's seat colour) with `buildMap`, paints it with the ground painter (`createGround`), and poses the real atlas sprites and rigs at fixed times: towers at tiers 1–3 and one branch, creeps and the Ironhorn on the lanes (runners tinted by frost), the three heroes one per lane (the Ranger mid-shot, the Arcanist mid-cast), projectiles and glows from the fx atlas, the logo from the lobby (`.logo`, the title font) on the forest shade at the bottom. Units are drawn larger than their tiles (heroes ×1.8, creeps ×1.45) so they still read in a 500 px wide preview. Moonlight from the upper left, ink outlines and glow only on emitters come for free from the painter; the vignette is a CSS scrim over the canvas.

- **Generate:** `npm run og -w @tdt/client` (`scripts/ogImage.ts`) starts the Vite dev server, screenshots `?ogcard` at 2× in headless Chromium, averages each 2 × 2 block (supersampled, like the icons), quantizes to 256 colours with a light dither (`scripts/quantize.ts`; ~770 KB → ~260 KB) and writes the palette PNG. The frame is deterministic: two runs on one machine write the same bytes. The wordmark uses the machine's fonts (Palatino, else Book Antiqua, Georgia, then the system serif), so look at the result before committing.
- **Check:** at full size and as a ~500 px and ~240 px thumbnail; the logo stays inside the middle 600 px, so a square crop (some chat apps) still shows the whole title. Keep it under ~300 KB (a test checks the size and the 1200 × 630 header).
- **Change the art → regenerate the card.** Crawlers cache an image by URL for days to weeks, so a new card needs a new file name (`og-card-2.png`, and update both tags) to show on links already shared (docs/PRESS.md §4).
- The service worker does **not** precache it (`PREVIEW_FILES` in `platform/swSource.ts`): only crawlers fetch it, and a player's phone would download it on every deploy for nothing.

**The boot splash** (`#boot`, inline in `index.html`: markup and a small `<style>`) paints as soon as the HTML and the stylesheet arrive, before the app's script has loaded, so a phone on a slow network shows the title instead of a bare HUD while the bundle loads. It copies the lobby's background (the same radial gradients as `.lobby`) and its logo (white "Tower Defense", rune-teal "Together" with its glow), with three rune diamonds that pulse in turn and a "Loading…" line. Under `prefers-reduced-motion` the runes stand still. `main.ts`'s `ready()` (every screen: lobby, solo pick, showcase, progress, stress) adds `done`, which stops it taking taps at once and fades it out in 0.25 s, then removes it. If `main()` throws, the line reads "The game could not start. Refresh to try again." The **start-up watchdog** (`startup/boot.ts`; docs/ANALYTICS.md "Start-up reasons") changes the line when the game is not ready after 15 s of the page being on screen ("Still loading. This can take longer on a slow connection.": start-up keeps going and `ready()` still removes the splash) or when WebGL cannot start at all or is lost ("This browser could not start the game's graphics."); each shows the splash's **Reload** button (`#boot-reload`, hidden in the markup, shown by `startup/splash.ts`). Two Pixi 8.21 start-up hangs are closed in `GameView.create`: WebGL only (`isWebGLSupported()` once, `preference: ['webgl']`: Pixi would otherwise wait on a WebGPU adapter request with no timeout), and `startup/glGuard.ts` (a lost context made Pixi's texture-limit probe loop for ever, a frozen page no timer can reach; the guard makes the call throw while `app.init()` runs). The splash has no art of its own and no JavaScript; keep it that way (it must paint with only the HTML).

## 15. 3D heroes, rendered ahead of time

**Han, 14 Oct 2026.** Heroes, then creeps and towers, are **3D models made by Blender scripts in the repo and rendered ahead of time** into pictures and videos. **Nothing 3D runs on the player's device**: no three.js, no glTF, no second WebGL context, no model file loaded by the client (`test/art3d.test.ts` checks the source and the shipped files). Three throwaway trials led here: the Ranger built from three.js primitives looked toy-like; the Ranger made in Blender and shown live with three.js looked clearly better, but live 3D crashed Chrome's graphics on a Pixel 10 Pro now and then and took the whole game's graphics with it; the same Blender Ranger rendered ahead of time never crashed. V-05a built the pipeline and the Ranger (PR #105, then round 2, PR #106: the hero and his clearing as one picture); V-05b does the Warden and the Arcanist, V-05c the creeps and bosses, V-05d the towers, the Heart and the portals.

### The pipeline

```
tools/blender/
  build.py         the entry: build a hero from nothing, render its outputs, write its layout (npm run art:3d)
  art3d.mjs        npm run art:3d: finds a Python with bpy and scipy, checks ffmpeg, runs build.py
  requirements.txt bpy 4.5.14 and scipy, for Python 3.11
  ranger.py        the Ranger: materials, skeleton, meshes, poses, the stage loop, the match frames
  contact.py       the contact sheet: every pose, from the shipped files, to judge against the quality bar
  edges.py         the edge sheet: 300% crops of the hero's edges as a 3× phone shows the stage, before and after
  tdt3d/
    palette.py     the Runelight tokens, read from render/art/tokens.ts (a colour is never copied by hand)
    geom.py        quad cages smoothed by a subdivision surface: lofts, tubes, lathes, blobs; creases; stitching
    rig.py         skeletons, IK, skin weights, posing in figure space, springs for secondary motion
    shading.py     materials: a white diffuse body for the moon's light plus AOVs (albedo, glow, AO, rim, moonlit
                   edge, fill, sheen, height, id); each material's line weight
    scene.py       Cycles on the CPU, the moon (a sun lamp in its own light group), cameras placed to the pixel,
                   rendering a frame (or a whole-pixel box of it) into numpy passes
    npr.py         the painterly look in numpy: cel bands, AO, rim and moonlit edge, sheen, glow, tinted ink lines
    bake.py        a posed loop written into f-curves (motion blur needs them)
    tracks.py      keyed curves for the stage loop, eased, periodic
    clearing.py    the lobby's moonlit clearing (shared by every hero), in near, middle and far layers
    stage.py       the stage loop: plate and hero at 2×, one picture made of them, the air, the grade, the check
    fringe.py      the fringe check (scripts/fringe.ts is the same, for the unit test)
    match.py       the match sheet: body, head, bow and draw-hand layers with white twins, and their layout
    encode.py      ffmpeg: the MP4, the WebM, the WebP poster and stills, each searched to its size budget
    imageio.py     PNG writing (deterministic) and reading
```

**Run it.** `npm run art:3d -- ranger` builds the Ranger and writes everything; `-- ranger match` or `-- ranger stage` one part; `-- ranger plate --scale 0.5` the empty clearing alone in a minute or two, while working on the scenery (with `TDT_DUMP=DIR` it also writes each render pass there as a grey PNG); `--draft` renders the stage at half size with no supersampling, fewer samples and no motion blur; `--frames 0,165 --out DIR` writes single stage frames (with their fringe check) to look at, and `--plate-cache FILE` keeps the finished plate between such runs while only the hero changes. It needs **Python 3.11 with `tools/blender/requirements.txt`** (`python3.11 -m venv .venv-blender && .venv-blender/bin/pip install -r tools/blender/requirements.txt`, or `TDT_BLENDER_PYTHON` pointing at one) and **ffmpeg with libx264, libvpx-vp9 and libwebp** on the PATH. On a headless Linux box Blender's module also wants `libegl1` (it loads it at start-up, even for Cycles). Then `python tools/blender/contact.py ranger` writes the contact sheet and `python tools/blender/edges.py …` the edge sheet (`docs/screenshots/3d-heroes/`). **CI never runs Blender**: the outputs are committed, and `test/art3d.test.ts` checks the layout data against the images and runs the fringe check on the committed fixtures.

**Why Cycles and numpy.** Eevee needs a GPU context; on a headless container it falls back to software GL at ~50 s for a thumbnail. Cycles on the CPU renders the passes in seconds. Every surface is a white diffuse body, so the moon's light-group pass is exactly the light that reaches it (Lambert and cast shadows, 0..1); what it is made of goes out as AOVs; `npr.py` paints the frame from those, in display values, as the 2D painter mixes them. That gives the look exact control and outlines exact pixel widths at any output size. Two traps: a pixel on the edge between two parts carries the average of their ids, which names some other material (in the opaque plate every edge pixel does), so `npr.ids_of` gives such pixels the id of the nearest clean pixel; and the sky dome, the stars and the moon's disc cast no shadow (`visible_shadow` off), or the dome shades the whole clearing from the moon (#105's plate had no moonlight at all on the scenery while the hero, rendered without the dome, was moonlit: half of its pasted-on look).

**Determinism.** The scripts use no randomness (scattered scenery uses a hash; noise textures and the film grain are fixed), Cycles uses a fixed seed, PNGs are written byte for byte the same. ffmpeg's encoders are run with bit-exact flags. A re-render on the same machine and Blender version gives the same picture, but not quite every pixel: Cycles' threads can flip a few hundred edge pixels of the 1.5-megapixel match sheet (354 between two runs), and the x264 and libvpx encoders are threaded, so a re-encoded video may differ in a few bytes (and its hash, so the service worker fetches it again).

### The quality bar

Han's notes on #105 (15 Oct 2026, on his Pixel 10 Pro) come first: **the hero and the clearing read as one picture, not a drawing put in front of a 3D scene; no white or light fringe round his edges; the bow string never disappears against what is behind it; the hero large on a phone.** Then: aim at the stylised 3D heroes of the best store games of this kind: chunky, readable, lit like a painting. Original designs only, in Runelight's palette and moonlit mood.

| Bar | How the Ranger meets it |
|---|---|
| One picture | Hero and clearing rendered at 2×, lit by the same moon and moonbeam, painted by the same look with the same ink, then one haze, depth of field, mist, bloom, grade, vignette and grain over the finished frame, a little of the scene's light wrapped round his edges, his contact shadows on the moss (below) |
| No fringe | The silhouette's line covers the anti-aliased rim the render leaves outside the figure, every part on the outline is lined, and the fringe check runs on every frame (below): {FRINGE_WORST} |
| The string | A light core with a thin dark edge of its own (line weight 0.45, never under 0.7 on the silhouette): it shows against the night and the moonlit mist alike; {STRING_PX} px wide on a 3× phone's stage |
| Large on a phone | On the 412 × 839 home card the Ranger stands {HERO_CSS} CSS px from the hood to the ground line (V-01's 2D Ranger 157 px, #105's 3D one 188 px), {HERO_AREA} px² of figure (2D 20,826, #105 13,195), whole and clear of the title |
| Smooth, bevelled forms, no facets or raw primitives | Every part is a quad cage under a subdivision surface (level 2 on the stage and in the match sheet); creases keep soles, belt and strap edges tight |
| Cloth with folds, leather with seams and stitching, metal with a bright edge | Tunic and cloak folds that deepen towards a leaf-cut hem, a faint weave in the greens; stitched belt, bracers, boots, quiver, pouch and strap (raised `bone` thread); gold buckle, quiver bands, bow tips and arrowhead catch the moon's sheen |
| A silhouette you can name at 50 px tall | The big hood with its long tip, the bow and the quiver's fletchings (the contact sheet's last row is 50 px tall) |
| Stylised proportions, arms long enough for a real draw | About 26.5 world px tall, the hood nearly half of it, feet a little apart; arms 11 px shoulder to fingertip, capped bracers, gloves a fifth larger than the first cut with three fingers: the bow arm reaches out straight and the draw hand comes back under the chin, forward of the hood's rim, where it shows against the lit hood and the mantle and the string runs under the eyes (at the cheek, inside the opening, the arrow's feathers sat in front of the face like a mouth) |
| Light | Moonlight from the upper left, where the moon hangs in the sky, in soft cel bands (a cool shadow tone, a lit tone, a narrow highlight band), AO in the creases, a soft sky fill, the moonlit edge from the moon behind on the left on hero and scenery alike (the canopies' tops, the hood), a faint rune-teal rim on the right, a moonbeam pool on the clearing round the hero; the hero's flat-colour tokens toned down for the night on the stage (saturation 0.72, value 0.9: lit by the scene's moon, not a studio's); eyes, the arrowhead, the bow's tips and runes, the mushrooms and the motes glow with one bloom |
| Ink | The local colour darkened (a deep green line on the hood, a deep brown one on the bow), the same weight on hero and scenery: 2.4 px round silhouettes, 1 px inside, on the 2400 px stage; in a match 1.5 world px round the figure, 0.42 inside |
| Face | The hood's opening and both eyes show in every frame: on the stage the draw comes under the chin, below the eyes; in a match the body is seen more from the front (34°, both eyes), the head is its own layer over the bow layer, and the draw hand its own layer over the head |
| Motion | Anticipation (a dip before the reach, the draw creeping in while held), action, follow-through (the loose snaps the string, the bow rolls forward in the open hand, the draw hand flies back past the ear); the arrow comes out of the back quiver nock first, swings forward under the shoulder and is laid over the bow hand in front of the string before it is nocked (it never crosses the string); the cloak, the hood's tip (never curled up over the head like a horn), the pouch and the quiver strap's loose end swing on springs; the jog has no foot sliding (a planted foot moves back exactly as fast as the body goes forward); every loop is seamless (periodic curves, springs run over the loop until they repeat) |
| Scenery worth the hero | Near: moss with a worn earth path through it, lumpy moss cushions, ferns with real leaflets, faceted boulders capped with moss, chunky pebbles along the path, mushrooms whose caps glow faintly and whose spots glow, a fallen log (ridged bark, a pale broken end, its root flare, moss on its back), an old stump with roots running over the moss. Middle: the clearing's edge, oaks with crowns in tiers of foliage clumps (each clump outlined and pushed out in leafy lumps, so it has a broken edge and its own shadow line; lit on top, dark beneath, silvered by the moon) and pines with pointed skirts. Far: three rows of pines going into the mist. Above: stars and the moon at the upper left |

### One picture: how hero and scene become one

The clearing doesn't move, so it is rendered once (the plate); each frame renders only the hero, in the box of the frame he, his shadow and his glows reach (a whole-pixel border render, cropped), with the ground as a shadow catcher (his moon shadow) and the props in front of him as holdouts (a fern still hides a boot). The layers stay, for render time, but nobody can tell:

- **The same light and look.** One moon (a sun lamp) and one moonbeam (a spot) light both; both are painted by `npr.shade` with one look; the scenery is only a value step darker (`dim`), and the haze does the rest of the depth.
- **2× and scaled down.** Plate and hero are rendered at 4800 × 1800 (10 samples a pixel for the hero, 20 for the plate) and averaged down to 2400 × 900, so every edge is anti-aliased from four times the pixels, never stair-stepped.
- **Premultiplied, with a line that covers the rim.** The hero layer is premultiplied colour and coverage; its silhouette line spreads from the outermost covered pixels as far out as in, at least 0.7 of a full line, wide enough at 2× to cover the partly covered pixels the render leaves outside the figure. Every part on the outline is lined (a stitch or seam on the outline gets the full line), except glowing parts (a glow is its own edge). A part blurred by its motion (the arrow swung to the bow) spreads wider than the line reaches, so his thinly covered pixels (half covered or less) take the line's colour too: a motion trail is a faint ink trail, never a lit one past the line (`npr.ink_smear`). Over a prop in front of him the line stops (the plate's depth there is nearer than his).
- **Lines on the scene too.** The plate is lined by the same rule and weights: canopies, trunks, rocks, ferns, mushrooms, the log, the far rows (at 0.6). Foliage alternates between twin materials of one colour, so a line marks each clump, and the crowns are pushed out in leafy lumps after the subdivision (`clearing.leafy`: a cellular texture in world space).
- **The air over everything.** On the finished frame: a depth haze towards the mist colour, a little everywhere and thickening towards the far rows (the hero gets the haze of his own depth, the same as the moss at his feet); depth of field on the far trees and the sky (blur by depth, up to 3 px; the clearing and the hero sharp); the mist drifting along the tree line; the moon's halo.
- **Contact.** His moon shadow from the shadow catcher, in the cel look (the moss's lit tone turned to its shadow tone); under each foot a soft contact shadow and under the whole figure a wider, fainter one, worked out on the ground plane from the feet each frame (a lifted foot's shadow fades).
- **Light wrap.** Round his edges a little of the scene behind him, blurred, brightens the edge towards it (never past it): the moonlit mist bleeds onto the hood's rim.
- **One bloom, one grade, one grain.** The glows of hero and scene bloom together; then one grade (night lifted into blue-teal, a gentle contrast, a little less saturation, cooler shadows), a vignette and a fixed film grain (fixed, so it costs the video nothing and dithers its gradients against banding).

### The fringe check

`tdt3d/fringe.py` (and `apps/client/scripts/fringe.ts`, the same check line for line) reads a finished frame and the hero mask pass (his layer's coverage as composited, line included, plus where his glow lights the frame: his glowing parts, their bloom, the motes). Along the silhouette (partly covered pixels, or either side of a step with nothing between) it walks the coverage's normal up to 4 px each way to a clean hero pixel and a clean scene pixel, without the coverage dipping on the way in (a thin part apart from the body, such as a string blurred beside the bow, is not the rim). A pixel more than 12 luma levels brighter than both is a fringe pixel. **A frame passes with at most 1% fringe pixels and at most 5% hard alpha steps** (neighbours either side of half cover with nothing between); silhouette pixels within 8 px of the hero's glow are left out (a glow's halo is light the scene really gets).

The build runs it on every stage frame and stops after the encode if any frame fails. Three key frames (idle, full draw, follow-through) are kept as fixtures, cut to the silhouette's band (`apps/client/test/fixtures/stage-fringe/`), and `test/art3d.test.ts` checks that they pass, that #105's frames (`before-105/`) fail, and that the TypeScript check gives the pipeline's numbers.

| Frames | Fringe pixels (worst frame) | Hard steps (worst frame) |
|---|---|---|
| #105, frames 0, 165, 200 | 5.8–8.1% (frame 200) | 0% |
| This render, all 240 frames | {FRINGE_TABLE} | {HARD_TABLE} |

### The stage loop (the first screen and the solo pick)

The whole stage is rendered in Blender: the moonlit clearing with the hero in it, **8 s at 30 frames a second**, seamless: idle with breathing and a weight shift, then the reach to the quiver, an arrow drawn nock first and swung forward as the bow comes up with a step, nocked, the draw under the chin, a held breath, the loose (the arrow flies off to the right), the follow-through, the bow lowered and the weight settling back. A little motion blur (shutter 0.42).

- **One frame for every stage size**, 2400 × 900, the figure's box over the whole loop {FIG_H} px tall (a 5.5th of the frame's width) with his feet on the line at y = 735: wide and tall enough that the fit that puts the hero between the title and the ground also covers the stage from the 328 × 190 home card of a small phone to the 498 × 150 solo pick on a desktop (`fitStage`, tested at ten sizes). The fit centres the box his whole loop fills (the bow drawn forward); where the video only just spans the stage (the short desktop solo pick) it slides sideways as far as covering needs, and the client never crops the hero. A taller second render for portrait stages was weighed and left: the solo pick on short phones (358 × 150 at 390 × 664, 398 × 150 at 430 × 739) needs the frame about 4.4 figures wide to stay covered with the hero whole, so a portrait frame could have been only a quarter sharper; one sharper frame does both, and a device downloads one video.
- **Larger.** The bow is shorter (0.82 of the first cut) so drawn and raised it stays level with the hood and clear of the boots, and the arrow comes out of the quiver nock first, under the shoulder: the hood is now the top of the figure's box (#105's box was 25% taller than the hood, for the arrow held up out of the quiver), so the camera frames him a quarter larger on every stage.
- **~{FRAME_S} s a frame on 4 cores** (the 240-frame loop took {LOOP_MIN} min), plus {PLATE_MIN} min for the plate; the whole build, stage and match, {BUILD_MIN} min.
- **Outputs** (`apps/client/public/stage/`): `ranger.mp4` (H.264 high profile, level 4.2, yuv420p, `-tune animation`, one keyframe a loop, faststart, muted; every iPhone), `ranger.webm` (VP9, for browsers without H.264: open-source Chromium builds and the browser tests), `ranger-poster.webp` (the loop's first frame) and `clearing.webp` (the empty clearing, for the 2D heroes). Each is searched to the best quality under its budget: **1.2 MB a video, 60 KB a poster or still**. Their sizes and a hash of their bytes go into `src/render/art3d/ranger.json`; the client asks for `?v=<hash>`.
- **In the lobby** (`lobby/stageBackdrop.ts`, §12): the poster shows at once; the video loads after the first screen is up (600 ms and an idle moment later), playing from its URL, and fades in over the poster once it plays. Under reduced motion or data saver it never loads; when autoplay is blocked (iPhone Low Power Mode) or it fails, the poster stays. Only the live stage's video plays; it pauses when its stage stops, is hidden or scrolled away, or the page is hidden.
- **The service worker** (`platform/swSource.ts`) stores a stage video whole the first time it plays (it fetches the file without the Range header: a 206 can't be stored, a 200 can) and answers every range request from the stored file with a 206, its Content-Range and Content-Length (a 416 for a range past the end, the whole file for a request it can't answer as one range): iPhones play a video only from proper range answers. The posters and the empty clearing are part of the shell; the videos are never precached.

### The match frames

One sheet per hero at **4 px per world px** (`src/render/art3d/<hero>-match.png`, PNG, RGBA), rendered at 8 and averaged down, with its layout in `<hero>.json`. Four layers:

| Layer | View | Frames | Anchor |
|---|---|---|---|
| Body (no arms; the head held out) | 3/4 from the front right (34° round from the front, so both eyes show), 20° down | idle 8 (one breath, 3.14 s, the 2D rigs' breath), jog 12 (one stride), the cast pose 1 | the feet |
| Head (the hood and eyes; the body held out) | the same | one per body frame | the feet |
| Bow (both arms, the bow, the arrow) | profile, the bow broadside, aimed along +x | the string drawn in 8 steps (0 to full), loosed 1 | the bow shoulder |
| Draw hand (the right glove; the rest of the bow layer held out) | the bow layer's | one per bow frame, in the bow layer's box | the bow shoulder |

The body and head renders use holdouts, so together they are exactly the whole figure, shadows and occlusion included. Every frame has its **white twin** (the hit flash: the same alpha, white), every layer is cropped to one box so frames swap without moving, and the layout gives each body frame the point where the bow layer hangs (its shoulder). **`Ranger3DRig`** (`src/render/art3d/rangerRig.ts`, on `HeroRigBase`) draws body, bow layer, head, draw hand (the hand turned with the bow layer, so a hand drawn to the cheek shows over the hood); it keeps the 2D Ranger's timing exactly (the draw over the attack cooldown, the 110 ms release, the cast aims and loose point, the facing flip), shows the cast frame for the sky casts (Q, R), and steps its jog at the cadence that makes the planted foot hold the ground (`walkCadence`). The base gives the ring, shadow, flinch, hit and death flash and the death fall. The sheet loads one second after the first screen (`loadHeroSheets`, `main.ts`); a hero created before that, or if the sheet fails, gets its 2D rig, which also stays in `?showcase`. The hero's size on the map is unchanged (V-04's scales).

**Tuned for the match's size** (a hero ~2.2× on a phone, 16 px a tile), checked side by side with the 2D Ranger in zoomed crops against the lane and the moss (`docs/screenshots/3d-heroes/match-*`): a bolder silhouette line (1.5 world px, was 0.62), a brighter rim and the moonlit edge, lighter shadows than the stage's night, lines tinted but darker (they must hold against the lane), and the small parts made bolder for this size only (`MATCH_BOLD`: the bow, its string, the arrow, the gloves, sleeves and bracers pushed out along their surface by 0.1–0.42 world px after the skinning, so they keep their length); the bow's tips glow, as the 2D Ranger's do. The rig draws the bow layer (and the draw hand) 1.2× the body's size, so the bow reads as a bow; the draw hand stays under the head when he aims steeper than 0.6 rad (there it would land on the face like a nose).

### Sizes (V-05a round 2, 15 Oct 2026)

| File | Size | Budget | Encoding |
|---|---|---|---|
| `public/stage/ranger.mp4` | {MP4} B | 1.2 MB | H.264 (libx264 `veryslow`, `tune animation`), CRF {CRF}, level 4.2, yuv420p, one keyframe a loop, faststart, 8 s, 30 fps, 2400 × 900, no audio |
| `public/stage/ranger.webm` | {WEBM} B | 1.2 MB | VP9 (libvpx-vp9), CRF {WEBM_CRF}, the same frames |
| `public/stage/ranger-poster.webp` | {POSTER} B | 60 KB | WebP q{POSTER_Q}, frame 0 |
| `public/stage/clearing.webp` | {CLEARING} B | 60 KB | WebP q{CLEARING_Q}, the empty clearing |
| `src/render/art3d/ranger-match.png` | {SHEET} B | none (loaded a second after the first screen) | PNG, RGBA, every frame and its white twin |

**Re-render:** `npm run art:3d -- ranger` (about {BUILD_H} hours on 4 cores). The renders and the PNG sheet are repeatable (fixed Cycles seed and samples, no time or random input; numpy on the same machine), up to a few hundred edge pixels Cycles' threads can flip; the video encoders run threaded, so a re-encode can differ by a few bytes while looking the same. The hashes in `ranger.json` always come from the bytes written, so the client's `?v=` follows whatever was committed.

### Adding a 3D hero (V-05b)

1. Write `tools/blender/<hero>.py` beside `ranger.py`: materials from tokens (`shading.define`, with each material's line weight), skeleton, meshes, a `Poser`, the stage loop (`stage_pose`, `stage_springs`, `STAGE_*`), `body_frames()` / `bow_frames()` (or the hero's weapon layer), `HEIGHT`, `STAGE_HEIGHT` (the tallest moment of the loop, measured: keep weapons level with the head, or the hero shrinks on every stage), `STAGE_MID`, the layer sets, `MATCH_BOLD`, `CHECK_FRAMES`.
2. `npm run art:3d -- <hero> stage --frames … --out DIR --plate-cache DIR/plate.npz`, look at the frames and their fringe check, iterate; then the full render, `python tools/blender/contact.py <hero>` and the edge sheet; judge them against the quality bar, Han's notes first.
3. Client: the hero's layout and sheet in `HERO_3D` and `SHEETS`, its rig in `heroRig3d`, `test/art3d.test.ts` (it reads `HERO_3D`), the lobby browser tests.
