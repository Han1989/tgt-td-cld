# V-08b look: the tilted camera, three pitches

**Han, 5 Nov 2026:** a reference clip of an isometric courtyard; he wants its depth. This session shows **three pitches of one camera for Han to pick from on his phone**, on one real match frame. It is **images only: nothing in the game changes.** The committed plate, the sheets, the client, the sim and the protocol are as they were (`PROTOCOL_VERSION` stays 24). Han picks A, B, C or none; the build sessions are written from the pick (see "What a pick costs").

**The camera.** One orthographic (dimetric) camera looking up the map from the south, the map's +y toward the bottom of the screen as today, tilted from straight down: **A 20°, B 30°, C 40°** (today is 0°). Its elevation is 90° − pitch: 70°, 60°, 50° above the horizon. At any pitch the ground maps onto the screen affinely: x unchanged, y × cos(pitch); a point z world px above the ground is drawn z × sin(pitch) higher.

## The pictures

- **`docs/art/camera-options.png`**, the sheet. From top to bottom:
  - Today's frame (a screenshot of the game) and A, B and C composed at the same held moment on a 412 × 839 phone, the HUD over each, with the measurements under each frame.
  - The same four at 1280 × 800.
  - The five towers at tier 1 and 3 (turret at rest) on a pad, the Heart whole and cracked and a portal: today's sheet, then A, B and C.
  - The turret test: each kind's tier-3 turret turned 90° and 180° rendered truly, next to the rest frame turned as a sprite (red), at today's camera through the same code and at A, B and C.
  - The Warden and the Grunt, idle: today's camera, then each pitch's.
- **`docs/art/camera-a.webp`, `camera-b.webp`, `camera-c.webp`**: each option's phone frame alone at the phone's 2× pixels (824 × 1678). Opened on a phone, each fills the screen as the game does.

**The held moment** is ground-check's (V-07c): Full, solo Ranger, the afternoon light, clear weather, five towers round the map's middle (Cannon 2, Arrow 3, Frost 1, Arcane 3, Flak 2), the hero walked up to their row, wave 10 held with the Ironhorn on its road. It is played on the e2e build and paused twice, once on the phone and once on the desktop. Each pitched frame is then composed from that snapshot:

