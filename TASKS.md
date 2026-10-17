# Tower Defense Together: Task list

**As of 14 Oct 2026** (the roadmap's copy of 9 Oct 2026, 12:30, plus Han's graphics review of 10 Oct). Copied from Han's roadmap checklist (11 of 50 done), plus the items marked **NEW**, added for the handover. Updated 30 Sep: Discovery and rollout after polish; 1p/2p store-facing, 3p community flagship. Updated 2 Oct: Gate 1 passed (Android, PC, iPhone Safari friends). Updated 8–9 Oct: Han's new plan before any Reddit post (**Now → The order from here**): friends retest, a cold test, one fix round, page opens and failed starts counted with no id (D-10), then one post at a time and the gate (D-06); everything else is on hold until D-06 is called. Playtest 2's work orders are done but the retest (P2-05), which is open. Updated 10 Oct: Han's graphics review and the presentation pass (**Now → Presentation pass**, V-01–V-04). Updated 13 Oct: V-01 merged (PR #100); Han's answer on the lesson (V-02). Updated 14 Oct: V-02 done (PR #102): the second screen, and the lesson by choice. Updated 14 Oct, later: V-04 done (PR #104): heroes and creeps drawn larger on a phone, on the same view. Updated 15 Oct: V-05a round 2 (PR #106, replaces #105): the Ranger and his clearing as one picture, after Han's notes on his Pixel 10 Pro. Updated 16 Oct: **Han's decision: the heroes come from the CC0 KayKit packs, not modelled in code.** V-05b done (PR #108): all three heroes imported from KayKit models with the packs' own clips, in Runelight's look; V-05a closed as superseded. Updated 17 Oct: V-03 done (PR #114): **Han's decision: the Spire map is one rendered picture** (Blender, from the map's data), drawn as one sprite; the painted ground is the fallback. Updated 17 Oct, later: V-05c done (PR #115): every creep and boss from the CC0 KayKit Skeletons and Quaternius monsters, rendered ahead of time. Updated 17 Oct, last: **Han's decisions: match modifiers are removed, nobody picks a difficulty (every match is Normal), and the lobby fits one screen** (PR #116, `PROTOCOL_VERSION` 20; **Done → p5-one-screen**).
**This file is now the tracker.** Update a task's status in the same pull request that finishes it. Also update [`apps/client/src/progress/data.ts`](apps/client/src/progress/data.ts) so the dashboard stays in step ([`docs/PROGRESS.md`](docs/PROGRESS.md)). Do not add a third list: no queue file. `data.ts` only mirrors this file.

**Progress dashboard:** `/?progress` on any build (production: https://tgt-td-cld.vercel.app/?progress). **Cooking now** on that page lists rows marked ◐ in progress in this file. Open pull requests and CI stay on the Ops Dashboard.

**Owner:** **Team** = the Grok bot and the automated team. **Han** = only Han can do it (phones, friends, accounts, money, decisions).
**Status:** ☐ to do · ◐ in progress · ☑ done · ⛔ blocked

**Next (Han, 8 Oct 2026):** before any Reddit post, friends retest the new phone controls (P2-05, on the link tagged `?src=friends`) and three to five people who have never seen the game play it with no help (the cold test, H-09, `?src=cold`). One fix round follows (T-07, with the rebalance), then the posts one at a time (D-02 r/PlayMyGame, D-03 r/WebGames, D-04 r/TowerDefense) and the gate (D-06). The order is **Now → The order from here**. Measurement for it is in (D-09: the friends and cold-test tags and a funnel per link) and the numbers survive a sleep or a deploy (H-08, Render Starter with a disk, 9 Oct 2026). D-10 (page opens and failed starts counted with no id, before the age question) is in review before the first post. **On hold until D-06 is called:** nothing in Phase 6 or later, and no new feature; bug fixes and the rows in that order are the only work. Gate 1 passed 2 Oct 2026 (Android, PC, iPhone Safari friends). Han's list still has H-03 (the hook on a phone) and H-05 (the iPhone checklist).

---

## Now: in this order

**On hold (Han, 8 Oct 2026):** nothing in Phase 6 or later, and no new feature, starts before D-06 is called. Bug fixes and the rows in **The order from here** are the only work. **One exception (Han, 10 Oct 2026):** the presentation pass, below the order.

**While a post is live** (D-02, D-03, D-04): no merge that changes the sim or the protocol, because each one restarts the game server.

**Overnight bots.** Open **Team** rows in this section, top to bottom, are the auto-pull order. Skip Han rows and anything already done. The order is this file only. The one open Team row, T-07, starts after P2-05 and H-09. D-10 is in review (PR #99) until Han merges it. The presentation pass rows (V-01–V-04) are not on the auto-pull list: each one starts when Han says go.

### The order from here · Han, 8 Oct 2026

Top to bottom. Each Reddit post waits until the previous post's numbers are read (dashboard → **Where new players stop** → **By link**, `docs/ANALYTICS.md`).

| Step | ID | Task | Owner | Status |
|---|---|---|---|---|
| 1 | D-09 | **Measurement before strangers play** (server analytics and client, PR #98, `PROTOCOL_VERSION` stays 19): two new link tags, `?src=friends` (Friends) and `?src=cold` (Cold test), remembered for later visits with no tag like the Reddit tags; r/WebGames (`reddit-webgames`) and r/TowerDefense (`reddit-towerdefense`) replace r/incremental_games and r/cozygames, which were never posted; **Where new players stop** keeps the overall funnel and adds a table with one row per channel that has new players (by the channel of their first visit): new players, then started a match, reached wave 5, finished a match and started a second match in that first visit, each as a count and a share, also in `/analytics/summary` and `npm run analytics:example -w @tdt/server`; the privacy contact address on `/privacy.html` (H-07). | Team | ☑ |
| 2 | H-08 | **Numbers that survive a sleep or a deploy:** the Render game server on the **Starter** plan with a disk mounted at `/var/data` and `ANALYTICS_DIR=/var/data` (`docs/ANALYTICS.md` → Keep the numbers across deploys). **Done 9 Oct 2026** (Han). | Han | ☑ |
| 3 | P2-05 | **Retest with friends:** the new phone controls (P2-07) and the rest of Playtest 2, on the link tagged `?src=friends`. Everyone taps **Save match report** after each match. P2-04b is done, so it can start. | Han | ☐ |
| 4 | H-09 | **Cold test:** three to five people who have never seen the game, on the link tagged `?src=cold`, with no help; two of them bring a friend of their own. **The bar:** they finish a first match unaided, and at least half start another (**By link** → Cold test: finished a match, started a second match). | Han | ☐ |
| 5 | T-07 | **One fix round** from the retest and the cold test, with the rebalance in it, which ends the "provisional until Playtest 3" balance bounds (`ProvisionalGate`, `docs/balance/TUNING_LOG.md`). Already waiting for it: how often players repair (the reports' repairs and repair gold), `waves.lateHpGrowthPerWave` (0 until then), and a second point cast in the same tick (P2-07 round 3). Starts after P2-05 and H-09. | Team | ☐ |
| 6 | D-10 | **Count page opens and failed starts with no id** (server analytics and client, PR #99, `PROTOCOL_VERSION` stays 19; Han's decision of 8 Oct 2026). Needed before the first post, not before the retest or the cold test. `POST /analytics/count` takes exactly `{ what, channel, platform, browser }` (`open`, or the watchdog's `boot_timeout` / `webgl_unavailable` / `webgl_context_lost`): no id, no text, no time; the same origin check, CORS, body limit and per-address rate limit as events. The server keeps daily totals only (per UTC day, what, channel, platform and browser) in memory and `counts.json`, 90 days, nothing in `events.jsonl`, no address; copy and deletion are not affected. The client sends one `open` per load of the game page and the watchdog's reason once when it shows its message, by `countAllowed` (`preference.ts`): before the age answer unless play data is off or GPC / DNT, never under 13, 13–15 only when turned on, 16 and over the play-data rule. Dashboard and `/analytics/summary`: **Before the age question** (per channel pages opened, sessions started, the share; failed starts by reason, platform and browser), also in `npm run analytics:example`. The privacy page, the Play data line and `docs/ANALYTICS.md` say so. In review: Han reads the privacy page's changed sentences on his phone before merging; no auto-merge. | Team | ◐ |
| 7 | D-02 | **First post: r/PlayMyGame only** (follow the sub's rules; one clear link, `?src=reddit-playmygame`). | Han | ☐ |
| 8 | D-03 | Post to **r/WebGames** (`?src=reddit-webgames`; follow the sub's rules), only after D-02's numbers are read. | Han | ☐ |
| 9 | D-04 | Post to **r/TowerDefense** (`?src=reddit-towerdefense`; follow the sub's rules), only after D-03's numbers are read. | Han | ☐ |
| 10 | D-06 | **The gate.** This round's bar is the first session, read per link (**By link**, and the rating per channel in **Where they came from**): of the new players, how many started a match, finished it and started a second one, and the rating. Day-1 returns are noted. Day-7 is not the bar yet, because no progress is saved between visits. Gate 2 (CrazyGames) keeps its day-1 and day-7 bar. **Go** starts the Later rows (L-01, L-02, then Phase 6a); **no-go** means more polish or a pitch change. Friends-only signal is not enough for go. | Han | ☐ |

### Presentation pass · Han, 10 Oct 2026

**Why.** On 10 Oct 2026 Han compared the game with store games: the rules and the group play hold up, the look does not yet. A review of the live build found that the gap is less the art than where it shows. The first screen was a form (a title, a paragraph, a name box, three text cards). A hero is about 25 px tall on a phone. Everything in a match is flat, seen from straight above. Han chose **option A, a presentation pass**: drawn in code, no new spend. Paid art (illustrated portraits and key art, image sprites in the match, 3D) was reviewed the same day and is not started (`docs/ROADMAP.md` → Graphics review).

**Rules.** Client only: no sim, tuning or protocol change, so no merge here restarts the game server. Runelight was drawn in code (`docs/ART.md`) until **Han's decision of 14 Oct 2026**: heroes, then creeps and towers, are **3D models rendered ahead of time by Blender scripts in the repo** into pictures and videos; nothing 3D runs on the player's device (V-05a–V-05d; `docs/ART.md` §15). **Han's decision of 16 Oct 2026:** the models come from the CC0 KayKit packs (`tools/blender/assets/kaykit/`) with the packs' own clips, not modelled in code; the painter, the clearing, the fringe check and the output formats stay. **Not on the overnight auto-pull list:** the open rows are **Han, then Team**: each starts when Han says go, after he has looked at the row before it on a phone. V-01 comes before the cold test (H-09), so people who have never seen the game meet the new first screen.

| ID | Task | Owner | Status |
|---|---|---|---|
| V-01 | **The first screen** (the home card; client only, `PROTOCOL_VERSION` stays 19, PR #100). The picked hero stands large on a moonlit clearing under the title, breathing, drawn from its own art at the screen's size (`HeroArt.stand`, `render/art/stand.ts`, `lobby/heroStage.ts`: Canvas 2D, no image files, nothing drawn while the lobby is hidden, one still drawing under reduced motion). Under it: three hero buttons, the hero's role and one line, then **one main button, Play solo**, on screen with no scrolling and no nickname. A new player gets one line under it (the first solo match is a short lesson) with **Skip lesson**; the Start lesson button is gone, because Play solo starts the lesson. **Play with friends** (nickname, Create room, code and Join room) follows, in carved stone. A friend who opens an invite link (`?room=CODE`) gets the nickname and Join first, with **Join room** as the main button. This replaces "Create room is the main button, Play solo is a stone button in a dock" (Decision Log, 1 and 3 Oct 2026). **Merged 10 Oct 2026** (PR #100). The browser suite passed on CI; the unit-test job failed once on a server test this change does not touch (a timeout in `server.test.ts` → modifiers). The first load on a throttled phone (`docs/PRESS.md` §5) is not re-measured yet. | Team | ☑ |
| V-02 | **The second screen, and the lesson by choice** (client only, `PROTOCOL_VERSION` stays 19, PR #102; the roadmap's copy of 14 Oct 2026, 00:40). **Han, 13 Oct 2026:** the lesson is the player's choice, never forced. **Play solo** and **Play** on the solo pick always start the match picked (hero, mode, difficulty, modifiers), never the lesson; **Learn to play** starts the lesson as it ran (Quick, Normal, no modifiers, the picked hero). It is one quiet line, "New here? Learn to play", under the main button on the home card and the solo pick, only before a player's first solo match; ⚙ → Lesson's button is **Learn to play** and starts it at once. `tdt.settings` `tutorial` keeps `new` / `completed` / `skipped` (`new` = no solo match yet). No new analytics name: the lesson steps of the first-session funnel now count only players who chose the lesson. **The solo pick** in the home card's look: the hero on a shorter stage with ‹ back to the home card (none in a build with no game server), the short hero buttons, Mode and Difficulty as segmented stone rows with a line for the pick, compact modifiers, Practice Meteor Rain in stone, and **Play docked** at the bottom of the card. **The room card:** the code large with Copy invite link, a seat per lane with the hero's emblem (Host, Ready, Not ready, reconnecting…, "Open seat: send the invite link"), your hero, the host's picks read-only for a guest, and **Ready** or **Start match** docked, Leave in stone. One hero stage draws at a time. Screenshots: `docs/screenshots/second-screen/`. Decision Log, 14 Oct 2026. **17 Oct 2026:** the solo pick is folded into the home card (Mode over Play solo, which starts the match at once), Difficulty, the modifiers and Practice Meteor Rain are gone, and each card fits one phone screen (**Done → p5-one-screen**, PR #116). | Team | ☑ |
| V-03 | **The map as a rendered picture** (client art and tools only, `PROTOCOL_VERSION` stays 19, PR #114; the roadmap's copy of 17 Oct 2026, 09:30). **Han, 17 Oct 2026:** the Spire map is one rendered picture: the ground, the lanes, the cliffs, the trees, the rocks, the moss, the worn road and the build pads get depth, light and shadow from the same moon as the 3D heroes, so a match reads as a little world instead of flat tiles; nothing 3D runs on the phone, and the layout, the pads and where taps land are unchanged. `npm run art:3d -- map` (`tools/blender/tdt3d/map.py`) builds a Blender scene from the map's data (`tools/blender/mapdata.ts`: `getMap()`, `padLayout`, `propSpots`; no typed coordinates) and renders it straight down, orthographic, at 2× and averaged down to 1664 × 3200 (2 px per world px), with the heroes' painter: the moss and grass of the clearing, the 2D ground's rocks, mushrooms and runestones at their spots, a worn earth road sunk 6 world px (its upper-left bank in shade), flat stone pads exactly their 3 × 3 tiles, raised 8 world px with a lit top edge and a shadow down-right, a rocky ledge and low trees on the border leaning off the map, the safe zone's canopy sinking into the same deep shade; the Heart, the portals and the hero spawn are not painted. One WebP, `public/map/spire.webp` (under 700 KB), precached with the shell and drawn by `WorldRenderer` as one sprite where the painted ground was; Bright is the same `screen` wash as one sprite over it; the zone tints are drawn over the pads as before; the three extra pads of 3-player teams are patches (`spire-extra.webp`), drawn only in matches that have them; `ground.ts` stays as the fallback until the plate has decoded. The link card is regenerated from its own rendered map (`?ogcard`), and the press screenshots show the new map. `docs/ART.md` §16, Decision Log 17 Oct 2026, screenshots in `docs/screenshots/map/`. In review: Han looks at the map on his phone, on the Vercel preview. (The row's first plan, empty pads receding and shadows and height for towers and units, is not part of it: towers and units become 3D in V-05c and V-05d.) | Team | ✅ |
| V-04 | **Bigger on a phone** (client only, `PROTOCOL_VERSION` stays 19, PR #104; the roadmap's copy of 14 Oct 2026, 19:00). **Han, 14 Oct 2026:** heroes and creeps are drawn larger on the same view; the whole Spire map stays on screen and the camera stays still on phones (both locked decisions stand; a closer camera that follows the hero is not this task). One `entityScale` is now three scales from a pure function of the tile size (`render/entityScale.ts`, `entityScales`): towers unchanged (at most 1.2), **heroes ×1.4** and **creeps ×1.2** (bosses with them) on top of the old 1.6 cap on a phone, so on 412 × 839 a hero is drawn 2.21× (was 1.58×) and a creep 1.89×; at most 2.24 and 1.92 on 360 × 640; 1 where a tile is 25 px or more. HP bars, hit flashes, hit and death effects, meteors, damage numbers, the Iron Vow ring's reach, the hero's ring and shadow and where a tap lands on a creep follow their unit; tower ranges, aura radii, rain and skill areas, the trap's root ring, pads and the Heart keep their true size. Checked by eye at 412 × 839 and 360 × 640 in `/?stress=300` and a wave-12 Quick match with towers built; the aims held, nothing taken off. Screenshots: `docs/screenshots/bigger-units/`. `docs/ART.md` §6, Decision Log, 14 Oct 2026. | Team | ☑ |
| V-05a | **3D heroes, part 1: the pipeline and the Ranger** (client art and tools only, `PROTOCOL_VERSION` stays 19; the roadmap's copy of 14 Oct 2026, 19:20). **Han, 14 Oct 2026:** heroes, then creeps and towers, are 3D models made by Blender scripts in the repo and rendered ahead of time into pictures and videos; nothing 3D runs on the device (no three.js, no second WebGL context, no model files): in the trials live 3D crashed Chrome's graphics on a Pixel 10 Pro and took the whole game's graphics with it. `tools/blender/` (a shared library and `ranger.py`) builds the Ranger from nothing: smooth cages under a subdivision surface, skinned to a skeleton with IK, springy cloak and hood tip, painted from Cycles passes in numpy (moonlit cel bands, AO, a rune-teal rim, glow and bloom, an ink outline in exact pixels). **`npm run art:3d -- ranger`** writes the first screen's 8 s loop in a moonlit clearing (H.264 MP4 and VP9 WebM, under 700 KB each, a WebP poster and the empty clearing under 60 KB each, `public/stage/`) and the match sheet with its layout (`src/render/art3d/`). The stage plays only on the live stage, poster first, never under reduced motion; the videos are cached on first play, never precached. In a match `Ranger3DRig` (on `HeroRigBase`, the 2D Ranger's timing) replaces the 2D rig once the sheet has loaded; the 2D rig stays as the fallback and in `?showcase`. `docs/ART.md` §15, Decision Log 14 Oct 2026. Screenshots: `docs/screenshots/3d-heroes/`. **Round 2, PR #106 (replaces #105; the roadmap's copy of 15 Oct 2026, 06:00), after Han's notes on his Pixel 10 Pro:** the Ranger and his clearing are one picture. Hero and clearing are rendered at 2× and scaled down, lit by the same moon (the sky dome no longer shades the clearing from it), painted with the same tinted ink, and the haze, depth of field, mist, bloom, colour grade, vignette and grain go over the finished frame, with a light wrap and contact shadows; his silhouette line covers the render's soft rim, so no light fringe shows, and a fringe check (`tdt3d/fringe.py`, `scripts/fringe.ts`) runs on every frame and in `test/art3d.test.ts` (#105's frames fail it, these pass). One sharper 2400 × 900 loop (up to 1.2 MB) with the hero a quarter larger on every stage (the bow level with the hood, the arrow drawn nock first), the string with a dark edge, a new clearing (layered canopies with moonlit edges, faceted rocks, a worn path, moss cushions, ferns, a log, three rows of far pines), longer arms and the draw hand at the jaw, a draw-hand layer over the head in a match and bolder small parts there; the service worker stores a stage video whole and answers range requests with a 206 (iPhones). In review: Han judges it on his phone, on the Vercel preview. **Closed as superseded (16 Oct 2026):** Han decided the heroes are no longer modelled in code; V-05b (PR #108) imports all three from the KayKit packs and keeps this row's painter, clearing, fringe check, formats, rigs and encode. | Team | ✅ |
| V-05b | **3D heroes from the KayKit models: the Ranger, the Warden and the Arcanist** (client art and tools only, `PROTOCOL_VERSION` stays 19; the roadmap's copy of 16 Oct 2026, 22:30). **Han, 16 Oct 2026:** the heroes are no longer modelled in code (ranger.py's cages, lathes, skeleton and IK made every round slow and the figure look wrong, and the renders ran at four times the display size); the models come from the CC0 KayKit packs (Knight = the Warden, Mage = the Arcanist, Rogue_Hooded = the Ranger) with the packs' own clips. `tools/blender/tdt3d/gltf.py` imports a character, hangs its props on the pack's hand slots (`handslot.l` / `handslot.r`), scales it to its 2D rig's height and turns it to face +X; every face is repainted from its palette cell to a Runelight token (no pack colour reaches a frame). One table, `tools/blender/hero.py`, holds the three (model, props, clips, colour map). The clips play by bone name, retimed to the 2D rigs (`WARDEN_SWING` / `wardenStrike` unchanged); `Hero3DRig` (one rig, driven by the layout) replaces `Ranger3DRig`. All three stand in the same clearing and box, so the stage swaps them cleanly; ranger.py's modelling and the code-built skeleton are gone. `docs/ART.md` §15, Decision Log 16 Oct 2026, screenshots in `docs/screenshots/3d-heroes/`. **Round 2, a sharp stage (PR #109, replaces #108; Han's note of 17 Oct 2026 from a Pixel 10 Pro, the roadmap's copy of 03:20):** V-05b's 1200 × 450 stage was blurry next to V-05a's Ranger (soft edges, weak eye glow, thin ink): a 412 px phone's home card magnifies that frame 3× on a 3× screen. The stage is back at 2400 × 900 (1.5×), with V-05a's ink (2.4 px round the silhouette, 1 px inside) and bloom, not scaled down; the clearing rendered at 2× once, the hero at 1× with 24 samples (at 2× a frame took 20–35 s on 4 cores, over the 15 s allowed), but his fast frames (the draw, the slice, the summon's swings: at 1× their motion blur broke into specks) and any frame that fails the fringe check at 1× at 2×; each video under 1.2 MB (`-tune animation`); the match sheets unchanged. In review: Han judges all three on his phone, on the Vercel preview. | Team | ✅ |
| V-05c | **3D creeps and bosses** (client art and tools only, `PROTOCOL_VERSION` stays 19; Han's decision of 17 Oct 2026, PR #115). Every creep and the three bosses are pre-rendered 3D models, as the heroes are: the CC0 KayKit Skeletons (Grunt = Minion with the pack's blade, Runner = Rogue, Archer = Minion with the crossbow, Brute = Warrior with axe and shield) and Quaternius Ultimate Monsters (Wisp = Ghost, Hatchling = Mushnub in the Matriarch's colours, Ironhorn = BlueDemon, Matriarch = MushroomKing, Shardback = Dino), posed by the packs' own clips, repainted in Runelight's tokens (skeletons in bone, dark iron and moss with each kind's warm cloth; the monsters in the creep and boss tokens; eyes glowing, the bosses' gold plate), in one table, `tools/blender/creeps.py`. Each figure is sized so its idle silhouette's area radius is its tuning radius (a Grunt 22 × 32 world px). `npm run art:3d -- creeps` (about 3 minutes) renders match sheets only, 1× with 24 samples, the fringe check over the lane on all 152 frames (none fails), every sheet 2048 wide so the nine fit two 2048 × 2048 pages (4 px per world px, bosses 3: at their radius they are 70–90 px). `Creep3DRig` plays them as the 2D rig does (walk at the cadence that keeps a foot planted, stand, attack while stopped or from an Archer's shot, the flinch with its white twin as the hit flash, the death clip then the fade, the bosses' Stomp / Hatch / hide shift on their events, the Wisp's bob over its shadow, the Shardback's spines lit while the Ether hide is up, the HP bar over the head), once its sheet loads after the hero sheets; creeps on the map swap; the 2D rigs stay the fallback and in `?showcase`, which lists both. Contact sheet for Han: `docs/art/creeps-3d.png`. `docs/ART.md` §7 and §15, Decision Log 17 Oct 2026. In review: Han judges the contact sheet and the game on his phone. | Team | ✅ |
| V-05d | **3D towers, the Heart and portals.** The five towers at every tier and their ten branches, the Heart with its damage states and the portals, rendered ahead of time from above, turrets still turning towards their target. After V-05c, when Han says go. | Han, then Team | ☐ |

### T-00 · CI and branch protection · NEW · Team, then Han · ☑

Tests have only ever run inside build sessions. The team workflow and the required `ci` check are on `main` (PR #24).

- **Team:** ☑ `.github/workflows/ci.yml` for pull requests and pushes to `main`: Node 22.12+, `npm ci`, `npm test`, `npm run build`. Browser tests (Playwright Chromium) run when `apps/client/**`, `packages/**`, or `.github/**` change, in parallel jobs: one per project (iPhone in 2 shards, Pixel in 3, Desktop in 1) and the 300-creep stress test alone in `e2e (perf)` (the page's own frame timer: the mean of 90 frames after 60 warm-up frames; 9–18 ms on GitHub's runners against the 33.3 ms budget). `ci` aggregates them and is the only required check. npm and the Playwright browsers are cached.
- **Han:** protect `main` in the repo settings: require a pull request, require the CI checks to pass, block force pushes. **Done 30 Sep 2026:** `main` requires PR + status check `ci`, force pushes blocked, admins enforced; repo `allow_auto_merge` on.
- **Done when:** a PR shows green checks, and a PR with a deliberately failing test can't be merged. **Done 30 Sep 2026:** `ci` is on `main` (PR #24) and is the required status check.

### T-01 · Hard difficulty and an expert bot · checklist `a-hard` · Team · ☑

**Why:** Han's solo match report shows 99 of 100 Heart on Normal where the balance bot ends with 46 on the same seed. Normal suits new players (friends found it hard); Hard is for players who branch towers, call waves early and don't die.

**Brief (ready to run):**

> Difficulty: add Hard. Read CLAUDE.md and docs/GAME_DESIGN.md.
> A saved match report (solo Quick, Ranger, seed 680952457, build 1fa2887) shows a strong player beating Normal with 99/100 Heart; the balance bot on the same seed ends with 46. Compared with the bot, the player built 20 towers instead of 26 but took 3 to tier-4 branches (bot: 0), died once (bot: 6), cast Q/W/R 50/24/7 times (bot: 26/11/4), reached level 10 at 5:21 (bot: 7:42) and called 7 waves early (bot: 0).
> 1. Expert bot: a second balance bot that plays like that: focuses gold into fewer towers and branches them, calls waves early when safe, casts on cooldown and avoids dying. Keep the current bot as the casual bot.
> 2. Hard difficulty, picked in the lobby next to Full/Quick (the host picks, everyone sees it; solo too). Scale creep HP and numbers, not HP alone, so Hard is more intense rather than just slower. Normal stays exactly as it is.
> 3. Balance gates, 1, 2 and 3 players, Full and Quick: the casual bot on Normal stays at 40–80 Heart; the expert bot on Normal wins with at least 80; the expert bot on Hard ends at 40–80 and keeps the difficulty-curve rule; the casual bot may lose on Hard.
> 4. Match reports: add difficulty, towers built, upgrades, branches, gold spent and unspent, and waves called early.
> 5. Update GAME_DESIGN.md, the Decision Log and docs/MOBILE_TESTING.md.
> npm test, npm run build and npm run test:e2e must pass. Bump PROTOCOL_VERSION. Commit to a new branch and open a PR.

### T-02 · Team pings and quick-chat emotes · checklist `a-pings` · Team · ☑

From `docs/MOBILE.md` §9 and the checklist: long-press on the map on phones, Alt-click on desktop. Quick-chat emotes only, **no free-text chat** (a locked guardrail).

Done: a map ping (phone long-press, desktop Alt-click) shows on the map for teammates, or at the screen edge when it is off screen, with a gong. Six phrases (Help, On my way, Danger, Thanks, Nice, Defend) from the speech button or C; the codec rejects any other text. The server rate-limits both (1 s / 1.5 s). Touch rule `mapPing` is unit-tested. `PROTOCOL_VERSION` 13. Real-device steps in `docs/MOBILE_TESTING.md` §3.14–3.15 and §6.7.

### T-03 · First five minutes · checklist `a-tutorial` · Team · ☑

A guided first match that teaches moving, building, casting and upgrading within the first two waves. Do it **after T-02**, so it can teach pings too. Proposed: it runs once for a new player (solo), can be skipped, and is replayable from settings.

Done: a solo Quick match on Normal, once, for a new player (`tdt.settings` `tutorial`). Steps are move, build an Arrow, cast Q, upgrade, ping, and an optional quick-chat phrase. Each step advances when the player does it. Skip is on the card and on the hero pick. Online create / join does not start it. The lobby home offers Start lesson and Skip only while the flag is `new`. Replay is ⚙ → Replay tutorial, not a control on the home screen after the lesson. `PROTOCOL_VERSION` stays 13. Real-device steps in `docs/MOBILE_TESTING.md` §2.6.

### T-04 · Art for projectiles and traps · NEW · Team · ☑

The last things still drawn as plain shapes (`CLAUDE.md` status). Follow the new-entity checklist in `docs/ART.md` §10 and check them at phone size in `?showcase`, in Normal and Bright.

**Done 30 Sep 2026:** every shot style and the Snare Trap are Runelight sprites (`docs/ART.md` §6). `?showcase` lists them in Normal and Bright.

### T-05 · Docs clean-up · NEW · Team · ☑

- README: the status line still says Phase 2.
- Add `docs/ROADMAP.md` (vision, locked decisions and phases, from `HANDOVER.md` §2 and this file) and link it from `CLAUDE.md`.
- `docs/GAME_DESIGN.md` §11 "Out of scope": mark accounts, leaderboards, PvP and monetisation as planned for Phases 6–8, after Gate 1.
- Add `AGENTS.md` pointing to `CLAUDE.md` if your tooling reads it.

**Done 30 Sep 2026:** README status is Phases 1–3 done and Phase 4 polish through the tutorial (T-00–T-04). [`docs/ROADMAP.md`](docs/ROADMAP.md) is linked from `CLAUDE.md`. §11 then marked accounts, leaderboards, PvP and monetisation as Phases 6–8 after Gate 1. [`AGENTS.md`](AGENTS.md) points at `CLAUDE.md`. **Superseded 2 Oct 2026:** Gate 1 passed (Android, PC, iPhone Safari friends), so Phase 6 may proceed (decision log).

### T-06 · Soft-launch co-op hook signals (sim) · Team · ☑

Signals only, for Client Polish to present. No new damage, no fused ultimates, no HUD ribbons in this change.

**Done 1 Oct 2026:** `PROTOCOL_VERSION` 14. A leak event carries `lane` (West / Mid / East via `laneName`). Match reports add `goldGifted` and `goldReceived` (missing on old saves counts as 0). `R_OVERLAP_SECONDS` (2) lives in the protocol, and a live `syncCast` fires once when a second living hero's R lands inside that window. Boss waves export advisory lane lines (`BOSS_LANE_HINTS`). Pings need no sim change: a double ping is two `ping` events, and the client can see that they are within 1 s.

### Han, in parallel

H-08 (the Render disk) and H-09 (the cold test) are steps in **The order from here**, above.

| ID | Task | Notes | Status |
|---|---|---|---|
| H-01 | Let friends open preview links | Vercel → project → Settings → Deployment Protection → Vercel Authentication: **Disabled** → Save. **Done 1 Oct 2026:** Han confirmed this is already Disabled on the tgt-td-cld project, so friends do not see a Vercel login page. | ☑ |
| H-02 | Confirm the hook test server | **No longer needed (9 Oct 2026):** the hook is on main (SL-04, PR #45) and the `tgt-td-spike` service is deleted. | ☑ |
| H-03 | Try the hook on your phone | Solo practice (`?practice=meteor-rain`) was removed on 17 Oct 2026 with the solo pick (PR #116): try Meteor Rain in a room of two, a Ranger and an Arcanist casting R within 2 s. The spike URL `?spike=hook` is retired. Then one online match with a friend on the production server. | ☐ |
| H-04 | Three music tracks (`a-music`, optional) | Done 1 Oct 2026: `lobby.mp3`, `match.mp3`, and `boss.mp3` in `apps/client/public/music/` (AI-generated via Google Gemini, by Han). See `docs/SOUND_FILES.md`. | ☑ |
| H-05 | Test on an iPhone (`a-iphone`) | Safari has the most quirks. Run `docs/MOBILE_TESTING.md` once and fill in its Results table. | ☐ |
| H-06 | Give the team access | **Done:** the team opens and merges pull requests (auto-merge once `ci` is green). | ☑ |
| H-07 | Privacy contact email | **Done 9 Oct 2026** (Han gave the address; D-09, PR #98): `towerdefensetogether@gmail.com` is a mailto link under **Or ask by email** on `/privacy.html`, for a copy or deletion of a player's play data (D-07, `docs/ANALYTICS.md` → Requests by email). The placeholder and its TODO are gone. The server already prunes `events.jsonl` to 30 days at startup and daily (PR #75, `docs/ANALYTICS.md` → Retention). | ☑ |

---


---

## After polish · Discovery and rollout · NEW

**Polish path T-00–T-05 is done** (CI, Hard, pings, tutorial, art, docs). **Gate 1 passed on 2 Oct 2026** (Android, PC, iPhone Safari friends). **Han's plan of 8 Oct 2026** puts a friends retest (P2-05), a cold test (H-09) and one fix round (T-07) before the first post; the anonymous counts (D-10), the posts (D-02, D-03, D-04) and the gate (D-06) are steps 6–10 of **Now → The order from here**, and their rows live there. Discovery and store submission still wait on the measurement below; friends-only signal is not a store go. D-08 (link preview, first load, press kit) is done, so posts have a card and a measured first load; D-09 adds the friends and cold-test tags and a funnel per link, and D-10 counts, with no id, the page opens and failed starts that never reach the age question.

**Why:** current playtesters are only **2–3 friends**. That is enough for confusion and hook notes, not for whether strangers stay. Discovery is the first real-audience signal **before or alongside** store submission.

**Modes:** **1p and 2p** lead the store-facing build. **3-player co-op** stays the flagship community mode (do not demote 3p — polish the entry sizes hardest for stores).

**Measurement (required):** for each acquisition channel, track at least:

| Metric | Meaning |
|---|---|
| Average playtime | How long a first session lasts from that channel |
| Retention | Return rate: D1, D7 and D30 (D30 since p6a-analytics, PR #85) |
| Repeat visits | Same player / same browser returning after the first session |

Tag sessions (or landing links) by channel so Reddit vs CrazyGames can be compared. The funnel is in [`docs/ANALYTICS.md`](docs/ANALYTICS.md): `?src=` on the link, events on the game server, one dashboard. D30, where new players stop, match breakdowns and crash reports are there too (p6a-analytics, PR #85). The friends retest and the cold test have their own tags, and **Where new players stop** has a row per link (D-09). Page opens and failed starts are counted with no id, before the age question too, so a link's visitors who leave before Play, and first visits that never start, show under **Before the age question** (D-10, in review).

| ID | Task | Owner | Status |
|---|---|---|---|
| D-01 | Channel analytics: average playtime, retention (D1/D7), repeat visits, tagged by source (`?src=`; the tags are in `docs/ANALYTICS.md` → Tag the links, and D-09 changed two of them). Prefer building on Phase 6a analytics when ready; until then, a minimal tagged funnel is enough. Phase 6a's p6a-analytics (PR #85) adds D30 per channel on the same dashboard. | Team | ☑ |
| SL-01 | Soft-launch co-op presentation (client, #35): mirrored ping and same-emote burst within 1 s, gift sent/received toasts, twin-ultimate ribbon from two R casts within `R_OVERLAP_SECONDS`. Sim signals are T-06 (protocol 14): leak lane, gift totals, live `syncCast`, advisory boss lane lines. | Team | ☑ |
| SL-02 | Soft-launch HUD hooks (client): lane clutch on a real leak (`laneName`, skip `FINALE_LEAK_CREEP_ID`), end-screen gold given and received via `heroGiftTotals`, twin ribbon prefers live `syncCast` (cast overlap stays the fallback), advisory boss lane banners from `bossLaneHint`. Protocol stays 14. | Team | ☑ |
| SL-03 | Together-kill flash (client): two or more living heroes whose `damage` hit the same creep within 2 s of its `kill` get a short shared flash (seat colours, edge glow, dual-pitch chime). No gold or stat change. Protocol stays 14. A living player's towers share `damage.by`, so they count; a hero-only `togetherKill` event waits on Gameplay after Phase 5. | Team | ☑ |
| SL-04 | Soft-launch hook on main (`PROTOCOL_VERSION` 16, `docs/HOOK_SPIKE.md`): Meteor Rain only (Arrow Storm + Meteor fuse into a denser shared lane rain inside 2 s; no aim overlap), global lane rains for both of those R, Quick wave-10 Matriarch two-lane shield (Full wave 10 is a normal Ironhorn), solo Practice Meteor Rain (`?practice=meteor-rain`), Warden Blood Hunger + Iron Vow, stick overrides melee chase. Do not merge `claude/loving-hawking-7fvsu7`. | Team | ☑ |
| SL-05 | Kit rework and balance by simulation (Playtest 2, `PROTOCOL_VERSION` 17, `docs/HOOK_SPIKE.md`, `docs/balance/`): Arrow Storm and Meteor instant lane rains again (no aiming, no caps, strikes on creeps, flyers hit, Meteor stuns every impact) and much stronger, the Warden hits flyers (Cleave and Taunt too) and Blood Hunger heals from Cleave, Iron Vow heals every living hero and bursts, three combos in a 5 s window with no overlap check (Meteor Rain, Stun Storm, Shockwave; three ultimates fire the strongest pair once), Hard finale deduction removed, novice bot (every hero solo ≥ 80%) and `npm run balance:matrix`, new balance targets. Merged after Han's review (PR #66). | Team | ☑ |
| D-07 | Privacy notice before strangers play (client, PR #74): a short, plain-language page at `/privacy.html` (what is collected and why, no accounts, no third-party trackers, kept 30 days, deletion by email with the browser's id), linked from the lobby, the rating control and Settings; the note box says "Don't include personal details."; ⚙ Settings → **Play data** On / Off for this browser (`tdt.analytics`, off by default with Global Privacy Control or Do Not Track), checked before every event. Client only, no protocol change. The email was a placeholder until H-07 (done 9 Oct 2026, PR #98). Accounts privacy stays `p6a-privacy`. | Team | ☑ |
| D-08 | **Link preview and first load** (client only, protocol stays 18): Open Graph / Twitter tags with README's pitch, a 1200 × 630 card from the game's own art (`npm run og -w @tdt/client`), tagged links keep the card and their `?src=`, a boot splash, Play solo one tap with no scrolling on phones, first load measured on a throttled Pixel 7 (`npm run first-load -w @tdt/client`), press kit in [`docs/PRESS.md`](docs/PRESS.md). PR #77. | Team | ☑ |
| D-05 | **CrazyGames Basic Launch** — same work as Gate 2 `g2-launch`, on hold with it until D-06 is called; Gate 2 keeps its day-1 and day-7 bar. Not instead of finishing polish. | Han | ☐ |

D-10 (page opens and failed starts, counted with no id), D-02 (r/PlayMyGame), D-03 (r/WebGames), D-04 (r/TowerDefense) and D-06 (the gate) are steps 6–10 of **Now → The order from here**.

## Gate 1 · Friends playtest · PASSED · 2 Oct 2026

Friends played on **2 Oct 2026** on Android, PC, and iPhone Safari. **Passed.** That unblocked Phase 6; Han's plan of 8 Oct 2026 holds Phase 6 and new features until D-06 is called (**Now → The order from here**). Discovery D-02–D-06 and Gate 2 stay the public soft-launch path and are still open. Follow-up from the session is Playtest 2: its work orders are done but the retest (P2-05).

| ID | Task | Owner | Status |
|---|---|---|---|
| g1-render | Switch Render to Starter for the evening (both services), back to Free afterwards. Free sleeps and can drop matches. **Passed 2 Oct 2026** with Gate 1. Friends played on Android, PC, and iPhone Safari. | Han | ☑ |
| g1-play | Play 2–3 matches with two friends. Mix phones and desktop, and include the hook test. Everyone taps **Save match report** after each match. **Passed 2 Oct 2026.** Friends played on Android, PC, and iPhone Safari. | Han | ☑ |
| g1-watch | Watch, don't coach. Note where they get confused, what makes them shout or laugh, and whether they use combos. **Passed 2 Oct 2026** with the friends session (Android, PC, iPhone Safari). | Han | ☑ |
| g1-tune | Per-hero tuning from the playtest. Use the saved match reports (`npm run replay`), not bots alone. Known so far: Quick pairs are the noisiest (Arcanist + Ranger ended one bot match with 11 Heart); Ranger + Warden is the weakest pair; the Warden casts R only 3–4 times in 3-player games. The easy last third is already fixed. **Passed 2 Oct 2026** with Gate 1. Kit rework and sim balance from the session is Playtest 2 (P2-03). | Team | ☑ |
| g1-gate | **Gate:** at least half the players ask to play again unprompted. **Passed 2 Oct 2026.** Friends on Android, PC, and iPhone Safari. Phase 6 may proceed. | Han | ☑ |

---

## Playtest 2 · work orders

Follow-up from the 2 Oct 2026 friends session (Android, PC, iPhone Safari). P2-01 to P2-04c, P2-06 (tower repair, PR #90), P2-07 (phone controls, PRs #93 and #94), P2-08 (start-up watchdog, PR #95) and P2-09 (calm battle sound, PR #96) are done. P2-05, the retest with friends on the link tagged `?src=friends`, is step 3 of **Now → The order from here**, and its row lives there. They are not the overnight auto-pull list (that list is **Now**, above).

| ID | Task | Owner | Status |
|---|---|---|---|
| P2-01 | Touch controls (client, #57). Client Polish. Phone UX from the 2 Oct 2026 friends session. | Team | ☑ |
| P2-01b | Phone build and upgrade fix (client, PR #82). Han's request in #57 was misread: one tap on a tower in the build ring builds (no "tap again"), a hold (0.3 s) previews its range and stats and does not build, and the gold ↑ tags on towers are gone (tap the tower, then Upgrade; the ring stays open). Merged (PR #82). | Team + Han | ☑ |
| P2-02 | Air waves and unspent gold teaching (client, #63). Client Polish. Flyer readability, anti-air teaching, and a gold nudge. | Team | ☑ |
| P2-03 | Kit rework and balance by simulation (sim, Claude; PR #66, merged as 05a3fc0 after Han's review). The same work as SL-05. | Team + Han | ☑ |
| P2-04 | Ultimate presentation and combo cue (client, PR #70). Each combo has its own ribbon, strikes and colour, and a finished rain or combo shows its kill count. No aim circles. | Team | ☑ |
| P2-04b | Cast-together prompt, ultimate shake and heal feedback (client, PR #73, `PROTOCOL_VERSION` 18): the part of Task 4 that PR #70 left out. Every cast gets a flare, a screen blink, a kick and a sound heard everywhere; a finished rain or burst pops one exact kill count ("Arrow Storm: 12", from the `ultResult` event); R glows when ready, pulses after 20 s ready with creeps on the map, and shows a 5 s "Combo!" ring after a teammate's pairing cast; Screen shake Off / Normal / Strong (reduced motion turns it off) on ultimates, boss abilities and Heart hits; Iron Vow's heal rings every healed hero and shows on a teammate chip; the end screen and `report.coop` list kills per ultimate and combos per pair. Sim: two events (`ultResult`, `heal`) and report fields only, no tuning change. Real-device steps: `docs/MOBILE_TESTING.md` §10. Built by Claude Code. | Team | ☑ |
| P2-04c | Meteors you can see falling (client only, protocol stays 18; `docs/ART.md` §6): Han saw only red circles. Meteor, Meteor Rain and Shockwave now launch meteors about half a second before each pulse from the rain's fixed schedule, at the creeps it will strike, over the red circle (now a warning whose inner ring closes); impacts with a glowing scorch, a red wash and sky meteors at the cast, a bigger finale and a falling whistle. Same kills and timing. Merged (PR #88). Built by Claude Code. | Team | ☑ |
| P2-06 | Tower repair (sim + client, `PROTOCOL_VERSION` 19; Han's decision after his 4 Oct solo Quick match, where he sold and rebuilt damaged towers 11 times). Instant repair for ceil(0.3 × gold spent × share missing); phone ring button, desktop panel and F, one-time hint; casual / expert bots repair one tower at a time (30 s / 15 s), the novice never; reports carry repairs, repair gold and towers destroyed per player. Balance is **provisional until Playtest 3** (gate bounds set to the measured result with repair; late-wave growth tried and stopped, `docs/balance/TUNING_LOG.md` rounds 3–4). Merged (PR #90). Built by Claude Code. | Team + Han | ☑ |
| P2-07 | Phone controls (client only, protocol stays 19; friends' match 7 Oct: "the joystick area is too small, and moving the hero sometimes taps a skill by accident"). A **floating stick** is the new default: drag anywhere on the map to walk, the base under the thumb and trailing it. **Round 2** (Han tried PR #92 one-thumbed, right-handed: the skills in the corner were too far from the thumb while steering): the skills are back **around the stick** in the one-thumb arc at the bottom centre, spread sideways so every two buttons and the stick's 80 px resting hint (it takes no touches) are at least 24 px apart, no higher than before, so the map still fits 412 × 839 with no panning; the fixed one-thumb layout uses the same arc around its 100 px stick. The **Skills button is gone** (holding any skill button, E included, opens the card). ⚙ → Controls layout is two rows: Stick (Floating / Fixed) and Skills (Around the stick / Right corner / Left corner), Joystick (Left / Center / Right) only for Around the stick; old saves keep the stick and skills they had (an unpicked old default moves to the new one). A drag never selects, pings or presses a skill; two fingers steer and cast at once. **Taps that register when the game hitches:** tap or hold is decided at release from the events' timestamps, so a stalled frame no longer turns a quick tap into the skill card or the range preview; selling still needs a real 0.5 s hold. Ping fires on lifting a still hold. Real-device steps: `docs/MOBILE_TESTING.md` §3.1–3.1h, 3.6d, 3.14. **Round 3 (Han's phone test of round 2, sim + client, protocol stays 19):** a point skill (Q / W on the Arcanist, W on the Ranger) is cast at once when a `move`, `attackMove`, `attack` or `stop` follows it in the same tick and the point is in range, so Q and W fire while you steer (before, the stick's next `move` overwrote the cast); the left-corner layout swaps Q and R so both corners read Q, W, R. **Later (rebalance after Playtest 3):** a second point cast in the same tick still replaces the first, and the bots do exactly that, so fixing it moves balance. Merged (PRs #93 and #94). Built by Claude Code. | Team + Han | ☑ |
| P2-08 | Start-up watchdog (client only, protocol stays 19; browser-test runs sat on "Loading…" for 150 s twice). After 15 s of the page on screen without the first screen, the boot splash says "Still loading. This can take longer on a slow connection." with a **Reload** button and keeps waiting; no WebGL or a context lost while starting says "This browser could not start the game's graphics." at once, with Reload; each is reported once as a `client_error` with a fixed reason (`boot_timeout`, `webgl_unavailable`, `webgl_context_lost`, no stack) through the Play data switch (`docs/ANALYTICS.md` "Start-up reasons"). **Causes found and closed in `GameView.create`:** a context lost during `app.init()` sends Pixi 8.21's texture-limit probe into `while (true)` (a frozen page no timer can reach; `startup/glGuard.ts` makes the call throw), and with no WebGL Pixi waits on a WebGPU adapter request with no timeout (WebGL only now). Auto-merge (PR #95). Built by Claude Code. | Team | ☑ |
| P2-09 | Calm battle sound (client audio only, protocol stays 19; a friend on 8 Oct: "the music is great, but the towers and heroes attacking sound like a car workshop or a scrap yard"). Measured on waves 10–14 of a solo Quick match: 15 effects a second, the effects over the music in 97% of seconds with the room. **Room:** the impulse has unit energy (the same at every sample rate) and returns 14 dB under the old room at 48 kHz, so a frequent sound's room is 10 dB under it, not 4 dB over. **Budget:** tower shots and the Blizzard pulse, creep deaths and coins share one budget per group (a shot every 140 ms and three ringing at once, a fall every 200 ms, a coin every 450 ms), yours and teammates' alike, with no extra voice for yours. **Levels:** tower shots ×0.5, deaths and coins ×0.7, your hero's attacks and Q / W ×1.25. **Softer:** the Frost shot loses its bell, the coin is one soft, low clink, the Warden's hit is a thud with a short dull ring. After: 7.4 effects a second, 11 dB under the music dry, 10 dB with the room; Music and Effects sliders and defaults unchanged. `battleSound.test.ts` keeps it. Real-device steps: `docs/MOBILE_TESTING.md` §8.4. Merged 9 Oct 2026 (PR #96). Built by Claude Code. | Team + Han | ☑ |

---

## Phase 6 and later · on hold until D-06 is called (Han, 8 Oct 2026)

**On hold (Han, 8 Oct 2026):** nothing in this section starts before D-06 is called, and no new feature does either. Overnight bots do not pull from here. Bug fixes and **Now → The order from here** are the only work.

Gate 1 passed 2 Oct 2026, which unblocked Phase 6; Han's plan of 8 Oct 2026 holds it until the first posts are read (D-06). The tasks below are not started, except p6c-combos (done, PR #83), p6a-analytics (done, PR #85) and p6a-privacy (done for play without accounts, PR #86). Monetisation still waits on Gate 2. Store work still waits on Discovery showing that strangers stay.

### Later · after D-06 passes, in this order (Han, 9 Oct 2026)

On hold until D-06 passes. Then, in this order: L-01, L-02, then **Phase 6a** (below). **No matchmaking yet:** there are too few players for a queue, and the room link is how friends join.

| ID | Task | Owner |
|---|---|---|
| L-01 | **A bot teammate in solo:** a lone player gets a bot hero on another lane, so combos happen without a friend. It builds on the practice ally (`coop.ts`) and needs a balance run (`npm run balance:matrix`). | Team |
| L-02 | **Progress saved in the browser**, for example stars per hero, mode and difficulty. No accounts. | Team |

### Phase 6a · Foundation: accounts and data

| ID | Task | Owner |
|---|---|---|
| p6a-db | Choose the database host: Render Postgres, or AWS | Han (decision) |
| p6a-accounts | Accounts and saved progress. Play as a guest first; link Google, Apple or email later. Currencies and inventory live on the server. | Team |
| p6a-analytics | Analytics and crash reports: day-1, day-7 and day-30 return rates, match results, where new players quit. **Done** (PR #85, server + client, `PROTOCOL_VERSION` stays 18, no new service, `docs/ANALYTICS.md`): D1 / D7 / D30 overall and per channel from a small `retention.json` beside `events.jsonl` (one line per browser id, deleted 31 days after it was last seen, plus daily cohort counts with no id, kept 90 days), so D30 still works after the first visit is pruned at 30 days; a first-session funnel (opened, lobby, match start, waves 3 / 5 / 10, match end, second match, plus each lesson card) that names the step most new players stop after; match results by mode and difficulty, team, hero and channel, with length; client crash reports (`error` / `unhandledrejection`, trimmed stack, build, browser family, once per error, at most 5 a session); copy and delete by browser id behind the dashboard key. All behind the Play data switch; the privacy page lists the new data. Durable numbers still need `ANALYTICS_DIR` on a disk that survives deploys (D-01's advice). | Team |
| p6a-privacy | Privacy basics: privacy policy, data export and deletion, an age check. PDPA, GDPR and child-safety rules apply. **Done for play without accounts** (PR #86, server + client, `PROTOCOL_VERSION` stays 18, no new service or database, `docs/ANALYTICS.md` "Age" and "Your data"): **Download my data** and **Delete my data** in ⚙ Settings and on `/privacy.html`, by a secret data key the browser keeps (`tdt.visitorKey`; the visitor id is derived from it, so nobody can ask for another browser's data by id; `POST /analytics/mine`, `/analytics/mine/forget`, rate limited, same answer whether or not data exists; the dashboard-key routes still work); a neutral one-time age question ("How old are you?") at the first Play / Create / Join tap, never on first load: nothing is sent before it, under 13 nothing is ever sent (and what was sent is deleted), 13–15 starts off; the privacy page explains GDPR and PDPA rights, the age rule and self-serve copy and deletion in plain words. Open questions for Han in the PR (age bands, the one extra step, legacy ids). Account data joins the same copy and deletion when p6a-accounts lands. The contact email is still H-07. | Team |

### Phase 6b · Clans

| ID | Task | Owner |
|---|---|---|
| p6b-clans | Clans of 3: create, invite by link, join and leave. Clan level and banner. | Team |
| p6b-party | Play as a clan: party up and queue together, quick-chat only | Team |

### Phase 6c · Loot and progression

| ID | Task | Owner |
|---|---|---|
| p6c-combos | Combo ultimates, full version: a fused effect for every hero pair. The sim has all three (Meteor Rain, Stun Storm, Shockwave: SL-05, PR #66). **Done:** Stun Storm and Shockwave now have their own presentation like Meteor Rain's: ribbon, sky, strike flight and landing, fuse burst and kill count (client only, PR #83). Don't merge `claude/loving-hawking-7fvsu7`. | Team |
| p6c-raids | Raid bosses with team mechanics: two-lane shields, pressure plates, bosses that split across lanes. One raid boss rotates weekly. The first beat is already in: Quick wave 10 Matriarch takes no damage until two lanes hit within 3 s (SL-04). Full wave 10 does not. | Team |
| p6c-gear | Team set gear: gear slots, Common-to-S rarity, effects that change how towers and skills behave. Set bonuses switch on when teammates wear pieces of the same set. Earned by play only at this stage. | Team |
| p6c-tiers | Difficulty tiers: better gear unlocks harder tiers with better loot, so gear never makes co-op trivial | Team |
| p6c-afk | AFK camp: resources build up per hour while away, capped at 12 hours, calculated on the server. Bonus for friends you played with this week. | Team |

### Phase 6d · Competition

| ID | Task | Owner |
|---|---|---|
| p6d-weekly | Weekly seeded challenge: everyone plays the same seed, and the server re-runs it to verify every score (replays already make this possible) | Team |
| p6d-boards | Regional and world leaderboards, separate for players and for clans | Team |
| p6d-challenge | Clan challenges: "beat our score within 24 hours". No queue needed. | Team |
| p6d-wars | Weekend clan wars: scheduled windows so everyone is online at the same time | Team |

### Gate 2 · Public soft launch (part of Discovery and rollout)

On hold until D-06 is called, like the rest of this section. Gate 2 keeps its day-1 and day-7 bar (g2-gate); D-06's bar for this round is the first session, read per link (**Now → The order from here**).

| ID | Task | Owner |
|---|---|---|
| g2-launch | CrazyGames Basic Launch, no monetization yet: real players, real data (see also D-05) | Han |
| g2-gate | **Gate:** top-quarter return rates, about 25–30% back the next day and 7–8% after a week; also compare **average playtime** and **repeat visits** vs Reddit channels. If not, fix the game before selling anything or spending on stores. | Han |

### Phase 7 · Monetization

| ID | Task | Owner |
|---|---|---|
| p7-cosmetics | Cosmetics shop: hero and tower skins, clan banners, leaderboard frames | Team |
| p7-pass | Season pass: cosmetic and convenience rewards along a seasonal track | Team |
| p7-forge | Forge spins: odds shown, a pity guarantee, duplicates turned into upgrade shards, no trading, region rules (Brazil bans paid loot boxes for under-18s) | Team |
| p7-sdk | CrazyGames full launch with purchases. Optional rewarded ads in solo only. | Han |
| p7-gate | **Gate:** steady first income. Even $100 a month proves people pay; then grow toward $2k. | Han |

### Phase 8 · Live PvP

| ID | Task | Owner |
|---|---|---|
| p8-sends | Live 3v3 tower defense PvP: each clan defends its own map and sends creeps at the other, Legion TD style. Bots fill empty seats; gear is equalised. | Team |
| p8-gate | **Gate:** short queues at peak, for example under 2 minutes in your region at peak hours | Han |
| p8-netcode | Netcode for hero fights: faster response for your own hero, servers in more regions | Team |
| p8-brawl | Paid-only 3v3 hero brawl (Brawl Pass): monthly pass, gear equalised, bots fill seats, scheduled brawl hours, one free trial match | Team |

### Phase 9 · Reach

Start store work only after Discovery (D-01–D-06 / Gate 2) shows strangers stay — not after friends-only playtests. Store-facing build leads with **1p and 2p**; **3p** remains the community flagship.

| ID | Task | Owner |
|---|---|---|
| p9-steam | Steam page and wishlists, started months before a Steam release | Han |
| p9-stores | App Store and Google Play: wrap the same web build with Capacitor, same `PROTOCOL_VERSION`. Needs Apple and Google developer accounts. | Team + Han |

### Backlog (not scheduled)

- The rest of Phase 5 (`docs/REPLAYABILITY.md`): more maps. Lane surges are in; match modifiers were removed on 17 Oct 2026.
- Should Quick be the default mode on phones? (`docs/MOBILE.md` §11, Han decides.)

---

## Done · 12 of 50

| ID | What | Proof |
|---|---|---|
| a-units | Units art (heroes, creeps, bosses) merged | PR #16 |
| a-branches | Old branches cleaned up; merged branches now delete themselves | Repo setting |
| a-mana | Decided: ultimates cost no mana, regen grows with level | Decision |
| a-mana-merge | Hero mana rework merged | PR #17 |
| a-cap3 | Matches locked to 3 players, one per lane | PR #18 |
| a-feel | Mobile feel pass | PR #19 |
| a-reach | Melee reach fix: the Warden fights back | PR #20 |
| a-fix1 | Playtest round 1 fixes: match reports and replays, difficulty curve, mana | PR #21 |
| a-sound | Sound: music and effects made in code | PR #22 |
| a-theme | Sound theme: Japanese lobby, Three Kingdoms battles (no recorded files yet) | PR #23 |
| b-spike | Hook test branch: combo ultimates, boss shield, solo bot ally. **Never merge.** | Branch `claude/loving-hawking-7fvsu7` |
| p5-surges | Lane surges. Protocol 15 (shipped with match modifiers, removed on 17 Oct 2026: see p5-one-screen) | PR #39 |
| p5-one-screen | **NEW** · **No modifiers, Normal only, the lobby on one screen** (Han, 17 Oct 2026; `PROTOCOL_VERSION` 20). Match modifiers (Swift, Ironclad, Sky Tide, Fog, Gold Rush) are removed from the game: they changed a match's numbers, not what the player does; lane surges stay exactly as they are. Nobody picks a difficulty: every match a player starts, solo or in a room, is Normal; Hard stays in the sim, the match config and the balance gates for the Daily run and Endless later. The lobby fits one phone screen (412 × 839): the home card carries Mode (Full / Quick) over Play solo, which starts the match at once; the solo pick, Practice Meteor Rain and its solo ally are gone; the room card fits with three seats for the host and a guest. No tuning number changed. Screenshots: `docs/screenshots/one-screen-lobby/`. Decision Log, 17 Oct 2026. | PR #116 |
