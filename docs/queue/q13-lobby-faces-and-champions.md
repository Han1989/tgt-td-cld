# q13: The lobby: hero faces that live, and today's champions on the first screen

| | |
| --- | --- |
| Roadmap row | The lobby: hero faces that live, and today’s champions on the first screen |
| Merge | Han |
| Needs | q12 |
| Restarts the game server | yes (one HTTP answer gains a field; PROTOCOL_VERSION stays 28) |
| Written | 15 Nov 2026, by the advisor |

How a session starts and ends is in [README.md](README.md). Where the brief below says otherwise (a branch
name, "no other pull request may be open", auto-merge, "stop and tell Han", who merges), the README decides.
Everything else in the brief is the task.

## Merge condition

`Merge: Han`. He judges the faces and the ribbon on his phone, from the pictures and the two clips linked at the top of the pull request and from the Vercel preview.

## Brief

The lobby's hero faces, and a ribbon of today's champions (Han, 15 Nov 2026, looking at the home card before the launch). Read CLAUDE.md ("Layout and touch", the Art rule, "Hosted builds hang on one constant", "Analytics respect the Play data switch", Conventions, Session rules), docs/ART.md section 12 (the UI and its icons) and section 15 (the stage), docs/GAME_DESIGN.md "Endless" (The board), apps/client/src/lobby/ (lobby.ts, heroPicker.ts, heroStage.ts, boardCard.ts, modePicker.ts), apps/client/src/render/art/icons.ts (heroIcon, iconVar, how an icon becomes `--icon-<id>`), apps/client/src/endless/ (board.ts, api.ts), apps/server/src/endless/ (http.ts, board.ts, store.ts), apps/client/scripts/pressShots.ts (`cut`: a hero cut from his stage poster against the empty clearing) and apps/client/e2e/lobby.spec.ts (the home card's size tests, the board link's test and its stub of /endless/today) first. Client, one HTTP answer on the server, docs. No sim and no WebSocket change: PROTOCOL_VERSION stays 28.

## Why
1. The hero buttons still show the first draft's 2D faces: a hood, a helmet, a witch's hat. The heroes have been the game's own 3D characters since V-06b, and the Arcanist has worn no hat since V-06e. These buttons are the first thing a stranger taps.
2. "Today's top 10" under the word Mode reads as a top 10 of modes: a stranger cannot tell it is a board of players. And the players who are on the board never see their names unless they open it. Han wants the names on the front of the page, running in a loop, so that a player is proud to be there.

## Part 1: the heroes' faces
- A portrait a hero: head and shoulders, cut from the hero's own stage poster (apps/client/public/stage/<hero>-poster.webp against clearing.webp; pressShots.ts's `cut` does this for the store covers: move what you need into a module both scripts use). A script makes them (`npm run hero-portraits -w @tdt/client`) and they are committed. Square, the face centred, the hero's silhouette piece inside the picture (the Ranger's leaf peak, the Warden's helm, the Oracle's hood), sharp in a 44 px box on a 3x phone, each under 12 KB. The script also measures where the eyes are and writes it beside the pictures, for the glow below. If the cut is soft or fringed at that size and the Blender pipeline runs in your session (docs/ART.md section 15), render frame 0 of the stage scene with the figure alone instead; say which you used.
- They replace the three hero icons everywhere the game shows one (`heroIcon`: the hero buttons on the home card and the room card, the room's seats, the board card's rows, the match's hero panel and the teammates' chips): one face a hero in the whole game. The canvas-drawn hero icons leave icons.ts if nothing uses them (the `?showcase` icon list and its test follow). This is the one exception to "UI icons are drawn in code": say so in docs/ART.md section 12 and in CLAUDE.md's Conventions.
- On the hero buttons the faces are alive. The button keeps its box (44 px tall, three in a row at 360 px wide, the name beside the face, the wins mark where it is). The face sits in a round medallion in the hero's own colour from the tokens (the Ranger's teal, the Warden's ember, the Oracle's violet), as large as the button allows, and may stand a few px out of the medallion's top. CSS only, transform and opacity only:
  - at rest: a slow breath (each hero his own period and phase, so the three never move as one), the eyes' glow pulsing, a blink every few seconds;
  - one signature each: the Ranger's head tilts a little, as if listening; a glint crosses the Warden's visor; the Oracle's eyes flare violet and two or three motes rise;
  - picked: the medallion's ring lights, the face is a step larger and hops once with a squash and a stretch; the two others dim a little and breathe slower;
  - pressed: the 2 px sink the buttons have today;
  - reduced motion: nothing moves; the picked ring and size only.
- Nothing may move the home card: the buttons' row, the blurb, the Mode row, the tile and Play solo are where they are today at 412 x 839, at 360 x 640 and in the two-column layout (the size tests hold).
- The three portraits ship with the first screen (inline or precached). Say in the pull request what the first load gained in bytes.

