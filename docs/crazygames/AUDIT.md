# CrazyGames audit (q5, frames q7)

Made by `npm run cg-audit -w @tdt/client` on 2026-11-13 from the crazygames build's e2e zip (`embed-e2e-crazygames.zip`: the crazygames build with the e2e hook), served as a host serves it (scripts/embedServe.ts), in headless Chromium on a software GPU. The rules are the advisor's reading of CrazyGames' pages on 10 Nov 2026 (docs/queue/q5-crazygames-prep.md) and, for the frames, on 13 Nov 2026 (docs/queue/q7-crazygames-frames.md): this machine cannot open docs.crazygames.com, so none was checked against the live pages.

## Every requirement

| | Requirement | Result | Evidence |
| --- | --- | --- | --- |
| Technical | Total size 250 MB or less | **PASS** | 17.77 MB unzipped (apps/client/embed-e2e-crazygames.zip) |
| Technical | 1,500 files or less | **PASS** | 86 files |
| Technical | Initial download 50 MB or less (no SDK: the whole build counts) | **PASS** | the whole zip 16.6 MB; the page's own first download 1.37 MB in 15 files |
| Technical | 20 MB or less to be on the phone homepage | **PASS** | zip 16.6 MB |
| Technical | Relative paths only | **PASS** | index.html names no root path (`base: './'`); e2e/embed.spec.ts serves the zip under a deep path with no 404 |
| Technical | Time to gameplay 20 s or less | **PASS** | cold, unthrottled: 2.8 s; cold, Fast 4G, CPU 4×: 6.5 s; 30 s on the home card, unthrottled: 2.9 s; 30 s on the home card, Fast 4G, CPU 4×: 5.9 s |
| Technical | Chrome and Edge work | **NOT CHECKED** | Chromium (headless) only here: every browser test and this audit; Edge is Chromium but was not run |
| Technical | Safari works (else switched off) | **NOT CHECKED** | No Safari here; the iPhone checklist (docs/MOBILE_TESTING.md) is Han's real-device step |
| Technical | Runs smoothly on a 4 GB Chromebook | **NOT CHECKED** | a stand-in, not a device: the stress scene (300 creeps, a tower on every pad, rain at night): 18.9 ms JavaScript a frame, heap 30.2 MB of 608, 131.8 MB of textures; a real wave 10 (Full, five towers, the Ironhorn on its road, rain): 7.5 ms JavaScript a frame, heap 12.3 MB of 608, 132.5 MB of textures |
| Technical | Touch input where phones are supported | **PASS** | touch controls (joystick, Q/W/E/R, the build ring) on every touch screen; e2e/embed.spec.ts plays a match by touch in the frame (pixel) |
| Technical | Desktop landscape (a portrait game with bars or a picture at the sides) | **PASS** | the wide layout on desktop: the portrait map in the middle, the HUD's panels and the background at its sides (frames/1920x1080-wave10.jpg) |
| Technical | Orientation set in the submission | **PASS** | SUBMISSION.md: portrait on phones |
| Technical | body user-select: none (and -webkit-) | **PASS** | style.css `html, body { user-select: none; -webkit-user-select: none; }` (text fields and the privacy id selectable) |
| Technical | Works in their app's fullscreen with the safe areas | **NOT CHECKED** | the layout reads `env(safe-area-inset-*)` and re-runs when the insets change (docs/MOBILE.md §4); not run in CrazyGames' app |
| Technical | After an iOS interruption the AudioContext resumes inside a touch or click | **PASS** | audio/engine.ts: every pointerdown / touchend / click / keydown calls `unlock`, which resumes a context that is not running (`interrupted` included) inside that gesture; unchanged |
| Gameplay | Legible at 821 × 462 (desktop, not fullscreen) | **PASS** | every step within the bars (see the frames table) |
| Gameplay | Legible at 907 × 510 (desktop, not fullscreen) | **PASS** | every step within the bars (see the frames table) |
| Gameplay | Legible at 1077 × 606 (desktop, not fullscreen) | **PASS** | every step within the bars (see the frames table) |
| Gameplay | Legible at 1216 × 684 (desktop, not fullscreen) | **PASS** | every step within the bars (see the frames table) |
| Gameplay | Legible at 1280 × 720 (desktop, fullscreen) | **PASS** | every step within the bars (see the frames table) |
| Gameplay | Legible at 1366 × 768 (desktop, fullscreen) | **PASS** | every step within the bars (see the frames table) |
| Gameplay | Legible at 1536 × 864 (desktop, fullscreen) | **PASS** | every step within the bars (see the frames table) |
| Gameplay | Legible at 1920 × 1080 (desktop, fullscreen) | **PASS** | every step within the bars (see the frames table) |
| Gameplay | Legible at 450 × 800 (phone, upright) | **PASS** | every step within the bars (see the frames table) |
| Gameplay | Legible at 1080 × 607 (tablet, landscape) | **PASS** | every step within the bars (see the frames table) |
| Gameplay | Legible at 607 × 1080 (tablet, portrait) | **PASS** | every step within the bars (see the frames table) |
| Gameplay | Legible at 800 × 450 (phone, sideways) | **NOT SERVED** | their phone frame held sideways: SUBMISSION.md declares portrait on phones, so CrazyGames turns the phone and never serves this frame (the game asks to rotate) |
| Gameplay | The same speed at 60, 144 and 165 Hz | **PASS** | 60 Hz (49 frames/s drawn): 401 ticks in 20 s, 400 expected; 144 Hz (47.4 frames/s drawn): 1200 ticks in 60 s, 1200 expected; 165 Hz (49.4 frames/s drawn): 401 ticks in 20 s, 400 expected. The sim runs on its own 20 Hz clock in the worker; the drawing interpolates on real time |
| Gameplay | English | **PASS** | every text in the game is English |
| Gameplay | Controls explained on each device (keyboard picture or gestures) | **PASS** | the first-match lesson (Learn to play; in gameplay, skippable) shows each move as keycaps and a mouse with its button lit, or a touch gesture, over one line (q8): [907x510 Move](frames/907x510-lesson-move.jpg) (mouseRight), [907x510 Build a tower](frames/907x510-lesson-build.jpg) (mouseLeft or B 1–5 X cancel), [450x800 Move](frames/450x800-lesson-move.jpg) (gestureStick), [450x800 Build a tower](frames/450x800-lesson-build.jpg) (gesturePad). The judgement stays CrazyGames' |
| Gameplay | No key the browser owns (Escape leaves fullscreen) | **PASS** | X cancels (src/input/keys.ts); Escape still does outside fullscreen but no text in the DOM names it (the hints, the Controls list and the lesson say "X or right-click"), read at 907 × 510 with the build hint up and the Controls list open |
| Gameplay | Loads fast, no errors | **PASS** | no page error in any frame run; time to gameplay above |
| Gameplay | Original name and art | **PASS** | Tower Defense Together; every model the game's own design (Meshy from Claude's concepts) or CC0 KayKit pieces repainted; the sound made in code or CC0 (docs/SOUND_CREDITS.md) |
| Gameplay | No fullscreen button of the game's own | **PASS** | the crazygames build adds none (platform/embed.ts `linkless`); e2e/embed.spec.ts with TDT_EMBED_HOST=crazygames checks it; the match's ⤢ is the map zoom, not fullscreen |
| Gameplay | PEGI 12 | **NOT CHECKED** | fantasy violence, no blood, no typed chat (SUBMISSION.md): the rating is CrazyGames' |
| Gameplay | Solo as easy to find as multiplayer | **PASS** | Play solo is the home card's main button (frames/1280x720-home.jpg) |
| Links | Nothing that promotes another game or platform | **PASS** | none in the game |
| Links | No link to a playable web version | **PASS** | the crazygames build: no invite link (rooms by code), no address on the share card, no link on a version mismatch, the privacy page's "Back to the game" hidden (`?hosted`); e2e/embed.spec.ts finds no other origin but the privacy page |
| Links | A privacy policy link is allowed | **PASS** | the lobby's Privacy opens the site's privacy.html in a new tab |
| Links | No app-store links | **PASS** | none |
| Covers | Three pictures of one design: 1920 × 1080, 800 × 1200, 800 × 800; the title the only text | **PASS** | cover-1920x1080.png, cover-800x1200.png, cover-800x800.png |
| Previews | Two videos, landscape 1080p 16:9 and portrait 2:3, 15–20 s, 50 MB or less, no sound, no cursor | **PASS** | preview-landscape-1920x1080.mp4 7.2 MB, 18.2 s; preview-portrait-1080x1620.mp4 7.0 MB, 17.6 s (q9: recorded again with the bot teammate and Meteor Rain; q10: the Ranger alive through the boss cut and on the last frame, the combo cut after the wave banner) |

