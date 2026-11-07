# V-08c look: the sizes of the towers, the Heart, the portals and the heroes

**Han, 7 Nov 2026,** from his Pixel at wave 13 on the Spire (the Warden, Full, Normal): the towers are too big against the portals and the Heart, and the Warden is too big. On his screenshot a tower stands as tall as the Heart and nearly twice a portal. This session shows **three sets of sizes on one real match frame, for Han to pick from**. It is **images only: nothing in the game changes** and no art is rendered again: the client, the sheets, the plate, the sim and the protocol are as they were (`PROTOCOL_VERSION` stays 25). Han picks 1, 2, 3 or his own numbers; the build session is written from the pick ("What the build session changes", below).

## The pictures

- **`docs/art/size-options.png`**, the sheet. Three columns, labelled only 1, 2 and 3: each the 412 × 839 phone at 2× over the 1280 × 720 desktop at 1×, the measured numbers under it. Under the three, the strip: the Warden idle between a Grunt and a Brute at each column's sizes, and once more at column 3 with the creeps a step smaller.
- **`docs/art/size-options/1.png`, `2.png`, `3.png`**: each column's phone frame alone at the phone's 2× pixels (824 × 1678). Opened on a phone, each fills the screen as the game does.
- **`docs/art/size-options/measures.json`**: every number below, and each tower variant's.

**The columns** (which is today is said here, never on the sheet):

