# Tower Defense Together — Game Design & Build Plan

> **Source of truth for this repo.** Claude Code sessions: read this file and `CLAUDE.md` first, build only the phase or feature you are asked for, and record any design decision you make in the Decision Log at the bottom.

## 1. Vision

A browser-based **co-op tower defense for 1–4 players**, in the spirit of the Warcraft III custom-map era (co-op TD and Dota 1). Large creep waves march down lanes toward your base. Each player defends with a **hero they control directly** and **towers they build**. A match lasts 25–35 minutes. Joining is easy: open a link, enter a room code, play.

Original names and art only. No Warcraft, Dota or other studio assets, names or characters.

## 2. Core loop

1. Players join a room, pick a hero and ready up.
2. After a 30-second build phase, creep waves start.
3. Creeps spawn at portals and walk three lanes toward the **Heart** (the base).
4. Players kill creeps with heroes and towers, earn gold and XP, build and upgrade towers, and level their heroes.
5. Creeps that reach the Heart damage it. Heart at 0 HP means defeat. Surviving the final wave means victory.

## 3. Map

- One map for now, **Crossroads**: top-down tile grid (1 tile = 32 px), about 80 × 60 tiles.
- The Heart sits bottom-centre. Three lanes (left, middle, right) run from spawn portals along the top edge down to the Heart.
- Lanes are fixed waypoint paths; creeps do not maze. Towers go on **build pads**, marked tiles beside the lanes. Heroes can walk anywhere walkable (grid pathfinding).
- Tile types: lane, open ground (walkable, not buildable), build pad, blocker (cliffs/trees, not walkable).

## 4. Creeps and waves

| Creep | Role | Notes |
|---|---|---|
| Grunt | Melee baseline | Most common |
| Archer | Ranged | Attacks heroes and towers in range |
| Runner | Fast, low HP | Punishes thin defences |
| Brute | Slow, high armour | Needs magic damage or focus fire |
| Wisp | Flying | Flies straight to the Heart; only anti-air towers and ranged heroes can hit it |
| Boss | Waves 10 / 20 / 30 | High HP, one special ability, leak damage 20: **Ironhorn** (10, Stomp), **Matriarch** (20, Hatch), **Shardback** (30, Shifting Hide) |

**Behaviour:** creeps walk their lane. If a hero comes within aggro range, they fight the hero and return to the lane once it leaves (leash range). Archers and Bosses also attack towers in range. A creep that reaches the Heart deals its leak damage (default 1) and despawns.

**Waves:** timed. A new wave starts every 40 s whether or not the last one is cleared. Any player can **call the next wave early** for bonus gold to everyone. Wave sizes grow from about 12 creeps to 60+ across all lanes (Phase 3: up to 120). Final wave: 30 (Phase 1: 10).

**Player-count scaling:** creep HP × (1 + 0.05 × (players − 1) + an early bonus by team size: +0.8 for 2 players, +3.4 for 3, +4.2 for 4 on wave 1, fading out by wave 11); creep count +30% per extra player. All numbers are tunable (see Architecture). (Phase 2 used a flat +50% HP and +25% count per extra player; see the Decision Log.)

## 5. Economy

- Each player has their **own gold**. Starting gold: 120 (150 before the Phase 3 balance pass).
- **Kill bounty** goes to the player whose hero or tower landed the killing blow.
- **Wave income:** every player gets flat gold at the start of each wave, scaling with wave number.
- **Call-early bonus:** paid to all players.
- **Selling** a tower refunds 70% of the total gold spent on it.
- **Heart HP:** 100, no regeneration.
- **Gold gifting** between teammates (Phase 3): give any whole amount of your gold to a connected teammate.

## 6. Towers

A tower is owned by the player who built it, and its kills credit that player. Towers build instantly on an empty build pad and have 3 upgrade tiers. The default target priority is **First** (closest to the Heart); Strongest and Closest are added in Phase 3.

| Tower | Hits | Behaviour | Phase |
|---|---|---|---|
| Arrow | Ground + air | Fast, single target | 1 |
| Cannon | Ground | Slow, splash damage | 1 |
| Frost | Ground + air | Low damage, slows 30% | 1 |
| Arcane | Ground + air | Magic damage | 3 |
| Flak | Air only | High burst damage | 3 |

**Damage types:** physical (reduced by armour) and magic (reduced by magic resist).

## 7. Heroes

Each player controls one hero. Heroes gain levels 1–10 from XP, which is shared among heroes near a creep when it dies. Q/W/E rank up to 4; R unlocks at level 6. Heroes use mana. A dead hero respawns at the Heart after 5 s + 2 s × level.

| Hero | Role | Q | W | E | R |
|---|---|---|---|---|---|
| Ranger | Ranged DPS | Multishot | Snare Trap (root) | Keen Eye (passive crit) | Arrow Storm (AoE) |
| Warden | Melee tank | Cleave | Taunt | Bulwark Aura (armour) | Last Stand (damage reduction + AoE stun) |
| Arcanist | Caster | Fireball (AoE) | Frost Nova (slow) | Clarity Aura (mana regen) | Meteor |