## Sizes

| | Measured | Limit |
| --- | --- | --- |
| Zip | 16.6 MB | 20 MB (phone homepage), 50 MB (initial) |
| Unzipped | 17.77 MB | 250 MB |
| Files | 86 | 1,500 |
| The page's first download | 1.37 MB in 15 files | (the whole build counts with no SDK) |

## Time to gameplay

From the host page's load to tick 20 of a solo Quick match (its first second), Play solo tapped the moment the first screen was up (or after 30 s on the home card, not counted), each in a fresh browser context (cold cache, no service worker yet), at 1366 × 768. Fast 4G is DevTools' preset as `npm run first-load -- --fast-4g` uses it (165 ms, 8.1 Mbps down) with the CPU 4× slower.

| Run | First screen | Gameplay |
| --- | --- | --- |
| cold, unthrottled | 1.3 s | 2.8 s |
| cold, Fast 4G, CPU 4× | 3.6 s | 6.5 s |
| 30 s on the home card, unthrottled | 1.3 s | 2.9 s |
| 30 s on the home card, Fast 4G, CPU 4× | 3.8 s | 5.9 s |

## The frames

CrazyGames' frames, one device px per CSS px; a mouse on the desktop sizes, touch on the phone and tablet. The tile is the map's tile on screen; a hero's and a Grunt's height are the pixels that change when its scale is set to 0 (its ground ring and shadow included; a Grunt the median of those standing alone, on wave 1); the smallest text is the DOM's (the canvas's damage numbers and HP bars are not counted). FAIL under 11 px of text, a hero under 24 px, anything cut off, a button outside the frame (on the home card only Play solo and what is above it must be inside before any scrolling), and, with a mouse, a match not in the wide layout or showing the joystick or a touch skill button. 800 × 450 is NOT SERVED: the submission declares portrait on phones.

