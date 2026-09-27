# Tower Defense Together: Art Direction ("Runelight")

> **The style guide for every art session.** Read it before drawing anything, together with `CLAUDE.md` (architecture and performance rules) and `docs/MOBILE.md` §7 (performance targets). If you make an art decision this guide doesn't cover, add it here and log it in `GAME_DESIGN.md` §13.

Art Track 0 chose style C, **"Runelight"**, from the art-direction spike (styles A/B/C, compared on phones). It is now the game's only look. Everything is **drawn in code** (Canvas 2D paths) and **baked once** into atlases at start-up; there are no image files. Entities that have no art yet keep their Phase 1 shapes until an art session draws them.

## 1. The look in one paragraph

Twilight in a mossy forest clearing. Dark teal-green moss, packed-earth lanes worn pale in the middle, a few glowing motes. Every part has an **ink outline**, a body that **darkens downwards**, and a **cool moonlit rim** on its upper-left edge. Colour is used sparingly: materials are muted (wood, stone, iron, cloth), and the brightest things on screen are small **glowing accents**: runes, embers, eyes, gems. Creeps are warm (reds, oranges) against the cool ground so they are always the brightest thing on a lane; the player's side is cool and teal-lit; the enemy's portals are violet.

**Status (Art Track 2):** restyled: the ground and forest, build pads, portals, the Heart, the Ranger, Grunt and Brute, and **all five towers** (Arrow, Cannon, Frost, Arcane, Flak) at tiers 1–3 with **all ten branches**. Still shapes: the other creeps and bosses, the Warden and Arcanist, projectiles and traps. `?showcase` lists both.

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
| `forest` / `tree` | `#172416` / `#21381f` | Blocker tiles and their canopies |
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
| **Creeps** | | |
| `grunt` / `gruntBelly` | `#e0503f` / `#e8a070` | Grunt |
| `brute` | `#8c3440` | Brute's skin |
| **Glow accents** (drawn with `p.accent`) | | |
| `rune` | `#7ffcd8` | Player-side magic: tower runes, pad studs, sighting crystals |
| `ember` | `#ffa24a` | Fire: cannon runes, fuses, mortar, the Heart's core |
| `frost` | `#9fe8ff` | Frost tower runes and cores |
| `arcane` | `#d68cff` | Arcane tower runes and orbs |
| `voidGlow` | `#ff5fd2` | The Void branch's rim and needle |
| `flare` | `#ff6a3d` | Flak runes and breeches (redder than `ember`) |
| `eye` | `#ffd24a` | Creature eyes |
| `heroEye` | `#b6ff9e` | Hero eyes under a hood |
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
- A cool moonlight wash near the top, a vignette at the edges; forest (blocker tiles) is dark ground with round canopies.
- **Build pads** (`entities/pad.ts`) are sprites on top of the ground, not painted into it: a slab of cool carved stone, lighter than both moss and lanes, with a moonlit edge, an inset groove, calm flagstone seams, a faint build ring and four dim rune studs. A white `rim` and `wash` are **tinted at runtime**: solo and open pads get a faint moonlit rim (35%); in multiplayer each pad gets its owner's zone colour (`PLAYER_COLORS`: blue, orange, violet, green by seat), bright on your own pads (rim 95%, wash 20%) and dim on teammates' (50%, 8%).

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

- **Creeps:** one sprite each (shadow and weapon baked in). Walk = rock around the feet + hop each step, flipped to the walking direction (`GAITS.waddle`: 105 ms steps, 0.15 rad rock, 2.2 px hop; `GAITS.stomp` for heavy creeps: 190 ms, 0.07 rad, 1.2 px, 5% squash). Rooted or stunned creeps stand still. Pick a gait or add one to `GAITS`.
- **Towers:** the turret turns towards the target at **7 rad/s** (towards its last shot for 0.9 s, else the nearest creep it can hit); on a shot the gun **recoils** back along the barrel (140 ms, up to ~5 px); a new or upgraded tower pops in (260 ms overshoot). Every tower turns (`turret: true`). An all-round blast with no projectile (the Blizzard pulse) doesn't recoil: on its `aoe` event the whole tower **swells** and settles (220 ms, up to +12%, the same in every direction).
- **Heroes:** walk bob and stepping feet from their speed; a weapon aimed along `facing`; an attack animation keyed to `shot()` and the hero's attack cooldown (the Ranger draws the string back over the cooldown and releases on the shot).
- **Hit flash:** a white **silhouette** of the body (`flash` on the frame) whose **alpha** goes up for 90 ms, at most every 200 ms. Frost tints the whole rig icy (`#bfeaff`). Art keeps its own colours; nothing is re-coloured by a tint except frost.
- **The Heart** beats (lub-dub, faster below 30% HP), floats ±2.5 px, flashes and wobbles when hit. **Portals** turn their swirl and flare at each wave start.
- Idle motion is subtle (≤ 0.5 px breathing); big motion is for things that matter (moving, shooting, being hit).

