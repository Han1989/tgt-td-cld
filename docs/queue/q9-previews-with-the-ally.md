# q9: CrazyGames' previews again: the bot teammate and a combo on screen

| | |
| --- | --- |
| Roadmap row | CrazyGames previews again: the bot teammate and a combo on screen |
| Merge | autopilot |
| Needs | q8 |
| Restarts the game server | no |
| Written | 14 Nov 2026, by the advisor |

How a session starts and ends is in [README.md](README.md). Where the brief below says otherwise (a branch
name, "no other pull request may be open", auto-merge, "stop and tell Han", who merges), the README decides.
Everything else in the brief is the task.

## Merge condition

`Merge: autopilot` only if both videos pass every ffprobe check of "Record and look", each recording holds its meteorRain combo, both heroes are in the frame at the cast, and the diff touches nothing of the game (nothing under `apps/client/src` but the tracker's data file, nothing under `packages` or `apps/server`). Otherwise write `Merge: Han`, with what is left and why.

## Brief

CrazyGames' two preview videos recorded again with the bot teammate and a combo on screen (Han, 14 Nov 2026: go). Read CLAUDE.md (the status paragraph's "A bot teammate in solo"; Session rules), docs/crazygames/SUBMISSION.md ("The pictures"), docs/PRESS.md (the paragraph "CrazyGames' covers and previews"), apps/client/scripts/cgPreviews.ts (all of it), apps/client/src/online.ts (botTeammateOn: a browser-test build has the ally only with ?ally), apps/client/src/transport/sim.worker.ts (the lab control: ?lab&ult gives every hero R from the start) and packages/sim/src/bots.ts (createAllyBot: ALLY_ANSWER_SECONDS, where it walks) first. The script, the two videos, one contact sheet and docs only: no change to the game (nothing under apps/client/src but the tracker's data file, nothing under packages or apps/server); PROTOCOL_VERSION stays 27. If the script needs something the e2e hook does not give, say so in the pull request instead of adding it.

## Why
The two previews in docs/crazygames/ were recorded on 13 Nov (q5), before the bot teammate (q6, protocol 27). They show one hero and an Arrow Storm cast alone. Since q6 a stranger's first Play solo has a bot hero beside them, and two ultimates cast together fuse into a combo: that is the game's name and its pitch, and the store page's video is the first thing a CrazyGames player sees. Han submits to CrazyGames as soon as these are in.

## CrazyGames' rules for previews (unchanged from q5: keep every one)
Two videos, both required: landscape 1080p 16:9 (1920 x 1080) and portrait 1080p 2:3 (1080 x 1620); 15 to 20 s each; 50 MB or less; no sound; no cursor; no black bars top or bottom; no promotional text (the game's own HUD and its combo banner are the game, not promotion); real speed; opening on the cover.

## What changes in apps/client/scripts/cgPreviews.ts
1. The match has the bot teammate: add `ally` to the page's query (?lab&ult&ally&weather=clear&light=afternoon). The picked hero stays the Ranger, so the ally is the Arcanist (allyHeroFor) and the pair's combo is Meteor Rain. Add allyHint: 'seen' and wheelHint: 'seen' to SETTINGS so no one-time line sits over the video; leave botTeammate at its default.
2. The third cut becomes the combo. Today it is Arrow Storm 0.4 s into a 3.4 s cut. New: the Ranger's R at 0.4 s, the ally answers 0.5 s later by its own rule (do not send a command for it), the two fuse, and the cut runs until the Meteor Rain has landed (its rain lasts 3.5 s): about 5.5 s.
   - Before recording the cut, wait until the ally is alive, its R is learned and off cooldown, and at least 10 creeps are in the frame.
   - Confirm the fuse from the game itself: a `combo` event of kind meteorRain in the snapshots during the cut (collect the events of every snapshot: one poll can miss a tick), or the HUD's fuse band in the DOM. No combo: play that cut again on a new wave, at most three tries, then stop and report what the snapshots said.
3. Both heroes on screen. In the build cut or the wave cut, and in the combo cut at the cast, the Ranger and the ally are both inside the frame. Read their positions from the snapshot (the ally is the hero whose player carries bot: true) and the frame's world box (the landscape camera's own position and zoom; the portrait page's camera), and steer the Ranger with move commands (and the landscape camera with camAt) until they are. Do not move the ally: it walks where the game sends it.
4. Still 15 to 20 s. The cover's second plus the four cuts are 18.4 s today. Take the combo's extra two seconds from the build, wave and boss cuts (none under 3 s); the boss cut stays last.
5. The script's header comment says what it records now.

## Record and look
npm run build:e2e -w @tdt/client, then npm run cg-previews -w @tdt/client (ffmpeg with libx264; the covers are already in docs/crazygames/, so press-shots is not needed).
- ffprobe each video: 1920 x 1080 and 1080 x 1620, h264, 30 fps, 15 to 20 s, no audio stream, under 50 MB.
- Look at frames of both around the combo (ffmpeg -ss <t> -frames:v 1): the Ranger and the Arcanist both in the frame, the fuse banner readable, meteors landing on creeps, no one-time hint line, no cursor, no black band top or bottom.
- A video that fails one of these is recorded again.
A contact sheet for Han's phone, docs/crazygames/previews-sheet.jpg (at most 2400 px wide, under 1 MB): six frames a video in order (the cover, the build, the wave, the cast, the fuse, the boss), the landscape row over the portrait row, each frame's time under it.

## Docs
- docs/crazygames/SUBMISSION.md: "The pictures" says what the previews show now. The Description gains one sentence after "alone or with friends in a room joined by its code": a solo match starts with a bot teammate beside you, and your ultimate cast with its own fuses into a combo (plain words, no new claim).
- docs/crazygames/AUDIT.md, the Previews row: the new sizes (keep its hand-written notes block; change the row by hand, or with cg-audit -- --only sizes if that is what writes it).
- docs/PRESS.md (the previews' paragraph), CLAUDE.md (the cg-previews row of the Commands table and one sentence at the end of the status paragraph), TASKS.md and apps/client/src/progress/data.ts as the tracker's rules ask (the next D number), docs/queue/STATUS.md.

## Checks
- git diff --stat against main shows only apps/client/scripts/cgPreviews.ts, the two .mp4, previews-sheet.jpg, docs and the tracker's data file.
- npm test and npm run build pass, run after the last edit. No browser spec covers this script: run none.
- The pull request's description: the contact sheet at its top, each video's ffprobe line, the combo event's tick in each recording, and how many tries each cut took.