Phase 1 ships the Ranger only, with Q and W, max level 5. Phase 3 (heroes track) adds the Warden and the Arcanist, all Q/W/E/R and levels 1–10; E is passive for every hero. Skill mechanics are in the Decision Log.

## 8. Controls (desktop first)

- **Right-click:** move, or attack the clicked target. **A + left-click:** attack-move.
- **Q / W / E / R:** cast; targeted skills then take a left-click.
- **Left-click a build pad:** tower menu. Or press **B**, then **1–5**.
- **Left-click your own tower:** upgrade / sell panel.
- **Camera:** edge scroll, arrow keys, middle-mouse drag; mouse wheel zooms; **Space** centres on your hero.
- **Esc:** cancels targeting or building.
- Touch controls arrive in Phase 4.

## 9. Multiplayer

- 1–4 players, co-op only. No accounts: nickname + room code.
- **Create room** gives a 5-letter code and a share link (`?room=CODE`). **Lobby:** nickname, hero pick (duplicates allowed), ready; the host starts the match.
- **Server-authoritative.** The server runs the only real simulation. Clients send commands (move, attack, cast, build, upgrade, sell, call-early, ready). The server validates gold, range, cooldowns and ownership, and ignores invalid commands.
- The server runs a **fixed 20 Hz tick** and sends snapshots or deltas. Clients render about 100 ms behind using interpolation. No client-side prediction in v1, since RTS-style click commands tolerate latency. The UI gives instant local feedback (build ghost, click markers).
- **Reconnect:** a dropped player can rejoin within 60 s and gets their hero and gold back. A leaver's towers keep firing, and their hero returns to the Heart.
- **Hardening:** per-client command rate limit, message size cap, unknown message types rejected, nothing trusted from the client.
- **Performance targets:** 4 players with 300 creeps alive; client holds 60 FPS on a mid-range laptop; server tick under 10 ms; under 50 KB/s per client.

## 10. Architecture

Monorepo with npm workspaces and strict TypeScript throughout.

```
packages/sim        Pure game simulation. No DOM, no Node APIs, no networking.
packages/protocol   Command and snapshot message types, encode/decode.
apps/client         Vite + TypeScript + PixiJS for rendering; HTML/CSS for HUD and menus.
apps/server         Node + TypeScript WebSocket rooms (plain ws; see Decision Log).
```

**Rules**

- The sim is deterministic: fixed timestep and seeded RNG. No `Math.random()` or `Date.now()` inside `packages/sim`.
- The sim exposes roughly: `createGame(config, seed)`, `applyCommand(state, playerId, command)`, `step(state)`, `snapshot(state)`.
- The client never mutates game state. It only sends commands and renders snapshots.
- Phase 1 uses a **LocalTransport** that runs the sim in the browser (main thread or a Web Worker) with the same command/snapshot protocol as the network. Phase 2 swaps in a **NetworkTransport** without touching game code.
- All balance numbers live in one file: `packages/sim/src/tuning.ts`.
- Shapes-only graphics until Phase 4. Each entity type has a distinct shape and colour plus an HP bar.

**Deployment**

- **Client:** Vercel, as a static site. A root `vercel.json` sets the install command, the build command for `apps/client`, and the output directory, so that importing the repo root works.
- **Game server:** a container host that keeps WebSockets open for a whole match. It ships as a `Dockerfile` with a `/health` endpoint. Not Vercel: Vercel Functions WebSockets are pinned per instance and cut at the function duration limit, which doesn't suit 30-minute shared rooms. The host is chosen in Phase 2.
- The client reads the server URL from `VITE_SERVER_URL`.

**Testing**

- Vitest unit tests for every sim mechanic: targeting, damage and armour, slows, pathing, aggro and leash, economy, wave spawning, win/lose.
- **Headless balance run:** scripted bot players play a full match in tests. A sensible-build bot must win on default settings; a do-nothing bot must lose.
- Phase 2 onward adds a **server integration test**: 4 bot clients join one room and play 5 waves, and every client's final snapshot must match the server's.
- `npm test` and `npm run build` must pass before any push.

## 11. Phases

### Phase 1: Solo playable slice (local mode)

**Scope:**
- Monorepo scaffold; Crossroads map with the Heart, 3 lanes and build pads.
- Creeps: Grunt, Archer, Runner, Brute, Wisp, Boss. 10 waves, with Wisps from wave 5 and a Boss at wave 10.
- Towers: Arrow, Cannon and Frost at tier 1 only, plus sell.
- Ranger with Q and W, levels up to 5, respawn.
- Economy: gold, bounties, wave income, call-early.
- HUD: gold, Heart HP, wave number, next-wave timer, hero HP / mana / level / cooldowns.
- Victory and defeat screens with restart.
- LocalTransport.

