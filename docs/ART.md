# Tower Defense Together: Art Direction ("Runelight")

> **The style guide for every art session.** Read it before drawing anything, together with `CLAUDE.md` (architecture and performance rules) and `docs/MOBILE.md` §7 (performance targets). If you make an art decision this guide doesn't cover, add it here and log it in `GAME_DESIGN.md` §13.

Art Track 0 chose style C, **"Runelight"**, from the art-direction spike (styles A/B/C, compared on phones). It is now the game's only look. Everything is **drawn in code** (Canvas 2D paths) and **baked once** into atlases at start-up; there are no image files. Entities that have no art yet keep their Phase 1 shapes until an art session draws them.

## 1. The look in one paragraph

Twilight in a mossy forest clearing. Dark teal-green moss, packed-earth lanes worn pale in the middle, a few glowing motes. Every part has an **ink outline**, a body that **darkens downwards**, and a **cool moonlit rim** on its upper-left edge. Colour is used sparingly: materials are muted (wood, stone, iron, cloth), and the brightest things on screen are small **glowing accents**: runes, embers, eyes, gems. Creeps are warm (reds, oranges) against the cool ground so they are always the brightest thing on a lane; the player's side is cool and teal-lit; the enemy's portals are violet.

**Status (Art Tracks 1–3):** restyled: the ground, the forest (trees over the border and the safe zone) and a few props, build pads, portals (with a wave-start flare), the Heart (with damage states), **all three heroes** (Ranger, Warden, Arcanist, with walk, attack, cast, hit and death; Art Track 1; the Warden's melee reworked to read at phone size, §7), **every creep** (Grunt, Archer, Runner, Brute, Wisp, the Matriarch's Hatchlings) and **the three bosses** (Ironhorn, Matriarch, Shardback with both hides), **all five towers** (Arrow, Cannon, Frost, Arcane, Flak) at tiers 1–3 with **all ten branches** (Art Track 2), every effect colour (§8) and the whole UI (§12: HUD, radial menus, skill buttons, lobby, settings, end screen, code-drawn icons). Still shapes: projectiles and traps. `?showcase` lists both, the UI icons and the sounds. **Sound** (§13): music and every effect, made in code.

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
| **UI icons** (they also use the tower tokens below: `ice`, `amethyst`, `arcane`…) | | |
| `mana` | `#4a8cff` | The mana drop (Clarity Aura icon) |
| **Pads** | | |
| `padStone` / `padStoneDark` / `padGroove` | `#6b7189` / `#3c4052` / `#2a2d3b` | Build pads: cool stone, lighter than moss and lanes |
| **Materials** | | |
| `wood` / `woodDark` | `#8f5d38` / `#5c3a22` | Decks, stocks, carts, clubs |
| `stone` / `stoneDark` | `#8f8ba2` / `#58556d` | Keeps, pedestals, portal rims |
| `iron` / `ironDark` | `#444b5b` / `#262b36` | Armour, barrels, crossbow arms |
| `gold` | `#e8b94a` | Tier-3 trim, buckles, tips (gold = upgraded / valuable) |
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
| `p.accent(c, path, color)` | Coloured glow (7 px blur) with a hot core | Runes, gems, embers, glowing eyes: **only** things that emit light |
| `p.line(c, path, color, width, alpha?)` | Round-capped stroke | Strings, seams, cracks, facets |
| `p.shadow(c, x, y, rx, ry)` | Soft radial contact shadow | Under anything standing on the ground |

- **Outline weights** (world px, `LINE` in `paint.ts`): body parts **2.4** (`opts.line` scales it: 0.6–0.8 for small parts such as feet, hands and bolts, up to 1.2 for the Heart); details **1.1**; lines 1–2.4. Inner parts that sit on an outlined part may skip the outline (`noOutline`).
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
- Frames are drawn in **world px around (0, 0)** (1 tile = 32 px); the atlas bakes them at 2×.

## 6. Size and readability at phone size