- the pitched plate;
- the pitched towers, Heart and portals;
- the creeps and the hero from their match sheets as they are, at the client's own scales (`entityScale.ts`, `towerScale` with `TOWER_REACH`);
- everything placed by the pitched mapping and drawn back to front, with HP bars and your hero's ring;
- the HUD alone (the page with the map's canvas hidden) over it.

The same composer at 0° with today's committed plate and sheets lands on the game's own screenshot. Left out of the composed frames: the pads' zone tints, the light pools, projectiles, damage numbers and other effects. Turrets are drawn at rest, and creeps on the first frame of their walk.

**Drafts:** the plates are rendered at 1× with 4 samples (about a minute each), the structures with 6 samples.

## The three pitches, measured

| | Today · 0° | A · 20° | B · 30° | C · 40° |
|---|---|---|---|---|
| **Phone** (412 × 839, 44 px bar, tile 15.85 px) | | | | |
| Map height on screen (50 tiles × cos) | 792 px | 744 px | 686 px | 607 px |
| Left under the map's bottom edge | 3 px | 50 px | 109 px | 188 px |
| Gameplay rows end (row 40) / the controls' top | 678 / 688 | 640 / 688 | 593 / 688 | 530 / 688 |
| Clearance (docs/MOBILE.md §4: controls never cover gameplay) | +10 px | +48 px | +95 px | +158 px |
| The safe zone's rows (rows 40–50) | 158 px | 149 px | 137 px | 121 px |
| A portal's top, screen y (the bar ends at 44) | 46 | 48 | 44 (0.2 px in the bar) | 40 (4 px in the bar) |
| **Desktop** (1280 × 800, the wide layout fits the map's height) | | | | |
| Tile / map width | 15.7 px / 408 px | 16.7 / 434 | 18.1 / 471 | 20.5 / 532 |
| Map under the side panels (they reach 424 px in from the left) | 0 | 1 px | 19 px | 50 px |
| **Occlusion** | | | | |
| Road drawn under a tier-3 tower, behind it | 0 | 0 | 0 | 0 |
| The tallest tier-3 roof (Arrow, 107 world px), drawn over the ground behind its pad's middle | 0 | 1.22 tiles | 1.93 tiles | 2.81 tiles |
| …into the next pad behind it (its front edge 2.5 tiles behind) | 0 | 0 | 0 | 0.31 tiles |
| The Heart: drawn tall / above its point (tiles of screen) | 3.9 / 2.7 | 3.1 / 1.8 | 3.6 / 2.3 | 4.1 / 3.0 |
| A portal: drawn tall / above its point | 2.2 / 1.4 | 2.2 / 1.2 | 2.2 / 1.3 | 2.2 / 1.4 |
| **The turret test** (sprite-turned against truly turned, IoU of their silhouettes, tier 1 and 3 × 90° and 180°) | | | | |
| Mean / worst | 0.96 / 0.88 | 0.64 / 0.43 | 0.58 / 0.32 | 0.54 / 0.26 |
| **The plate** (draft; today's full render is 684 KB at quality 87) | | | | |
| Size, WebP under the 700 KB budget | 1664 × 3200 | 1664 × 3007, 674 KB (q86) | 1664 × 2771, 660 KB (q87) | 1664 × 2451, 652 KB (q88) |

### The map on a phone

The phone fits the map's width, so the tile stays 15.85 px and the map gets shorter: **cos(pitch) of today's 792 px**. Every pitch keeps the gameplay rows above the controls, with more room than today (+48 / +95 / +158 px against +10). `followRange` stays 0.

What a pitch frees is a band under the map's bottom edge: **50, 109, 188 px**. The controls (688–839) then sit partly (A, B) or wholly (C) below the map, over nothing. The frames show the band dark. A build session would choose one of these:

- render the plate with more forest south of row 50, so the safe zone fills the band (cheap: the scene only needs more ground);
- slide the map down so its safe zone stays under the controls (the band then opens under the top bar, where a pitched camera would show the forest beyond the north edge: the scene needs that ground too).

Tall things at the top now stand up over the map's top edge. A portal's gatehouse is drawn up to 1.4 tiles above its point (row 1.5): at B its top touches the bar, at C it is 4 px under it. The north border's canopy is cut by the frame's top edge at every pitch: the plate is framed on the ground's rectangle.

### The map on a desktop

The wide layout fits the map's height (`(800 − 16) / 50`), so a shorter map is drawn bigger, by 1/cos(pitch): **+6%, +15%, +31%** (tile 16.7, 18.1, 20.5 px). That is a real gain for the laptop. The catch is width: the HUD's side panels reach 424 px in from the left (and the hero panel 424 px in from the right). At B the map's west pad column slides 19 px under them, and at C 50 px. The wide layout's `SIDE_MIN` (280) would rise to about 430, or the tile would be capped.

### Occlusion

**No tower ever hides road, at any pitch.** Spire's roads run between the pad columns, 3.5 tiles from the pads' middles. The nearest road point behind any pad is 2.42 tiles to its side, and a tier-3 tower's widest drawn half (its base and shadow, at the phone's tower scale) is 1.43 tiles.

This was measured on the roads' whole surface (their 2.15 tiles of width, every 0.1 tile), against each kind's tier-3 base and turret at rest, at 90° and at 180°, on every pad of a solo match. A creep on a road is therefore never behind a tower. What a tall tower covers is the grass and the pad behind it:

- **A:** at most 1.22 tiles behind its middle, inside its own pad (1.5);
- **B:** 1.93 tiles, into the 1-tile gap between pads;
- **C:** 2.81 tiles. The tier-3 Arrow's roof reaches 0.31 tiles over the next pad's front edge, so a tower there is partly hidden behind it.

Per kind at C: Arrow 2.81, Frost 2.32, Arcane 2.17, Cannon 1.94, Flak 1.90. The branches were not rendered; the Sniper and the Prism are taller.

Units walking on the grass between pads (a hero, a creep chasing him) can stand behind a tower. They are drawn back to front, as today.

**The Heart and the portals** are already drawn from the south at 55° elevation today (35° from straight down, `VIEW_SOUTH`). On today's flat ground they cover 2.7 tiles of screen above the Heart's point. At A the Heart is lower than today (1.8 tiles above its point; its Spire is seen more from above), at B much as today (2.3), and at C taller (3.0 tiles above, which is 3.9 tiles of ground behind it). The portals hardly change (1.2–1.4 tiles). **B is the pitch the Heart and the portals were made for.**

### The turret problem

Today a tower's turret is one picture seen straight down, which the client turns toward its target. From straight down that is true: through the same code at 0°, the sprite-turned turret covers 96% of the truly turned one (the rest is the light, which stays on the upper left in the render but turns with the sprite).

Tilted, a turret turned toward the north is seen end-on and foreshortened, and one turned toward the camera shows its other face. A sprite turned on screen shows neither: it lays the side view on its side. **It visibly lies from A on:**

- **A:** mean IoU 0.64. The Arrow's crossbow is at 0.43 when turned 180° (the bow upside down, its stock on the wrong side) and 0.54 at 90° (the bow's full length where the true view is end-on).
- **B:** 0.58.
- **C:** 0.54, with the Frost's lance at 0.26.

The Arcane's thin staff holds best (0.84–0.89 at A), but its 90° falls to 0.64 at C. See the sheet's red columns.

**Rendered per direction instead** (each frame at the pitch's mean turret frame size, measured on these renders, 4 frames a direction (rest and 3 recoil) × 25 variants (15 tiers and 10 branches), plus the bases and their white twins, packed at 85%):

| | Frames | Pixels | Pages of 2048 × 2048 |
|---|---|---|---|
| Today (one turret picture, turned) | 100 turret + 25 bases | in today's one sheet | **1** (2048 × 1822, everything) |
| 8 directions | 800 turret frames | 13.3 Mpx | **4** |
| 16 directions | 1,600 turret frames | 24.1 Mpx | **7** |

The cost is about the same at A, B and C: the frames barely change size. Seen from the south, a turret at θ mirrors to 180° − θ, so 8 directions need 5 rendered (and 16 need 9) and the rest flipped, at about half the pages. The flipped frames would be lit from the upper right, a smaller lie than today's turned light.

16 directions on a phone is 22.5° a step. The client would pick the nearest frame (no turning), and a turret's turn would step.

### Taps

The tile-to-screen mapping stays affine at any pitch (the camera is orthographic):

- screen x = left + x · T;
- screen y = top + y · T · cos(pitch), on the ground;
- back: tile y = (screen y − top) / (T · cos(pitch)).

Every tap, ping, ring and aim keeps working through one change in `input/camera.ts`'s two conversions. Pads are rectangles now (`padAtTile` unchanged on the ground). Their top stands 8 world px up, drawn 8 · sin(pitch) higher: 2.7, 4, 5.1 world px, under a tenth of a tile.

**The one place it is not affine: a tall thing's top sits over the ground behind it.** A tap on a tier-3 tower's roof lands on the tile behind it: 1.22 tiles behind its middle at A (still on its own pad), 1.93 at B (the grass behind), and 2.81 at C (the next pad).

Today a tower is selected by its pad. From B on, the tower's drawn box would have to be a tap target too, before the pad behind it. Units are drawn standing up already today: a tap on a creep's body is already above its feet, and that does not change.

### The heroes and the creeps

The brief says their camera is "20° down, already close to A". **It is not:** their camera (`match.VIEWS['body']`: azimuth 34°, elevation 20°) is 20° *above the horizon*, which is **70° from straight down**. A is 20° from straight down (70° above the horizon), so A is the farthest of the three from them and C (50° above the horizon) the nearest.

Rendered at each pitch's own elevation (the sheet's last row), both look worse. The Warden becomes a helmet and shoulders, and the Grunt a skull seen from above (drawn 68% as tall at A, 75% at B, 84% at C). Their eyes, the faction's mark (`docs/art/enemy-style.md`), are gone.

**They need no re-render at any pitch.** Keep them as they are, standing figures over a tilted ground, the usual convention: the composed frames show them reading well on all three. If one pitch were to match them better, it is C.

## What a pick costs

What re-renders, and what does not:

| | A · 20° | B · 30° | C · 40° |
|---|---|---|---|
| The stage (the lobby's hero loops), the HUD's frames | no | no | no |
| The heroes and the creeps (above) | no | no | no |
| The map plate, its three lights and the extra pads' patches | yes | yes | yes |
| The towers, the branches, the Heart and the portals | yes | yes | yes (the Heart and the portals already sit at 35°: B is nearly theirs) |
| The turrets: 8 or 16 directions (4 or 7 pages), or keep the lie | yes | yes | yes |
| Ground circles as ellipses (cos(pitch) tall): the meteors' and rains' warning circles, the light pools, Rampart Slam's rings and the quake's front, the range and aura circles, the hero's ring, the snare's ring | yes | yes | yes |
| The pads' zone tints (rectangles 3 × 3·cos) | yes | yes | yes |
| Layout: the band under the map; the desktop's side margins | small (50 px; 1 px) | yes (109 px; 19 px) | yes (188 px; 50 px) |
| Taps on a tower's roof | no (inside its pad) | the tower's box as a target | the tower's box as a target |

Most of the client's part is one change done once:

- the world's y scaled by cos(pitch) in the camera's two conversions;
- a ground-effects layer with `scale.y = cos` (its circles become ellipses for free; the units' and towers' layers stay unscaled, placed by the mapping);
- `layout.ts` measuring the map as 50 · cos tall;
- the art at the pitch (the plate, the structures' sheet and the turret directions).

`plate.test.ts`'s pad squares become rectangles and its lane lines are measured on the tilted plate. The e2e taps go through the camera as they do now.

**Sessions** (rough):

- **A, about 4:**
  1. the plate in three lights at full quality, the layout and its tests;
  2. the client's mapping and the ground effects as ellipses;
  3. the structures with the turret directions, and the sheet budget's tests;
  4. the browser tests, the stress budget with 3–4 more texture pages, and Han's phone check.
- **B, about 5:** A's four, plus the desktop's margins, the band under the map, and the tower's box as a tap target.
- **C, about 6:** B's, plus the next pad's tower partly hidden (a tall tower's box ordered over the pad behind), the portal under the bar, and the larger band.

## How to make them again

```
npm run art:3d -- pitch all --draft --out DIR                 # plates, structures and figures at A, B, C (about 6 min)
npm run art:3d -- pitch structures --pitch z --draft --out DIR  # today's camera through the same code (the turret check)
npm run build:e2e -w @tdt/client
CHROMIUM_PATH=… npm run camera-options -w @tdt/client -- DIR     # the held moment, then tools/blender/pitch_compose.py
```

- `npm run art:3d -- pitch` (`tools/blender/tdt3d/pitch_options.py`, `build.py pitch`) is dev only and refused without `--out`: nothing the game ships is written. Without `--draft`, the plates render at full quality (about 13 min each).
- `npm run camera-options` (`apps/client/scripts/cameraOptions.ts`) holds the moment on both devices and writes `DIR/held/`.
- `tools/blender/pitch_compose.py DIR` (`.venv-blender`'s Python, or any Python with numpy and Pillow) composes `DIR/frames/` and `DIR/measures.json`, then writes the sheet and the three frames into `docs/art/`.
- `CHROMIUM_PATH` is only for a Chromium of another revision than Playwright's.