**Done when:** it's playable on a Vercel preview; the balance bot wins all 10 waves and the do-nothing bot loses; tests and build are green.

### Phase 2: Online co-op

**Scope:**
- `apps/server` with rooms, codes and share link.
- Lobby: nickname, hero pick, ready.
- NetworkTransport with interpolation.
- Reconnect, command validation and rate limits.
- Player-count scaling.
- `Dockerfile` + `/health`, and deployment notes.

**Done when:** the 4-bot integration test passes, and two browsers can play one match together against a deployed server.

### Phase 3: Content

**Scope:**
- All 5 towers with 3 tiers each, and target priority.
- Warden and Arcanist; Q/W/E/R for all heroes up to level 10.
- 30 waves with 3 bosses.
- Armour and magic resist tuning.
- Gold gifting; hero item shop at the Heart (optional).

**Done when:** the balance bot wins on Normal with 1 player and with 4 players; tests are green.

### Phase 4: Polish

**Scope:**
- Touch controls.
- Minimap with team pings; quick-chat emotes.
- Sprites and sound.
- Difficulty modes (Easy / Normal / Hard).
- Balance pass.

### Out of scope

Accounts, persistence and leaderboards, PvP, public matchmaking, monetisation.

## 12. Working rules for Claude Code sessions

- One phase or one feature per session.
- Keep `CLAUDE.md` current: commands, repo layout, architecture rules, conventions.
- Balance changes go in `tuning.ts`, not scattered constants.
- If you make a design decision this doc doesn't cover, add a row to the Decision Log.
- End every session with a summary: what was built, how to test it, and any open questions.

