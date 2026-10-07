# Tower Defense Together: Mobile Design (Phase 4, portrait)

> Companion to `docs/GAME_DESIGN.md`, and the source of truth for mobile work. Phase 4 sessions read this file, `GAME_DESIGN.md` and `CLAUDE.md`. Record any decision this doc doesn't cover in the Decision Log in `GAME_DESIGN.md`.
>
> Based on four spike rounds played on a real Android phone (PR #7, not merged). **Use the spike branch as a reference only. Reuse what worked, and rewrite it properly.**

## 1. Decisions (already made)

| Area | Decision |
|---|---|
| Orientation | **Portrait on phones.** Tablets and desktop show the same map centred, with the HUD in the side margins. |
| Map | **Spire is the only map, on every device.** Crossroads is retired. |
| Controls | Controls are **drawn over the map, semi-transparent**. There is **no separate control strip.** Since 7 Oct 2026 the default is the **floating stick**: drag anywhere to walk, the skills together in the bottom-right corner (§5). The fixed joystick at bottom-centre with Q/W/R in an arc around it stays as a choice. |
| Casting | **Tap a skill to smart-cast it; press and drag to aim it.** |
| Hero attacks | The hero **auto-attacks while moving or standing still, on all devices.** |
| Towers in co-op | **Each player has their own zone of pads, and bigger teams unlock extra pads.** |
| Tower actions | A **radial ring around the tower**, never a bottom panel. |
| Quick mode | 15 waves, on every device. |
| Team size | **1–3 players, one per lane** (Phase 4b: the 4-player Core zone is gone; Decision Log). |
| Hero speed | Ranger 4.6, Warden 4.3, Arcanist 4.5 tiles/s (+35% in Phase 4b), the same on every device. |

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
| 3 (the most a match holds) | West / Mid / East, plus **extra pads** added to each lane zone (about +12%) |

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
- **Control overlay, at the bottom, over the safe zone:**
  - **Default (floating stick, skills around it):** a faint **resting stick** (80 pt, the floating base's size) at the bottom centre as a hint only: it takes no touches, and a drag anywhere walks (§5). **W** and **R** (56 pt) sit over it and **Q** and the **E** badge at the ends of the one-thumb arc, where a right thumb resting near the bottom centre reaches. **At least 24 pt** separate any two buttons, and the hint from any button; the arc is spread sideways for that room, never raised: W's and R's tops sit no higher than on the first one-thumb arc (692 pt down on a 412 × 839 phone), so the whole map still fits with no panning. There is no Skills button: holding any skill button opens the card.
  - **Other layouts** (⚙, §5): the same arc around a **fixed joystick** (100 pt, about 35% opacity when idle, solid while touched; the arc keeps 24 pt from its larger edge), or the skills in a quarter arc around E in one bottom corner with the stick (floating hint or fixed) in the other.
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
| Move | **Floating stick (default): drag anywhere.** A touch that starts on the map or on the empty part of the control band and moves past the tap slop (10 px) becomes the stick: its base appears where the touch started and the hero walks. If the thumb goes past the base's radius (40 px), the base trails it, so turning back is a short move. Lifting stops the hero. A full push is a short drag (⚙ → Stick feel: Light, Normal or Firm). Starting a drag closes an open ring or picker. A drag never selects, never pings and never presses a button it passes over; a touch that starts on a skill, a ring button or any other control belongs to that control. One finger can steer while another taps a skill or a pad. ⚙ → Joystick moves the stick with the skills around it **Left**, **Center** or **Right** (the buttons move with it). **Fixed stick** (⚙): the joystick over the forest, and a drag on the map does nothing. The hero auto-attacks while moving, and is drawn moving at once (client-side prediction; Decision Log). |
| Tap a skill | **Smart cast.** Instant skills fire; targeted skills hit the densest enemy group in range; self-buffs cast on the hero. |
| Press and drag a skill | Manual aim, with range and area shown. Release to cast; drag back onto the button to cancel. |
| Nothing in range | The button shakes and no mana is spent. |
| Read a skill | **Hold** any skill button (E, the passive, included) to open a card with every skill's name and description, on that skill's row; **Close** or a tap on the map shuts it. A short tap still casts. There is no separate Skills button. |
| Ping | Hold a finger **still** on the map: a ring fills (0.45 s) and glows; **lifting** then pings. Moving cancels it (with the floating stick the move walks instead). |
| Build | Tap a pad in **your zone** to open the radial build menu (5 towers with costs, greyed out if unaffordable). **One tap on a tower builds it.** Hold a tower button (about 0.3 s) to preview: its range shows on the pad and its name and stats in the chip; lifting after a hold does not build. The chip reads "Tap to build · hold to preview" until a button is held. |
| Tower actions | Nothing is drawn on your tower until you tap it. Tap it to open a **radial ring:** **Upgrade** (one tap, with cost; the ring stays open, so the next tier is one more tap), **Priority** (cycles First / Strongest / Closest), **Sell** (hold 0.5 s). A chip above the ring shows what the next tier adds, e.g. "Dmg 24→36" (below the ring when there is no room above it, as on the top row; it never covers a ring button, wherever the tower is). At tier 3 the ring shows **two branch buttons** where Upgrade was, each named with its cost, and the chip says what both do. **One tap buys** the branch. |
| Target enemy | Tap an enemy to set the focus target. |
| Close menus | Tap anywhere else. With the floating stick, starting a drag also closes it (and walks). **A fixed joystick keeps working while a menu or ring is open.** |

**Tap rules**
- A tap snaps to the nearest pad or tower within 44 pt. If two are equally close, a tiny picker appears.
- **Tap or hold is decided at release, from the events' own timestamps** (`event.timeStamp` of pointerdown and pointerup), not from when the page's frames ran. A skill card or a build preview that opened only because a frame was late, under a press shorter than its hold (0.38 s / 0.3 s), closes and the skill casts or the tower builds. A hold is never decided on the first frame after a stall (over 100 ms since the last frame), since the lift may still be queued. Sell still needs a real 0.5 s hold. Tap or drag on the map is decided by distance, never time.
- Taps inside the control overlay never select anything on the map.
- A radial menu or ring **moves up whenever it would overlap the control overlay.** It never covers the joystick or skills.

**Settings → Controls layout**, two rows:
- **Stick:** **Floating** (default; a drag anywhere walks, the resting stick is a hint) or **Fixed** (the joystick stays where it is drawn).
- **Skills:** **Around the stick** (default; the one-thumb arc at the bottom, with the **Joystick** row Left / Center / Right below it), **Right corner** (the stick bottom-left, the skills in a quarter arc around E bottom-right) or **Left corner** (the mirror, for left thumbs: W and E mirror, Q and R trade places so both corners read Q, W, R from left to right). The Joystick row shows only for Around the stick.

**Steering and casting at once:** a point skill (Q / W on the Arcanist, W on the Ranger) cast while the stick is held goes off at once. The stick resends `move` every 100 ms, and a point cast only sets the hero's order, so the sim now casts a pending in-range point cast before any `move`, `attackMove`, `attack` or `stop` replaces it (a cast still out of range is replaced as before). A second point cast in the same tick still replaces the first. Both corner layouts read Q, W, R from left to right.

Saves from before the two rows keep what they had: One thumb → Fixed + Around the stick (with its side), Two thumbs → Fixed + Right corner, Two thumbs left-handed → Fixed + Left corner, PR #92's floating stick right / left → Floating + Right / Left corner. A save that never picked anything (One thumb at Center, the old default written for everyone, or PR #92's default) moves to the new default. All layouts use the same overlay approach.

## 6. Quick mode

- **15 waves**, target length 10–12 minutes, available on every device.
- Difficulty is compressed so wave 15 plays like wave 30. Bosses come at **waves 5, 10 and 15**.
- More starting gold and faster XP, so heroes reach about level 8–10.
- The host picks the mode in the lobby; solo has its own mode pick.
- The mode is a new match option, so bump `PROTOCOL_VERSION`. All numbers live in `tuning.ts`.
- **Balance gate:** bots win with 1, 2 and 3 players, ending with Heart HP 40–80; the do-nothing bot loses. (Track 3 gated 1 and 4 players; matches hold 3 players since Phase 4b.)

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
- **Screen Wake Lock** during matches, where supported. **Audio** (Phase 4b, done: `docs/ART.md` §13) starts on the first tap, pauses in the background and uses Safari's ambient audio session (the silent switch mutes it).
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
- **Balance gate:** full mode on Spire; bots win with 1, 2 and 4 players, ending with Heart HP 40–80; the do-nothing bot loses (since Phase 4b: 1, 2 and 3 players, the most a match holds, in Full and Quick). Report 3 players and **Heart lost in waves 1–10, 11–20 and 21–30.** Aim for losses spread across the match instead of mostly before wave 12. The extra pads should allow flatter team scaling than the Phase 3 early-wave bonus.

**Track 2 (after track 1 is merged): portrait client.**
- Layouts (§4), touch controls (§5), platform and PWA (§7), tests (§8), and `docs/MOBILE_TESTING.md`.

**Track 3 (after track 1, in parallel with track 2): Quick mode** (§6).

**Done when:**
- All automated tests pass, including the mobile emulation tests and the stress test.
- The balance gates for both modes pass.
- Desktop keyboard and mouse still work.
- Han completes the real-device checklist.

### Phase 4b: Polish
- Sprites and sound. **Art direction: Runelight, see `docs/ART.md`** (Art Track 0: style guide, art registry, `?showcase`, Display setting). **Sound: done** (music and effects made in code, `docs/ART.md` §13; real-device check: `docs/MOBILE_TESTING.md` §8).
- Team pings (long-press on the map on phones, Alt-click on desktop) and quick-chat emotes. **Done:** six phrases (Help, On my way, Danger, Thanks, Nice, Defend), no free-text chat; the server rate-limits both (`PROTOCOL_VERSION` 13). Real-device check: `docs/MOBILE_TESTING.md` §3.14 and §6.7.
- First-match lesson. **Done:** a new player's first solo match is Quick on Normal and teaches move, build, Q, upgrade, ping and an optional phrase. Skip is always there. Online rooms do not start it. Replay from ⚙ or the lobby. Real-device check: `docs/MOBILE_TESTING.md` §2.6.
- Difficulty modes.
- Balance carry-overs: a 3-player gate (**done: matches hold 3 players, and 1, 2 and 3 are gated in Full and Quick**), per-hero tuning, how often ultimates get used (**done: the hero mana rework**, ultimates cost no mana, and the balance bot casts R on 3+ creeps; Decision Log).

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
