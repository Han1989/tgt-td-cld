# q8: Keys CrazyGames allows, and a lesson that shows them

| | |
| --- | --- |
| Roadmap row | CrazyGames fix 2: X cancels in place of Escape, and a lesson that shows the keys |
| Merge | autopilot |
| Needs | q7 |
| Restarts the game server | no |
| Written | 13 Nov 2026, by the advisor |

How a session starts and ends is in [README.md](README.md). Where the brief below says otherwise (a branch
name, "no other pull request may be open", auto-merge, "stop and tell Han", who merges), the README decides.
Everything else in the brief is the task.

## Merge condition

`Merge: autopilot` only if the audit's "No key the browser owns" row reads PASS and the tests that measure the lesson card on the phone pass unchanged. Otherwise write `Merge: Han`, with what is left and why.

## Brief

Keys CrazyGames allows, and a lesson that shows them: X cancels where Escape did, and the first-match lesson shows each move as a picture of the keys or the gesture (the advisor's row of 13 Nov 2026, from the q5 audit, docs/crazygames/AUDIT.md). Read CLAUDE.md (Conventions: UI icons are drawn in render/art/icons.ts; the "Layout and touch" rule; Session rules), docs/crazygames/AUDIT.md (the Keys table, the "Controls explained" and "No key the browser owns" rows), docs/crazygames/SUBMISSION.md (Controls), apps/client/src/input/controls.ts (onKeyDown), apps/client/src/hud/hud.ts (the placing and aiming hints that say Esc), apps/client/index.html (the Controls list), apps/client/src/tutorial/logic.ts and coach.ts with apps/client/test/tutorial.test.ts, apps/client/src/render/art/icons.ts, apps/client/scripts/cgAudit.ts, and the lesson's cases in apps/client/e2e/desktop.spec.ts and mobile.spec.ts first. New branch from the latest main; no other pull request may be open. Client only: no sim, protocol, server or tuning change, so the merge does not restart the game server. Every build: no __EMBED__ branch in this task.

## Why
CrazyGames' quality guidelines, read by the advisor on 13 Nov 2026 (a session cannot open them: treat this as the specification).
- Avoid keys the browser owns: "Escape closes fullscreen" (and Ctrl / Cmd + W closes the tab, which the game already leaves alone). In CrazyGames' fullscreen a player who presses Escape to cancel a build drops out of fullscreen instead.
- "Show the user how to control the game with a keyboard overlay or mouse gestures." "Implement the onboarding in gameplay." "Make the onboarding phase skippable." "Prioritize visuals and limit the use of text for onboarding." The first-match lesson is in gameplay and skippable already; its cards are words.

## What to build
1. X cancels. X does everything Escape does today (cancels a build, an aim and a selection, closes the open panel or menu), in controls.ts's own key handling. Escape keeps working where the page still receives it (outside fullscreen), but the game no longer names it: the placing and aiming hints, the Controls list, the lesson and SUBMISSION.md say "X or right-click cancels". Right-click already cancels a mode: check that it cancels a build, an aim and a selection, and make it so where it does not. X is free today (A, B, C, E, F, Q, R, S, U, W, 1 to 5, Space and the arrows are taken).
2. The lesson shows its moves. Each lesson card (Move, Build a tower, Cast a skill, Upgrade, Ping the map, Quick chat) carries a picture of what to press above one short line of words.
   - Mouse and keyboard: keycaps (a styled <kbd>, its letter 13 px or more) and a small mouse with the button to press lit. Move: the mouse, right button lit. Build: the mouse, left button lit, over a pad; then "or" the B and 1 to 5 keycaps. Cast: the Q keycap, and the mouse's left button for an aimed skill. Upgrade: the left button on a tower, "or" the U keycap. Ping: the Alt keycap and the left button. Quick chat: the C keycap. Where a card starts a mode, a small X keycap with "cancel".
   - Touch: a gesture glyph. Move: a thumb on the stick with an arrow. Build: a tap ring on a pad. Cast: a tap on the Q button, and a drag arrow out of it for an aimed skill. Upgrade: a tap on a tower. Ping: a long-press ring on the map.
   The mouse and the gesture glyphs are drawn in render/art/icons.ts like every UI icon (no image files, no icon pack); the keycaps are CSS, and the Controls list's <kbd>s take the same look. The words shrink to one line a card: what to do, not which key, since the picture says that. logic.ts stays pure: a card's picture is data (the keycaps and glyph ids for each input), tested. The card keeps its place and its size on a 412 x 839 phone and a 360 x 640 one (it never covers the controls or the pad it points at; the tests that measure it pass), every text in it is 11 px or more, and under reduced motion it fades instead of moving, as today.
3. The audit. cgAudit.ts shoots the lesson's first two cards at 907 x 510 with a mouse and at 450 x 800 with touch into docs/crazygames/frames/, and the "Controls explained" row cites them (PASS when each card shows its picture; the judgement stays CrazyGames'). The "No key the browser owns" row and the Keys table show X beside Escape, and the row is PASS when no text in the DOM names Esc. Run it (`--only frames,keys` is enough if nothing else changed) and commit AUDIT.md, audit.json and the new frames.

## Checks
- Unit tests: apps/client/test/tutorial.test.ts (every card has a picture for each input and one line of words; no card's text names Escape), and a test of the key handling's rule if it has a pure part.
- Browser tests, once each (README step 5: search apps/client/e2e for Escape and for the lesson): e2e/desktop.spec.ts on desktop (X cancels a build, an aim and a selection; Escape still does outside fullscreen; right-click does; the hint reads "X or right-click"), e2e/mobile.spec.ts on pixel and iphone (the lesson's cards show their glyphs and sit where they did).
- Screenshots in the pull request: each lesson card on a 1280 x 720 desktop and on a 412 x 839 phone, before and after.
- Docs: docs/MOBILE.md section 5 (X cancels; the lesson's pictures), docs/ART.md section 12 (the new icons), docs/crazygames/AUDIT.md and SUBMISSION.md, docs/MOBILE_TESTING.md (a step for each), a Decision Log row in docs/GAME_DESIGN.md dated 2026-11-13, CLAUDE.md's status paragraph, TASKS.md and apps/client/src/progress/data.ts (a new done row in the Discovery list, the next free D- number, "Keys and the lesson's pictures"; apps/client/test/progress.test.ts checks exact counts: work them out, don't guess).
npm test and npm run build pass, run after the last edit.
