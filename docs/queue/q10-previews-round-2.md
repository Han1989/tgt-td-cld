# q10: Previews, round 2: the hero alive at the end, and the kill count clear of the combo band

| | |
| --- | --- |
| Roadmap row | CrazyGames previews, round 2: no dead hero at the end, the kill count clear of the combo banner |
| Merge | autopilot |
| Needs | q9 |
| Restarts the game server | no |
| Written | 14 Nov 2026, by the advisor |

How a session starts and ends is in [README.md](README.md). Where the brief below says otherwise (a branch
name, "no other pull request may be open", auto-merge, "stop and tell Han", who merges), the README decides.
Everything else in the brief is the task.

## Merge condition

`Merge: autopilot` only if the browser test that measures the pill and the band passes at both phone sizes, both videos pass q9's ffprobe checks, the hero's HP never reached 0 in either boss cut, and no frame of either video shows "Your hero has fallen" or a respawn timer. Otherwise write `Merge: Han`, with what is left and why.

## Brief

Previews, round 2, and one HUD collision they showed (the advisor's look at q9's two videos, 14 Nov 2026). Read CLAUDE.md (the "Effects are client-only" rule: the fuse band is DOM, CoopStage.fuse; "Layout and touch"; Session rules), docs/crazygames/SUBMISSION.md ("The pictures"), apps/client/scripts/cgPreviews.ts (q9's version, all of it), apps/client/src/hud/coopStage.ts (the fuse ribbon, FUSE_MS), apps/client/src/hud/ultHud.ts and apps/client/src/ult/cues.ts (ultPops, heldPopDue), apps/client/src/style.css (#fuse-ribbon, #ult-pops and the comments that say what sits where), apps/client/e2e/hook.spec.ts and apps/client/e2e/ultimates.spec.ts first. One small change to the client's HUD, the script, the two videos, the contact sheet and docs: no sim, protocol, server or tuning change; PROTOCOL_VERSION stays 27.

## What the advisor saw in q9's videos
Good, and to keep: both heroes on screen, the Ranger's R, the ally's own answer, the METEOR RAIN band with "You · Arcanist", meteors landing on creeps, the portrait's "Together" word.
1. The landscape video ends on the player's death. From about 17.3 s to its end (19.27 s) the hero panel is greyed out with "Respawning in 15s", a toast reads "Your hero has fallen", and the boss walks half out of the top of the frame (look at 17.3, 18.6 and 19.1 s). The last two seconds of the store's video are a dead hero.
2. Three banners at once in the combo cut. The cast comes as wave 4 starts, so "Wave 4 +276 gold", the combo band and "Level 2! Skill point ready" share the frame (portrait, 10.4 s).
3. In the portrait video the kill-count pill ("Arrow Storm: 5") sits on the combo band, over its kicker line and touching the name (portrait, 10.4 to 11.9 s). This is the game, not the script. In the tall layout #ult-pops is at top 36% and #fuse-ribbon is centred at 46%, and a fused combo ends the first ultimate's rain at the fuse, so its count pops while the band is up: in every combo on a phone. At 412 x 839 the pill covers the band's top edge and part of its kicker; at the preview's 412 x 618 most of the kicker. The wide layout (30% and 50%) is clear.

## 1. The game: a kill-count pill never overlaps the fuse band (client HUD only)
In every layout, while the fuse ribbon is up, no .ult-pop box intersects #fuse-ribbon's box. Take the simplest rule that holds at 412 x 839, 412 x 618, 360 x 640 and 1280 x 720, and say which you took: the pills sit above the band while it is up (stacking upward from just above its top edge), or a pill that arrives while the band is up is held until the band has gone (cues.ts already holds a pop for the quake: heldPopDue).
- The pill still shows its count for as long as it does today. The band's place, size and timing do not change. The Heart-save word, the Together word and the wave banner keep their places; keep style.css's comments about what sits where true.
- Reduced motion included. Not under __EMBED__: it is the game's HUD on every build.
- Tests: a unit test if the rule has a pure part; a browser test (e2e/ultimates.spec.ts or e2e/hook.spec.ts, pixel and desktop) with a fused Meteor Rain whose first ultimate's count pops during the band, the two boxes measured apart at 412 x 839 and at 412 x 618.

## 2. The script (apps/client/scripts/cgPreviews.ts)
- The boss cut: the player's hero is alive from its first frame to its last. Keep the Ranger out of the boss's reach (behind his towers, down-lane of the boss, stepping back as it comes). Before recording the cut the hero has at least 60% of his HP. After it, throw the cut away and play it again (at most three tries) if the hero's HP reached 0 during it, a toast said "Your hero has fallen", or the hero panel showed "Respawning in". The ally fights where the game sends it; if it falls, that is the game.
- The boss stays whole inside the landscape frame through the cut (the camera follows it down its road), with the Ranger in the frame too.
- One banner at a time: the combo cut starts once the wave banner (#banner) is hidden again, with creeps still coming (at least 10 in the frame, as q9 asked). A level-up toast over the band is the game and stays.
- The last frame of each video is a good one: the boss under the towers' fire, the Ranger alive. No "fallen" line and no respawn timer in any frame of either video.
- Everything q9 set stays: ?lab&ult&ally, the hints seen, the combo confirmed from the game's own `combo` event, both heroes in the frame at the cast, 15 to 20 s, CrazyGames' rules (two videos, landscape 1920 x 1080 and portrait 1080 x 1620, 50 MB or less, no sound, no cursor, no black bars, real speed, opening on the cover).

## Record and look
As q9: npm run build:e2e -w @tdt/client, then npm run cg-previews -w @tdt/client; ffprobe both; look at frames around the combo and over the last three seconds of each video (ffmpeg -ss <t> -frames:v 1). The contact sheet again, docs/crazygames/previews-sheet.jpg (at most 2400 px wide, under 1 MB): q9's six frames a video plus each video's last frame as a seventh.

## Docs
docs/crazygames/AUDIT.md's Previews row (the new sizes; keep its notes block); SUBMISSION.md and docs/PRESS.md only where their words about the previews changed; docs/MOBILE_TESTING.md 10.2 (the kill-count popup: one sentence on where it sits during a combo's band); CLAUDE.md (one sentence at the end of the status paragraph); TASKS.md and apps/client/src/progress/data.ts as the tracker's rules ask (the next D number); docs/queue/STATUS.md.

## Checks
- npm test and npm run build pass, run after the last edit. Browser specs, once each: the one you changed, on pixel and on desktop.
- The pull request's description: the contact sheet at its top; each video's ffprobe line; the hero's lowest HP in each boss cut and how many tries each cut took; which rule item 1 took, with a before and after picture of the pill and the band at 412 x 839.