| | Towers | Heart | Portals | Phone hero (Han's numbers) | `HERO_BOOST` it means |
|---|---|---|---|---|---|
| **1**, today | 100% | 100% | 100% | × 1.4 | 1.75 (today's) |
| **2** | 85% | 115% | 120% | × 1.25 | 1.5625 |
| **3** | 75% | 130% | 135% | × 1.1 | 1.375 |

**Han's hero numbers are V-04's.** The game's phone extras have been V-07e's since 24 Oct 2026: heroes × 1.75 and creeps × 1.45 (`entityScale.ts`), not × 1.4 and × 1.2. So column 1 is the game as it is (× 1.75), and columns 2 and 3 keep Han's steps against it: × 1.25 / 1.4 and × 1.1 / 1.4 of today's boost, the Warden 89% and 79% of today's height. Taken literally (`HERO_BOOST` 1.25 or 1.1) the Warden would be 31.7 or 27.9 px tall on the phone, under a Grunt's 33.4: see "The heroes and the creeps". Likewise the creeps stay at today's × 1.45 in every column (Han's "× 1.2").

**The towers are named in Han's note as Arrow, Cannon, Frost, Ballista, Flak and Arcane.** The game has five kinds, no Ballista (the Arrow tower is the crossbow); all five are on the frame.

**The held moment** (`npm run size-options -w @tdt/client`, `apps/client/scripts/sizeOptions.ts`, on the e2e build): a solo Full match on the Warden (level 8), `?lab`, clear weather, the afternoon's light. The Warden stands on the West lane's lower stretch above its bend and wave 13 is started; once Runners and a Brute are round him (wave 13 has no Grunts), every pad of the four columns is built in three ticks, Arrow, Cannon, Frost, Arcane and Flak at tiers 1, 2 and 3 (tier 3 on the top row: Arrow, Cannon, Arcane, Frost; Flak 3 on the East column), and the match is paused. (With all 26 towers standing, a wave dies long before it reaches the lane's lower half, so the towers go up round the pack.) The same paused frame is then drawn three times:

- **the towers, the Heart and the portals scaled about their ground points**: the pad's centre, the Heart's point and the portal's point, so nothing leaves its pad or footprint. Their roots are found in the Pixi stage through Pixi's own devtools hook (`__PIXI_APP_INIT__`) and get the column's factor on whatever scale the renderer sets each frame: a tower is drawn at the factor × today's drawn size, `towerScale`'s pad cap included;
- **the hero (and, in the strip, the creeps)** through the e2e hook's `scales`: `entityScales` with the column's boost.

The lane surge's flag ("East · Surge now", when the match's seed puts a surge on wave 13) is hidden on the frames: it hangs over the portals. The towers' lanterns (V-08a, faint in the afternoon) keep today's places in columns 2 and 3: they are placed when a tower's variant changes. **The strip** is composed from the match sheets themselves (in the frame the pack hides the figures): each figure's first idle frame, drawn at the phone's 2× pixels and its column's scale, feet on one line, shown 2.25× larger.

## The numbers

On the 412 × 839 phone at the fit (tile 15.85 px, 0.495 CSS px a world px), CSS px. A tower's height is its silhouette (alpha 200 and up, as `TOWER_REACH` is measured), from its base's lowest point to its roof or turret (`TOWER_TOP` + its `down`); its roof over its pad is `TOWER_TOP` (from the pad's centre, up the screen); the Heart, the portal and the Warden their silhouettes on their sheets (the Heart whole, the gatehouse, the Warden's first idle frame) at the column's scale.

| | **1** | **2** | **3** |
|---|---|---|---|
| Tower roof over its pad's centre, tier 1 / tier 3 (mean of the five kinds) | 2.39 / 2.62 tiles · 37.8 / 41.5 px | 2.03 / 2.23 tiles · 32.2 / 35.3 px | 1.79 / 1.97 tiles · 28.4 / 31.1 px |
| Tower drawn tall, tier 1 / tier 3 | 53.4 / 58.6 px | 45.4 / 49.8 px | 40.1 / 44.0 px |
| The tallest, the tier-3 Arrow | 63.5 px | 54.0 px | 47.7 px |
| Tower width over pad width, tier 1 / tier 3 | 0.81 / 0.90 | 0.69 / 0.77 | 0.61 / 0.68 |
| Heart tall (and wide) | 54.2 px (42.1) | 62.3 px (48.5) | 70.5 px (54.8) |
| Portal tall (and wide) | 31.9 px (51.5) | 38.2 px (61.8) | 43.0 px (69.5) |
| Warden tall | 44.4 px | 39.7 px | 34.9 px |
| **Tower : Heart : portal : hero** (towers: tiers 1 and 3 together) | **1.26 : 1.22 : 0.72 : 1** | **1.20 : 1.57 : 0.96 : 1** | **1.20 : 2.02 : 1.23 : 1** |
| A tier-3 tower against the Heart / a portal | 1.08 / 1.84 | 0.80 / 1.30 | 0.62 / 1.02 |
| A tier-3 tower against today's Warden (44.4 px) | 1.32 | 1.12 | 0.99 |

Today (column 1) a tier-3 tower is drawn 8% taller than the Heart and 1.84 times a portal: Han's screenshot, measured. Column 2 puts the Heart a quarter over a tier-3 tower and the portal at three quarters of one; column 3 makes the Heart one and a half times a tier-3 tower and the portal as tall as one. Note that the tower-to-hero ratio barely moves in 2 and 3 (1.20 against 1.26): the towers and the hero shrink together.

Every tower variant's numbers are in `measures.json` (`phone[n].towers`): its scale, roof, height, width and what it covers behind.

### What a roof covers (the tap rule from build 2)

A tower's drawn body is a tap target before the ground behind its pad (`towerRise`, `pickTower`): a tap on its roof is the tower. Behind a pad there is one tile of walk, then the next pad's front edge, so a roof covers the pad behind when it rises more than 1.5 + 1 tiles of ground (× cos 30°) over its pad's centre. Into the pad behind, in tiles of ground (the pad is 3 deep), today and at 2 and 3:

| | **1** | **2** | **3** |
|---|---|---|---|
| Arrow tier 1 / tier 3 | 0.78 / 1.16 | 0.29 / 0.61 | 0 / 0.24 |
| Cannon tier 1 / tier 3 | 0.43 / 0.53 | 0 / 0.07 | 0 / 0 |
| Frost tier 1 / tier 3 | 0.38 / 0.69 | 0 / 0.21 | 0 / 0 |
| Arcane tier 1 / tier 3 | 0.01 / 0.31 | 0 / 0 | 0 / 0 |
| Flak tier 1 / tier 3 | 0 / 0 | 0 / 0 | 0 / 0 |

Today every Arrow, Cannon and Frost covers the front of the pad behind it, the tier-3 Arrow more than a third of it (1.16 of 3 tiles). At 85% only the Arrows and the tier-3 Cannon and Frost reach it, the tier-3 Arrow a fifth; at 75% only the tier-3 Arrow, by a quarter tile. A smaller tower is a smaller tap target too: its box shrinks with it (`towerRise` uses `towerScale`), but never smaller than its pad, which stays the whole target.

### The top row and the HUD

The first row of pads (rows 4–6) under the 44 px top bar and the ⤢ button (top right, 46–90 px down, 364–408 across):

| | **1** | **2** | **3** |
|---|---|---|---|
| Highest tier-3 roof (the Arrow, top left) under the bar's edge | 25.3 px | 32.8 px | 37.8 px |
| The top-right tier-3 Frost's roof under the ⤢ button (the button's bottom edge below the roof) | 14.3 px | 7.7 px | 3.4 px |
| A portal's top against the bar's edge (negative: under the bar) | −0.1 px | **−4.3 px** | **−7.4 px** |