## Part 2: today's champions on the first screen
- The link "Today's top 10" leaves the Mode label.
- The home card gets a ribbon of its own instead: one line, about 30 px tall, the card's width, between the Mode row and the Daily run's tile, with the tile's gold hairline. Left, standing: a small code-drawn laurel or crown (icons.ts) and the label "Endless · today's top 10" (11 px or more). Right: the names, moving.
- The names. Each row is its rank (1 gold, 2 silver, 3 bronze, the rest plain), the hero's face (Part 1, 20 px), the nickname as the board shows it, and its wave ("wave 54"). The rows run right to left in one line, a loop with no seam (the set drawn twice), about 36 px a second, and hold while a finger or the mouse is on them. Rows that do not fill the window do not move: they stand centred.
- Your own row (the answer's `mine`) is teal, with a small "you".
- One tap anywhere on the ribbon opens the board card the link opened (boardCard.ts; its title reads "Endless · today's top 10" if it does not already say Endless).
- When today's board has fewer than 3 rows, yesterday's best follow them after a small "Yesterday" label (the server's new field, below). With no row at all it reads "No runs on the board yet. Play Endless to be the first." and stands still.
- Where the link was hidden, the ribbon is hidden: no game server, a failed request, under 13 (`currentAgeBand() === 'child'`). Its height is taken from the hero stage when it shows, as the Daily run's tile does, so Play solo never moves, and the home card fits one screen at 412 x 839 and 360 x 640 with the ribbon and the tile both showing. In the two-column layout it goes in the right column, with the picks.
- It asks for the board when the home card shows, as today, and again every 5 minutes while the home card is open and the page is visible.
- Reduced motion: nothing moves; the first rows that fit, then "+N more".
- Screen readers: the ribbon is one button, "Endless, today's top 10: open the board"; the moving text is hidden from them.
- Hosted builds get the same ribbon, with no `__EMBED__` difference.

## The server
GET /endless/today's answer gains `yesterday`: the top 3 of the UTC day before (rank, name, wave, ticks, hero; never `mine`), an empty list when that day has no file. The same guard, limits and caching; nothing new is stored and nothing new is sent by the client. The client accepts an answer without the field (an older server).

## Privacy
privacy.html's "A posted Endless run" says where a posted nickname shows: add that the day's top names also show on the game's first screen (its test lists the sentences). The consent card's words stay.

## Tests
- Unit: the ribbon's pure model (what it shows in each state: full, few, yesterday, empty, hidden; the loop's length for a width; your row); the portrait data (each hero has a picture, its eyes inside it); the server's `yesterday` (apps/server/test/endless.test.ts: a day with rows, a day with none, never `mine`).
- Browser (e2e/lobby.spec.ts, on the projects that spec runs): the hero buttons show the three portraits, loaded, and the picked one changes with a tap; with reduced motion nothing on the home card animates; with the board stubbed as the spec already does: ten rows run, a tap opens the board card, two rows stand still with yesterday's after them, no rows shows the empty line, a failed request and under 13 show no ribbon; the home card's size tests pass with the ribbon and the tile showing, and Play solo is where it is without them. No fixed sleeps.

## Pictures for Han (he judges this on his phone, and the preview's real board may be empty)
From the e2e build, into docs/screenshots/lobby/: the home card at 412 x 839 (2x), 360 x 640 and 1280 x 720 with ten rows; the two-rows-and-yesterday and the empty states at 412 x 839; the room card; the hero buttons before and after, side by side, enlarged; and two clips recorded in real time at 412 x 839 (H.264, no sound, about 10 s each): `ribbon.mp4` (the names running, then a tap opening the board) and `faces.mp4` (the three buttons at rest, then each picked in turn). Look at every picture and both clips before committing. Link each of them at the top of the pull request.

## Docs
docs/ART.md section 12 (the portraits, the icon rule's exception, the buttons' life, the ribbon); CLAUDE.md (the status paragraph, the icon rule in Conventions, `npm run hero-portraits` in the command table, lobby/ in the layout); docs/GAME_DESIGN.md "Endless" (The board) and a Decision Log row dated 2026-11-15; docs/DEPLOY.md where it lists /endless/today; TASKS.md and apps/client/src/progress/data.ts as the tracker's rules ask; docs/queue/STATUS.md.

## Checks
npm test and npm run build pass, run after the last edit; e2e/lobby.spec.ts once on each of its projects, and any other spec you changed. The pull request says what to look at on the Vercel preview (the hero buttons; the ribbon, which there shows whatever today's real board holds), that the merge restarts the game server (one HTTP answer gains a field; PROTOCOL_VERSION stays 28), and that the hosted zips are built again for the new lobby.
