# q1: Laptop run fixes: whole numbers, a way back to the lobby, tidy skill buttons

| | |
| --- | --- |
| Roadmap row | From your laptop run: whole numbers, a way back to the lobby, tidy skill buttons |
| Merge | autopilot |
| Needs | nothing |
| Restarts the game server | no |
| Written | 11 Nov 2026, by the advisor |

How a session starts and ends is in [README.md](README.md). Where the brief below says otherwise (a branch
name, "no other pull request may be open", auto-merge, "stop and tell Han", who merges), the README decides.
Everything else in the brief is the task.

## Brief

Laptop run fixes: whole numbers on the HUD, a clear way back to the lobby, and tidy skill buttons on desktop (Han, 11 Nov 2026, from an Endless run on his laptop: Arcanist, fell on wave 49, build ad26ab4). Read CLAUDE.md (Session rules; the layout and touch rule), docs/MOBILE.md sections 4 and 5, apps/client/src/hud/hud.ts (the hero panel: hpText and manaText; the tower panel's HP line; the end screen's buttons: restartBtn, changeHeroBtn, endLeave), apps/client/index.html (the end card: #restart, #end-change-hero, #end-leave; the settings sheet), apps/client/src/gameView.ts and online.ts (onChangeHero and `home`: what "Change hero / mode" does today), apps/client/src/hud/settingsPanel.ts, skillFace.ts and towerInfo.ts, and apps/client/src/style.css (.skill .name, .skill .cd-text, the hero panel's bars) first. New branch from the latest main; no other pull request may be open. Client only: no sim, protocol, server or tuning change, so the merge does not restart the game server.

## What Han saw
1. The hero panel read "271 / 949.2799999999999", later "261 / 991.16". In Endless a hero past level 10 gets a percentage on its max HP (heroMaxHp times the veteran bonus), a Reinforce rank does the same to a tower, and the HUD prints the snapshot's numbers as they come.
2. On the end card of a solo match he found no way back to the lobby to play with friends, so he closed the app and opened it again. "Change hero / mode" does go to the home card, which carries Play with friends, but its name does not say so. During a solo match there is no way out at all.
3. On desktop the cooldown number is drawn over the skill's name ("Fireball1", "Meteo6": .cd-text is centred over the whole button), and the mana bar's "332 / 332" is cut off at its bottom edge.

## What to build
1. Whole numbers everywhere the HUD shows a number from the game. One pure function with a test (for example hud/num.ts): current HP rounds up (a living hero or tower never reads 0), max HP rounds to the nearest, mana rounds down (a skill that reads affordable is affordable), and current never reads above max. Use it in the hero panel, the team rows, the tower panel and the tower ring, the touch HUD, the tooltips and towerInfo.ts's stats, the end card and the share card. Then search the client for every other place a snapshot number reaches text (template strings and setText with hp, maxHp, mana, maxMana, damage, range, gold, cost or a cooldown) and list in the pull request what you found and what you changed. The sim's numbers, the bars' widths and the saved match report keep the exact values.
2. The way back. On a solo end card the second button reads "Back to lobby" (the same action as today); the Daily run's and Endless's end cards too. In Settings, during a solo match only, a "Back to lobby" button that asks once inside the sheet ("Leave this match? It won't be saved." with Leave and Stay; never a browser dialog), then ends the match and goes home exactly as the end card's button does. An online room keeps Leave room as it is. Keep the ids the browser tests use (#end-change-hero stays the id).
3. Skill buttons on desktop. The countdown never covers the name: put it over the icon as the touch buttons do, or fade the name while it counts; say which you chose and show it. The hero panel's HP and mana lines sit fully inside their bars at 1280 x 720, 1366 x 768 and 1920 x 1080.

## Checks
- Unit tests: the number function (every rounding case, with 949.2799999999999, a hero at 0.4 HP and mana at 34.9 against a cost of 35), and the Settings button's rule (a solo match only).
- Browser tests, once each: e2e/desktop.spec.ts on desktop (a skill on cooldown shows its name and its count apart; the panel's HP and mana text are whole numbers), e2e/mobile.spec.ts on pixel (the end card's Back to lobby reaches the home card; Settings' Back to lobby in a solo match asks, then goes home), e2e/endless.spec.ts on pixel if the end card's markup changed.
- Screenshots in docs/screenshots/laptop-fixes/, before and after, at 1920 x 1080: the hero panel in an Endless match past level 10, a skill on cooldown, the end card; and the Settings button at 412 x 839. Put them in the pull request.
- Docs: docs/MOBILE.md section 5 (the way back), docs/MOBILE_TESTING.md (a step for each of the three), a Decision Log row in docs/GAME_DESIGN.md dated 2026-11-11, CLAUDE.md's status paragraph, TASKS.md and apps/client/src/progress/data.ts (a new done row in the Discovery list, the next free D- number, "Laptop run fixes", with this pull request's number; apps/client/test/progress.test.ts checks exact counts: work them out, don't guess).
npm test and npm run build pass, run after the last edit. Open the pull request, do not turn on auto-merge (Han looks at it on his laptop), and stop.
