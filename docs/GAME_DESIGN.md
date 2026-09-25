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
| Boss | Waves 10 / 20 / 30 | High HP, one special ability, leak damage 20 |

**Behaviour:** creeps walk their lane. If a hero comes within aggro range, they fight the hero and return to the lane once it leaves (leash range). Archers and Bosses also attack towers in range. A creep that reaches the Heart deals its leak damage (default 1) and despawns.

**Waves:** timed. A new wave starts every 40 s whether or not the last one is cleared. Any player can **call the next wave early** for bonus gold to everyone. Wave sizes grow from about 12 creeps to 60+ across all lanes (Phase 3: up to 120). Final wave: 30 (Phase 1: 10).

**Player-count scaling:** creep HP × (1 + 0.5 × (players − 1)); creep count +25% per extra player. All numbers are tunable (see Architecture).

## 5. Economy

- Each player has their **own gold**. Starting gold: 150.
- **Kill bounty** goes to the player whose hero or tower landed the killing blow.
- **Wave income:** every player gets flat gold at the start of each wave, scaling with wave number.
- **Call-early bonus:** paid to all players.
- **Selling** a tower refunds 70% of the total gold spent on it.
- **Heart HP:** 100, no regeneration.
- **Gold gifting** between teammates arrives in Phase 3.

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

Phase 1 ships the Ranger only, with Q and W, max level 5.

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
apps/server         Node + TypeScript WebSocket rooms (Colyseus or plain ws; decide in Phase 2 and log it).
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
