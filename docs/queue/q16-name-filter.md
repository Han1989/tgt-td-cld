# q16: A stricter name filter for the boards and the rooms, and the Daily run's top names in one answer

| | |
| --- | --- |
| Roadmap row | A stricter name filter, and the Daily run’s top names in one answer |
| Merge | Han |
| Needs | nothing |
| Restarts the game server | yes (the server's name rules, and two fields more in GET /daily/today; PROTOCOL_VERSION stays 28) |
| Written | 15 Nov 2026, by the advisor |

How a session starts and ends is in [README.md](README.md). Where the brief below says otherwise (a branch
name, "no other pull request may be open", auto-merge, "stop and tell Han", who merges), the README decides.
Everything else in the brief is the task.

## Merge condition

`Merge: Han`. The merge restarts the game server while the game is in CrazyGames' review (docs/queue/README.md, "When the game is live"): he picks the minute. It may be built beside q15: the two touch different halves of the repo.

## Brief

A stricter name filter for the boards and the rooms, and the Daily run's top names in one answer (Han, 15 Nov 2026: go). Read CLAUDE.md (Architecture rules: "Protocol validation", "The server is authoritative"; Session rules), apps/server/src/daily/names.ts, daily/http.ts, daily/board.ts, endless/http.ts and endless/board.ts, apps/server/src/room.ts (`join`, `takeSeat`, `sameName`, `seatToTake`), packages/protocol/src/codec.ts (`normalizeName`), apps/client/src/daily/api.ts (`isToday`) and daily/text.ts (`DailyToday`), and docs/GAME_DESIGN.md ("Daily run", "Endless" → The board, "Coming back to a match") first. The game server only, with tests and docs: no sim change, no protocol change (PROTOCOL_VERSION stays 28: no new message, error code or field in any WebSocket message), nothing in the game's bundle. The merge restarts the game server, so it is Han's.

## Why
The game is in CrazyGames' review and is about to be played by strangers. A posted name shows on the public boards and, since q13, on the first screen of every visitor (the champions' ribbon). CrazyGames' rules ask for a filter on anything players write. Today's filter is twelve stems matched anywhere in the name: it misses most of what strangers type, a space or a stretched letter steps round it, and it refuses innocent names ("Therapist" holds one of its stems; Nazim and Nazira are first names). Room nicknames are not filtered at all.

## What to build
1. One module for names on the server (move daily/names.ts up to src/names.ts or keep its place: your call), used by both boards and by the rooms. Server side only, as today: the list is never shipped to a browser.
2. A stronger fold before matching: Unicode NFKD, lower case, accents and other combining marks off, zero-width and other invisible characters out, letters of other scripts that read as Latin ones read as those (Cyrillic and Greek look-alikes, full-width forms), digits and signs read as the letters they stand for (where one stands for two letters, try both: 1, ! and | as i or l), separators between letters dropped (spaces, dots, dashes, underscores, asterisks), and a stretched letter read as one (match the squeezed form and the plain form, so an entry with a doubled letter still matches).
3. Three kinds of entry, in one data file with a comment a group:
   - stems, matched anywhere in the folded name: only words with few innocent neighbours;
   - whole words, matched only when a token of the name is that word or the whole folded name is (tokens: the raw name split on anything that is not a letter or a look-alike, and where lower case turns to upper): the short and the ambiguous ones, so that Nazim, Cassandra and Essex pass;
   - innocent words that hold a stem (Scunthorpe, therapist, shiitake and the like), looked for first and taken out before the stems are tried.
