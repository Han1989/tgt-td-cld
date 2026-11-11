# q5: CrazyGames prep: their build, an audit against their rules, the submission kit

| | |
| --- | --- |
| Roadmap row | CrazyGames prep: their build, an audit against their rules, the submission kit |
| Merge | autopilot |
| Needs | q3, q4 |
| Restarts the game server | no |
| Written | 11 Nov 2026, by the advisor |

How a session starts and ends is in [README.md](README.md). Where the brief below says otherwise (a branch
name, "no other pull request may be open", auto-merge, "stop and tell Han", who merges), the README decides.
Everything else in the brief is the task.

## Brief

CrazyGames prep: the crazygames build's switches, an audit against CrazyGames' published requirements, and the submission kit. Read CLAUDE.md ("Hosted builds hang on one constant", the PWA rule, Session rules), docs/DEPLOY.md section 10, docs/PRESS.md, apps/client/src/platform/embedHost.ts and embed.ts, apps/client/scripts/buildEmbed.ts, embedReport.ts, embedServe.ts, pressShots.ts and heldMoment.ts, and apps/client/e2e/embed.spec.ts first. New branch from the latest main; no other pull request may be open. Check first that main has ASK_AGE_AT_PLAY (the "No question before the first match" row) and docs/art/lighter-ab.png (the "A lighter download" row); if either is missing, stop and tell Han. Client build config and code under __EMBED__, scripts, images and docs: no sim, protocol, server or tuning change (PROTOCOL_VERSION stays as main has it).

## Why (the advisor's review of 10 Nov 2026; Han: go)
CrazyGames' Basic Launch is the game's test with strangers: it shows a new game to a small share of its players for 7 to 21 days (it ends after 7 days and 500 plays), with no ads and no SDK needed, and reports play time, day-1 return and conversion. Its QA rejects a build that breaks its rules, and a rejected game is taken again only with clear improvements. This session cannot open docs.crazygames.com (the network allow-list), so the rules below are the advisor's reading of those pages on 10 Nov 2026: treat them as the specification, and list in the pull request any you could not check.

## CrazyGames' requirements (Basic Launch)
Technical: total size 250 MB or less; 1,500 files or less; initial download 50 MB or less, and with no SDK the whole build counts; 20 MB or less to be on the phone homepage; relative paths only; time to gameplay 20 s or less; Chrome and Edge must work, Safari is switched off if it does not; on Chromebooks a game is switched off unless it runs smoothly on a 4 GB device; touch input where phones are supported; desktop expects landscape, and a portrait game is allowed with bars or a background picture at the sides; the orientation is set in the submission; body has user-select: none (and the -webkit- form); the game works in their app's fullscreen with the device's safe areas; after iOS interrupts the sound, the AudioContext is resumed inside a touch or a click.
Gameplay: text and pictures legible at one device pixel per CSS pixel in these frames: 907 x 510 and 1216 x 684 (desktop, not fullscreen), 1280 x 720 and 1920 x 1080 (desktop, fullscreen), 800 x 450 (phone) and 1080 x 607 (tablet); the same speed at 60, 144 and 165 Hz; English; controls that explain themselves on each device, shown with a keyboard picture or gestures; no key the browser owns (Escape leaves fullscreen); loads fast, no errors; an original name and art; NO fullscreen button of the game's own; PEGI 12; solo as easy to find as multiplayer.
Links: nothing that promotes another game or platform. Allowed, never as a main-menu call to action: a community or developer link in the menu ONLY IF it does not lead to a playable web version; a privacy policy; a desktop store link. No app-store links.
Covers: three pictures of one design, 1920 x 1080 (16:9), 800 x 1200 (2:3) and 800 x 800 (1:1); the title is the only text; no borders, logos, icons or plain screenshots; nothing blurry.
Previews: two videos, both required, landscape 1080p 16:9 and portrait 1080p 2:3, 15 to 20 s, 50 MB or less, no sound, no cursor, no black bars top or bottom, no promotional text, real speed, opening on the cover.