| Frame | Step | Layout | Tile | Hero | Grunt | Smallest text | Cut off | Scrolled to | Over the map | Result | Picture |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 821 × 462 | home | wide | — | — | — | 11 px "Ranged DPS" | none | #lobby-create "Create room", #lobby-code, #lobby-join "Join room" | none | **PASS** | [home](frames/821x462-home.jpg) |
| 821 × 462 | loading | wide | — | — | — | 13 px "W · Snare Trap" | none | #lobby-create "Create room", #lobby-code, #lobby-join "Join room" | none | **PASS** | [loading](frames/821x462-loading.jpg) |
| 821 × 462 | wave10 | wide | 10 | 51 | — | 11 px "Q" | none | none | none | **PASS** | [wave10](frames/821x462-wave10.jpg) |
| 821 × 462 | ring | wide | 10 | — | — | 11 px "Q" | none | none | .btn "Upgrade to tier 3 375", .btn "Repair 10", .btn "First", .btn "Strongest", .btn "Closest", .btn "Sell for 203" | **PASS** | [ring](frames/821x462-ring.jpg) |
| 821 × 462 | end | wide | 10 | — | — | 13 px "Back to lobby" | none | none | #restart "Play again", #end-change-hero "Back to lobby", #end-save "Save match report" | **PASS** | [end](frames/821x462-end.jpg) |
| 907 × 510 | home | wide | — | — | — | 11 px "Ranged DPS" | none | none | none | **PASS** | [home](frames/907x510-home.jpg) |
| 907 × 510 | loading | wide | — | — | — | 13 px "Q · Multishot" | none | none | none | **PASS** | [loading](frames/907x510-loading.jpg) |
| 907 × 510 | wave10 | wide | 11.4 | 43 | — | 11 px "Q" | none | none | none | **PASS** | [wave10](frames/907x510-wave10.jpg) |
| 907 × 510 | ring | wide | 11.4 | — | — | 11 px "Q" | none | none | .btn "Upgrade to tier 3 375", .btn "Repair 10", .btn "First", .btn "Strongest", .btn "Closest", .btn "Sell for 203" | **PASS** | [ring](frames/907x510-ring.jpg) |
| 907 × 510 | end | wide | 11.4 | — | — | 13 px "Back to lobby" | none | none | #restart "Play again", #end-change-hero "Back to lobby", #end-save "Save match report" | **PASS** | [end](frames/907x510-end.jpg) |
| 1077 × 606 | home | wide | — | — | — | 11 px "Ranged DPS" | none | none | none | **PASS** | [home](frames/1077x606-home.jpg) |
| 1077 × 606 | loading | wide | — | — | — | 13 px "R · Arrow Storm" | none | none | none | **PASS** | [loading](frames/1077x606-loading.jpg) |
| 1077 × 606 | wave10 | wide | 13.6 | 61 | — | 11 px "Q" | none | none | none | **PASS** | [wave10](frames/1077x606-wave10.jpg) |
| 1077 × 606 | ring | wide | 13.6 | — | — | 11 px "Q" | none | none | .btn "Upgrade to tier 3 375", .btn "Repair 7", .btn "First", .btn "Strongest", .btn "Closest", .btn "Sell for 203" | **PASS** | [ring](frames/1077x606-ring.jpg) |
| 1077 × 606 | end | wide | 13.6 | — | — | 13 px "Back to lobby" | none | none | #restart "Play again", #end-change-hero "Back to lobby", #end-save "Save match report" | **PASS** | [end](frames/1077x606-end.jpg) |
| 1216 × 684 | home | wide | — | — | — | 11 px "Ranged DPS" | none | none | none | **PASS** | [home](frames/1216x684-home.jpg) |
| 1216 × 684 | loading | wide | — | — | — | 13 px "Q · Multishot" | none | none | none | **PASS** | [loading](frames/1216x684-loading.jpg) |
| 1216 × 684 | wave10 | wide | 15.4 | 81 | — | 11 px "Q" | none | none | none | **PASS** | [wave10](frames/1216x684-wave10.jpg) |
| 1216 × 684 | ring | wide | 15.4 | — | — | 11 px "Q" | none | none | .btn "Upgrade to tier 3 375", .btn "Repair 5", .btn "First", .btn "Strongest", .btn "Closest", .btn "Sell for 203" | **PASS** | [ring](frames/1216x684-ring.jpg) |
| 1216 × 684 | end | wide | 15.4 | — | — | 13 px "Back to lobby" | none | none | #restart "Play again", #end-change-hero "Back to lobby", #end-save "Save match report" | **PASS** | [end](frames/1216x684-end.jpg) |
| 1280 × 720 | home | wide | — | — | — | 11 px "Ranged DPS" | none | none | none | **PASS** | [home](frames/1280x720-home.jpg) |
| 1280 × 720 | loading | wide | — | — | — | 13 px "Q · Multishot" | none | none | none | **PASS** | [loading](frames/1280x720-loading.jpg) |
| 1280 × 720 | wave10 | wide | 16.3 | 82 | — | 11 px "Q" | none | none | none | **PASS** | [wave10](frames/1280x720-wave10.jpg) |
| 1280 × 720 | ring | wide | 16.3 | — | — | 11 px "Q" | none | none | .btn "Upgrade to tier 3 375", .btn "Repair 13", .btn "First", .btn "Strongest", .btn "Closest", .btn "Sell for 203" | **PASS** | [ring](frames/1280x720-ring.jpg) |
| 1280 × 720 | end | wide | 16.3 | — | — | 13 px "Back to lobby" | none | none | #restart "Play again", #end-change-hero "Back to lobby", #end-save "Save match report" | **PASS** | [end](frames/1280x720-end.jpg) |
| 1366 × 768 | home | wide | — | — | — | 11 px "Ranged DPS" | none | none | none | **PASS** | [home](frames/1366x768-home.jpg) |
| 1366 × 768 | loading | wide | — | — | — | 13 px "R · Arrow Storm" | none | none | none | **PASS** | [loading](frames/1366x768-loading.jpg) |
| 1366 × 768 | wave10 | wide | 17.4 | 84 | — | 11 px "Q" | none | none | none | **PASS** | [wave10](frames/1366x768-wave10.jpg) |
| 1366 × 768 | ring | wide | 17.4 | — | — | 11 px "Q" | none | none | .btn "Upgrade to tier 3 375", .btn "Repair 10", .btn "First", .btn "Strongest", .btn "Closest", .btn "Sell for 203" | **PASS** | [ring](frames/1366x768-ring.jpg) |
| 1366 × 768 | end | wide | 17.4 | — | — | 13 px "Back to lobby" | none | none | #restart "Play again", #end-change-hero "Back to lobby", #end-save "Save match report" | **PASS** | [end](frames/1366x768-end.jpg) |
| 1536 × 864 | home | wide | — | — | — | 11 px "Ranged DPS" | none | none | none | **PASS** | [home](frames/1536x864-home.jpg) |
| 1536 × 864 | loading | wide | — | — | — | 13 px "E · Keen Eye" | none | none | none | **PASS** | [loading](frames/1536x864-loading.jpg) |
| 1536 × 864 | wave10 | wide | 19.6 | 73 | — | 11 px "Q" | none | none | none | **PASS** | [wave10](frames/1536x864-wave10.jpg) |
| 1536 × 864 | ring | wide | 19.6 | — | — | 11 px "Q" | none | none | .btn "Upgrade to tier 3 375", .btn "First", .btn "Strongest", .btn "Closest", .btn "Sell for 203" | **PASS** | [ring](frames/1536x864-ring.jpg) |
| 1536 × 864 | end | wide | 19.6 | — | — | 13 px "Back to lobby" | none | none | #restart "Play again", #end-change-hero "Back to lobby", #end-save "Save match report" | **PASS** | [end](frames/1536x864-end.jpg) |
| 1920 × 1080 | home | wide | — | — | — | 11 px "Ranged DPS" | none | none | none | **PASS** | [home](frames/1920x1080-home.jpg) |
| 1920 × 1080 | loading | wide | — | — | — | 13 px "E · Keen Eye" | none | none | none | **PASS** | [loading](frames/1920x1080-loading.jpg) |
| 1920 × 1080 | wave10 | wide | 24.6 | 61 | 29 | 11 px "Q" | none | none | none | **PASS** | [wave10](frames/1920x1080-wave10.jpg) |
| 1920 × 1080 | ring | wide | 24.6 | — | — | 11 px "Q" | none | none | .btn "Upgrade to tier 3 375", .btn "Repair 13", .btn "First", .btn "Strongest", .btn "Closest", .btn "Sell for 203" | **PASS** | [ring](frames/1920x1080-ring.jpg) |
| 1920 × 1080 | end | wide | 24.6 | — | — | 13 px "Back to lobby" | none | none | #restart "Play again", #end-change-hero "Back to lobby", #end-save "Save match report" | **PASS** | [end](frames/1920x1080-end.jpg) |
| 450 × 800 | home | tall | — | — | — | 11 px "Ranged DPS" | none | #lobby-code, #lobby-join "Join room" | none | **PASS** | [home](frames/450x800-home.jpg) |
| 450 × 800 | loading | tall | — | — | — | 13 px "E · Keen Eye" | none | #lobby-code, #lobby-join "Join room" | none | **PASS** | [loading](frames/450x800-loading.jpg) |
| 450 × 800 | wave10 | tall | 17.3 | 41 | 37 | 11 px "Gold" | none | none | #joystick, .tskill-btn "Q", .learn "+", .tskill-btn "W", .tskill-btn "E", .tskill-btn "R", #zoom-btn | **PASS** | [wave10](frames/450x800-wave10.jpg) |
| 450 × 800 | ring | tall | 17.3 | — | — | 11 px "Gold" | none | none | #joystick, .tskill-btn "Q", .learn "+", .tskill-btn "W", .tskill-btn "E", .tskill-btn "R", .radial-btn "Upgrade375", .radial-btn "TargetFirst", .radial-btn "Sell203", .radial-btn "Repair5", #zoom-btn | **PASS** | [ring](frames/450x800-ring.jpg) |
| 450 × 800 | end | tall | 17.3 | — | — | 13 px "Back to lobby" | none | none | #restart "Play again", #end-change-hero "Back to lobby", #end-save "Save match report", #joystick, .tskill-btn "Q", .learn "+", .tskill-btn "W", .tskill-btn "E", .tskill-btn "R", #zoom-btn | **PASS** | [end](frames/450x800-end.jpg) |
| 1080 × 607 | home | wide | — | — | — | 11 px "Ranged DPS" | none | none | none | **PASS** | [home](frames/1080x607-home.jpg) |
| 1080 × 607 | loading | wide | — | — | — | 13 px "E · Keen Eye" | none | none | none | **PASS** | [loading](frames/1080x607-loading.jpg) |
| 1080 × 607 | wave10 | wide | 13.6 | 74 | — | 12 px "Q" | none | none | none | **PASS** | [wave10](frames/1080x607-wave10.jpg) |
| 1080 × 607 | ring | wide | 13.6 | — | — | 11 px "Upgrade" | none | none | .radial-btn "Upgrade375", .radial-btn "TargetFirst", .radial-btn "Sell203", .radial-btn "Repair6" | **PASS** | [ring](frames/1080x607-ring.jpg) |
| 1080 × 607 | end | wide | 13.6 | — | — | 13 px "Back to lobby" | none | none | #restart "Play again", #end-change-hero "Back to lobby", #end-save "Save match report" | **PASS** | [end](frames/1080x607-end.jpg) |
| 607 × 1080 | home | tall | — | — | — | 11 px "Ranged DPS" | none | none | none | **PASS** | [home](frames/607x1080-home.jpg) |
| 607 × 1080 | loading | tall | — | — | — | 13 px "W · Snare Trap" | none | none | none | **PASS** | [loading](frames/607x1080-loading.jpg) |
| 607 × 1080 | wave10 | tall | 23.3 | 69 | 30 | 11 px "Gold" | none | none | #joystick, .tskill-btn "Q", .learn "+", .tskill-btn "W", .tskill-btn "E", .tskill-btn "R" | **PASS** | [wave10](frames/607x1080-wave10.jpg) |
| 607 × 1080 | ring | tall | 23.3 | — | — | 11 px "Gold" | none | none | #joystick, .tskill-btn "Q", .learn "+", .tskill-btn "W", .tskill-btn "E", .tskill-btn "R", .radial-btn "Upgrade375", .radial-btn "TargetFirst", .radial-btn "Sell203" | **PASS** | [ring](frames/607x1080-ring.jpg) |
| 607 × 1080 | end | tall | 23.3 | — | — | 13 px "Back to lobby" | none | none | #restart "Play again", #end-change-hero "Back to lobby", #end-save "Save match report", #joystick, .tskill-btn "Q", .learn "+", .tskill-btn "W", .tskill-btn "E", .tskill-btn "R" | **PASS** | [end](frames/607x1080-end.jpg) |
| 800 × 450 | home | rotate | — | — | — | 14 px "Tower Defense Together is played with th" | none | #lobby-create "Create room", #lobby-code, #lobby-join "Join room" | none | **NOT SERVED** (the submission declares portrait on phones: CrazyGames turns the phone) | [home](frames/800x450-home.jpg) |

