# q6: A bot teammate in solo

| | |
| --- | --- |
| Roadmap row | A bot teammate in solo |
| Merge | Han |
| Needs | q5 |
| Restarts the game server | yes (sim; the protocol if a format changes) |
| Written | 11 Nov 2026, by the advisor |

How a session starts and ends is in [README.md](README.md). Where the brief below says otherwise (a branch
name, "no other pull request may be open", auto-merge, "stop and tell Han", who merges), the README decides.
Everything else in the brief is the task.

## Brief

A bot teammate in solo. Read CLAUDE.md (Architecture rules; Conventions: the balance targets and the bots), docs/GAME_DESIGN.md sections 4, 7 and 13 (the Decision Log rows of 2 and 17 Oct 2026), docs/HOOK_SPIKE.md (item 4, "Solo practice", and the combos), packages/sim/src/bots.ts, coop.ts, pads.ts and match.ts, apps/client/src/transport/simHost.ts, and pull request #116, which removed the Practice ally (its sim part is in the history: `git log --diff-filter=D --name-only`) first. New branch from the latest main; no other pull request may be open. Sim, protocol, the solo host, the client and the bots; the game server's rooms never add an ally.

## Why (the advisor's review of 10 Nov 2026; Han: go)
The game is called Tower Defense Together and its hook is two ultimates fusing into a combo. A stranger from a game portal arrives alone and there is no matchmaking (a room is joined by a friend's link or code), so a first solo match has no teammate, no combo and no wave-10 shield broken from two lanes: the hook never shows. The friends who replayed (Gate 1) played together.

## The rule (the advisor's, from the Practice ally of 2 Oct 2026; Han reviews the pull request)
- Play solo in Full and Quick starts with one bot hero beside you, with no new row or switch in the lobby (Han: no clutter, the lobby fits one screen). Settings gets one line, "Bot teammate: On / Off" (On by default, remembered).
- Never in the Daily run, in Endless or in the lesson (Learn to play): the two boards stay one player's runs, re-run by the server exactly as today, and their seeds, replays and results do not change by a byte.
- Which hero: the Arcanist for a Ranger, the Ranger for an Arcanist or a Warden. In the match a small "Bot" tag under its name, nothing else drawn on it.
- What it is: a hero only. It owns no pads, builds nothing, has no gold, gets no income or call-early gold, and its kills' bounty goes to you. It levels with you, spends its skill points as the casual bot does, walks the lane with the most creeps that you are not standing in, auto-attacks, and casts Q and W as the casual bot does. Its ultimate is for combos: it answers yours 0.5 s later when its own is ready; when both are ready and unused for 20 s with 12 creeps out it pings once and waits; and when yours is more than 25 s away it casts alone on 12 creeps. It retreats and respawns as a hero does, and never pings or emotes otherwise.
- What it leaves alone: pad zones (you own every pad, as in solo), surge shares, the wave-10 shield's rule (its hero counts as the lane it stands in, so the shield can break in solo).
- Your record keeps these matches as solo; the report says an ally played and lists its kills, casts and combos apart from yours.

## What to build
1. Sim: a match config flag for the ally (a second hero that is not a player for pads, income, scaling by team size or surges), deterministic: the bot decides from snapshots and acts through commands that matchCommand logs like any player's, so replayMatch re-runs a match with an ally to the same state (a test). The sim stays pure. If the snapshot, the config, the report or the replay format changes, bump PROTOCOL_VERSION and make replayRefusal refuse older replays with a clear message.
2. Balance. The ally adds a hero's damage and a second ultimate, so solo with the ally must sit where solo sits today: one creep HP factor for "solo with an ally" in tuning.ts, found with `npm run balance:matrix` (solo, Normal, Full and Quick, novice, casual and expert, 30 seeds, the ally on): novice wins at least 80% for each hero, casual ends with 50 to 90 Heart, expert with 85 or more, the three heroes' means within 10 Heart. Solo with the ally off keeps today's numbers exactly (a byte-for-byte comparison of 60 matches). Round numbers only. Report combos per match and the ally's share of the damage (aim: 25 to 40%; if it carries the match, weaken its auto-attack, not its ultimate).
3. The solo host (simHost.ts) creates the match with the ally when the mode is Full or Quick and the setting is on, runs the bot a few times a second on the snapshots it already makes, and logs its commands; the pause and the hidden-page pause hold it too.
4. Client: the ally's hero drawn as a teammate's is in a room (its sheet is part of what a match waits for: artLoad's matchSheets), its chip beside yours, the Combo! ring on your R after its cast as with a human teammate, the end card's ultimates and combos listing it. The Settings line. No lobby change.
5. Teach it once: the first time your R and the ally's are both ready with creeps out, one line, "Your ally is ready: cast R together for a combo" (tdt.settings, once).

## Checks
- Unit tests: the ally owns no pad and earns nothing; its bounty goes to the player; its level follows; the combo answer lands inside the window; never in the Daily run, Endless or the lesson; replays with and without an ally; the Daily run's and Endless's results for the gate seeds unchanged.
- The balance tables before and after in the pull request, and a new round in docs/balance/TUNING_LOG.md.
- Browser tests, once each: e2e/mobile.spec.ts on pixel (a solo match shows the ally, and a combo fuses when both R are cast), e2e/lobby.spec.ts on iphone (the home card unchanged at 412 x 839), and the stress test alone if the renderer changed.
- Docs: docs/GAME_DESIGN.md (the rule and a Decision Log row), docs/HOOK_SPIKE.md item 4, docs/MOBILE_TESTING.md (a solo combo with the ally), CLAUDE.md's status paragraph, TASKS.md and apps/client/src/progress/data.ts (the bot teammate's row done, with this pull request's number; apps/client/test/progress.test.ts checks exact counts: work them out, don't guess).
npm test and npm run build pass, run after the last edit. If the protocol is bumped, the merge restarts the game server and every hosted zip must be built again: say so at the top of the pull request. Open it, do not turn on auto-merge (Han reviews the balance and plays it), and stop.