## 13. Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-09-25 | Server-authoritative 20 Hz snapshots, not lockstep | Lockstep needs bit-identical simulation across browsers, which is fragile in JS. TD gameplay tolerates latency. |
| 2026-09-25 | Client on Vercel; game server on a separate container host | Vercel Functions WebSockets are limited by function duration and per-instance pinning. |
| 2026-09-25 | Every player controls one hero and can build towers | Combines co-op TD and Dota-style hero play. |
| 2026-09-25 | Design doc lives at `docs/GAME_DESIGN.md` (moved from the repo root) | Keeps the root tidy; `CLAUDE.md` points to it. |
| 2026-09-25 | Workspaces export TypeScript source directly (`@tdt/sim`, `@tdt/protocol`); no per-package build step. `npm run build` = `tsc` typecheck of every workspace + Vite build of the client | Simplest monorepo setup; Vite and Vitest compile TS from source. Revisit in Phase 2 if the server needs a bundled build. |
| 2026-09-25 | Toolchain: TypeScript 7, Vite 8, Vitest 5, PixiJS 8, Node ≥ 22.12 | Current stable releases at project start. |
| 2026-09-25 | LocalTransport runs the sim in a Web Worker (`SimHost`) and exchanges JSON-encoded protocol messages; full snapshot every tick | Proves the transport boundary before Phase 2; keeps the sim off the render thread. Delta snapshots are left to Phase 2. |
| 2026-09-25 | Match restart is a transport envelope (`{ t: 'restart' }`), not a sim command; the host only honours it once the match is over | Restarting creates a new game, which is a host concern, not a rule of the simulation. |
| 2026-09-25 | Sim events: sim code emits to `pendingEvents`; `step()` moves them to `events`, which the next `snapshot()` carries. Rejected commands emit a `rejected` event for the issuing player | Keeps `snapshot()` pure while giving the UI feedback (e.g. "Not enough gold"). |
| 2026-09-25 | Crossroads is generated deterministically in code: lane waypoints, 3-tile-wide lanes, 2×2 build pads every 5 tiles on both sides of each lane (59 pads), value-noise tree groves kept 5.5+ tiles from lanes, walkable pockets that can't reach the Heart are filled | Host and clients derive the identical map without sending it; the client imports it from `@tdt/sim`. |
| 2026-09-25 | Units: the sim works in tiles (floats); rendering multiplies by 32 px | Tuning reads naturally (ranges and speeds in tiles). |
| 2026-09-25 | Build pads are 2×2 tiles, one tower per pad; towers do not block hero movement | Readable tower size at 32 px tiles; avoids blocking hero paths. |
| 2026-09-25 | Towers have HP (500–550) and can be destroyed by Archers and the Boss; destroyed towers give no refund and there is no repair in Phase 1 | The doc says Archers and Bosses attack towers, which needs tower HP. |
| 2026-09-25 | Armour: physical damage × (1 − 0.06a / (1 + 0.06a)); magic damage × (1 − magic resist). The Frost tower deals magic damage | A familiar diminishing-returns formula; gives Phase 1 a magic source against Brutes. |
| 2026-09-25 | Tower "First" priority = least lane distance left to the Heart; a creep chasing a hero counts from where it left its lane. Wisps use straight-line distance | Matches "closest to the Heart" on non-straight lanes. |
| 2026-09-25 | Creep aggro 5 tiles, leash 9 tiles from where the creep left its lane; a leashed creep walks back and ignores heroes until it is on its lane again. Chasing creeps move in straight lines (the terrain near lanes is open) | Simple WC3-style behaviour without pathfinding for 300 creeps. |
| 2026-09-25 | Creeps spread randomly (±0.8 tiles, seeded RNG) around the lane line; no creep–creep collision | Avoids stacking visually at no simulation cost. |
| 2026-09-25 | Boss special ability (Phase 1 boss): **Stomp**, every 7 s when a hero or tower is within 3 tiles: 40 magic damage to heroes, stuns heroes and towers for 2 s | Gives the wave-10 boss a threat that interacts with both heroes and towers. |
| 2026-09-25 | Ranger Q **Multishot** is instant: one arrow at each of the N nearest creeps within attack range + 1 (N = 3/4/5/6). W **Snare Trap** is placed at a clicked point (range 8, the hero walks into range), arms after 0.5 s, triggers when a ground creep steps within 1.2 tiles, then roots and damages ground creeps within 2.5 tiles; Bosses are rooted for half as long and Wisps are unaffected | The doc names the skills but not their mechanics. |
| 2026-09-25 | Skill learning: the hero starts with Q and W at rank 1 and gets one skill point per level-up, spent with the HUD's "+" buttons (no hotkey, since Ctrl+W closes the browser tab) | Q/W "rank up to 4" needs a learn step; starting at rank 1 means both skills work from the first second. |
| 2026-09-25 | XP from a kill is split equally between living heroes within 12 tiles. Level thresholds 100/250/450/700 | The doc says XP is "shared among heroes near a creep". |
| 2026-09-25 | Heroes: an idle hero attacks creeps within attack range without chasing; attack-move engages creeps within 7 tiles. Heroes cannot attack towers or other heroes (co-op) | Predictable defaults for a directly controlled hero. |
| 2026-09-25 | Economy numbers: wave income 20 + 5 × (wave − 1); call-early bonus 0.5 gold per second left on the timer (paid to everyone); bounties 5–14 (Boss 150); towers cost 60 / 90 / 70 (Arrow / Cannon / Frost) | Tuned so the balance bot wins 10 waves with ~80–90 Heart HP and the idle bot loses around wave 8. |
| 2026-09-25 | Victory = the final wave has fully spawned and no creeps are alive. Once the match is over, every command is rejected | "Surviving the final wave" made precise. |
| 2026-09-25 | Player-count scaling is not applied in Phase 1 | It is listed in Phase 2 scope. |
| 2026-09-25 | Extra controls beyond §8: **S** stops the hero; right-click cancels targeting or build mode; **B** then **1–3** in Phase 1 (only 3 towers); with a pad selected, **1–3** builds there directly | Small conveniences consistent with RTS conventions. |
| 2026-09-25 | Balance gate: the sensible-build bot must win and the idle bot must lose on 5 fixed seeds (`balance.test.ts`); `npm run balance` prints the results | Makes the "Done when" criterion a test that has to keep passing. |
| 2026-09-25 | **Networking library: plain `ws`, not Colyseus** | The sim, the protocol and its validation already exist. Colyseus's schema state sync, rooms and matchmaking would duplicate them or have to be bent around them. `ws` gives direct control of the origin check, `maxPayload`, rate limits, close codes and graceful draining, and bundles to one small file. |
| 2026-09-25 | **Hosting: Render web service built from the root `Dockerfile`, Singapore region, one instance (`render.yaml`)**, Starter plan by default | Keeps WebSockets open for whole matches, supports zero-downtime deploys with a 300 s shutdown delay, and deploys from the repo with a health check. Singapore is closest to the expected players. The Free plan works but sleeps when idle. |
| 2026-09-25 | Server = one Node process: HTTP `/health` and WebSockets on one port, a single fixed 20 Hz loop ticking every room. `/health` `avgTickMs` is the whole loop's time over ~5 s | One loop is simple and makes "tick time" one number to watch and load-test against. |
| 2026-09-25 | Server bundled with esbuild into one CommonJS file; the runtime image is `node:22-alpine` + that file, with Node as PID 1 | Small image; SIGTERM reaches Node directly. |
| 2026-09-25 | Snapshots over the network: JSON keyframe on join/rejoin and every 200 ticks (10 s), JSON deltas (per-entity changed fields, adds, removals) every other tick, plus permessage-deflate | Delta roundtrip is exact (tested for thousands of ticks). The load test measured 9–20 KB/s per client (decompressed JSON) at 10–100 rooms, under the 50 KB/s target. A binary codec can come later if needed. |
| 2026-09-25 | Room codes: 5 letters, no I/O; **first letter = server shard (`SHARD`)**, 4 random. A server asked for another shard's code answers `wrong_server` | Lets a future router send each room to its server from the code alone, with no shared state. Documented in `docs/DEPLOY.md` §7; not built. |
| 2026-09-25 | Player ids are seat slots `p1`–`p4`; each seat has a random 128-bit reconnect token, kept in the tab's `sessionStorage` so a reload rejoins | Small ids; a token proves ownership of a seat without accounts. |
| 2026-09-25 | Lobby rules: the host has no ready toggle and starts when every other player is ready and connected; heroes lock at start; the host role passes to the next connected player if the host drops or leaves; after victory/defeat only the host can return the room to the lobby ("Back to lobby") | The doc says "the host starts the match" but leaves the details open. |
| 2026-09-25 | Reconnect: a dropped seat is kept 60 s. While disconnected, the hero walks back to the Heart and waits; towers keep firing and gold is kept. After 60 s the player counts as left (towers keep firing, no rejoin). A room with nobody connected closes after 60 s | Follows §9, with the timing made precise. |
| 2026-09-25 | Hardening: `Origin` allow-list (`ALLOWED_ORIGINS`, `*` = one DNS-label run; missing Origin rejected; mandatory in production); 1 KB `maxPayload`; binary frames and unknown or malformed messages rejected; per-client token bucket of 25 msg/s, burst 50; more than 50 violations closes the socket with 1008; ws ping every 15 s drops dead peers | §9 hardening. The origin check blocks other websites from driving players' browsers; it is not authentication. |
| 2026-09-25 | Graceful shutdown: on SIGTERM the server refuses new connections (503) and rooms, sends everyone a `server_restarting` notice, closes lobbies and finished matches right away (code 1012), and lets running matches continue up to `SHUTDOWN_GRACE_SECONDS` = 280 s before closing them. Render `maxShutdownDelaySeconds` = 300 (the maximum) | A deploy doesn't cut off a match that is about to end, and everyone is told what is happening. Room state is not persisted across restarts. |
| 2026-09-25 | Player-count scaling (Phase 2): creep HP × (1 + 0.5 × (players − 1)); creeps per lane × (1 + 0.25 × (players − 1)), rounded; **bosses are not multiplied** (their HP scales). Values in `tuning.ts` `playerScaling` | The doc's formula; a wave-10 "boss" should stay one boss. |
| 2026-09-25 | Client: `VITE_SERVER_URL` set → lobby (create / join / invite link `?room=CODE`), plus a "Play solo offline" button using LocalTransport; unset → Phase 1 local solo straight away. `NetworkTransport` turns keyframes and deltas into full snapshots, so the renderer and HUD are unchanged | Online mode needs no changes to game code; offline still works if the server is down. |
| 2026-09-25 | Load test (`npm run loadtest`): rooms of 4 balance bots over real WebSockets, run in worker threads; hosts call the first wave early and restart finished matches; ramps until `/health` `avgTickMs` > 10 ms and reports the last room count under it | Measures the doc's "server tick under 10 ms" target in rooms per instance. |
| 2026-09-25 | **Phase 3 towers.** Arcane: magic damage (ignores armour), ground + air, 100 gold. Flak: air only, 80 gold, heavy physical bursts with a small splash that hits only flyers | The doc gives the roles; the numbers make Arcane the answer to Brutes and Flak the answer to Wisp packs. |
| 2026-09-25 | Tower tiers: every tower has 3 tiers in `tuning.ts` (`towers[kind].tiers`). An upgrade costs the next tier's `cost`, is instant, and raises damage, range, attack speed, splash / slow and max HP; current HP rises by the same amount as max HP. Selling refunds 70% of build + upgrades. Frost's slow grows 30% → 35% → 40% | "3 upgrade tiers" made concrete. Instant upgrades match instant builds. |
| 2026-09-25 | Only a tower's owner can upgrade it or change its priority (same rule as selling). Upgrades and priority changes are the `upgrade` and `setPriority` commands | Consistent with per-player gold and "click your own tower". |
| 2026-09-25 | Target priorities: **First** (least path left to the Heart, the default), **Strongest** (most *current* HP), **Closest** (nearest the tower). Ties fall back to First, then list order. Towers never switch target mid-flight; they pick again for each shot | Current HP rather than max HP, so Strongest keeps hitting the healthiest creep. Deterministic tie-breaks keep the sim deterministic. |
| 2026-09-25 | Tower panel shows each stat with its next-tier value (e.g. `26 → 40`), the upgrade cost, First / Strongest / Closest buttons and sell. **U** upgrades the selected tower; **B** then **1–5** builds. Tier = gold pips on the tower | Controls beyond §8. |
| 2026-09-25 | **`PROTOCOL_VERSION`** (now 2) in `@tdt/protocol`. The server sends `{ t: 'hello', v }` on connect; `create` / `join` / `rejoin` carry `v`, and the server answers a mismatch with `version_mismatch` + close code 4001. The client then stops reconnecting and shows "New version available — refresh" | Client and server deploy separately (Vercel / Render); a stale tab must not talk a changed protocol. `hello` is tiny and fixed, so even a future client with a reshaped entry message learns the server's version. |
| 2026-09-25 | The balance bot still builds only Arrow / Frost / Cannon and never upgrades | Keeps the Phase 1 balance gate unchanged while the other Phase 3 tracks (heroes, 30 waves) land; revisit when tuning 30 waves. |
| 2026-09-25 | **Phase 3 waves: 30 waves**, 12 creeps in wave 1 growing to 120 in wave 30 (solo, before player scaling). Waves 1–10 keep the Phase 1 lists; waves 15 and 25 are air-heavy. Written with a `w({ kind: perLane }, boss?)` helper in `tuning.ts` | The doc's "up to 120" and "final wave: 30". The last wave still spawns within the 40 s interval (40 per lane × 0.9 s). |
| 2026-09-25 | **Three distinct bosses**, one per boss wave, each a creep kind with `boss: true` in `tuning.ts`: **Ironhorn** (wave 10) keeps Phase 1's **Stomp**; **Matriarch** (wave 20) **Hatch**: every 6 s summons 3 hatchlings around itself that carry on down its lane (at most 24 per Matriarch); **Shardback** (wave 30) **Shifting Hide**: starts in Stone hide (+25 armour) and swaps to Ether hide (+0.6 magic resist) and back every 8 s. Boss code lives in `sim/src/bosses.ts`. Hatchlings are a new small creep kind (30 HP, bounty 1) that never appears in wave lists | Each ability tests something different: positioning (Stomp), splash / wave-clear (Hatch), and mixing physical and magic damage (Shifting Hide). The hatch cap keeps a stalled Matriarch from flooding the map. |
| 2026-09-25 | Bosses keep "not multiplied by player count" and "rooted for half as long" via the `boss` flag, not a `'boss'` kind. The HUD banner names the boss and shows a one-line hint; Shardback's hide shows as a coloured ring and a toast | Three kinds need a shared flag; players need to know which damage type to use. |
| 2026-09-25 | **Damage types everywhere**: one rule, `damageMultiplier` in `combat.ts`, for creeps, heroes and towers. Physical × armour formula, magic × (1 − magic resist), magic resist capped at 0.9. Towers now have armour (Arrow 2, Cannon 4, Frost 2, Arcane 2, Flak 2; per tower kind, the same at every tier) and magic resist (0); heroes have magic resist (Ranger 0.1). Creeps carry their own current armour / magic resist (sent in `CreepSnap`), starting from base stats + 0.1 armour per wave after the first | Phase 1 only reduced damage to creeps (and heroes' physical). Per-creep values let bosses change theirs and let armour grow over 30 waves. |
| 2026-09-25 | Creep magic resist tuning: Archer 0.15, Wisp 0.25, Matriarch 0.2, Ironhorn/Shardback 0.1, others 0. Brutes stay armoured with no magic resist ("needs magic damage") | Gives both damage types a job (Arcane and Frost deal magic, the rest physical). |
| 2026-09-25 | **Bounty growth**: bounty × (1 + 0.03 × (wave − 1)), rounded (wave 30 ≈ ×1.9). Boss bounties: 150 / 200 / 300 | Keeps kills worth something as HP grows; income was flat per kill in Phase 1. |
| 2026-09-25 | **Gold gifting** is a sim command `{ type: 'gift', to, amount }`. The codec only accepts an integer amount from 1 to 1,000,000 and a short id-like `to`; the sim rejects gifts to yourself, to unknown players, to an away (disconnected) teammate, of more than you have, or after the match. A `gift` event tells both players. The HUD's team panel (online) shows each teammate's gold with "Give 25" / "Give 100" buttons | Simple and fully server-validated; gifting to an away teammate would park gold where nobody can spend it. |
| 2026-09-25 | Balance with 30 waves: the solo balance gate is now "wins all 30 waves" (it wins with 76–88 Heart HP, ~25–27 min). **4 balance bots do not yet win**: they fall around wave 21, because the balance bot only builds tier-1 Arrow / Frost / Cannon: 59 pads of them can't keep up with 4-player HP scaling, and archers wear the towers down. `npm run balance` prints the 4-player result; it is not a test yet | 4-player balance needs the bot to use tower upgrades and Arcane / Flak before it can be a gate. |
| 2026-09-25 | `PROTOCOL_VERSION` 3: adds the `gift` command, `hatch` / `hideShift` / `gift` events, the boss and hatchling creep kinds (replacing `boss`) and `armor` / `magicResist` on `CreepSnap` | Commands, events and snapshots changed shape. |
| 2026-09-25 | **Hero levels and skill points (Phase 3):** max level 10, total XP 0/100/250/450/700/1000/1350/1750/2200/2700. Heroes still start with Q and W at rank 1 and get one point per level-up (9 by level 10, so not everything can be maxed). Q/W/E rank up to 4 at any level; R has 3 ranks, learnable at levels 6, 8 and 10 (`tuning.hero.ultimateLevels`) | "Q/W/E rank up to 4; R unlocks at level 6" made precise; three R ranks spread over the levels left |
| 2026-09-25 | Learning: **Shift+Q/W/E/R** or the HUD "+" (Ctrl stays off-limits). The snapshot's skill entries carry `learnable`, `nextRankLevel`, `passive` and `radius`, so the HUD and bots don't recompute rules. The level-up toast names the ultimate when it unlocks | Keyboard learning without the Ctrl+W tab-close risk |
| 2026-09-25 | **Ranger E Keen Eye** (passive): auto-attacks crit 15/20/25/30% for ×1.75/2/2.25/2.5 (seeded RNG; no roll until learned). **R Arrow Storm**: point, range 10, radius 3; 6 pulses over 3 s of 30/45/60 physical damage to ground and air creeps | The doc names the skills; these are the mechanics |
| 2026-09-25 | **Warden** (melee: hits land at once, cannot hit flyers; 480 HP, 5 armour, 0.1 magic resist). **Q Cleave**: instant physical hit on ground creeps within 2.2 tiles. **W Taunt**: ground creeps that can attack, within 4.5 tiles, chase the Warden and ignore their leash for 2–3.5 s. **E Bulwark Aura**: +2/4/6/8 armour to heroes within 8 tiles (the Warden too). **R Last Stand**: 40/50/60% less damage taken for 6/7/8 s and a 1.5/2/2.5 s stun on ground creeps within 3 tiles. Cleave, Taunt and Multishot with nothing in reach are rejected and cost nothing | The doc names the skills; a melee tank that pulls creeps off the lane and protects allies |
| 2026-09-25 | **Arcanist** (ranged, **magic** auto-attacks; 200 mana, 0.2 magic resist). **Q Fireball**: a bolt to a point (range 8) exploding for magic damage on ground and air creeps within 2 tiles. **W Frost Nova**: instant at a point (range 7): magic damage and a 35–50% slow for 3 s, radius 2.5, ground and air. **E Clarity Aura**: +1/1.75/2.5/3.25 mana/s to heroes within 8 tiles. **R Meteor**: point (range 9); after 1.2 s, 220/330/440 magic damage and a 1/1.5/2 s stun on ground creeps within 3 tiles | The doc names the skills; the caster is the magic-damage answer to armoured creeps |
| 2026-09-25 | Auras include their owner, reach only heroes (not towers, for now), and don't stack: the highest rank of each aura kind applies | Simple and predictable with several Wardens or Arcanists |
| 2026-09-25 | Crowd control: a **stunned** creep neither moves nor attacks (a stunned boss can't use its ability). Stuns and taunts last half as long on bosses (`boss` flag, `combat.bossControlFactor`), like the Snare Trap's root | Keeps the Boss threatening |
| 2026-09-25 | Arrow Storm and Meteor are sim **zones** (`GameState.zones`, snapshot `zones` with start/end ticks for the client's warning circle). Skill visuals use new `aoe` and `crit` events. Hero snapshots add `shielded` (Last Stand), creep snapshots `stunned` | Delayed and lingering effects need state; events give instant feedback |
| 2026-09-25 | Local solo mode opens a **hero pick** (the lobby card with the three hero cards). The local host treats the lobby's `hero` message as "start a new match with this hero", only before the first wave or after the match ends; "Play again" keeps the hero. Online, "Play solo offline" uses the hero picked on the home screen | Reuses an existing message; no protocol change for solo |
| 2026-09-25 | Balance bot: learns R as soon as it unlocks, otherwise its lowest-ranked skill; casts R, then Q, then W on groups (point skills aim at the densest creep), keeping mana for a ready R. The balance gate now also requires a solo win of all 30 waves with the Warden and with the Arcanist on the 5 seeds (each reaches level 10, 68–90 Heart HP left) and idle losses with both. Multi-player teams (any hero mix) still fall around wave 21–23, for the tower reason in the 30-wave balance row, so there is no team gate yet; `npm run balance` prints a 4-bot mixed team | Every hero has to be able to carry a solo match on default settings |
| 2026-09-25 | `PROTOCOL_VERSION` 4: Warden and Arcanist hero kinds; skill snapshots gain `radius` / `passive` / `learnable` / `nextRankLevel`; `shielded` on heroes, `stunned` on creeps; snapshot `zones`; `aoe` and `crit` events | Snapshots, events and lobby hero values changed shape. |
| 2026-09-25 | **Phase 3 balance pass — target:** on Normal, balance bots win all 30 waves **with 40–80 Heart HP left** with 1 player (every hero), 2 players (Ranger + Warden, Warden + Arcanist, Arcanist + Ranger) and 4 players (Ranger, Warden, Arcanist, Ranger), on the 5 gate seeds; the idle bot still loses. Required tests: `balance.test.ts` / `balanceHeroes.test.ts` (solo), `balanceDuo.test.ts` (one pair per seed), `balanceTeam.test.ts` (4 players); `HEART_TARGET` in `test/helpers.ts` | "A challenge, not a walkover" made testable for every team size the doc names, plus 2 players. |
| 2026-09-25 | **Balance bot plays the full game.** Towers: an 8-slot cycle (Arrow, Frost, Cannon, Arcane, Arrow, Cannon, Flak, Arcane) that reads the static wave list: after 3 general towers it adds the team's first **Flak before a wave with flyers** (current or next wave) and the first **Arcane before Brutes or a Stone-hide boss** (3-wave lookahead); cycle slots for Flak / Arcane become Arrow / Cannon while nothing coming needs them. With every pad taken it upgrades its lowest-tier towers, best pads first — **Arcane first while the Shardback is coming**. Cannon and Arcane target **Strongest**; any tower with a boss in range switches to Strongest. Hero: guards near the Heart; **from wave 12, once it has R, it plays forward** 35 tiles up its own lane (teammates take mid, west, east, mid) and, with R ready, walks to the biggest group within 25 tiles of that post; it hunts a live boss, and in the final wave the last ≤ 5 creeps. Works for any hero mix and 1–4 players | Without upgrades a team hit the 59-pad cap; without Strongest, bosses and archers that stop to hit towers lived for waves behind fresher creeps. A share-based build (towers in proportion to Wisp / armoured HP) lost to the fixed cycle in every test, because Arcane and Flak are poor value early; forcing counters from the first tower wasted the early gold. Moving forward as soon as R unlocks (~wave 7) left side lanes open in solo. The final-wave hunt fixes a stall: an Archer shooting an air-only Flak it outranges never died, and the rebuilt Flak kept it busy forever. |
| 2026-09-25 | **Bulwark Aura also covers towers:** towers within 8 tiles of a Warden with E get its armour bonus against every hit (`bulwarkBonus` takes any position). Aura values unchanged (+2/4/6/8) | Design decision for this pass. Halving the values was tried and made no measurable balance difference. |
| 2026-09-25 | **Player-count scaling reshaped:** creep HP × (1 + `hpPerExtraPlayer` (0.05) × (players − 1) + `earlyHpBonus`[players − 1] × max(0, 1 − (wave − 1) / `earlyWaves` (10))), with `earlyHpBonus` = [0, 0.8, 3.4, 4.2]; creep count +30% per extra player (was a flat +50% HP, +25% count). At 4 players: ×5.35 HP on wave 1, ×1.15 from wave 11. Bosses still aren't multiplied in count | A team has all its gold and heroes from wave 1 but shares one set of 59 pads with a solo player, so its power grows fast early and hits the same cap late. Any flat multiplier was either a walkover early or a collapse late (heroes holding back a growing backlog until they all die, then 2–3 waves leak at once). Front-loading the pressure makes teams leak gradually in waves 3–11, like a solo player. The bonus is a table because team strength isn't linear in size: 2 heroes can't cover three lanes, 3+ can. |
| 2026-09-25 | **Retune:** starting gold 150 → 120; creep HP growth 0.12 → 0.17 per wave; XP share radius 12 → 22 tiles | Solo won with 85–94 Heart and ~3,000 unspent gold once it could upgrade; more HP growth gives the late game pressure, less starting gold makes the first waves bite. 0.18 already tipped some solo and 4-player runs into a mid-game collapse. Stronger towers took kills far from the heroes, who stopped reaching level 10; the wider XP radius keeps them levelling. |
| 2026-09-25 | **Balance results (gate seeds 1, 2, 3, 42, 1234; `npm run balance`):** solo Ranger 66–73, Warden 65–74, Arcanist 54–80; 2 players Ranger + Warden 44–66, Warden + Arcanist 62–76, Arcanist + Ranger 54–69; 4 players 52–79; every idle bot loses (waves 6–8). Over 20 seeds all 260 balance-bot runs win: solo Ranger 34–77, Warden 62–81, Arcanist 13–80; 2 players 37–85 (56 of 60 in range); 4 players 44–87 (15 of 20 in range). Not gated: 3 players 24–93 (about half in range) | Results swing ±15–20 Heart HP between seeds; the gate seeds all land in range, the wider runs mostly do. |
| 2026-09-25 | **"Change hero" on the solo end screen** (next to "Play again"; hidden online): reopens the solo hero pick, and the local host starts a new match with the new hero (the `hero` message it already accepts after a match ends). Also after "Play solo offline" | Design decision for this pass; no protocol change. |
| 2026-09-25 | Kept as they are: **tower upgrades stay owner-only** (like selling and priority), and **gifts to disconnected teammates stay rejected** | Design decision for this pass; both already enforced and tested in `applyCommand`. |