On the reference phone (412 × 839, Spire's 26 tiles across the width) a tile is **15.85 px**. The renderer scales creeps and heroes by up to 1.6 and towers by up to 1.2, so on a phone:

| Thing | World px → phone px | Example |
|---|---|---|
| Creeps, heroes | × 0.78 | a Grunt frame 32 × 36 → 25 × 28 px |
| Towers | × 0.59 | an 84 px tower frame → 50 px |
| Heart, portals, pads | × 0.50 | a 96 px pad → 48 px |

Rules:
- **Silhouette first.** Each entity must be recognisable from its outline alone at phone size (`?showcase` shows each at that size, bottom right of its card). Different creeps need different silhouettes, not just different colours.
- **Body size follows the sim:** a creep's or hero's body spans about 2 × its `radius` (tuning.ts, in tiles × 32); weapons, horns and shadows may stick out. A tower fits its 84 px frame and stays inside its pad (3 tiles = 96 px) at × 1.2.
- **Smallest detail:** 2.5 world px for characters (~2 px on a phone), 3.5 for towers. Anything smaller is texture, not information.
- **Contrast hierarchy:** creeps (warm, bright) > heroes > towers > pads > lanes > moss. Creeps must stay distinct from the lane (`#5a4c3a`) and the moss; tower tiers must be told apart by shape (ring size, merlons, second crossbow, gold trim), not only by colour.
- Leave the HP bar zone clear: bars sit ~7 px above a creep's radius and 12 px above a hero's.

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
- **Flyers** (the Wisp) are the one exception to "one sprite": their shadow is a second, static sprite (`shadow` frame) on the ground, `feet` px below the body's centre, so the body can bob over it; the rig pivots at the shadow. Flyers are few (a handful per lane), so the extra sprite is free.
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
| Root / snare | `#c8a165` | `COLORS.root` |
| Stun | `#ffe066` | `COLORS.stun` |
| Shield / Last Stand | `#ffd24a` | `COLORS.shield`, `AOE_COLORS.lastStand` |
| Fire (Fireball, Meteor) | `#ff8a3d`, `#ff5a1f` | `AOE_COLORS`, `ZONE_COLORS` |
| Ranger skills (Multishot, Arrow Storm) | `#e6ff7a` | `PROJECTILE_COLORS.multishot`, `ZONE_COLORS.arrowStorm` |
| Portals, enemy magic | `#8a4fe0`, Wisp `#b98cff` | `COLORS.portal` = `RL.portal`, `CREEP_COLORS.wisp` = `RL.wisp` (its hit sparks and death burst match its art) |
| Player-side magic, wave starts | `#7ffcd8` | `FX.rune` = `RL.rune` |
| Tower shots (muzzle flash, trail) | the tower's glow token: Arrow `rune`, Cannon `ember`, Frost `frost`, Arcane `arcane`, Flak `flare`; branches with their own glow override it (Void `voidGlow`, Prism `crystal`, Glacier `ice`, Hailstorm `snow`, Sniper / Skyguard `moon`, Mortar fire, Shrapnel ember light) | `SHOT_COLORS`, `BRANCH_SHOT_COLORS`, `shotColor(kind, branch)` |
| Blizzard pulse | `#cff4ff` shockwave, frost-light inner ring, flakes whirled out | `fx.blizzardPulse` (the tower swells too, §7) |
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
- Pool sprites that come and go (creeps, projectiles); rigs are pooled with their creep sprite.

## 10. Adding a new entity (checklist)

1. **Read** this guide and look at `?showcase` (dev server: `npm run dev`, then `/?showcase`).
2. **Create one file** `apps/client/src/render/art/entities/<id>.ts`, named after its registry id (e.g. `archer.ts`, `frostTower.ts`). It draws its frames and calls `registerArt({...})` at the end. **Don't edit shared files**: `load.ts` imports every file in `entities/`, the renderer picks the art up by kind, and `?showcase` lists it.
3. Pick the category and its required frames (`REQUIRED_FRAMES` in `registry.ts`):
   - **creep**: `body` with contact shadow and weapon baked in, `flash` set (the silhouette without the shadow), `feet`, a `gait` from `GAITS`. A flyer draws its shadow as its own `shadow` frame instead (the registry refuses a flyer without one). Other looks go in `variants` (frames the size of `body`, each with a flash).
   - **tower**: `base1..3` and `top1..3` (top points +x), optional `<branch>.base` / `<branch>.top` for its two branches (`TOWER_BRANCHES`), `turret`.
   - **hero**: any frames (each with `flash: true` for the hit flash) plus a `rig(kit, mine)` returning a `HeroRig`: extend `HeroRigBase`, make parts with `this.part(frame)` and pose them in `pose()` (walk, attack from `shotAt`, cast from `casting()`); see `ranger.ts`, `warden.ts`, `arcanist.ts`.
4. Use **tokens only** (`k.<token>`; add new ones to `RL` and to §2), the **painter** calls (§3), light from the upper left, glow only on emitters.
5. Follow the **camera** (§5) and **size** (§6) rules; check the phone-size copy in `?showcase` in both Normal and Bright.
6. Animate with transforms, tint and alpha only (§7, §9).
7. Run `npx vitest run --project client` (the art tests check ids, frames, sizes and packing), `npm test`, `npm run build`, and `npm run test:e2e` (the showcase test finds your file by name; the stress test keeps ≥ 30 FPS).
8. Update §1's status line and, if you decided something new, this guide and the Decision Log.

A **prop** (category `prop`) is a file too: frames are its variants, `where` says forest or clearing, `weight` how often it is picked; the ground painter places it (§4). Check it in the real map as well as `?showcase` (it must not look like a creep or something to tap).

A **new category** (e.g. projectiles or traps) is the one case that touches shared files: add its type and required frames to `registry.ts`, its use to `render/world.ts`, its cards to `showcase.ts`, and a section here.

## 11. Files

```
apps/client/src/render/art/
  tokens.ts        RL palette tokens, Display, LIGHTING, liftColor
  paint.ts         The painter (part / detail / accent / line / shadow), LINE weights, path helpers, hash
  parts.ts         Shared drawing helpers (planks, stone blocks, rune rings, tower tier runes)
  registry.ts      registerArt, entry types by category, REQUIRED_FRAMES, lookups (creepArt, towerArt…)
  load.ts          Imports common.ts and every file in entities/ (import.meta.glob)
  common.ts        Shared frames (contact shadow)
  atlas.ts         Bakes every frame into 1024 px pages (+ flash silhouettes); re-bakes on Display change
  kit.ts           ArtKit: the atlas, sprite(id, frame), setDisplay
  rigs.ts          CreepRig, TowerRig, HeroRigBase, GAITS, HIT_FLASH, DEATH / deathPose (hit and death reactions)
  ground.ts        The ground painter
  scatter.ts       Where props go (pure, tested)
  damage.ts        The Heart's damage stages (pure, tested)
  icons.ts         UI icons (§12): drawn with the painter, baked to CSS images
  entities/        One file per entity (ranger, warden, arcanist, grunt, archer, runner, brute, wisp, hatchling, ironhorn,
                   matriarch, shardback, arrowTower, cannonTower, frostTower, arcaneTower, flakTower, heart, portal, pad,
                   tree, rock, mushrooms, runestone)
apps/client/src/showcase.ts   ?showcase dev page (entities, variants, UI icons, sounds)
apps/client/src/audio/        Sound (§13): synth, sound bank, mix, score, engine, music, game events → sounds
apps/client/src/style.css     The Runelight UI (§12)
```

## 12. UI

The DOM UI follows the same look (`style.css`, variables at the top of `:root`):

- **Panels** (top bar, popups, team, settings, lobby card, end card, chips): mossy dusk darkening to ink (`--panel`), an ink outline, a moonlit hairline on the upper-left inside edge and a soft night shadow (`--panel-shadow`). The phone top bar adds a thin gold trim underneath.
- **Buttons** are carved stone (`--stone`, `--stone-rim`); the main action (`.btn.big`: Play, Ready, Got it) glows rune-teal; selected choices get a rune outline and a teal-tinted stone; "value" is gold (costs, gold, skill ranks, learn buttons).
- **Titles** (logo, banner, end title, headings, stat labels) use the carved serif stack `--title-font` (Palatino / Book Antiqua / Georgia: system fonts, no downloads); body text stays system sans.
- **Radial menus and skill buttons** are stone medallions: radial buttons rimmed in rune-teal (gold when armed), skill buttons in moonlight, with a code-drawn icon, the key letter as a small badge, pips and a conic cooldown.
- **Icons** are drawn in code (`render/art/icons.ts`) with the painter and tokens, in a 40 × 40 box, bold enough for 20–32 CSS px: a tower icon per kind, a skill icon per hero and slot, a hero emblem per hero, and HUD glyphs (coin, Heart, cracked Heart, wave, timer, gear, upgrade, sell, target, level). `installIcons()` bakes them once at start-up to PNG data URLs published as `--icon-<id>`; an element shows one with `class="ico" style="--ico: var(--icon-<id>)"` (or `background-image`). No icon packs, fonts of symbols or image files. A new tower, hero or skill needs its icon (a test checks).
- **End screen:** the Heart emblem, whole and beating on a victory, split on a defeat, over a gold-trimmed card.
- The e2e layout tests check the UI stays clear of the map; keep panel sizes as they were when restyling (a heading one pixel taller moved the desktop tower panel under a test's wheel point).

## 13. Sound

The sound pass follows the same rules as the art: **everything is made in code** (Web Audio API, no sound files, no sound packs) and **baked once**. The code lives in `apps/client/src/audio/` (`index.ts` lists the files).

**The sound of Runelight:** soft magical **chimes and bells** for magic, gold and good news; **wooden knocks and thuds** for towers, bows and building; **filtered noise** for whooshes, wind and dust. Nothing harsh: sines, triangles, plucked strings and bell partials, with `square` / `saw` rounded off and low-passed, and noise always filtered. A unit test checks every sound's brightness (RMS of the first difference over the RMS; ≤ 0.9, about a pure sine at 3.5 kHz). Chimes use the music's key (D: D E F♯ A B for good news, D F G A C for bad news), so effects never clash with the music.

- **Synth** (`synth.ts`, pure, tested): a sound is data (`SynthDef`): layers of tone or noise, each with an attack, an exponential decay, a pitch glide, bell partials, a filter sweep, vibrato or a detuned copy, plus an optional echo. `renderSound` renders it at **24 kHz** (soft sounds have little above 10 kHz; half the usual rate halves bake time and memory), normalised to a 0.9 peak, deterministic.
- **Bank** (`sounds.ts`): every effect with its **volume**, **cooldown** (ms between two plays; yours and others' count apart), **most voices at once** and **priority** (0 frequent and skippable, 1 normal, 2 must be heard), and the music's six instruments (bell, pad, bass, drum, woodblock, shaker). A new tower, hero or skill needs its sounds here (a test checks every tower kind, hero attack and Q / W / R).
- **Baking:** after the first tap a Web Worker (`bake.worker.ts`) bakes the whole bank (UI and music first; ~0.15–0.4 s of worker time on a desktop) and posts the samples back; a sound asked for before it is baked is skipped.
- **Events → sounds** (`gameAudio.ts`, tested with a fake sink): only from what the client already gets: events (kills, leaks, waves, casts, level-ups, tower builds / upgrades / branches / sales, rejections, the end) and two facts the renderer derives (`onTowerShot` when a tower's projectile appears, `onMeleeImpact` when the Warden's blade visibly lands). Ranged attacks sound on their `heroAttack` event, melee ones on the impact. Branch shots play their tower's sound at another pitch (`BRANCH_RATE`: Sniper, Mortar, Void lower; Volley, Prism, Hailstorm higher); upgraded towers a touch lower; small creeps pop higher, big ones lower.
- **Mixing** (`mix.ts`, pure, tested): your hero, towers and kills play at full level, a teammate's at 50%; on-screen sounds at full level panned a little to their side, off-screen ones from 60% fading out over 8 tiles and then skipped (yours never are). Voices are capped at 12 for priority 0, 20 for priority 1 (yours get +1), 26 for warnings, and each sound has its cooldown and most-at-once, so 300 creeps never make noise. A compressor on the master bus catches the rest. **Muted or at 0% nothing is even considered.**
- **Music** (`score.ts` + `music.ts`): code-made loops in D minor / dorian: a calm **lobby loop** (72 bpm, pad, soft bass and a slow bell tune) and a **match loop** (96 bpm) whose layers follow the match: `base` (pad and bells) while building, `pulse` (bass, woodblock, shaker) during waves, `boss` (frame drums, driving bass, a high bell ostinato) on a boss wave or while a boss lives; layers fade in over ~1.5 s. A victory or defeat fanfare plays in 4.5 s of quiet, then the lobby loop. A look-ahead scheduler queues notes 0.3 s ahead on the audio clock every 80 ms, so music never depends on the frame rate. **Recorded music:** put `lobby.mp3`, `match.mp3` (and `boss.mp3`) in `apps/client/public/music/` and set `MUSIC_DIR` in `musicFiles.ts` to `'/music/'`.
- **Mobile** (`engine.ts`): the AudioContext is created on the first tap or key press (iOS needs a gesture; a silent buffer is played in it for older iOS); on iPhone the audio session is **ambient** (`navigator.audioSession`, Safari 16.4+), so the silent switch mutes the game and other apps' music keeps playing. Hidden page (another app, screen locked) → the context is suspended; back → resumed, or on the next tap if the browser insists.
- **Settings:** ⚙ → Sound: a mute button and Music / Effects sliders (defaults 50% / 80%, 5% steps, squared to gain so the slider feels even), saved in `tdt.settings`; the lobby has a speaker button that mutes too.
- **Check:** `?showcase` → Sounds plays every effect at its in-game level and each music scene; `docs/MOBILE_TESTING.md` §8 is the real-device sound check.
