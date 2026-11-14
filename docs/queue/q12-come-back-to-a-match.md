# q12: Coming back to a running match: at any time, and by the room code too

| | |
| --- | --- |
| Roadmap row | Coming back to a running match: any time, by the room code too |
| Merge | autopilot |
| Needs | q11 |
| Restarts the game server | yes (sim, protocol and server; PROTOCOL_VERSION 28) |
| Written | 14 Nov 2026, by the advisor |

How a session starts and ends is in [README.md](README.md). Where the brief below says otherwise (a branch
name, "no other pull request may be open", auto-merge, "stop and tell Han", who merges), the README decides.
Everything else in the brief is the task.

## Merge condition

`Merge: autopilot` only if all of these hold: `docs/queue/STATUS.md` says `Live: no`; every server test the brief lists is there and passes; a three-seat match with a drop, the pads opening, a return and a seat taken by code replays to the same state; a test shows a connected seat cannot be taken and that another nickname is refused before 60 s; the three browser checks pass on pixel and desktop. Otherwise write `Merge: Han`, with what is left and why. A Vercel preview cannot reach the game server before this merges (the server runs main's protocol), so Han tries it on the live site after the merge.

## Brief

Coming back to a running match: at any time, and by the room code too (Han's three-device match of 14 Nov 2026; the rule below is the advisor's, confirmed by Han when he merged this brief). Read CLAUDE.md ("The server is authoritative", "Hosts run matches through Match", "Protocol changes", Session rules), docs/GAME_DESIGN.md (the rooms and reconnect parts, the Decision Log), apps/server/src/room.ts (join, rejoin, disconnect, leave, tick's reconnect window), apps/server/src/config.ts (reconnectWindowMs), packages/sim/src/commands.ts (setPlayerLeft, setPlayerConnected), packages/sim/src/match.ts (matchPresence, the replay's presence entries, replayRefusal), apps/client/src/transport/networkTransport.ts (sessionStore, RECONNECT_WINDOW_MS, the retry loop), apps/client/src/online.ts (start, the error cases), apps/server/test/server.test.ts and integration.test.ts, and apps/client/e2e/lobby.spec.ts first. Sim, protocol, server and client. PROTOCOL_VERSION becomes 28.

## What happened
In Han's match one player's page had to be left (the stuck stick, q11). The replay shows her seat dropped at 593.0 s and removed for good at 653.0 s, 60 s later; the match ran to 711.75 s. She typed the room code on the home card and was refused. Why, in today's code:
- The server keeps a dropped seat for reconnectWindowMs (60 s), then calls leave: the member is `left`, and rejoin finds no seat.
- join answers `match_in_progress` for any room that is playing, so the room code never gets anyone into a running match.
- The seat's token is kept in sessionStorage, which belongs to one tab. A closed tab, a new tab or a restarted browser has no token.
Two players then finish a three-player match with the third gone for good.

## The rule
1. A seat belongs to its player until the match ends. A player who dropped can come back at any moment of the match, not only in the first 60 s.
2. After 60 s away the player's empty pads open to the teammates, as today, so nobody is blocked. The towers they built stay theirs and keep firing; their hero waits at the Heart as today. When they come back they have their hero, its level, their gold and their towers, and may build on any open pad (pads that opened stay open to all).
3. Three ways back, all to the same seat:
   a. The same tab reloads: automatic, as today.
   b. The same browser, another tab or after a restart: the seat is remembered in localStorage (the room's code, the token, the server's address, when it was saved). The home card's main button then reads "Rejoin your match" with the room's code under it, and one tap returns; Play solo and everything else stay reachable. It is forgotten when the match ends, when the server says the room or the seat is gone, when the player leaves on purpose, and after 2 hours.
   c. Any device with the room code: Join room with the code of a running match gives the joiner a seat whose player is away. With the away player's nickname (compared without case or outer spaces): at once. With any other nickname: only a seat that has been away 60 s or more, the one away longest first. The joiner plays that seat's hero with its level, gold and towers, under the joiner's nickname.
   When no seat can be taken the answer says why in a player's words: nobody is away ("That match is full: all its players are in it."), or a player dropped less than a minute ago ("A player just dropped out of that match. If that was you, join with the same nickname. Otherwise try again in a minute.").
4. A connected player is never replaced by a join by code. A seat taken by code gets a new token; the old one stops working, and a page that still holds it is told "Your seat was taken from another device" and forgets it. A rejoin with the seat's current token replaces that seat's connection, as today.
5. A `leave` message during a match (no button sends one mid-match today; do not add one) frees the seat for 3c at once and opens its empty pads at once.
6. Teammates see it: the away player's chip shows them away as today, and a line says when they are back ("<name> is back").
7. The page that comes back loads its art behind the loading card first, as today. The client no longer gives up after 60 s: it keeps trying with its backoff for as long as the page is open and the server has not said that the room, the seat or the match is gone; after 60 s the reconnecting notice gains a "Back to lobby" button, and the home card then offers "Rejoin your match".

## How
- The sim: a player who was `left` can return. Keep replays exact: every presence change the host applies is logged, and replayMatch re-runs a match with a drop, the pads opening, a return and a seat taken by code to the same state (the server integration test). Decide whether "pads open" stays `leave` followed by a new return entry or becomes its own entry, and say why.
- The protocol: PROTOCOL_VERSION becomes 28 (the entry flow and its answers change). Older replays hold no return and re-run as before, so replayRefusal refuses them only if you find one that would no longer re-run the same; say which way you went.
- The server: reconnectWindowMs becomes "when the pads open", not "when the seat is lost". An empty room still closes after emptyRoomTtlMs. The rate limits and the token's secrecy stay; a join by code into a running match is counted by the same limits as a join.
- The client: the seat in localStorage under one key, read on the home card; never sent anywhere but the game server; cleared by ⚙ Settings → Delete my data too. If privacy.html lists what this browser keeps, add it in one line.
- Hosted builds: the same, with no storage the page simply has no "Rejoin your match" (rule 3c still works).

## Tests
- Sim: a left player returns; their towers and gold are theirs; the opened pads stay open; a replay with these entries re-runs.
- Server (real server on port 0, bots): a dropped bot rejoins by token after the window; a new connection joins by code with the dropped seat's nickname and gets it at once (same player id, hero, gold, towers); with another nickname it is refused before 60 s and seated after; the old token then fails with the taken-seat answer; with nobody away the join is refused in words; a connected seat is never taken; a seat left on purpose is taken at once; a three-seat match with a drop, the pads opening, a return and a seat taken by code replays to the same state.
- Client unit: the stored seat's rules (when it is offered, when it is forgotten).
- Browser, once each, against a local server (e2e/lobby.spec.ts or a new spec beside it, pixel and desktop): a second tab of the same browser shows "Rejoin your match" and returns to the seat; a fresh browser context joins by code with the same nickname and takes the away seat; a reload still rejoins.

## Docs
docs/GAME_DESIGN.md (the rule, and a Decision Log row dated 2026-11-14), docs/DEPLOY.md (the reconnect window's new meaning), docs/MOBILE_TESTING.md (a three-device step: one device closes its tab mid-match and comes back by the code), CLAUDE.md (the status paragraph and the architecture rules that name the reconnect window), TASKS.md and apps/client/src/progress/data.ts as the tracker's rules ask, docs/queue/STATUS.md.

## Checks
npm test and npm run build pass, run after the last edit; the browser specs you changed, once. The pull request says that PROTOCOL_VERSION is 28, that the merge restarts the game server and that every hosted zip must be built again. A Vercel preview cannot reach the game server until this is merged (the server runs main's protocol), so the description lists what Han tries on the live site after the merge, with two devices: drop one, wait past a minute, and come back each of the three ways.
