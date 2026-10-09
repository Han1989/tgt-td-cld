# Tower Defense Together: Handover

**As of:** 30 Sep 2026 · **Repo:** `github.com/Han1989/tgt-td-cld` · **`main`:** `bf45f2a` (PR #23) · **Protocol:** v11
**Product owner:** Han. He reviews and merges every pull request.

**Read in this order:** this file → `TASKS.md` → `CLAUDE.md` → `docs/GAME_DESIGN.md` → the doc for your task (§7).

---

## 1. The game

A browser co-op tower defense for **1–3 players, one per lane**, in the spirit of the Warcraft III custom-map era (co-op TD, Dota 1). Creep waves march down three lanes toward the **Heart**. Each player controls **one hero directly** and **builds towers** on their own pads. Portrait-first on phones (installable PWA), and it also plays on desktop with mouse and keyboard.

- **Full mode:** 30 waves, bosses on 10 / 20 / 30, about 25–35 minutes.
- **Quick mode:** 15 waves, bosses on 5 / 10 / 15, about 10–15 minutes.
- **Heroes:** Ranger (ultimate: Arrow Storm), Warden (Last Stand), Arcanist (Meteor). Q/W/E/R, levels 1–10.
- **Towers:** Arrow, Cannon, Frost, Arcane, Flak. Three tiers each, then a tier-4 branch (two per tower, ten in total).
- **Bosses:** Ironhorn (stomp), Matriarch (hatches broods), Shardback (switches between physical and magic resistance).

| What | Where |
|---|---|
| Live game (`main`) | https://tgt-td-cld.vercel.app |
| Live game server | Render service `tgt-td-server` (Singapore, room codes start with `A`), health at `/health` |
| Hook test (never merge) | https://tgt-td-cld-git-claude-loving-hawking-7fvsu7-han1989.vercel.app/?spike=hook&practice |
| Art and sound showcase | `/?showcase` on any build |
| Roadmap progress | `/?progress` on any build (production: https://tgt-td-cld.vercel.app/?progress) |
| Render stress test | `/?stress=300` on any build |
| Task list | `TASKS.md` (copy of Han's roadmap checklist, 11 of 50 done) |

---

## 2. Vision

**Pitch:** combo your ultimates, raid bosses together, and loot set gear that gets stronger when your team wears it. Then prove your clan on the leaderboards.

**Business target:** a few thousand loyal players and about **US$2k a month** from a fair model, not millions of free players. The reference points are Legion TD 2 and Bloons: a small loyal community, cosmetics, a season pass, fair purchases. Han may sell the game later, so everything in it has to be original or properly licensed.

### Locked decisions (don't change without Han)

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

### Open decisions (Han decides)

| Decision | Options | When |
|---|---|---|
| Database for accounts | Render Postgres, or AWS | Phase 6a |
| Brawl Pass price | For example $4.99 a month: 400 subscribers is about $2k a month before store fees | Phase 8 |
| Quick mode as the default on phones? | Yes / no (`docs/MOBILE.md` §11) | Any time |

---

## 3. What's done

Everything below is on `main` unless marked otherwise. The whole build so far took five days (25–29 Sep 2026), one feature per branch and pull request.

| Area | What it delivered | Where |
|---|---|---|
| Phase 1: solo slice | Local play, sim in a Web Worker | PR #1 |
| Phase 2: online co-op | Rooms, lobby, invite links and codes, 60 s reconnect, Render deploy | PR #2 |
| Phase 3: content | 5 towers × 3 tiers, 3 heroes with Q/W/E/R, 30 waves, 3 bosses, damage types, gold gifting, balance bot | PRs #3–#6 |
| Phase 4a: mobile | Spire portrait map, pad zones, touch controls, PWA, Quick mode, browser tests | PRs #8–#10 |
| Effects pass | Client-only, pooled, code-drawn effects | PR #11 |
| Tier-4 tower branches | Ten specialisations (pulled forward from Phase 5) | PR #12 |
| Runelight art | World, towers, heroes, creeps, bosses, UI; all drawn in code | PRs #13–#16 |
| Mana rework | Free ultimates, mana regen scales with level | PR #17 |
| 3-player cap | One per lane, faster heroes, balance gates for 1, 2 and 3 players | PR #18 |
| Mobile feel | Own-hero prediction, 40 ms solo delay, readable Warden melee | PR #19 |
| Melee fix | Symmetric reach, melee heroes step in and fight back | PR #20 |
| Playtest round 1 fixes | Match reports and replays, team difficulty curve, mana lasts twice as long | PR #21 |
| Sound pass | Music and effects made in code (Web Audio) | PR #22 |
| Sound theme pass | Japanese lobby, Three Kingdoms battles, drop-in recorded files | PR #23 |
| **Hook test (not merged)** | Combo ultimates, a wave-10 boss shield that needs two lanes, a solo bot ally, behind `?spike=hook`. Details: `docs/HOOK_SPIKE.md` on that branch. `main` was merged into it on 29 Sep, so it has sound. | Branch `claude/loving-hawking-7fvsu7` |

**Performance:** 60 FPS with 300 creeps on Han's phone. The automated gate is at least 30 FPS under 4× CPU throttling.

### What playtesting has shown so far

- **Friends match 1** (3 players, Quick, Ranger / Warden / Arcanist): waves 1–10 felt hard and 11–15 easy, the Arcanist ran out of mana, and they expected ultimates to combine. The first two are fixed in PR #21. Combos exist only on the hook test branch.
- **First sound pass:** friends found the lobby too soft and "spacey", and battles robotic. PR #23 replaced it with the current theme.
- **Han's solo match** (Quick, Ranger, seed 680952457, build `1fa2887`): 99 of 100 Heart, where the balance bot gets 46 on the same seed. He branched 3 towers (bot: 0), died once (bot: 6), cast Q/W/R 50/24/7 times (bot: 26/11/4) and called 7 waves early (bot: 0). Normal is tuned for beginners; this is why Hard difficulty is next. Han has the match file.
- **Gate 1 (2 Oct 2026):** friends played on Android, PC, and iPhone Safari. The gate passed. Follow-up work orders are Playtest 2 in `TASKS.md`.

---

## 4. What's next

The full list, with briefs and acceptance criteria, is in `TASKS.md`. Polish items **T-00–T-05 are done** (CI, Hard, pings, the first-match tutorial, projectile art, docs). Do not jump to stores or public discovery from the docs pass alone. In short:

1. **Polish** (done):
   - **T-00** CI and branch protection
   - **T-01** Hard difficulty and an expert bot
   - **T-02** Team pings and quick-chat emotes
   - **T-03** First five minutes (tutorial; after pings)
   - **T-04** Projectile and trap art
   - **T-05** Docs clean-up
2. **Gate 1 passed on 2 Oct 2026.** Friends played on Android, PC, and iPhone Safari (g1-render, g1-play, g1-watch, g1-tune, g1-gate). Friends-only play was never the store go/no-go.
3. **Playtest 2** is open (`TASKS.md`, P2-01–P2-05 and P2-04b). P2-01 to P2-04b are done: touch controls (client, PR #57), air waves and unspent gold teaching (client, PR #63), kit rework and balance by simulation (sim, PR #66), the combo cue and kill count (client, PR #70), and P2-04b, the cast-together prompt, ultimate shake and heal feedback (client, PR #73, built by Claude Code). Still open: the P2-05 retest (Han).
4. **Han's list:** H-01 is done (Vercel Authentication Disabled on tgt-td-cld, Han confirmed 1 Oct 2026). H-04 is done (lobby, match, and boss music, PR #42). H-02, H-03, H-05, and H-06 stay open: the hook-test server, trying the hook test, the iPhone checklist, and GitHub access.
5. **Phase 6 may proceed** (accounts, clans, loot, leaderboards). Those tasks are not started. Kit rework and sim balance from the friends session is Playtest 2 (P2-03).
6. **Discovery and rollout** (plan in `TASKS.md`) is the public soft-launch path and is still open. Before or alongside store submission, put the polished build in front of **strangers** and measure response:
   - Reddit, one post at a time: **r/PlayMyGame**, then **r/WebGames**, then **r/TowerDefense** (Han's plan of 8 Oct 2026: a friends retest and a cold test come first; `TASKS.md` → Now)
   - **CrazyGames Basic Launch** (Gate 2)
   - Per channel, track **average playtime**, **retention** (at least D1 / D7), and **repeat visits**
   - Decide store push vs more polish from that data — friends alone are not the audience test
7. **Modes for that build:** lead the store-facing surface with **1p and 2p**; keep **3p co-op** as the flagship community mode.

---

## 5. How to work in this repo

### Hard rules

1. **Merges.** One task per branch and pull request. Never push to `main`. Prefer GitHub native auto-merge once required CI is green; Han remains product owner and can still review or block.
2. **`main` deploys itself.** Vercel rebuilds the client and Render restarts the game server (matches get up to 280 s to finish). Say in the PR if it restarts the server, so Han doesn't merge during a play session.
3. **Never merge `claude/loving-hawking-7fvsu7`.** It's a throwaway test. Combos get rebuilt properly in Phase 6c.
4. **Before opening a PR:** `npm test` and `npm run build` pass, run after your last edit. Browser tests: only the specs you touched; CI runs the whole suite. Stop when the PR is open (`CLAUDE.md`, Session rules).
5. **The sim is pure and deterministic.** No `Math.random()`, `Date.now()` or `performance.now()` in `packages/sim` (a test enforces this). All balance numbers live in `packages/sim/src/tuning.ts`.
6. **Protocol changes bump `PROTOCOL_VERSION`** (now 11) and update the validation in `codec.ts` and its tests.
7. **Balance gates stay green:** 1, 2 and 3 players, Full and Quick, 40–80 Heart left, plus the difficulty-curve rule. Results swing about ±20 Heart between seeds, so run `npm run balance` over a wide seed list before trusting a tuning change.
8. **Original work only.** No Warcraft, Dota or other studio names or assets. Art is drawn in code following `docs/ART.md`. Recorded sound only if it's licensed for a paid game.
9. **Record design decisions** in the Decision Log (`docs/GAME_DESIGN.md` §13) and keep `CLAUDE.md` current. `CLAUDE.md` is the agent guide for any AI agent, despite its name.
10. **No secrets in the repo.** It's public. Environment variables live in the Render and Vercel dashboards.

### Every pull request says

- What was built, and what was deliberately left out.
- How to test it: the Vercel preview link and the steps on a phone.
- Test and balance results (the numbers, not "passed").
- Whether it bumps the protocol or restarts the server.
- Open questions for Han.
- The task ID from `TASKS.md`, with the task's status updated in the same PR.

### Ask Han; don't guess

Anything in "Locked decisions". Money: Render plans, paid services, store accounts. Monetization, prices and odds. The database host. Gate go/no-go calls. Deleting branches, services or data.

---

## 6. Infrastructure and access

| Service | Setup | Access the team needs |
|---|---|---|
| **GitHub** `Han1989/tgt-td-cld` | Public repo, npm workspaces monorepo. Auto-deletes merged branches. `main` protected (require PR, require status check `ci`, no force pushes). Repo auto-merge enabled. | Write access to push branches and open PRs. Prefer native auto-merge on green CI; Han remains product owner. |
| **Vercel** project `tgt-td-cld` | Builds every pushed branch. Previews at `https://tgt-td-cld-git-<branch>-han1989.vercel.app`. `VITE_SERVER_URL` is set for Production and Preview. | None needed: previews appear on each PR. |
| **Render** `tgt-td-server` | Docker, Singapore, one instance, shard `A`, auto-deploys `main` when server code changes (`render.yaml`). Free tier for testing, Starter for real play (Free sleeps after 15 min and can drop matches). | Logs only, if at all. Plan changes stay with Han. |
| **Render** `tgt-td-spike` | Runs the hook test branch, shard `H`. On 30 Sep, `tgt-td-spike.onrender.com/health` returned 404, so its real address is still to be confirmed. | None. |

**Stack:** TypeScript (strict), Node ≥ 22.12, npm workspaces, Vite, PixiJS 8, Vitest, Playwright (Chromium), `ws`. Packages: `packages/protocol`, `packages/sim`. Apps: `apps/client`, `apps/server`. Commands are listed in `CLAUDE.md`.

---

## 7. Document map

| Document | What it's for | Read it when |
|---|---|---|
| `CLAUDE.md` | Commands, repo layout, architecture rules, conventions, current status. `AGENTS.md` points here | Every task |
| `docs/ROADMAP.md` | Vision, locked decisions and phases (from §2 and `TASKS.md`) | Choosing what phase you are in |
| `docs/GAME_DESIGN.md` | Design source of truth, and the Decision Log (§13) | Any gameplay change |
| `docs/MOBILE.md` | Spire map, touch controls, layouts, Quick mode | Touch, layout or map work |
| `docs/MOBILE_TESTING.md` | The real-device checklist Han runs on phones | Adding steps for Han to check |
| `docs/ART.md` | Runelight art guide (§1–12) and sound (§13) | Any art, effect or sound work |
| `docs/REPLAYABILITY.md` | Phase 5: tower branches (done); lane surges, match modifiers, more maps (not started) | Replayability work |
| `docs/DEPLOY.md` | Render and Vercel setup, environment variables, operations, scaling by shard | Server or deploy changes |
| `docs/SOUND_FILES.md` | Dropping in recorded music and effects | Sound files |
| `docs/HOOK_SPIKE.md` (spike branch only) | Combos, the boss shield, the bot ally, the spike server | Phase 6c (combos and raids) |
| `TASKS.md` | Roadmap and task list, with status | Choosing and closing work |
| `docs/PROGRESS.md` | The `/?progress` page, and the rule to update it with `TASKS.md` | Closing a task |

---

## 8. Known gaps and gotchas

- **CI is on.** T-00: `.github/workflows/ci.yml` on pull requests and `main`. `main` requires the `ci` check.
- **README status.** Updated in T-05: Phases 1–3 done, Phase 4 polish through the tutorial.
- **`docs/GAME_DESIGN.md` §11.** Updated in T-05, then on 2 Oct 2026: Gate 1 passed (Android, PC, iPhone Safari friends), so Phase 6 may proceed. Monetisation still waits for Gate 2 (`docs/ROADMAP.md`).
- **Claude-specific names.** `CLAUDE.md` and the `claude/…` branch names come from how the game was built. Keep `CLAUDE.md` as the guide. `AGENTS.md` points at it (T-05). Use your own branch prefix. The hook-test branch `claude/loving-hawking-7fvsu7` stays unmerged.
- **One tracker.** Han's original checklist lives in his claude.ai account and nobody else can tick it. `TASKS.md` is the tracker. `apps/client/src/progress/data.ts` mirrors it for `/?progress`. Do not add a third list.
- **Balance cliffs.** Solo and pairs break with small changes (see the balance notes in `CLAUDE.md` → Conventions). Ranger + Warden is the weakest pair.
- **Slow browser tests.** The whole suite (`npm run test:e2e`) takes over half an hour in an agent session and about 11 minutes on CI, which splits it over seven jobs. Off CI the runner refuses it: run single specs (`CLAUDE.md`, Session rules).
- **No recorded music yet.** `apps/client/public/music/` holds only a README; the game plays its code-made music.
- **The hook test stays on protocol 11** on purpose, so its client can still play on the live server without `?spike`.
- **Match reports** (the end screen's "Save match report") are the best test data. `npm run replay <file>` re-runs one exactly and warns if your checkout is a different build.
