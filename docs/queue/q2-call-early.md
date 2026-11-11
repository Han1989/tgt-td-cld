# q2: Call early waits for the wave, and End run for Endless

| | |
| --- | --- |
| Roadmap row | Call early waits for the wave: no stacked waves, an honest Endless board |
| Merge | autopilot |
| Needs | q1 |
| Restarts the game server | yes (sim and protocol 26) |
| Written | 11 Nov 2026, by the advisor |

How a session starts and ends is in [README.md](README.md). Where the brief below says otherwise (a branch
name, "no other pull request may be open", auto-merge, "stop and tell Han", who merges), the README decides.
Everything else in the brief is the task.

## Merge condition

`Merge: autopilot` only if the balance matrix did not move beyond noise and every target of `docs/GAME_DESIGN.md` §13 and the Endless gate holds; the description must say so with the before / after tables. Otherwise write `Merge: Han` and what moved.

## Brief

Call early waits for the wave: one press, one wave, so waves cannot be stacked and the Endless board cannot be topped by pressing a button; and an honest way to end an Endless run (the advisor's rule of 11 Nov 2026, from Han's Endless report; Han confirmed it the same day: "prevent it"). Read CLAUDE.md (Architecture rules: the sim is pure and deterministic, the protocol rule; Conventions: the balance targets and the bots; Session rules), docs/GAME_DESIGN.md ("Endless", "Daily run", section 13, the Decision Log rows of 24 and 28 Oct 2026), packages/sim/src/waves.ts (callEarly, callEarlyBonus, startWave, updateWaves, the spawn queue), commands.ts (the callEarly case), match.ts (replaySteps, replayRefusal, the report), endlessBoard.ts (endlessRankOrder), bots.ts (the expert's call-early rule), packages/protocol/src/types.ts (the snapshot's nextWaveIn and callEarlyBonus; the commands), apps/client/src/hud/hud.ts (canCall and the Call early button) and settingsPanel.ts, apps/client/src/endless/ (best.ts, board.ts, endCard.ts) and src/record/ (tdt.endlessBest), and apps/server/src/endless/ first. New branch from the latest main; no other pull request may be open. Sim, protocol, bots, client and docs. The merge restarts the game server.

## Why
Han's Endless run of 11 Nov 2026 (Arcanist, seed 922282674, build ad26ab4, protocol 25): the Heart stood at 100 after every wave up to 48. At tick 21790 he pressed Call early 7 times within one second (7 different ticks); the wave counter went from 42 to 49 and the Heart fell 39 s later. The run was posted as "Fallen on wave 49" and was #1 on that day's board. His end card also read "Best: wave 148": on 24 Oct the same presses (102 in 20 s) took a run that had really reached wave 46 to 148. callEarly has no condition but "a next wave exists": each accepted press sets nextWaveTick to now, so a wave starts on every tick it is pressed. The board ranks by the wave the Heart fell on, then the shorter time, and the server's re-run repeats the presses faithfully. So the fastest way to the top of the board is to press the button without playing. Both times Han pressed it because he wanted the run to end and there was no other way to end one.

## The rules
1. callEarly is accepted only when the current wave has finished spawning (nothing of it left in the spawn queue); before wave 1 it works as today. Otherwise it is rejected with a `rejected` event ("This wave is still arriving") and pays nothing. One press starts one wave, and the next press waits for that wave to come out. Every mode: Full, Quick, the Daily run, Endless, solo and rooms.
2. Calling early when the lanes are under control stays worth doing: the gold, and on the boards the shorter time.
3. The snapshot tells the client whether a call would be accepted now (a field beside callEarlyBonus). The Call early button is disabled while it would be rejected and reads "Wave arriving" (the compact HUD: the same idea in the room it has); the desktop key follows; a held key or a fast finger makes no stream of toasts.
4. End run (solo Endless only). A new command that ends the match as a defeat: the Heart falls now, on the wave the match is in, or on the wave before if the current one is still arriving. It is logged like any command, so replayMatch and the server's re-run end the same way and the run posts as any other. In Settings during a solo Endless match: "End run" beside Back to lobby (if the laptop-fixes row has merged; else on its own), asking once inside the sheet ("End this run on wave 43? It counts and can be posted." with End run and Keep playing). Never in a room, the Daily run, Full or Quick.
5. This changes how an old replay re-runs and adds a command: bump PROTOCOL_VERSION to 26, the codec validates the new command, and replayRefusal refuses replays recorded before 26 with a clear message, as it did at protocols 22 and 23. The server's Endless and Daily day files from before stay as they are (a board is one day).
6. Endless bests stored in the browser before this rule are dropped once (a version on tdt.endlessBest, which src/record/ reads too): they may be press counts, not waves fought. The first time the Mode row would have shown an old best it says once, "Bests start again: Call early can no longer stack waves".

## Bots and balance
The expert bot calls only after the field has been clear for a while; make it read the new field so it never sends a call that would be rejected. No bot uses End run. Then `npm run balance:matrix` (all bots, Normal and Hard, Full and Quick, solo, pairs, trio, 30 seeds) and `-- endless` once, before and after. Expected: nothing moves, because no bot stacks waves. A row that moves by more than noise is reported, not retuned. The targets of docs/GAME_DESIGN.md section 13 and the Endless gate must hold. The two playtest replay fixtures under packages/sim/test/fixtures/playtests/ hold callEarly commands: keep what their tests mean (re-record, or test the refusal of an old protocol) and say which.

## Tests
- Sim: a press while the wave is still spawning is rejected and pays nothing; a press after the last spawn starts exactly one wave; 50 presses over 50 ticks from the build phase start one wave, not 50; before wave 1 it works; two players in a room pressing on the same tick; End run ends on the right wave in both cases and is refused in a room, the Daily run, Full and Quick; replay equality over an Endless run with early calls and an End run; replayRefusal on a protocol-25 replay; the codec.
- Server: an Endless replay that ends with End run is accepted and ranked by the server's own wave and ticks.
- Client: the button's state and words from the snapshot; the bests' version (old bests dropped once, new ones kept); the End run rule in Settings.
- Browser tests, once each: e2e/desktop.spec.ts on desktop and e2e/mobile.spec.ts on pixel (Call early is off while a wave arrives and on after it), e2e/endless.spec.ts on pixel (End run asks, ends the match and the end card shows the wave).
- Docs: docs/GAME_DESIGN.md (the rule under the waves and under "Endless"; a Decision Log row dated 2026-11-11 with Han's run as the reason), docs/MOBILE_TESTING.md (a step: try to stack waves; end an Endless run), docs/balance/TUNING_LOG.md (the before / after tables), docs/ANALYTICS.md if the board's text changes, CLAUDE.md (status, the protocol line), TASKS.md and apps/client/src/progress/data.ts (a new done row in the Discovery list, the next free D- number, "Call early waits for the wave"; apps/client/test/progress.test.ts checks exact counts: work them out, don't guess).
npm test and npm run build pass, run after the last edit. Say at the top of the pull request that the protocol is 26 and that the merge restarts the game server. Open it, do not turn on auto-merge (Han reviews the tables and tries to stack waves), and stop.
