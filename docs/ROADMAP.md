# Tower Defense Together: Roadmap

**As of 2 Oct 2026.** Vision and locked decisions are copied from [`HANDOVER.md`](../HANDOVER.md) §2. Phase order and status follow [`TASKS.md`](../TASKS.md), which is the tracker. Design detail stays in [`GAME_DESIGN.md`](GAME_DESIGN.md). Do not treat this file as a second design bible.

## Vision

**Pitch:** combo your ultimates, raid bosses together, and loot set gear that gets stronger when your team wears it. Then prove your clan on the leaderboards.

**Business target:** a few thousand loyal players and about **US$2k a month** from a fair model, not millions of free players. The reference points are Legion TD 2 and Bloons: a small loyal community, cosmetics, a season pass, fair purchases. Han may sell the game later, so everything in it has to be original or properly licensed.

**Where the build is:** Phases 1–3 are done. Phase 4a (mobile) and the Phase 4b polish list **T-00–T-05** are done (CI, Hard, pings, the first-match tutorial, projectile and trap art, these docs). Real-device checks (`docs/MOBILE_TESTING.md`, H-05) and the optional app-store wrap (Phase 4c) are still open. Tower branches (Phase 5 §1), lane surges and match modifiers are in. More maps are not. **Gate 1 (friends playtest) passed on 2 Oct 2026** (Android, PC, iPhone Safari), so Phase 6 may proceed and is not started. Playtest 2 work orders are open. Discovery D-02–D-06 and Gate 2 are the public soft-launch path and are still open. The same picture is on the site at `/?progress` ([`docs/PROGRESS.md`](PROGRESS.md); production: https://tgt-td-cld.vercel.app/?progress). `TASKS.md` stays the tracker.

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
| **Playtest 2** | Touch controls, air waves and unspent gold, kit rework and sim balance, ultimate presentation, retest | Open. Work orders P2-01–P2-05 in `TASKS.md` |
| **Discovery** | Reddit posts and CrazyGames Basic Launch; playtime, D1/D7, repeat visits by channel (`docs/ANALYTICS.md`) | Measurement (D-01) is in. Posts and the go/no-go are Han (D-02–D-06), still open. Public soft-launch path with Gate 2 |
| **6a · Accounts** | Guest play, then Google / Apple / email; progress, currencies and inventory on the server; analytics and privacy | Unblocked 2 Oct 2026 (Gate 1 passed). Not started |
| **6b · Clans** | Clans of 3, party queue, quick-chat only | Unblocked 2 Oct 2026 (Gate 1 passed). Not started |
| **6c · Loot** | Combo ultimates (rebuilt, not the spike branch), raid bosses, team set gear, difficulty tiers, AFK camp | Unblocked 2 Oct 2026 (Gate 1 passed). Not started |
| **6d · Competition** | Weekly seeded challenge, regional and world leaderboards, clan challenges, weekend clan wars | Unblocked 2 Oct 2026 (Gate 1 passed). Not started |
| **Gate 2 · Soft launch** | CrazyGames Basic Launch, no monetisation yet. About 25–30% back the next day and 7–8% after a week | After polish, with the Reddit posts. Han calls the gate |
| **7 · Monetisation** | Cosmetics, season pass, forge spins (odds shown, pity, no trading), CrazyGames purchases, optional rewarded ads in solo only | After Gate 2 |
| **8 · Live PvP** | 3v3 send-creeps, then a paid-only hero brawl (Brawl Pass). Gear equalised, bots fill seats | Last, after the co-op live game |
| **9 · Reach** | Steam wishlists, then App Store and Google Play. Store-facing build leads with 1p and 2p; 3p stays the community flagship | Only after Discovery shows strangers stay |

Backlog, not scheduled: more maps (Phase 5), and whether Quick is the default on phones.

## What not to start

- Monetisation, prices or odds before Gate 2, and not without Han.
- Store submission before the discovery go/no-go (D-06). Friends-only playtests are not that signal.
- A merge of `claude/loving-hawking-7fvsu7`.
