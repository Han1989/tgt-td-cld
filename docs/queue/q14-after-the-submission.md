# q14: After the CrazyGames submission: the kit as uploaded, the label zone, one privacy line

| | |
| --- | --- |
| Roadmap row | After the submission: the kit as uploaded, and one privacy line |
| Merge | autopilot |
| Needs | q13 |
| Restarts the game server | no |
| Written | 15 Nov 2026, by the advisor |

How a session starts and ends is in [README.md](README.md). Where the brief below says otherwise (a branch
name, "no other pull request may be open", auto-merge, "stop and tell Han", who merges), the README decides.
Everything else in the brief is the task.

## Merge condition

`Merge: autopilot` only if the five uploaded files in docs/crazygames/ are unchanged by the pull request, the diff touches no file under packages/, apps/server/ or apps/client/src/ (scripts, privacy.html, its test and docs only, with the tracker's data file), and privacy.test.ts passes with the new sentence. Otherwise write `Merge: Han`, with what is left and why.

## Brief

After the CrazyGames submission: the kit as uploaded, the label zone in the cover script, and one privacy line (Han submitted the game on 15 Nov 2026). Read CLAUDE.md ("Analytics respect the Play data switch", "Hosted builds hang on one constant", Session rules), docs/crazygames/SUBMISSION.md and AUDIT.md, docs/DEPLOY.md section 10, apps/client/scripts/pressShots.ts (COVERS, CG_COVERS, `cover`, `logo`), apps/client/scripts/cgPreviews.ts (the opening second on the cover), apps/client/privacy.html (the paragraph with id `hosted`) and apps/client/test/privacy.test.ts first. Scripts, one static page and docs: no sim, protocol or server change, and nothing in the game's own bundle.

## What happened
- Han submitted the game to CrazyGames on 15 Nov 2026 at 14:43 (Singapore): Basic Launch, game ID 173418, "Awaiting review". The build is main at 1bc3492 (protocol 28), uploaded as its unzipped files.
- What he chose in their portal: engine HTML5; progress saved "using LocalStorage"; supports mobile devices; mobile orientation "Both"; an online multiplayer game with an "Online with Friends" lobby of 2 to 3 (the portal refuses a minimum of 1 and says such a game should use their invite link and button and IsInstantMultiplayer: this build has no SDK, and Han chose to declare it anyway); muting through the SDK not ticked; works well in fullscreen; category Strategy; PEGI 12 confirmed.
- His answers on their QA page: every Basic Launch row Yes; the four SDK rows "Not detected"; Invite Button used correctly No; IsInstantMultiplayer No; friend invitation flows N/A; the game retains friends in a lobby at the end of a round Yes; chat N/A; disableChat N/A.
- The portal draws a "label zone" over each cover, the top-left corner where CrazyGames puts its own tag: 40% of the width and 20.5% of the height on the 16:9 cover, 40% and 10% on the 2:3, 35.4% and 30.5% on the 1:1 (measured from the portal's overlay). The kit's title stood under it on all three. The advisor moved the title on the three covers (lower on the 16:9 and the 2:3, to the right of the zone on the 1:1) and rebuilt the first second of both previews from the new covers. Those five files are what CrazyGames holds, and the pull request that added this brief committed them to docs/crazygames/ in place of the old ones.

## What to build
1. The cover script knows the label zone. In pressShots.ts: a table of the zone per shape (the numbers above), the CrazyGames covers' title placed clear of it by at least 20 px at each size (follow the committed covers: lower on the wide and the tall, right of the zone on the square), and a check that stops the script when a title's box meets the zone. The pure rule (a title box against a zone) gets a unit test. The preview script opens on the cover file, so it follows.
2. Do not replace the five committed files: they are what was uploaded. Run the covers into a scratch folder to look at the new layout, say in the pull request how it compares, and write in SUBMISSION.md that the committed covers and previews are the uploaded ones (made by hand from the kit of 14 Nov) until the next real run of the scripts. Rebuild docs/crazygames/previews-sheet.jpg from the two committed videos if the script can do that without recording; if not, say so.
3. SUBMISSION.md gains "What was submitted" (everything under "What happened", in a table) and "When the review answers": passed (the game is live to a share of their players: a protocol change needs a new upload the same hour); they ask for the invite and instant-multiplayer features (the SDK work, a task of its own); they mind the orientation (a new version with Portrait: a phone held sideways shows the game's "Rotate to portrait" card today).
4. The privacy page. In the `hosted` paragraph of privacy.html add, in the page's plain words: on CrazyGames, when you are signed in to CrazyGames, their site copies what the game keeps in this browser to your CrazyGames account so that it follows you to your other devices (their "Automatic Progress Save"); the game does not send it, and CrazyGames' own privacy policy covers that copy. Then list in the pull request every localStorage key the crazygames build writes and what each holds (the settings, the record, the bests, the nickname, the age answer, the data key, a remembered seat), and say whether any of them should not travel that way: do not change what is stored in this task. The page's test lists the sentence.
5. docs/DEPLOY.md section 10 ("CrazyGames' build"): the label zone, what the portal's Upload step asks (files or a folder, not a zip; the options above), and that the multiplayer option brings their lobby rules.

## Tests and checks
The unit test for the zone rule; privacy.test.ts with the new sentence; npm test and npm run build pass, run after the last edit. No browser spec changes are expected: say so if one does. Compare the site's `dist/` with main's: only privacy.html and the tracker's page may differ.

## Docs
docs/crazygames/SUBMISSION.md, docs/DEPLOY.md section 10, CLAUDE.md (one sentence in the status paragraph), TASKS.md and apps/client/src/progress/data.ts as the tracker's rules ask, docs/queue/STATUS.md.