4. What the list covers. The session writes the entries; these are the groups: obscenities and sexual terms; slurs about race, ethnicity, nationality, religion, sexuality, gender and disability; hate figures, groups, slogans and their number codes; sexual violence, and anything sexual about children; telling someone to hurt or kill themselves; and, for the languages CrazyGames' players use most beside English (Spanish, Portuguese, French, German, Italian, Turkish, Polish, Indonesian, Russian in both scripts), each one's dozen most common obscenities and slurs. Words of the game's own world pass: kill, slayer, death, blood, doom, reaper, hell. CrazyGames' multiplayer requirements page (docs.crazygames.com/requirements/multiplayer/) links a word list: use it as a source if the session can open it, and say in the pull request whether it could. A few hundred entries at most, so that a person can still read the file.
5. Names that pose as someone, as whole words: admin, administrator, mod, moderator, staff, support, official, system, server, developer, owner, crazygames. And names that are an address or a contact: http, www, a dot and a common ending (com, net, org, gg, io, ru, xyz, tv, me, ly, co, app, dev), discord, telegram, t.me, whatsapp, and a name that starts with @.
6. What a refused name becomes.
   - On a board: "Player", as today. `boardName` runs when a run is posted and again whenever a board is read (the Daily run's rows, champion, `top` and `yesterdayTop`; Endless's top 10 and yesterday's 3; the dashboard's tables), so a name stored before this change that the new list refuses reads as "Player" from the first request after the deploy. Day files are not rewritten.
   - In a room: the seat is named "Player" ("Player 2", "Player 3" when that is taken in the room) on create, on join and on a seat taken by its code; `matchRename` gets the cleaned name, so the replay and the report carry it. No refusal and no new answer: the player sees the seat's name. A join by code still matches the name the seat carries (typing "Player 2" again takes it back at once; any name does after 60 s; the browser's own token always). Check that the client finds its own seat by id, never by the name it typed, and say what you found.
   - A name that shows nothing (invisible characters only): as today.
7. `GET /daily/today` gains two fields for the first screen's ribbon (q17): `top`, the day's first five rows (`rank`, `name`, `hero`, `won`, `heart`, `wave`, `ticks`, and `mine: true` on the caller's own row when its key came with the request), and `yesterdayTop`, yesterday's first three, never marked. Nothing else in the answer changes (`champion` and `you` stay), and `/daily/board` is as it was. The clients that are out (the site's, and the zips CrazyGames and itch.io hold, built from 1bc3492) must read the new answer as they read the old: add a client unit test that feeds a new answer to the check in apps/client/src/daily/api.ts (a test file only: nothing under apps/client/src changes but the tracker's data file).

## Tests and checks
- apps/server/test: a table of at least 150 names that must pass: common first names from many languages (Nazim, Nazira, Hitomi, Shital, Kumiko, Analia, Dong, Wang, Fuchs, Sukhdeep and the like), words and places that hold a stem (Scunthorpe, Therapist, Cassandra, Hancock, Dickens, Hitchcock, Peacock, Essex, Sussex, Middlesex, Shiitake, Matsushita, Assassin, Bassist, Classic, Passion, Analyst, Titan, Document, Cucumber, Grape, Nigel, Nigeria, Kumquat), and gamer names (xX_Slayer_Xx, DarkLord99, KillerQueen, DeathKnight, NoobMaster, l33tSniper). A table of at least 80 that must be refused: every group of item 4 and both of item 5, each plain and through each trick of item 2 (upper case, look-alike digits and signs, spaces, dots, a stretched letter, another script's letters, an accent, a zero-width character). Say in the pull request how many entries the list has, by group, and which innocent names you found it refusing along the way and how each was settled.
- Rooms: a refused nickname creates, joins and takes a seat by code as "Player" / "Player 2"; two refused names in one room differ; the replay and the report carry the cleaned names; a clean name is untouched, to the byte. Boards: a stored name the new list refuses reads as "Player" in every view while its day file is unchanged; a clean stored name is unchanged.
- `/daily/today`: the two new fields with 0, 1, 5 and 8 runs on the day; `mine` only with the caller's key; yesterday's three; the old fields as before.
- No browser spec is expected to change (the browser tests' names are clean): say so if one does. npm test and npm run build pass, run after the last edit.

## Docs
docs/GAME_DESIGN.md (the names rule under "Daily run" and "Endless" → The board, the room rule under "Coming back to a match", a Decision Log row), docs/DEPLOY.md where it lists the routes' answers, docs/ANALYTICS.md if it describes the boards' names, CLAUDE.md (the status paragraph and the repo layout), TASKS.md and apps/client/src/progress/data.ts as the tracker's rules ask, docs/queue/STATUS.md. The pull request says at its top: the merge restarts the game server; no protocol change; the copies CrazyGames and itch.io hold keep working, and which test shows it.