Every tier-3 roof clears the bar at every size. The ⤢ button already covers the top of the top-right pad's roof today (14 px), less at 2 and 3. **The portals sit right under the bar**: today their top touches it; at 120% and 135%, grown about their point, the bar covers the top 4 and 7 px of the gatehouses (11% and 17% of their height). The build session either accepts that, or stands the portals that much lower (0.27 and 0.47 tiles of view: their point from row 1.5 to about 1.8 and 2.0), which keeps their tops where they are today; a portal's arch and the creeps leaving it stay above the first pad row at either.

### The Heart

The Heart stands on the lanes' last stretch, its point at row 36; its roof rises over the ground behind it (the stretch the creeps walk in on, and the hero's spawn at row 33) by 2.7 tiles of ground today, 3.1 at 115% and 3.5 at 130%. Creeps are drawn behind it there in every column, as today for the last 2.7 tiles. At 130% it is 54.8 px wide on the phone, a little wider than a pad (47.5 px); it never reaches one (the nearest are about 9 tiles away).

### The heroes and the creeps

| | **1** | **2** | **3** | **3, creeps a step smaller** |
|---|---|---|---|---|
| Warden | 44.4 px | 39.7 px | 34.9 px | 34.9 px |
| Grunt / Brute / Runner | 33.4 / 37.7 / 43.0 px | the same | the same | 30.6 / 34.5 / 39.5 px |
| Warden : Grunt / Warden : Brute | 1.33 / 1.18 | 1.19 / 1.05 | 1.04 / **0.93** | 1.14 / 1.01 |

The creeps keep today's × 1.45 in columns 1–3. **At column 3 the Warden is shorter than a Brute** (0.93) and barely taller than a Grunt (1.04): the hero no longer stands out of his pack. **So column 3 wants the creeps a step smaller too**: Han's "× 1.1" against his "× 1.2" (`CREEP_BOOST` 1.45 → 1.329), the strip's fourth cell, puts the Warden back over the Brute (1.01) and at 1.14 Grunts, close to column 2's proportions. Column 2 does not need it (the Warden still clears the Brute). Taken literally, Han's hero numbers (`HERO_BOOST` 1.25 or 1.1) would draw the Warden at 31.7 or 27.9 px, under every creep but the Grunt at 1.25 and under all of them at 1.1, which is why the columns read them as steps against today.

The 1280 × 720 desktop frame is the wide layout at tile 16.26: its units get nearly the whole phone extra too (`entityScales` grows it as tiles shrink under 25 px), so every column changes the desktop the same way.

### Sharpness: no page is rendered again

The structures' pages are drawn at 2.75 sheet px a world px (§15). A tower is drawn at its scale × the camera's zoom × the screen's pixel ratio:

| Device px a world px, tier-1 Arrow | **1** | **2** | **3** |
|---|---|---|---|
| At the fit, Pixel 7 (2.625×) / a 3× phone | 1.69 / 1.93 | 1.44 / 1.64 | 1.27 / 1.45 |
| Pinched to 1.8×, Pixel 7 / 3× | 3.04 / 3.48 | 2.59 / 2.95 | 2.28 / 2.61 |

At 85% and 75% **the 2.75× pages are sharper than the screen needs at every zoom on a Pixel 7** (pinched in, today's towers are already drawn a little past the page's pixels, 3.04 against 2.75; at 85% and 75% they stay under it); on a 3× phone pinched in they are drawn 7% (85%) or nothing (75%) past the page, where today's are 27% past. No size needs the pages rendered again. One thing to watch on Han's Pixel: at the fit the pages are shrunk 1.6:1 today, 1.9:1 at 85% and 2.2:1 at 75%, and they have no mipmaps, so past 2:1 a turret's fine lines can shimmer a little as it turns. If they do, the build turns on mipmaps for the four pages (a third more GPU memory for them, about +21 MiB) rather than rendering anything again.

The Heart and the portals grow on the same pages. At the fit they stay under the page's pixels (the Heart at 130% 1.69 device px a world px on a Pixel 7, a portal at 135% 1.75); pinched to 1.8× they are drawn 11% and 15% past it (3.04 and 3.16 against 2.75; 2% past for a portal at 120%, under it for the Heart at 115%): a slight softening, the same as today's towers pinched in. Nothing needs rendering again for them either.

