# Tower Defense Together: Task list

**As of 1 Oct 2026.** Copied from Han's roadmap checklist (11 of 50 done), plus the items marked **NEW**, added for the handover. Updated 30 Sep: Discovery and rollout after polish; 1p/2p store-facing, 3p community flagship. Updated 1 Oct: Gate 1 waived and treated as passed.
**This file is now the tracker.** Update a task's status in the same pull request that finishes it. Also update [`apps/client/src/progress/data.ts`](apps/client/src/progress/data.ts) so the dashboard stays in step ([`docs/PROGRESS.md`](docs/PROGRESS.md)).

**Progress dashboard:** `/?progress` on any build (production: https://tgt-td-cld.vercel.app/?progress).

**Owner:** **Team** = the Grok bot and the automated team. **Han** = only Han can do it (phones, friends, accounts, money, decisions).
**Status:** ☐ to do · ◐ in progress · ☑ done · ⛔ blocked

**Next:** Gate 1 is waived and treated as passed (1 Oct 2026). Immediate open work is Han's list (H-01–H-06), Discovery posts D-02–D-06, and Gate 2 (the public soft launch). Phase 6 may proceed and is not started.

---

## Now: in this order

### T-00 · CI and branch protection · NEW · Team, then Han · ☑

Tests have only ever run inside build sessions. The team workflow and the required `ci` check are on `main` (PR #24).

- **Team:** ☑ `.github/workflows/ci.yml` for pull requests and pushes to `main`: Node 22.12+, `npm ci`, `npm test`, `npm run build`. A second job runs `npm run test:e2e` (Playwright Chromium) when `apps/client/**`, `packages/**`, or `.github/workflows/ci.yml` change. npm and the Playwright browsers are cached. The e2e job takes several minutes; the stress test still runs alone at the end.
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

Done: a solo Quick match on Normal, once, for a new player (`tdt.settings` `tutorial`). Steps are move, build an Arrow, cast Q, upgrade, ping, and an optional quick-chat phrase. Each step advances when the player does it. Skip is on the card and on the hero pick. Online create / join does not start it. Replay from ⚙ or the lobby home. `PROTOCOL_VERSION` stays 13. Real-device steps in `docs/MOBILE_TESTING.md` §2.6.

### T-04 · Art for projectiles and traps · NEW · Team · ☑

The last things still drawn as plain shapes (`CLAUDE.md` status). Follow the new-entity checklist in `docs/ART.md` §10 and check them at phone size in `?showcase`, in Normal and Bright.

**Done 30 Sep 2026:** every shot style and the Snare Trap are Runelight sprites (`docs/ART.md` §6). `?showcase` lists them in Normal and Bright.

### T-05 · Docs clean-up · NEW · Team · ☑

- README: the status line still says Phase 2.
- Add `docs/ROADMAP.md` (vision, locked decisions and phases, from `HANDOVER.md` §2 and this file) and link it from `CLAUDE.md`.
- `docs/GAME_DESIGN.md` §11 "Out of scope": mark accounts, leaderboards, PvP and monetisation as planned for Phases 6–8, after Gate 1.
- Add `AGENTS.md` pointing to `CLAUDE.md` if your tooling reads it.

**Done 30 Sep 2026:** README status is Phases 1–3 done and Phase 4 polish through the tutorial (T-00–T-04). [`docs/ROADMAP.md`](docs/ROADMAP.md) is linked from `CLAUDE.md`. §11 then marked accounts, leaderboards, PvP and monetisation as Phases 6–8 after Gate 1. [`AGENTS.md`](AGENTS.md) points at `CLAUDE.md`. **Superseded 1 Oct 2026:** Gate 1 is waived and treated as passed, so Phase 6 may proceed (decision log).

### T-06 · Soft-launch co-op hook signals (sim) · Team · ☑

Signals only, for Client Polish to present. No new damage, no fused ultimates, no HUD ribbons in this change.

**Done 1 Oct 2026:** `PROTOCOL_VERSION` 14. A leak event carries `lane` (West / Mid / East via `laneName`). Match reports add `goldGifted` and `goldReceived` (missing on old saves counts as 0). `R_OVERLAP_SECONDS` (2) lives in the protocol, and a live `syncCast` fires once when a second living hero's R lands inside that window. Boss waves export advisory lane lines (`BOSS_LANE_HINTS`). Pings need no sim change: a double ping is two `ping` events, and the client can see that they are within 1 s.

### Han, in parallel

| ID | Task | Notes | Status |
|---|---|---|---|
| H-01 | Let friends open preview links | Vercel → project → Settings → Deployment Protection → Vercel Authentication: **Disabled** → Save. Otherwise friends see a Vercel login page. | ☐ |
| H-02 | Confirm the hook test server | In Render, check `tgt-td-spike` is **Live** and copy its exact address. `/health` should show `"shard":"H"`. On 30 Sep, `tgt-td-spike.onrender.com/health` returned 404. | ☐ |
| H-03 | Try the hook test on your phone (`b-try`) | Solo with the bot ally first (`?spike=hook&practice`), then online with one friend (`?spike=hook&server=wss://<spike address>`). | ☐ |
| H-04 | Three music tracks (`a-music`, optional) | `lobby.mp3` (Japanese), `match.mp3` (Three Kingdoms war), `boss.mp3` (intense war drums). Pixabay Music, or Suno Pro subscribed **before** generating (free-plan songs can't go in a paid game). Upload through a PR; see `docs/SOUND_FILES.md`. | ☐ |
| H-05 | Test on an iPhone (`a-iphone`) | Safari has the most quirks. Run `docs/MOBILE_TESTING.md` once and fill in its Results table. | ☐ |
| H-06 | Give the team access | GitHub write access for branches and PRs (merging stays with you). Nothing else is needed to start. | ☐ |

---


---

## After polish · Discovery and rollout · NEW

**Polish path T-00–T-05 is done** (CI, Hard, pings, tutorial, art, docs). **Gate 1 was waived on 1 Oct 2026** (Han, time) and is treated as passed, so Discovery and Phase 6 are not held for a friends evening. Discovery and store submission still wait on the measurement below; friends-only signal is not a store go. D-02–D-06 and Gate 2 are the public soft-launch path and are still open.

**Why:** current playtesters are only **2–3 friends**. That is enough for confusion and hook notes, not for whether strangers stay. Discovery is the first real-audience signal **before or alongside** store submission.

**Modes:** **1p and 2p** lead the store-facing build. **3-player co-op** stays the flagship community mode (do not demote 3p — polish the entry sizes hardest for stores).

**Measurement (required):** for each acquisition channel, track at least:

| Metric | Meaning |
|---|---|
| Average playtime | How long a first session lasts from that channel |
| Retention | Return rate (aim for D1 and D7; add D30 when Phase 6a analytics exist) |
| Repeat visits | Same player / same browser returning after the first session |

Tag sessions (or landing links) by channel so Reddit vs CrazyGames can be compared. The minimal funnel is in [`docs/ANALYTICS.md`](docs/ANALYTICS.md): `?src=` on the link, events on the game server, one dashboard. D30 still waits for Phase 6a.

| ID | Task | Owner | Status |
|---|---|---|---|
| D-01 | Channel analytics: average playtime, retention (D1/D7), repeat visits, tagged by source (`reddit-playmygame`, `reddit-incremental`, `reddit-cozy`, `crazygames`, …). Prefer building on Phase 6a analytics when ready; until then, a minimal tagged funnel is enough. | Team | ☑ |
| SL-01 | Soft-launch co-op presentation (client, #35): mirrored ping and same-emote burst within 1 s, gift sent/received toasts, twin-ultimate ribbon from two R casts within `R_OVERLAP_SECONDS`. Sim signals are T-06 (protocol 14): leak lane, gift totals, live `syncCast`, advisory boss lane lines. | Team | ☑ |
| SL-02 | Soft-launch HUD hooks (client): lane clutch on a real leak (`laneName`, skip `FINALE_LEAK_CREEP_ID`), end-screen gold given and received via `heroGiftTotals`, twin ribbon prefers live `syncCast` (cast overlap stays the fallback), advisory boss lane banners from `bossLaneHint`. Protocol stays 14. | Team | ☑ |
| D-02 | Post polished build to **r/PlayMyGame** (follow sub rules; one clear link; channel tag). | Han | ☐ |
| D-03 | Post polished build to **r/incremental_games** (only if the pitch fits; follow sub rules; channel tag). | Han | ☐ |
| D-04 | Post polished build to **r/cozygames** (only if the pitch fits; follow sub rules; channel tag). | Han | ☐ |
| D-05 | **CrazyGames Basic Launch** — same work as Gate 2 `g2-launch`; schedule before or alongside store submission, not instead of finishing polish. | Han | ☐ |
| D-06 | Review per-channel playtime / retention / repeats. **Go/no-go:** push stores, or more polish / pitch change. Friends-only signal is not enough for go. | Han | ☐ |

## Gate 1 · Friends playtest · PASSED / SKIPPED · 1 Oct 2026

Han cancelled the friends playtest because of time. **Waived / skipped.** The evening was not run: no Render plan change, no matches, no watch notes, and no per-hero retune from friend reports. The gate is **treated as passed**, so Phase 6 and other post–Gate-1 work may proceed. Discovery D-02–D-06 and Gate 2 stay the public soft-launch path and are still open.

| ID | Task | Owner | Status |
|---|---|---|---|
| g1-render | Switch Render to Starter for the evening (both services), back to Free afterwards. Free sleeps and can drop matches. **Waived 1 Oct 2026** with Gate 1 (Han, time). No plan change. | Han | ☑ |
| g1-play | Play 2–3 matches with two friends. Mix phones and desktop, and include the hook test. Everyone taps **Save match report** after each match. **Waived 1 Oct 2026.** The session was not run. | Han | ☑ |
| g1-watch | Watch, don't coach. Note where they get confused, what makes them shout or laugh, and whether they use combos. **Waived 1 Oct 2026.** The session was not run. | Han | ☑ |
| g1-tune | Per-hero tuning from the playtest. Use the saved match reports (`npm run replay`), not bots alone. Known so far: Quick pairs are the noisiest (Arcanist + Ranger ended one bot match with 11 Heart); Ranger + Warden is the weakest pair; the Warden casts R only 3–4 times in 3-player games. The easy last third is already fixed. **Waived 1 Oct 2026** with the playtest. No retune from friend reports. | Team | ☑ |
| g1-gate | **Gate:** at least half the players ask to play again unprompted. **Treated as passed 1 Oct 2026.** Han waived the check (time). Phase 6 may proceed. | Han | ☑ |

---

## Phase 6 and later · unblocked (Gate 1 waived 1 Oct 2026)

Gate 1 is passed / skipped, so Phase 6 may start. The tasks below are not started. Discovery D-02–D-06 and Gate 2 remain the public soft-launch path (still open). Monetisation still waits on Gate 2. Store work still waits on Discovery showing that strangers stay.

### Phase 6a · Foundation: accounts and data

| ID | Task | Owner |
|---|---|---|
| p6a-db | Choose the database host: Render Postgres, or AWS | Han (decision) |
| p6a-accounts | Accounts and saved progress. Play as a guest first; link Google, Apple or email later. Currencies and inventory live on the server. | Team |
| p6a-analytics | Analytics and crash reports: day-1, day-7 and day-30 return rates, match results, where new players quit | Team |
| p6a-privacy | Privacy basics: privacy policy, data export and deletion, an age check. PDPA, GDPR and child-safety rules apply. | Team |

### Phase 6b · Clans

| ID | Task | Owner |
|---|---|---|
| p6b-clans | Clans of 3: create, invite by link, join and leave. Clan level and banner. | Team |
| p6b-party | Play as a clan: party up and queue together, quick-chat only | Team |

### Phase 6c · Loot and progression

| ID | Task | Owner |
|---|---|---|
| p6c-combos | Combo ultimates, full version: a fused effect for every hero pair. Start from the hook test (`docs/HOOK_SPIKE.md`), rebuilt properly; don't merge the spike branch. | Team |
| p6c-raids | Raid bosses with team mechanics: two-lane shields, pressure plates, bosses that split across lanes. One raid boss rotates weekly. | Team |
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

- The rest of Phase 5 (`docs/REPLAYABILITY.md`): lane surges, match modifiers, more maps.
- Should Quick be the default mode on phones? (`docs/MOBILE.md` §11, Han decides.)

---

## Done · 11 of 50

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