## 8. Effect colours

Effects (`render/fx/`) are client-only particles and sprites; their colours live in `render/palette.ts`, shared with the shapes and the HUD. Keep these meanings:

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
| Portals, enemy magic | `#9b5de5` / `#8a4fe0` | `COLORS.portal`, `RL.portal` |
| Zones by seat | `#4f9dff`, `#ff9f43`, `#b56cff`, `#3ddc84` | `PLAYER_COLORS` |

Light (glows, sparks, trails, muzzle flashes) uses **additive** blending; dust, debris and shadows use normal blending. A new effect reuses these meanings before inventing a colour.

## 9. Performance rules

The 300-creep stress scene (`?stress=300`) must stay **≥ 30 FPS** (MOBILE §7; `perf.spec.ts` checks the JavaScript per frame).

- **Bake, don't draw.** Everything is drawn once into the art atlas (`art/atlas.ts`: 1024 px pages at 2 px per world px, shelf-packed, tallest first) or the ground canvas. Never create or redraw a `Graphics` per frame.
- **One sprite per creep** (shadow and weapon baked in); rigs for heroes and towers use a handful of sprites.
- **No per-frame visibility toggles.** In Pixi v8, changing `visible` (or adding / removing children) rebuilds the draw list. Hide parts with `alpha = 0`, flash with alpha, and only toggle `visible` when something really appears or disappears (culling, a pooled sprite coming back).
- **Tints are quantised** and set only when they change (a creep that isn't hit or slowed costs nothing).
- **Frames stay small:** at most 200 × 200 world px (the registry refuses bigger); size a frame to its drawing plus the glow (~8 px). Every page is 4 MB of GPU memory, so prefer reusing a frame (tint, flip, scale) over a near-copy. With every tower drawn (50 tower frames) the atlas is **2 pages**. The bake is timed as `tdt:art-bake` (a `performance` measure) and the first screen as `tdt:ready`: going from 1 page to 2 took the bake from ~10 to ~19 ms (median; ~52 → ~94 ms at 4× CPU throttling) and open → lobby from ~204 to ~214 ms (~663 → ~717 ms at 4×), Pixel 7 emulation, cold.
- Pool sprites that come and go (creeps, projectiles); rigs are pooled with their creep sprite.

## 10. Adding a new entity (checklist)

1. **Read** this guide and look at `?showcase` (dev server: `npm run dev`, then `/?showcase`).
2. **Create one file** `apps/client/src/render/art/entities/<id>.ts`, named after its registry id (e.g. `archer.ts`, `frostTower.ts`). It draws its frames and calls `registerArt({...})` at the end. **Don't edit shared files**: `load.ts` imports every file in `entities/`, the renderer picks the art up by kind, and `?showcase` lists it.
3. Pick the category and its required frames (`REQUIRED_FRAMES` in `registry.ts`):
   - **creep**: `body` with contact shadow and weapon baked in, `flash` set (the silhouette without the shadow), `feet`, a `gait` from `GAITS`.
   - **tower**: `base1..3` and `top1..3` (top points +x), optional `<branch>.base` / `<branch>.top` for its two branches (`TOWER_BRANCHES`), `turret`.
   - **hero**: any frames plus a `rig(kit, mine)` returning a `HeroRig` (see `ranger.ts`); the `mine` ring on the ground, a shadow from `common/shadow`.
4. Use **tokens only** (`k.<token>`; add new ones to `RL` and to §2), the **painter** calls (§3), light from the upper left, glow only on emitters.
5. Follow the **camera** (§5) and **size** (§6) rules; check the phone-size copy in `?showcase` in both Normal and Bright.
6. Animate with transforms, tint and alpha only (§7, §9).
7. Run `npx vitest run --project client` (the art tests check ids, frames, sizes and packing), `npm test`, `npm run build`, and `npm run test:e2e` (the showcase test finds your file by name; the stress test keeps ≥ 30 FPS).
8. Update §1's status line and, if you decided something new, this guide and the Decision Log.

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
  rigs.ts          CreepRig, TowerRig, GAITS
  ground.ts        The ground painter
  entities/        One file per entity (ranger, grunt, brute, arrowTower, cannonTower, frostTower, arcaneTower, flakTower,
                   heart, portal, pad)
apps/client/src/showcase.ts   ?showcase dev page
```
