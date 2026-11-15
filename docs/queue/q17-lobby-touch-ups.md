# q17: Lobby touch-ups: the Warden's face readable, and the Daily run's leaders on the champions' ribbon

| | |
| --- | --- |
| Roadmap row | Lobby touch-ups: the Warden’s face, and the Daily run’s leaders on the ribbon |
| Merge | Han |
| Needs | q15, q16 |
| Restarts the game server | no |
| Written | 15 Nov 2026, by the advisor |

How a session starts and ends is in [README.md](README.md). Where the brief below says otherwise (a branch
name, "no other pull request may be open", auto-merge, "stop and tell Han", who merges), the README decides.
Everything else in the brief is the task.

## Merge condition

`Merge: Han`. He judges the Warden's face and the ribbon on his phone, from the pictures and the two clips at the top of the pull request and from the Vercel preview (which shows the real boards: q16 is on the live server by then).

## Brief

Lobby touch-ups: the Warden's face readable when he is not picked, and the Daily run's leaders on the champions' ribbon (Han, 15 Nov 2026: go). Read CLAUDE.md (the q13 paragraph of the status, "Layout and touch", "Art", Session rules), docs/ART.md section 12 (the heroes' faces, "The champions' ribbon"), apps/client/src/lobby/ribbon.ts, src/endless/ribbon.ts and its test, src/lobby/boardCard.ts, src/lobby/heroPicker.ts, src/render/art/portraits.ts, the script behind `npm run hero-portraits`, scripts/lobbyShots.ts, src/daily/api.ts and daily/text.ts, and apps/server/src/daily/http.ts (q16's `top` and `yesterdayTop` in GET /daily/today) first. Client only: no sim, protocol or server change; the home card's boxes do not move.

## 1. The Warden's face
On the home card's hero buttons the Warden reads as a dark shape whenever another hero is picked (Han's phone, 15 Nov; docs/screenshots/lobby/buttons-after.png shows it): his helm is slate iron on a slate button, where the Ranger's green and the Arcanist's violet stand off theirs. Measure first, on the `faces` picture of `npm run lobby-shots` at 412 x 839: for each hero's button when it is not picked, the median lightness (CIE L*) of the bust's opaque pixels, of the button's face behind it, and of the eyes' glow. Then fix it where it is cheapest and stays his own look: the cut's levels in the portraits script (a lift for him alone, his poster untouched, nothing rendered in Blender), a lighter medallion behind him, a thin light rim round his bust, or two of them. The bar: not picked, his bust's median is at least 14 L* from the button's face (the other two already are: report all three), the three busts are within 12 L* of each other, his eyes' glow is at least 25 L* over the helm round them, and picked he looks as he does today or better. The same picture is his icon everywhere (the seats, the board's and the ribbon's rows, the hero panel, the teammates' chips, the wait card): look at each and show the seats and one ribbon row before and after. The file stays under 12 KB.

## 2. The Daily run's leaders on the ribbon
The ribbon shows Endless's top 10 only, and its fixed label ("Endless · today's top 10") takes nearly half of the line on a phone. Make it the day's champions of both boards.
- After Endless's rows, a small label "Daily run" and today's first three from `top` (the rank in its medal, the face, the name, "94 Heart"; a run that lost reads "wave 12"); yours in teal with "you". With no posted Daily run today: yesterday's three (`yesterdayTop`) after "Daily run · yesterday". Endless's own rule is unchanged (today's ten; yesterday's three after "Yesterday" when today has fewer than three), with a small "Endless" before its rows.
- The fixed label becomes short ("Today's champions", or the crown alone under 380 px): at most a third of the line at 360 px, never under 11 px.
- States: neither board has a row → today's empty line; one board has rows → that board alone; no server, a failed request, or under 13 → hidden, as today. An answer without `top` (an older server) is Endless alone, exactly as today.
- No new request: the Daily's rows come from the `GET /daily/today` the home card already makes for the Daily tile; the five-minute refresh asks both. The ribbon stays 30 px, its room still comes out of the stage, Play solo does not move, a set that fits stands centred, and under reduced motion the first rows that fit and "+N more".
- One tap opens the board card, which gains two tabs, "Endless" and "Daily run" (the tab of the part tapped; from the label, Endless). The Daily tab: today's five from `top`, your row marked, the line the Daily tile shows (how many ran it, when it closes), and "Play the Daily run to get on it"; one screen at 412 x 839 and 360 x 640, as the Endless tab is.
- The privacy page: where it says the day's top names show on the first screen, it must name both boards. The page's test lists the sentence.

## Tests and checks
- Unit: the ribbon's model (both boards, each alone, the yesterdays, neither, an old answer, yours on either board, under 13), the rows' words (Heart, a lost run's wave), the label's widths, the motion rule unchanged. The measuring of part 1 is a script or a test whose numbers are in the pull request.
- Browser, once each, in the projects that run them: the lobby's spec (the home card at 412 x 839, 360 x 640 and 1280 x 720: Play solo's box and every other box where they are on main, with the ribbon carrying both boards), the board card's two tabs, the ribbon hidden under 13. e2e/embed.spec.ts on the crazygames host once (the home card in the frame).
- `npm run lobby-shots` learns the Daily rows (made-up boards, as today) and writes the pictures and both clips again into docs/screenshots/lobby/; the faces picture gets a before / after pair. Look at every picture and both clips before committing. npm test and npm run build pass, run after the last edit.

## The pull request
Han judges it on his phone: at its top, the before / after of the hero buttons enlarged, the home card at 412 x 839 with both boards on the ribbon, the board card's Daily tab, and the two clips; then part 1's numbers. Say that the preview talks to the live server, so its ribbon shows the real boards once q16 is merged.

## Docs
docs/ART.md section 12 (the Warden's lift and why; the ribbon's two boards), docs/GAME_DESIGN.md ("Daily run": its leaders on the first screen; a Decision Log row), CLAUDE.md (the status paragraph; the command table's lobby-shots and hero-portraits rows if they changed), TASKS.md and apps/client/src/progress/data.ts as the tracker's rules ask, docs/queue/STATUS.md. After the merge both hosted zips are built again (the advisor's step).
