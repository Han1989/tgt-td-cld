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