## 1. The crazygames build (under __EMBED__, host `crazygames` only; itch's build and the site unchanged)
- No fullscreen button of ours (the one on the home card's stage). The match's zoom button stays: it is not fullscreen.
- No link to a playable copy: the room card's invite link and its Copy button, the share card's address line and the share sheet's URL, "open the real game" and the version-mismatch card's link all go or change. A room is joined by its code (the code large, with "Friends on CrazyGames tap Join room and type this code"); a version mismatch says "This copy is being updated. Try again in a few minutes." with no link; the share card still saves the picture, with no address on it.
- The privacy link stays (it opens the site's privacy.html in a new tab; a policy page is allowed). Check that page offers no way into the game for a visitor who came from a hosted build; if it does, give the hosted link a marker that hides it.
- body user-select: none in every build if it is not there already; the iOS sound resume inside a gesture (say what audio/engine.ts already does, change it only if it is missing).
- Solo first: Play solo is already the main button; show it with a picture.

## 2. The audit (`npm run cg-audit -w @tdt/client`, and its report docs/crazygames/AUDIT.md)
Built on embedServe.ts (the zip served cross-origin in a frame) and Playwright:
- Sizes: the zip, the unzipped total, the file count and the first download against the limits above.
- Time to gameplay: from the frame's load to the first second of a solo Quick match with Play solo tapped at once, cold, unthrottled and on Fast 4G with the CPU at 4x; and the same after 30 s spent on the home card.
- The six frames at deviceScaleFactor 1, a mouse for the desktop sizes and touch for the phone and tablet sizes: the home card, the loading card, a held wave-10 moment (heldMoment.ts), a tower's ring or panel open, the end card. For each: a screenshot in docs/crazygames/frames/, the tile size in px, the height in px of a hero, a Grunt and the smallest text on screen, and whether any control leaves the frame or covers the map. Mark a frame FAIL where the smallest text is under 11 px, a hero is under 24 px tall, or anything is cut off (the advisor's thresholds). Do not fix a failing layout in this session: report it, with what you would change, for the advisor's next row.
- A 4 GB Chromebook stand-in: the perf project's stress scene and a real wave 10 with the CPU at 4x and a 512 MB JavaScript heap limit: the JavaScript a frame, the heap, the GPU memory. Say plainly that it is a stand-in, not a device.
- 144 Hz: one solo minute with frames driven at 144 a second: the sim's tick count against the clock.
- Keys: every key the desktop controls bind, and whether the browser owns it.
- Every requirement above in one table: PASS, FAIL or NOT CHECKED, each with its evidence.

## 3. The kit (docs/crazygames/)
- Covers from the game's own art, by the press script's cover code: 1920 x 1080, 800 x 1200 (new) and 800 x 800, one design, the wordmark the only text.
- Two previews recorded in real time from real matches on the e2e build, no sound, no cursor: landscape 1920 x 1080 from the desktop layout zoomed on the action so the map fills the frame (no dark side bands), portrait 1080 x 1620 from the phone layout; 15 to 20 s each: the build phase, a wave, an ultimate, a boss; the first frame is the cover. MP4 (H.264), under 50 MB.
- SUBMISSION.md: the title; a description of two or three short paragraphs from README's pitch; the controls for mouse and keyboard and for touch; tags (tower defense, strategy, co-op, multiplayer); orientation portrait on phones; multiplayer yes (1 to 3 players, rooms joined by code); notes for PEGI 12 (fantasy violence, no blood, no typed chat: quick-chat only); and what the game sends (the anonymous counts; a nickname only on a posted run).
- docs/SOUND_CREDITS.md (new): every recorded file, its source, its licence and the date. The effects are Kenney's CC0 packs (apps/client/public/sfx/CREDITS.md); the three music files were generated with Google Gemini by Han on 1 Oct 2026 (roadmap row a-music; the licence line reads "Han to confirm Gemini's terms allow use in a paid game"). Add one line to SUBMISSION.md's notes for Han: the 3D models were generated with Meshy from the game's own designs and the code was written with Claude Code; CrazyGames asks for no AI label, itch.io and Steam do.

## Checks
- e2e/embed.spec.ts on pixel and desktop with a crazygames e2e zip: no fullscreen button, no link to another origin except the privacy page, a room joined by its code from a second page.
- The itch zip and the site's dist/ unchanged (apart from the body's user-select if it was added).
- npm test and npm run build pass, run after the last edit. Docs: docs/DEPLOY.md section 10 (the crazygames build), docs/PRESS.md, a Decision Log row, CLAUDE.md's status paragraph, TASKS.md and apps/client/src/progress/data.ts (a new done row in the Discovery list, the next free D- number, "CrazyGames prep"; apps/client/test/progress.test.ts checks exact counts: work them out, don't guess).
Open the pull request with AUDIT.md's table and the six wave-10 frames at the top, do not turn on auto-merge, and stop.