## A 4 GB Chromebook stand-in

**A stand-in, not a device**: this machine's Chromium with the CPU 4× slower (CDP) and V8's heap held to 512 MB (`--max-old-space-size=512`), on a software GPU. JavaScript a frame is the page's own (`__tdt.frameCosts`, the stress test's measure); the textures are what the game holds on the GPU (`__tdt.gpuTextures`).

| Scene | JavaScript a frame | Frames measured | Heap used | Heap limit | Textures |
| --- | --- | --- | --- | --- | --- |
| the stress scene (300 creeps, a tower on every pad, rain at night) | 18.9 ms | 58 | 30.2 MB | 608 MB | 131.8 MB |
| a real wave 10 (Full, five towers, the Ironhorn on its road, rain) | 7.5 ms | 30 | 12.3 MB | 608 MB | 132.5 MB |

## Refresh rates

requestAnimationFrame replaced before the page's code by a timer at the rate (headless Chromium has no display to sync to); a solo match's ticks against the clock.

| Rate | Frames drawn a second | Seconds | Ticks | At 20 a second |
| --- | --- | --- | --- | --- |
| 60 Hz | 49 | 20 | 401 | 400 |
| 144 Hz | 47.4 | 60 | 1200 | 1200 |
| 165 Hz | 49.4 | 20 | 401 | 400 |

