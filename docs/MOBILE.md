# Tower Defense Together: Mobile Design (Phase 4, portrait)

> Companion to `docs/GAME_DESIGN.md`, and the source of truth for mobile work. Phase 4 sessions read this file, `GAME_DESIGN.md` and `CLAUDE.md`. Record any decision this doc doesn't cover in the Decision Log in `GAME_DESIGN.md`.
>
> Based on four spike rounds played on a real Android phone (PR #7, not merged). **Use the spike branch as a reference only. Reuse what worked, and rewrite it properly.**

## 1. Decisions (already made)

| Area | Decision |
|---|---|
| Orientation | **Portrait on phones.** Tablets and desktop show the same map centred, with the HUD in the side margins. |
| Map | **Spire is the only map, on every device.** Crossroads is retired. |
| Controls | Controls are **drawn over the map, semi-transparent**, with a fixed joystick at bottom-centre, Q/W/R in a tight arc around it and E as a badge. There is **no separate control strip.** |
| Casting | **Tap a skill to smart-cast it; press and drag to aim it.** |
| Hero attacks | The hero **auto-attacks while moving or standing still, on all devices.** |
| Towers in co-op | **Each player has their own zone of pads, and bigger teams unlock extra pads.** |
| Tower actions | A **radial ring around the tower**, never a bottom panel. |
| Quick mode | 15 waves, on every device. |

## 2. Map: Spire

- **Shape:** tall and narrow, fitted to the phone's width. Three lanes run from the portals at the top down to the Heart. Tile size must be **at least round 4's** on a 412 × 839 pt screen.
- **Safe zone:** the bottom band of the map, under the control overlay, is **scenery only** (forest, no lanes, pads or Heart). The overlay never hides gameplay.
- **Whole map visible:** on a 412 × 839 phone the whole map fits with no panning. On shorter phones the camera follows the hero vertically only. There is no pinch-zoom on phones.
- **Map data** (lanes, pads with zone tags, portals, Heart, safe zone) lives in data, not code, so Phase 5 can add maps without engine changes.

### Pad zones (multiplayer)

- Base pads are split into three **lane zones**: West, Mid and East, each covering the pads alongside its lane.

| Players | Zones |
|---|---|
| 1 | The player owns every pad |
| 2 | P1: West + west half of Mid; P2: East + east half of Mid |
| 3 | West / Mid / East, plus **extra pads** added to each lane zone (about +15%) |
| 4 | West / Mid / East, plus a **Core zone** of extra pads where the lanes converge above the Heart (about +25%) |

- Extra-pad amounts live in `tuning.ts`. Solo play never shows extra pads.
- Each player's pads are **tinted in their colour**. You can only build on your own zone. Tapping a teammate's pad shows whose it is.
- **Leavers:** their towers keep firing. Once the 60-second rejoin window runs out, their **empty** pads open to all teammates. Their existing towers stay theirs, since upgrades are owner-only.
- Gold gifting stays as it is. It becomes the main way to help a teammate whose zone is under pressure.

## 3. Rule changes (apply everywhere)

- **The hero auto-attacks the nearest enemy in range while moving or standing still.** On desktop, right-clicking an enemy still sets a focus target.
- **Anti-stall:** a creep stops attacking a tower after 10 s and carries on down its lane (tunable). This fixes the Archer-vs-Flak soft lock found in the Phase 3 balance pass.
- Both changes affect balance. The balance pass in §9 covers them.

## 4. Layout

### Phone (portrait)

- **Top bar, one compact row:** gold, Heart HP, wave, timer, Call early, settings. Hero level, XP and a skill-point badge go here too. There is no separate hero row.
- **Map:** the rest of the screen, from the top bar down to the bottom edge.
- **Control overlay, bottom-centre, over the safe zone:**
  - A **fixed joystick** at about 35% opacity when idle, solid while touched.
  - **Q, W, R** as buttons of about 52 pt, semi-transparent, in a tight arc around the joystick.
  - **E** (passive) as a small badge.
  - Skill-learn "+" badges sit on the buttons.
- Hero HP and mana show above the hero sprite.
- **Landscape on a phone** shows a "Rotate to portrait" screen.
- Keep clear of notches and the home indicator using `env(safe-area-inset-*)`. Touch targets are at least 44 pt.

### Tablet and desktop

- The same Spire map, centred and fitted to the height.
- The HUD, hero panel and team panel sit in the side margins.
- The whole map is always visible, so there's no minimap.
- Desktop keeps mouse and keyboard control (§8 of `GAME_DESIGN.md`). Touch tablets put the control overlay in the side margins.

## 5. Touch controls

| Action | Touch |
|---|---|
| Move | Fixed joystick. The hero auto-attacks while moving. |
| Tap a skill | **Smart cast.** Instant skills fire; targeted skills hit the densest enemy group in range; self-buffs cast on the hero. |
| Press and drag a skill | Manual aim, with range and area shown. Release to cast; drag back onto the button to cancel. |
| Nothing in range | The button shakes and no mana is spent. |
| Build | Tap a pad in **your zone** to open the radial build menu (5 towers with costs, greyed out if unaffordable). The first tap on a tower previews its range; the second tap builds it. |
| Tower actions | Tap your own tower to open a **radial ring around it:** **Upgrade** (with cost), **Priority** (cycles First / Strongest / Closest), **Sell** (hold 0.5 s). A small chip above the ring shows what the next tier adds, e.g. "Dmg 24→36". At tier 3, Upgrade becomes **two branch buttons** (`REPLAYABILITY.md` §1): the first tap shows what the branch does in the chip, the second buys it. |
| Target enemy | Tap an enemy to set the focus target. |
| Close menus | Tap anywhere else. **The joystick keeps working while a menu or ring is open.** |

**Tap rules**
- A tap snaps to the nearest pad or tower within 44 pt. If two are equally close, a tiny picker appears.
- Taps inside the control overlay never select anything on the map.
- A radial menu or ring **moves up whenever it would overlap the control overlay.** It never covers the joystick or skills.

**Settings → Layout:**
- **One thumb** (default): as above.
- **Two thumbs:** joystick bottom-left, skills bottom-right.
- **Two thumbs, left-handed:** the mirror of Two thumbs.

The two-thumb layouts use the same overlay approach.

## 6. Quick mode

- **15 waves**, target length 10–12 minutes, available on every device.
- Difficulty is compressed so wave 15 plays like wave 30. Bosses come at **waves 5, 10 and 15**.
- More starting gold and faster XP, so heroes reach about level 8–10.
- The host picks the mode in the lobby; solo has its own mode pick.
- The mode is a new match option, so bump `PROTOCOL_VERSION`. All numbers live in `tuning.ts`.
- **Balance gate:** bots win with 1 and with 4 players, ending with Heart HP 40–80; the do-nothing bot loses.

## 7. Platform, performance and PWA

- **Targets:** iPhone 12 or newer (iOS 17+ Safari) and mid-range Android from 2021 onward (current Chrome).
  - 60 FPS with 150 creeps on screen, at least 30 FPS with 300.
  - Solo mode runs the simulation in a Web Worker.
  - Cap the device pixel ratio at 2, pool sprites, and cull anything off-screen.
  - Adaptive quality, plus a setting: Auto / High / Low.
- **Browser:**
  - Viewport `width=device-width, initial-scale=1, viewport-fit=cover`.
  - Stop the browser taking over gestures: `touch-action: none` on the canvas, `overscroll-behavior: none`, no text selection or long-press callout, no context menu.
- **Leaving the app:** in solo, the game pauses automatically when the page is hidden. Online, it rejoins within 60 s, with a "Reconnecting…" overlay.
- **Screen Wake Lock** during matches, where supported. **Audio** (Phase 4b) starts on the first tap.
- **PWA:**
  - Manifest with name, short_name "TD Together", icons at 192 and 512 px (including maskable), `display: fullscreen`, `orientation: portrait`.
  - The service worker caches the app shell for a fast start and **offline solo play**, and never touches the WebSocket.
  - "Update available — tap to reload" works alongside the `PROTOCOL_VERSION` check.
  - Android gets an Install button; iPhone gets a short "Share → Add to Home Screen" sheet.
  - Serve the service worker with no-cache headers.

## 8. Testing

- **Unit tests:** touch-input recognition as pure functions (joystick, tap vs drag, smart-cast targeting, drag-to-aim and cancel, snap-to-nearest, hold-to-sell, ignoring taps in the overlay).
- **Browser tests (Playwright, mobile emulation, portrait iPhone and Pixel profiles):**
  - HUD, overlay and radial menus stay inside the safe viewport and **never overlap the joystick or skills**.
  - Touch-only flows: start a solo Quick match, move, build, open the tower ring and upgrade, change priority, hold to sell, smart-cast, drag-aim, cancel.
- **Performance:** a 300-creep stress scene under 4× CPU throttling must hold at least 30 FPS.
- **Real-device checklist:** write `docs/MOBILE_TESTING.md` for Han: one iPhone and one Android phone, a solo Quick match to the end, and one online match with a phone and a desktop player together.

## 9. Phase plan (replaces Phase 4 in `GAME_DESIGN.md` §11)

### Phase 4a: Mobile, in three tracks

**Track 1 (run first): map, rules and balance.** Covers the sim, server and protocol.
- Spire with its safe zone, pad zones and extra pads (§2).
- The rule changes (§3).
- The balance bot plays by zones and moves while attacking.
- Bump `PROTOCOL_VERSION`.
- **Balance gate:** full mode on Spire; bots win with 1, 2 and 4 players, ending with Heart HP 40–80; the do-nothing bot loses. Report 3 players and **Heart lost in waves 1–10, 11–20 and 21–30.** Aim for losses spread across the match instead of mostly before wave 12. The extra pads should allow flatter team scaling than the Phase 3 early-wave bonus.

**Track 2 (after track 1 is merged): portrait client.**
- Layouts (§4), touch controls (§5), platform and PWA (§7), tests (§8), and `docs/MOBILE_TESTING.md`.

**Track 3 (after track 1, in parallel with track 2): Quick mode** (§6).

**Done when:**
- All automated tests pass, including the mobile emulation tests and the stress test.
- The balance gates for both modes pass.
- Desktop keyboard and mouse still work.
- Han completes the real-device checklist.

### Phase 4b: Polish
- Sprites and sound.
- Team pings (long-press on the map on phones, Alt-click on desktop) and quick-chat emotes.
- Difficulty modes.
- Balance carry-overs: a 3-player gate, per-hero tuning, how often ultimates get used.

### Phase 4c: App stores (optional)
- A Capacitor wrapper for iOS and Android, built from the same web build and kept on the same `PROTOCOL_VERSION`.
- Requires Apple Developer Program and Google Play developer accounts.

### Phase 5: Replayability
- See `docs/REPLAYABILITY.md`.

## 10. Changes to apply to `GAME_DESIGN.md` (first task of track 1)

- **§3 Map:** replace Crossroads with a short Spire summary pointing to `MOBILE.md` §2.
- **§6 Towers:** add pad zones and extra pads (pointer to `MOBILE.md` §2).
- **§7 Heroes:** heroes auto-attack while moving.
- **§8 Controls:** add "Touch controls: see `docs/MOBILE.md` §5".
- **§4 Creeps:** add the anti-stall rule.
- **§11 Phases:** replace Phase 4 with pointers to Phases 4a, 4b and 4c in `MOBILE.md` §9, and Phase 5 in `REPLAYABILITY.md`.
- **Decision Log:** add a row for each item in §1 of this doc.

## 11. Open questions (decide during Phase 4a and log the answer)

- Should smart-cast favour the densest group, or the group closest to the Heart when it's close? **Answered in track 2: the densest group; ties go to the group nearer the Heart** (Decision Log).
- Should a leaver's towers pass to a teammate after the rejoin window, instead of staying locked? **Answered in track 1: not now** (Decision Log).
- Should Quick mode be the default on phones?
