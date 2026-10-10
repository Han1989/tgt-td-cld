# Tower Defense Together: Roadmap

**As of 10 Oct 2026** (the roadmap's copy of 9 Oct 2026, 10:35, plus Han's graphics review of 10 Oct). Vision and locked decisions are copied from [`HANDOVER.md`](../HANDOVER.md) §2. Phase order and status follow [`TASKS.md`](../TASKS.md), which is the tracker. Design detail stays in [`GAME_DESIGN.md`](GAME_DESIGN.md). Do not treat this file as a second design bible.

## Vision

**Pitch:** combo your ultimates, raid bosses together, and loot set gear that gets stronger when your team wears it. Then prove your clan on the leaderboards.

**Business target:** a few thousand loyal players and about **US$2k a month** from a fair model, not millions of free players. The reference points are Legion TD 2 and Bloons: a small loyal community, cosmetics, a season pass, fair purchases. Han may sell the game later, so everything in it has to be original or properly licensed.

**Where the build is:** Phases 1–3 are done. Phase 4a (mobile) and the Phase 4b polish list **T-00–T-05** are done (CI, Hard, pings, the first-match tutorial, projectile and trap art, these docs). Real-device checks (`docs/MOBILE_TESTING.md`, H-05) and the optional app-store wrap (Phase 4c) are still open. Tower branches (Phase 5 §1), lane surges and match modifiers are in. More maps are not. **Gate 1 (friends playtest) passed on 2 Oct 2026** (Android, PC, iPhone Safari). Playtest 2's work orders are done but the retest.

**The plan from 8 Oct 2026 (Han).** Before any Reddit post: friends retest the new phone controls on the link tagged `?src=friends` (P2-05), then three to five people who have never seen the game play it with no help on `?src=cold` (the cold test, H-09; two of them bring a friend; the bar is that they finish a first match unaided and at least half start another). One fix round follows, with the rebalance that ends the "provisional until Playtest 3" balance bounds (T-07). Then the first post, r/PlayMyGame only (D-02), then r/WebGames (D-03) and r/TowerDefense (D-04) one at a time, each only after the previous post's numbers are read, then the gate (D-06). D-06's bar for this round is the first session, read per link: started a match, finished it, started a second one, and the rating; day-1 returns are noted, and day-7 is not the bar yet, because no progress is saved between visits. Gate 2 (CrazyGames) keeps its day-1 and day-7 bar. The measurement for it (link tags and a funnel per link, D-09) is in, and the numbers survive a sleep or a deploy (Render Starter with a disk, H-08, 9 Oct 2026).

**Graphics review and the presentation pass (Han, 10 Oct 2026).** Han compared the game with store games: the rules and the group play hold up, the look does not yet. A review of the live build found that the gap is less the art than where it shows: the first screen was a form, a hero is about 25 px tall on a phone, and a match is flat, seen from straight above. The benchmark is the 2D stylised tower defense games on the stores (Kingdom Rush), not studio 3D. Four options were set out:

- **A · A presentation pass, drawn in code.** The first screen becomes a scene with the hero large and one main button; then the second screen, depth in the match (pads that recede, shadows, tower height) and bigger units on a phone. No new spend. **Han chose A.** It is the one exception to the hold below, client only, one slice at a time, each after Han has looked at the one before on a phone (`TASKS.md` → Presentation pass, V-01–V-04). V-01, the first screen, is in review (PR #100) and comes before the cold test.
- **B · Illustrated art where the eye rests** (hero portraits, boss cards, key art, the store icon): an artist or a paid image tool, wired in by the team. Not started.
- **C · Image sprites in the match**, for heroes and bosses only. One route is a 3D model rendered once in Blender into 2D frames that drop into the atlas; a one-hero trial was proposed, not decided. Not started.
- **D · Real 3D in the match.** A rewrite of the renderer that would not show at 25 px. Not planned.

B and C cost money and carry two risks this roadmap already cares about: everything in the game has to be original or properly licensed, because Han may sell it (an image made from a prompt alone may not be protected by copyright), and the Reddit communities in the Discovery plan react badly to art that looks machine-made. The recommendation on 10 Oct was B after the gate, and C for heroes only if the numbers ask for it. Han has decided A only.

**On hold (Han, 8 Oct 2026):** nothing in Phase 6 or later, and no new feature, starts before D-06 is called; bug fixes, the rows above and the presentation pass (Han, 10 Oct 2026) are the only work. While a post is live, no merge changes the sim or the protocol, because each one restarts the game server. **After D-06 passes** (Han, 9 Oct 2026), in this order: a bot teammate in solo (L-01: a lone player gets a bot hero on another lane, so combos happen without a friend), progress saved in the browser (L-02: for example stars per hero, mode and difficulty; no accounts), then Phase 6a. No matchmaking yet: too few players for a queue, and the room link is how friends join. The same picture is on the site at `/?progress` ([`docs/PROGRESS.md`](PROGRESS.md); production: https://tgt-td-cld.vercel.app/?progress). `TASKS.md` stays the tracker.

## Locked decisions

Don't change these without Han.

| Area | Decision |
|---|---|
| Players | Up to 3 per match, one per lane. **Store-facing build leads with solo (1p) and duo (2p).** **3-player co-op is the flagship community mode.** |
| Platform | Portrait on phones, the Spire map on every device, controls drawn over the map. |
| Hero control | Auto-attacks while moving. Tap a skill to smart-cast it, drag to aim. Ultimates cost no mana (cooldown only); mana regen grows with level. |
| Art | "Runelight" (dark, moonlit fantasy), drawn entirely in code. |
| Sound | Lobby: Japanese garden. Matches: Three Kingdoms war epic. Made in code; recorded files can replace any of it. |
| Business | Small but paying. No pay-to-win in co-op; spending for status goes on cosmetics and rank. |
| Hook | Combo ultimates and raid bosses first, then team set gear, the AFK camp and forge spins, with difficulty tiers keeping co-op fair. |
| Social | Clans of 3, regional and world leaderboards, challenges that need no queue first. |
| PvP | Live 3v3 hero brawl as a paid-only tier (Brawl Pass), built last. |
| Guardrails | No trading of spun items. Odds shown, with a pity guarantee. Region rules for paid spins. Quick-chat and emotes only, no free-text chat. |
| Tech | Server-authoritative 20 Hz simulation with snapshot interpolation. Client on Vercel, game server on Render. |

The hook-test branch `claude/loving-hawking-7fvsu7` (combo ultimates, boss shield, solo bot ally) is a throwaway. **Never merge it.** Combos are rebuilt in Phase 6c.

### Open decisions (Han)

| Decision | Options | When |
|---|---|---|
| Database for accounts | Render Postgres, or AWS | Phase 6a |
| Brawl Pass price | For example $4.99 a month: 400 subscribers is about $2k a month before store fees | Phase 8 |
| Quick mode as the default on phones? | Yes / no (`docs/MOBILE.md` §11) | Any time |

## Phases

| Phase | What | Status |
|---|---|---|
| **1 · Solo** | Local play, sim in a Web Worker | Done (PR #1) |
| **2 · Online co-op** | Rooms, lobby, invite links, reconnect, Render | Done (PR #2) |
| **3 · Content** | 5 towers × 3 tiers, 3 heroes, 30 waves, 3 bosses, gold gifting, balance bot | Done (PRs #3–#6) |
| **4a · Mobile** | Spire, pad zones, touch, PWA, Quick mode, browser tests | Done (PRs #8–#10). Real-device checklist still open (H-05) |
| **4b · Polish** | Effects, Runelight art and sound, branches, mana, 3-player cap, feel, melee, match reports, Hard + expert bot, pings, tutorial, docs | Done through T-05. See `CLAUDE.md` for the feature list |
| **4c · App stores** | Capacitor wrap of the same web build | Not started (Phase 9 does the store release) |
| **5 · Replayability** | Tower branches; lane surges, match modifiers, more maps (`docs/REPLAYABILITY.md`) | Branches, lane surges and match modifiers are done. More maps are backlog |
| **Gate 1 · Friends** | 2–3 friends, saved match reports, unprompted "play again" | **Passed 2 Oct 2026.** Friends played on Android, PC, and iPhone Safari (g1-render, g1-play, g1-watch, g1-tune, g1-gate) |
| **Playtest 2** | Touch controls, air waves and unspent gold, kit rework and sim balance, ultimate presentation, tower repair, phone controls, start-up watchdog, calm battle sound, retest | Work orders P2-01–P2-09 done. The retest with friends (P2-05, `?src=friends`) is step 3 of the order in `TASKS.md` → Now |
| **Presentation pass** | The first screen (a hero on a stage, one main button), the second screen, depth in the match, bigger units on a phone. Drawn in code, client only (Han, 10 Oct 2026) | V-01, the first screen, is in review (PR #100). V-02–V-04 each wait for Han's go (`TASKS.md` → Presentation pass) |
| **Cold test and fix round** | Three to five people who have never seen the game, no help, `?src=cold` (H-09); then one fix round with the rebalance (T-07) | Next, after the retest |
| **Discovery** | Reddit posts one at a time: r/PlayMyGame, r/WebGames, r/TowerDefense; playtime, D1/D7, repeat visits and a first-visit funnel per link (`docs/ANALYTICS.md`) | Measurement is in (D-01, D-09) and survives deploys (H-08). Posts and the gate are Han (D-02–D-04, D-06), after the fix round. D-06 reads the first session per link |
| **Later · after D-06 passes** | A bot teammate in solo (L-01), progress saved in the browser (L-02), then Phase 6a. No matchmaking yet | On hold until D-06 passes (Han, 9 Oct 2026) |
| **6a · Accounts** | Guest play, then Google / Apple / email; progress, currencies and inventory on the server; analytics and privacy | On hold until D-06 is called (Han, 8 Oct 2026), then after L-01 and L-02. Analytics and privacy basics are done; accounts not started |
| **6b · Clans** | Clans of 3, party queue, quick-chat only | On hold until D-06 is called (Han, 8 Oct 2026). Not started |
| **6c · Loot** | Combo ultimates (rebuilt, not the spike branch), raid bosses, team set gear, difficulty tiers, AFK camp | On hold until D-06 is called (Han, 8 Oct 2026). Combos are done; the rest is not started |
| **6d · Competition** | Weekly seeded challenge, regional and world leaderboards, clan challenges, weekend clan wars | On hold until D-06 is called (Han, 8 Oct 2026). Not started |
| **Gate 2 · Soft launch** | CrazyGames Basic Launch, no monetisation yet. About 25–30% back the next day and 7–8% after a week | On hold until D-06 is called. Keeps its day-1 and day-7 bar. Han calls the gate |
| **7 · Monetisation** | Cosmetics, season pass, forge spins (odds shown, pity, no trading), CrazyGames purchases, optional rewarded ads in solo only | After Gate 2 |
| **8 · Live PvP** | 3v3 send-creeps, then a paid-only hero brawl (Brawl Pass). Gear equalised, bots fill seats | Last, after the co-op live game |
| **9 · Reach** | Steam wishlists, then App Store and Google Play. Store-facing build leads with 1p and 2p; 3p stays the community flagship | Only after Discovery shows strangers stay |

Backlog, not scheduled: more maps (Phase 5), and whether Quick is the default on phones.

## What not to start

- Anything in Phase 6 or later, and any new feature, before D-06 is called (Han, 8 Oct 2026). Bug fixes and the order in `TASKS.md` → Now are the only work. The presentation pass is the one exception (Han, 10 Oct 2026), and its rows start one at a time, when Han says go.
- A merge that changes the sim or the protocol while a Reddit post is live: each one restarts the game server.
- Matchmaking: too few players for a queue; the room link is how friends join (Han, 9 Oct 2026).
- Monetisation, prices or odds before Gate 2, and not without Han.
- Store submission before the discovery go/no-go (D-06). Friends-only playtests are not that signal.
- A merge of `claude/loving-hawking-7fvsu7`.