## The columns, read

**1, today.** The towers are the biggest things on the map: a tier-3 tower stands taller than the Heart (1.08) and nearly twice a portal (1.84); the Arrows, Cannons and Frosts cover the front of the pad behind them; the Warden stands 1.33 Grunts tall. This is what Han saw on his Pixel.

**2, the middle step.** The Heart is clearly the largest building (1.25 tier-3 towers), the portals three quarters of a tower, and the towers fill 69–77% of their pads, leaving the pads' stone round them visible. Only the Arrows still reach the pad behind. The Warden is 11% smaller and still stands over every creep but a Runner. The portals lose their top 4 px under the bar unless they are stood a little lower. Nothing else needs changing.

**3, the biggest step.** The Heart is one and a half tier-3 towers and the obvious goal of the map; a portal is as tall as a tower; the towers sit inside two thirds of their pads and cover nothing behind them but the tier-3 Arrow's quarter tile. The Warden is 21% smaller, which on the phone is 35 px: shorter than a Brute unless the creeps come down a step with him (the strip's fourth cell). The portals lose their top 7 px under the bar unless stood lower.

## What the build session changes, by pick

Client only in every case: no sim, protocol, server, tuning or art change. None of these renders anything again.

- **Towers (85% or 75%):** one factor after the pad cap, in `towerScale` (`entityScale.ts`): `Math.min(scale, PAD_HALF_PX / reach) × TOWER_SIZE`, `TOWER_SIZE` 0.85 or 0.75 (a lower `MAX_TOWER_SCALE` alone would not do it: the pad cap already holds the wide variants under 1.3, so they would not shrink as much). It applies wherever `towerScale` does, so the drawn tower, its tap box (`towerRise`, `pickTower`, the touch candidates) and the lanterns (placed with the root's scale) follow at once; on a desktop or tablet (tiles of 25 px and up, tower scale 1) the towers shrink by the same factor. **`TOWER_REACH` and `TOWER_TOP` do not move**: they are the art's measurements at scale 1, and the test that checks them against the pages is unchanged. **The pad check holds** (a smaller tower reaches less far: never past its pad sideways or below its south edge). The tower's HP bar is a child of its root, so it shrinks and drops with it: the build puts it back over the smaller roof (its `y` from `towerTop` × the drawn scale) and keeps its width. `entityScale.test.ts` gains the factor; the tap test in `mobile.spec.ts` and `npm run camera-shots -- --build 2`'s tap picture are run again.
- **The Heart (115% or 130%):** `HEART_SCALE` on the Heart's root (`makeHeart`, world.ts), about its point. What hangs off it in root px follows (the 3D view, its glow ellipse and warning ring, the windows); what the renderer places from its points in world px is multiplied by it: the shards' and flash's height (`fxY`), the blaze (`blazeY`), the embers, and the light pool's radius round it (`pools.ts`). Its HP shows in the top bar, not over it, so nothing else moves.
- **The portals (120% or 135%):** `PORTAL_SCALE` on each portal's root (`makePortals`); the swirl, glow and flare in the arch are its children and follow; the motes drawn into the arch (`updatePortals`) and the pool round it take the factor. Han chooses whether their tops go 4 or 7 px under the bar or the portals stand 0.27 or 0.47 tiles of view lower (`stand(root, p.x, p.y + 1 + …)`).
- **The hero (column 2 or 3):** `HERO_BOOST` 1.75 → 1.5625 or 1.375 (`entityScale.ts`, its test). Everything that reads `scales.hero` follows (the hero's drawn size, its death effect, the Rampart Slam ring's reach); the hero stage on the home card is a separate size (`stage.stand`, §15) and does not change.
- **The creeps (column 3, if Han takes the strip's fourth cell):** `CREEP_BOOST` 1.45 → 1.329. Their tap radius (`creepRadius`), the HP bars' lift and the damage numbers follow `scales.creep`.
- **Own numbers:** any factor works the same way; the sheet is made again with them by editing `OPTIONS` in `scripts/sizeOptions.ts` (about 3 minutes after `npm run build:e2e -w @tdt/client`).

Then, as for every art change: `npm run camera-shots -w @tdt/client` (build 3's pictures), the press stills and the link card made again if Han wants them current, and Han's look on his Pixel.
