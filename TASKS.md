# Tower Defense Together: Task list

**As of 2 Oct 2026.** Copied from Han's roadmap checklist (11 of 50 done), plus the items marked **NEW**, added for the handover. Updated 30 Sep: Discovery and rollout after polish; 1p/2p store-facing, 3p community flagship. Updated 2 Oct: Gate 1 passed (Android, PC, iPhone Safari friends). Playtest 2 tasks P2-01 to P2-04b are done (PR #57, PR #63, PR #66, PR #70, PR #73). P2-05 (the retest) is open.
**This file is now the tracker.** Update a task's status in the same pull request that finishes it. Also update [`apps/client/src/progress/data.ts`](apps/client/src/progress/data.ts) so the dashboard stays in step ([`docs/PROGRESS.md`](docs/PROGRESS.md)). Do not add a third list: no queue file. `data.ts` only mirrors this file.

**Progress dashboard:** `/?progress` on any build (production: https://tgt-td-cld.vercel.app/?progress). **Cooking now** on that page lists rows marked ◐ in progress in this file. Open pull requests and CI stay on the Ops Dashboard.

**Owner:** **Team** = the Grok bot and the automated team. **Han** = only Han can do it (phones, friends, accounts, money, decisions).
**Status:** ☐ to do · ◐ in progress · ☑ done · ⛔ blocked

**Next:** Gate 1 passed 2 Oct 2026 (Android, PC, iPhone Safari friends). H-01 is done (Vercel Authentication Disabled, Han confirmed 1 Oct 2026). H-04 is done (music files, PR #42). P2-01 is done (touch controls, PR #57). P2-02 is done (flyer readability, anti-air teaching, gold nudge, PR #63). P2-03 is done (kit rework and sim balance, PR #66). P2-04 is done (combo cue and kill count, PR #70). P2-04b is done (cast-together prompt, ultimate shake and heal feedback, PR #73). D-07 is done (privacy notice and the Play data switch, PR #74); its contact email is H-07, before the Reddit posts. Immediate open work is Playtest 2 (the P2-05 retest), Han's list (H-02, H-03, H-05, H-06, H-07), Discovery posts D-02–D-06, and Gate 2 (the public soft launch). Phase 6 may proceed and is not started.

---

## Now: in this order

**Overnight bots.** Open **Team** rows in this section, top to bottom, are the auto-pull order. Skip Han rows and anything already done. The order is this file only.

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

| ID | Task | Notes | Status |
|---|---|---|---|
| H-01 | Let friends open preview links | Vercel → project → Settings → Deployment Protection → Vercel Authentication: **Disabled** → Save. **Done 1 Oct 2026:** Han confirmed this is already Disabled on the tgt-td-cld project, so friends do not see a Vercel login page. | ☑ |
| H-02 | Confirm the hook test server | In Render, check `tgt-td-spike` is **Live** and copy its exact address. `/health` should show `"shard":"H"`. On 30 Sep, `tgt-td-spike.onrender.com/health` returned 404. | ☐ |
| H-03 | Try the hook on your phone | Solo practice is on main: open `?practice=meteor-rain` and press Practice Meteor Rain (Ranger or Arcanist). The spike URL `?spike=hook` is retired. Then one online match with a friend on the production server. | ☐ |
| H-04 | Three music tracks (`a-music`, optional) | Done 1 Oct 2026: `lobby.mp3`, `match.mp3`, and `boss.mp3` in `apps/client/public/music/` (AI-generated via Google Gemini, by Han). See `docs/SOUND_FILES.md`. | ☑ |
| H-05 | Test on an iPhone (`a-iphone`) | Safari has the most quirks. Run `docs/MOBILE_TESTING.md` once and fill in its Results table. | ☐ |
| H-06 | Give the team access | GitHub write access for branches and PRs (merging stays with you). Nothing else is needed to start. | ☐ |
| H-07 | Privacy contact email | **Before D-02.** Replace the yellow `[PRIVACY EMAIL — …]` placeholder in `apps/client/privacy.html` (`data-placeholder="privacy-email"`) with the address players write to for a copy or deletion of their play data (D-07, `docs/ANALYTICS.md` → Copy and deletion requests). The server already prunes `events.jsonl` to 30 days at startup and daily (PR #75, `docs/ANALYTICS.md` → Retention). | ☐ |

---


---

## After polish · Discovery and rollout · NEW

**Polish path T-00–T-05 is done** (CI, Hard, pings, tutorial, art, docs). **Gate 1 passed on 2 Oct 2026** (Android, PC, iPhone Safari friends), so Discovery and Phase 6 are not held for another friends evening. Discovery and store submission still wait on the measurement below; friends-only signal is not a store go. D-02–D-06 and Gate 2 are the public soft-launch path and are still open; D-08 (link preview, first load, press kit) is done, so posts have a card and a measured first load. Playtest 2 is the follow-up from that session: P2-01 to P2-04b are done (PR #57, PR #63, PR #66, PR #70, PR #73). P2-05 is still open.

**Why:** current playtesters are only **2–3 friends**. That is enough for confusion and hook notes, not for whether strangers stay. Discovery is the first real-audience signal **before or alongside** store submission.

**Modes:** **1p and 2p** lead the store-facing build. **3-player co-op** stays the flagship community mode (do not demote 3p — polish the entry sizes hardest for stores).

**Measurement (required):** for each acquisition channel, track at least:

| Metric | Meaning |
|---|---|
| Average playtime | How long a first session lasts from that channel |
| Retention | Return rate: D1, D7 and D30 (D30 since p6a-analytics, PR #85) |
| Repeat visits | Same player / same browser returning after the first session |

Tag sessions (or landing links) by channel so Reddit vs CrazyGames can be compared. The funnel is in [`docs/ANALYTICS.md`](docs/ANALYTICS.md): `?src=` on the link, events on the game server, one dashboard. D30, where new players stop, match breakdowns and crash reports are there too (p6a-analytics, PR #85).

| ID | Task | Owner | Status |
|---|---|---|---|
| D-01 | Channel analytics: average playtime, retention (D1/D7), repeat visits, tagged by source (`reddit-playmygame`, `reddit-incremental`, `reddit-cozy`, `crazygames`, …). Prefer building on Phase 6a analytics when ready; until then, a minimal tagged funnel is enough. Phase 6a's p6a-analytics (PR #85) adds D30 per channel on the same dashboard. | Team | ☑ |
| SL-01 | Soft-launch co-op presentation (client, #35): mirrored ping and same-emote burst within 1 s, gift sent/received toasts, twin-ultimate ribbon from two R casts within `R_OVERLAP_SECONDS`. Sim signals are T-06 (protocol 14): leak lane, gift totals, live `syncCast`, advisory boss lane lines. | Team | ☑ |
| SL-02 | Soft-launch HUD hooks (client): lane clutch on a real leak (`laneName`, skip `FINALE_LEAK_CREEP_ID`), end-screen gold given and received via `heroGiftTotals`, twin ribbon prefers live `syncCast` (cast overlap stays the fallback), advisory boss lane banners from `bossLaneHint`. Protocol stays 14. | Team | ☑ |
| SL-03 | Together-kill flash (client): two or more living heroes whose `damage` hit the same creep within 2 s of its `kill` get a short shared flash (seat colours, edge glow, dual-pitch chime). No gold or stat change. Protocol stays 14. A living player's towers share `damage.by`, so they count; a hero-only `togetherKill` event waits on Gameplay after Phase 5. | Team | ☑ |
| SL-04 | Soft-launch hook on main (`PROTOCOL_VERSION` 16, `docs/HOOK_SPIKE.md`): Meteor Rain only (Arrow Storm + Meteor fuse into a denser shared lane rain inside 2 s; no aim overlap), global lane rains for both of those R, Quick wave-10 Matriarch two-lane shield (Full wave 10 is a normal Ironhorn), solo Practice Meteor Rain (`?practice=meteor-rain`), Warden Blood Hunger + Iron Vow, stick overrides melee chase. Do not merge `claude/loving-hawking-7fvsu7`. | Team | ☑ |
| SL-05 | Kit rework and balance by simulation (Playtest 2, `PROTOCOL_VERSION` 17, `docs/HOOK_SPIKE.md`, `docs/balance/`): Arrow Storm and Meteor instant lane rains again (no aiming, no caps, strikes on creeps, flyers hit, Meteor stuns every impact) and much stronger, the Warden hits flyers (Cleave and Taunt too) and Blood Hunger heals from Cleave, Iron Vow heals every living hero and bursts, three combos in a 5 s window with no overlap check (Meteor Rain, Stun Storm, Shockwave; three ultimates fire the strongest pair once), Hard finale deduction removed, novice bot (every hero solo ≥ 80%) and `npm run balance:matrix`, new balance targets. Merged after Han's review (PR #66). | Team | ☑ |
| D-07 | Privacy notice before strangers play (client, PR #74): a short, plain-language page at `/privacy.html` (what is collected and why, no accounts, no third-party trackers, kept 30 days, deletion by email with the browser's id), linked from the lobby, the rating control and Settings; the note box says "Don't include personal details."; ⚙ Settings → **Play data** On / Off for this browser (`tdt.analytics`, off by default with Global Privacy Control or Do Not Track), checked before every event. Client only, no protocol change. The email is a placeholder until H-07. Accounts privacy stays `p6a-privacy`. | Team | ☑ |
| D-08 | **Link preview and first load** (client only, protocol stays 18): Open Graph / Twitter tags with README's pitch, a 1200 × 630 card from the game's own art (`npm run og -w @tdt/client`), tagged links keep the card and their `?src=`, a boot splash, Play solo one tap with no scrolling on phones, first load measured on a throttled Pixel 7 (`npm run first-load -w @tdt/client`), press kit in [`docs/PRESS.md`](docs/PRESS.md). PR #77. | Team | ☑ |
| D-02 | Post polished build to **r/PlayMyGame** (follow sub rules; one clear link; channel tag). | Han | ☐ |
| D-03 | Post polished build to **r/incremental_games** (only if the pitch fits; follow sub rules; channel tag). | Han | ☐ |
| D-04 | Post polished build to **r/cozygames** (only if the pitch fits; follow sub rules; channel tag). | Han | ☐ |
| D-05 | **CrazyGames Basic Launch** — same work as Gate 2 `g2-launch`; schedule before or alongside store submission, not instead of finishing polish. | Han | ☐ |
| D-06 | Review per-channel playtime / retention / repeats. **Go/no-go:** push stores, or more polish / pitch change. Friends-only signal is not enough for go. | Han | ☐ |

## Gate 1 · Friends playtest · PASSED · 2 Oct 2026

Friends played on **2 Oct 2026** on Android, PC, and iPhone Safari. **Passed.** Phase 6 and other post–Gate-1 work may proceed. Discovery D-02–D-06 and Gate 2 stay the public soft-launch path and are still open. Follow-up from the session is Playtest 2: P2-01 to P2-04b are done (PR #57, PR #63, PR #66, PR #70, PR #73). P2-05 is still open.

| ID | Task | Owner | Status |
|---|---|---|---|
| g1-render | Switch Render to Starter for the evening (both services), back to Free afterwards. Free sleeps and can drop matches. **Passed 2 Oct 2026** with Gate 1. Friends played on Android, PC, and iPhone Safari. | Han | ☑ |
| g1-play | Play 2–3 matches with two friends. Mix phones and desktop, and include the hook test. Everyone taps **Save match report** after each match. **Passed 2 Oct 2026.** Friends played on Android, PC, and iPhone Safari. | Han | ☑ |
| g1-watch | Watch, don't coach. Note where they get confused, what makes them shout or laugh, and whether they use combos. **Passed 2 Oct 2026** with the friends session (Android, PC, iPhone Safari). | Han | ☑ |
| g1-tune | Per-hero tuning from the playtest. Use the saved match reports (`npm run replay`), not bots alone. Known so far: Quick pairs are the noisiest (Arcanist + Ranger ended one bot match with 11 Heart); Ranger + Warden is the weakest pair; the Warden casts R only 3–4 times in 3-player games. The easy last third is already fixed. **Passed 2 Oct 2026** with Gate 1. Kit rework and sim balance from the session is Playtest 2 (P2-03). | Team | ☑ |
| g1-gate | **Gate:** at least half the players ask to play again unprompted. **Passed 2 Oct 2026.** Friends on Android, PC, and iPhone Safari. Phase 6 may proceed. | Han | ☑ |

---

## Playtest 2 · work orders

Follow-up from the 2 Oct 2026 friends session (Android, PC, iPhone Safari). P2-01 to P2-04b are done. P2-05 is still open. They are not the overnight auto-pull list (that list is **Now**, above, and those rows are done).

| ID | Task | Owner | Status |
|---|---|---|---|
| P2-01 | Touch controls (client, #57). Client Polish. Phone UX from the 2 Oct 2026 friends session. | Team | ☑ |
| P2-02 | Air waves and unspent gold teaching (client, #63). Client Polish. Flyer readability, anti-air teaching, and a gold nudge. | Team | ☑ |
| P2-03 | Kit rework and balance by simulation (sim, Claude; PR #66, merged as 05a3fc0 after Han's review). The same work as SL-05. | Team + Han | ☑ |
| P2-04 | Ultimate presentation and combo cue (client, PR #70). Each combo has its own ribbon, strikes and colour, and a finished rain or combo shows its kill count. No aim circles. | Team | ☑ |
| P2-04b | Cast-together prompt, ultimate shake and heal feedback (client, PR #73, `PROTOCOL_VERSION` 18): the part of Task 4 that PR #70 left out. Every cast gets a flare, a screen blink, a kick and a sound heard everywhere; a finished rain or burst pops one exact kill count ("Arrow Storm: 12", from the `ultResult` event); R glows when ready, pulses after 20 s ready with creeps on the map, and shows a 5 s "Combo!" ring after a teammate's pairing cast; Screen shake Off / Normal / Strong (reduced motion turns it off) on ultimates, boss abilities and Heart hits; Iron Vow's heal rings every healed hero and shows on a teammate chip; the end screen and `report.coop` list kills per ultimate and combos per pair. Sim: two events (`ultResult`, `heal`) and report fields only, no tuning change. Real-device steps: `docs/MOBILE_TESTING.md` §10. Built by Claude Code. | Team | ☑ |
| P2-05 | Retest. P2-04b is done, so it can start. | Han | ☐ |

---

## Phase 6 and later · unblocked (Gate 1 passed 2 Oct 2026)

Gate 1 passed 2 Oct 2026, so Phase 6 may start. The tasks below are not started, except p6c-combos (done, PR #83) and p6a-analytics (done, PR #85). Discovery D-02–D-06 and Gate 2 remain the public soft-launch path (still open). Monetisation still waits on Gate 2. Store work still waits on Discovery showing that strangers stay. Playtest 2 follow-up: P2-01 to P2-04b are done (PR #57, PR #63, PR #66, PR #70, PR #73). P2-05 is still open.

### Phase 6a · Foundation: accounts and data

| ID | Task | Owner |
|---|---|---|
| p6a-db | Choose the database host: Render Postgres, or AWS | Han (decision) |
| p6a-accounts | Accounts and saved progress. Play as a guest first; link Google, Apple or email later. Currencies and inventory live on the server. | Team |
| p6a-analytics | Analytics and crash reports: day-1, day-7 and day-30 return rates, match results, where new players quit. **Done** (PR #85, server + client, `PROTOCOL_VERSION` stays 18, no new service, `docs/ANALYTICS.md`): D1 / D7 / D30 overall and per channel from a small `retention.json` beside `events.jsonl` (one line per browser id, deleted 31 days after it was last seen, plus daily cohort counts with no id, kept 90 days), so D30 still works after the first visit is pruned at 30 days; a first-session funnel (opened, lobby, match start, waves 3 / 5 / 10, match end, second match, plus each lesson card) that names the step most new players stop after; match results by mode and difficulty, team, hero and channel, with length; client crash reports (`error` / `unhandledrejection`, trimmed stack, build, browser family, once per error, at most 5 a session); copy and delete by browser id behind the dashboard key. All behind the Play data switch; the privacy page lists the new data. Durable numbers still need `ANALYTICS_DIR` on a disk that survives deploys (D-01's advice). | Team |
| p6a-privacy | Privacy basics: privacy policy, data export and deletion, an age check. PDPA, GDPR and child-safety rules apply. | Team |

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

Runs **after polish** (T-00–T-05), with the Reddit discovery posts (D-02–D-04). Same measurement bar as D-01 / D-06.

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

- The rest of Phase 5 (`docs/REPLAYABILITY.md`): more maps. Lane surges and match modifiers are in.
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
| p5-surges | Lane surges and match modifiers (Swift, Ironclad, Sky Tide, Fog, Gold Rush). Protocol 15 | PR #39 |