## Keys

Every key the desktop controls bind (src/input/controls.ts `onKeyDown`).

| Key | Does | The browser's? |
| --- | --- | --- |
| Arrow keys | Move the hero | Scroll the host page by default: the game calls preventDefault |
| 1–5 | Build a tower (with the build menu open or a pad selected) | No |
| X | Cancels a build, an aim or a selection, and closes the open panel (the key every hint names, with right-click) | No |
| Escape | The same as X where the page receives it (outside fullscreen); no text in the game names it | Yes: in fullscreen the browser takes Escape to leave it (the page sees it only out of fullscreen) |
| A | Attack-move | No |
| Q | Cast Q (Shift+Q learns it) | No |
| W | Cast W (Shift+W learns it) | No |
| E | Cast E (Shift+E learns it) | No |
| R | Cast R (Shift+R learns it) | No |
| B | The build menu | No |
| C | Quick-chat | No |
| S | Stop | No |
| U | Upgrade the selected tower (Endless: Reinforce) | No |
| F | Repair the selected tower | No (F11 is the browser's, F is not) |
| Space | Centre the camera on your hero | Scrolls the host page by default: the game calls preventDefault |
| Ctrl / ⌘ / Alt + a key | Nothing: the game ignores them (the browser keeps its shortcuts) | Yes, and left to it |
| Alt + click | Ping the map | No (no default in a page) |

<!-- notes -->
## What is still open

Written by hand. q7 (13 Nov 2026) fixed the frames: a mouse gets the desktop layout in every desktop frame, the home
card is two columns with Play solo on the first screen in the short frames, and no DOM text is under 11 px.

- **800 × 450 (a phone held sideways): NOT SERVED.** SUBMISSION.md declares portrait on phones, and CrazyGames turns
  the phone for a game that does (the advisor's reading of their pages, 13 Nov 2026), so their landscape phone frame is
  never served to this game; it still asks a sideways phone to rotate. Not a build task.
- **Escape: fixed in q8.** X cancels a build, an aim or a selection (with right-click); Escape still works outside
  fullscreen but no text in the game names it. The lesson's cards show each move as keycaps and a mouse, or a gesture
  (frames/907x510-lesson-*.jpg, frames/450x800-lesson-*.jpg).
- **Not checked, for Han:** Edge and Safari (real browsers), CrazyGames' app fullscreen with safe areas, a real 4 GB
  Chromebook (the stand-in's JavaScript a frame is inside the 33.3 ms budget), PEGI 12 (CrazyGames rates it) and
  whether the lesson's pictures count as "controls explained" (CrazyGames' judgement).
<!-- /notes -->
