# q4: A lighter download: the hosted zip under 20 MB, a first match's art under 5 MB

| | |
| --- | --- |
| Roadmap row | A lighter download: the hosted zip under 20 MB, a first match’s art under 5 MB |
| Merge | Han |
| Needs | q2 |
| Restarts the game server | no |
| Written | 11 Nov 2026, by the advisor |

How a session starts and ends is in [README.md](README.md). Where the brief below says otherwise (a branch
name, "no other pull request may be open", auto-merge, "stop and tell Han", who merges), the README decides.
Everything else in the brief is the task.

## Brief

A lighter download: the same pictures in fewer bytes. Read CLAUDE.md (the Art rule, the PWA rule, the status paragraph's "V-08b load-all"), docs/ART.md section 15 ("Loading", "The tilted camera", the fringe check), docs/DEPLOY.md section 10 (the hosted build and its size report), apps/client/src/artLoad/ (rules.ts, bytes.ts, order.ts), apps/client/src/lobby/stageBackdrop.ts (pickVideo), apps/client/scripts/buildEmbed.ts, embedReport.ts, fringe.ts and webp.ts, and tools/blender/tdt3d/encode.py first. New branch from the latest main; no other pull request may be open and no other art session may be running. Tools, generated art and the client's build: no sim, protocol, server or tuning change (PROTOCOL_VERSION stays as main has it), so the merge does not restart the game server. Nothing is rendered again in Blender.

## Why (the advisor's review of 10 Nov 2026; Han: go)
Han's rule of 7 Nov stands and is not reopened: every sheet a match draws is in before the match starts, no placeholder towers. So the only way to a shorter wait is smaller files. Measured on main (ad26ab4): the four structure pages 6.87 MB (lossless WebP), the nine creep and boss sheets 2.12 MB, the three hero sheets 1.56 MB (PNG), the afternoon plate 0.63 MB; the hosted zip 27.7 MB, of which the stage videos are 6.5 MB (an MP4 and a WebM a hero) and the three music files 6.8 MB. Play solo to the match on a cold first visit: 0.8 s unthrottled, 10.7 s on Fast 4G, 75 s on Slow 4G. CrazyGames, where the game goes next: a game is on its phone homepage only if its download is 20 MB or less (with no SDK the whole build counts), its QA wants play within 20 s, its own benchmark for a good first minute is a load under 10 s, and a game is switched off on Chromebooks unless it runs smoothly with 4 GB of memory.

## Targets
- A hosted zip (`npm run build:embed -- crazygames`) of 19 MB or less.
- The pictures a first solo Quick match waits for: 5 MB or less (about 10 MB today).
- Play solo to the match, cold, on Fast 4G (`npm run first-load -w @tdt/client -- --match --fast-4g`): 6 s or less.
- No picture visibly different at phone size, the fringe check green on every sheet, the GPU's memory and the draw calls unchanged (the decoded size is the same).
If a target cannot be met without a visible change, stop at the last setting with none and say in the pull request what the next step would cost in looks.

## What to build, in this order (stop when the targets are met)
1. The hero match sheets as lossless WebP instead of PNG (the same pixels; the loader, the layout tests and scripts/webp.ts follow).
2. The four structure pages, then the creep and boss sheets: lossy WebP with the alpha kept exact, at the highest quality that meets the targets. Encode from the committed lossless files. A small script tries a ladder of qualities, runs the fringe check on each decoded result, and measures the change against the lossless page (the largest colour difference over opaque pixels, and over the 2-pixel band inside every silhouette). Pick per page. The pipeline's encode step (tools/blender/tdt3d/encode.py) gets the same setting so the next render writes what is committed, with a note in docs/ART.md section 15 on going back to lossless.
3. Music: the three files at 96 kbps, joint stereo, the same loop points; measure the levels again (`npm run music-levels -w @tdt/client`). Listen to each loop's seam; if 96 is audibly worse on the lobby's plucked strings, keep 128 for that file and say so.
4. Hosted zips only: one stage video a hero. pickVideo takes the MP4 first wherever it plays, so the zip leaves the WebM out, under __EMBED__ and the build script; the site's build keeps both.
5. The size report (embedReport.ts) prints the zip against 20 MB on a line of its own for crazygames.

## A sheet for Han (he judges every picture on his Pixel)
docs/art/lighter-ab.png: for each structure page three tower crops at 3x a phone's size, the lossless one beside the pick, marked only 1 and 2, with the key and the bytes printed under the sheet; the same for the Matriarch and the Grunt; and one held wave-10 phone frame (scripts/heldMoment.ts) on the build before and after, side by side. Look at every crop yourself first: banding in the moon-stone, a halo round a turret or a muddied rune is a failure, so go back up a step.

## Checks
- Unit tests: the layout data still matches every image; the fringe check on every changed sheet; the art bytes table (virtual:tdt-art-bytes) and the loading card's line; the hosted zip's file list (one video a hero); the site's dist/ the same as main's apart from the changed pictures and music.
- Browser tests, once each: e2e/art.spec.ts on pixel, e2e/embed.spec.ts on pixel, and the stress test alone (`npx playwright test --project=perf --no-deps`): JavaScript a frame, draw calls and GPU memory as main's.
- `npm run first-load -w @tdt/client -- --match` on Fast 4G and unthrottled, before and after; the zip's size before and after.
- Docs: docs/ART.md section 15, docs/DEPLOY.md section 10, docs/PRESS.md section 5 (the numbers), a Decision Log row, CLAUDE.md's status paragraph, TASKS.md and apps/client/src/progress/data.ts (a new done row in the Discovery list, the next free D- number, "A lighter download"; apps/client/test/progress.test.ts checks exact counts: work them out, don't guess).
npm test and npm run build pass, run after the last edit. Open the pull request with the sheet and the before / after table at the top, do not turn on auto-merge, and stop.
