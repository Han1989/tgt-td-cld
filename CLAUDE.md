# CLAUDE.md

**Source of truth: [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)**, plus [`docs/MOBILE.md`](docs/MOBILE.md) for Phase 4 (mobile) and [`docs/REPLAYABILITY.md`](docs/REPLAYABILITY.md) for Phase 5. Read them first. Build only the phase or feature you were asked for. When you make a design decision the docs don't cover, add a row to the Decision Log in `GAME_DESIGN.md` (§13).

Current status: **Phases 1 (solo, local mode), 2 (online co-op) and 3 (content) are done.** Phase 4a (mobile, `docs/MOBILE.md` §9) is in progress: **track 1 is done**: Spire is the only map (portrait, with a safe zone under the touch controls), pad zones per player with extra pads for 3–4 players, heroes auto-attack while moving, the creep anti-stall rule, a balance bot that plays by zones and only walks, and the full-mode balance gate on Spire (1, 2 and 4 players at 40–80 Heart HP). **Track 3 (Quick mode, §6) is done**: a `full` / `quick` match option (15 waves, bosses on 5/10/15, compressed difficulty) picked by the host in the lobby or in the solo pick, with its own balance gate. **Track 2 is done** (portrait client: layouts, touch controls, PWA, browser tests), waiting on the real-device checklist in [`docs/MOBILE_TESTING.md`](docs/MOBILE_TESTING.md). **Phase 4b (polish) has started with the effects pass** (client-only, code-drawn effects: hits, deaths, tower shots, every hero skill, the Heart, portals, banners, HUD feedback); sprites, sound, pings and difficulty modes are still to do. Deployment steps are in [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Commands

Run everything from the repo root. You need Node ≥ 22.12 and npm workspaces.

| Command | What it does |
|---|---|
| `npm install` | Install all workspaces |
| `npm run dev` | Start the Vite dev server for the client (http://localhost:5173); local solo mode unless `VITE_SERVER_URL` is set |
| `npm run dev:server` | Run the game server with reload (ws://localhost:8080; allows localhost:5173/4173) |
| `VITE_SERVER_URL=ws://localhost:8080 npm run dev` | Client in online mode (lobby) against the local server |
| `npm test` | Vitest across all workspaces: unit tests, headless balance runs, the 4-bot server integration test |
| `npm run test:e2e` | Playwright browser tests (`apps/client/e2e`): builds `apps/client/dist-e2e` with `--mode e2e`, then runs portrait iPhone / Pixel emulation, desktop, PWA and the 300-creep stress test in Chromium (~2 min) |
| `npm run build` | Typecheck every workspace (`tsc`), build the client to `apps/client/dist`, bundle the server to `apps/server/dist/index.cjs` |
| `npm run loadtest [-- --url wss://… --origin …]` | Ramp rooms of 4 bots until the server's average tick exceeds 10 ms (see docs/DEPLOY.md §6) |
| `npm run typecheck` | Typecheck only |
| `npm run preview` | Serve the production build locally |
| `npm run balance [quick] [solo\|teams\|2p\|3p\|4p] [seeds…]` | Print solo balance-bot and idle-bot results for every hero, plus mixed teams (three 2-bot pairs, 3 and 4 bots), with Heart HP lost per third of the match, in Full mode (or Quick with `quick`); use it after editing `tuning.ts` or `bots.ts` |
| `npm run map` | Print the map as ASCII (lanes, pads by zone, extra pads, safe zone); use it when editing `maps/*.ts` |
| `npm run icons -w @tdt/client` | Regenerate the PWA icons (`apps/client/public/icons`) |
| `/?stress=300` (any build) | Render stress scene: 300 creeps, a tower on every pad, every effect busy (hits, kills, skills, zones), an FPS readout; no simulation |
| `npx vitest run --project sim` | Tests for one workspace (`sim`, `protocol`, `client` or `server`) |
| `docker build -t tdt-server .` | Build the server image exactly as Render does |

`npm test` and `npm run build` must pass before any push. Run `npm run test:e2e` after client changes (layout, input, HUD, PWA).

## Repo layout

```
docs/GAME_DESIGN.md        Design and build plan (source of truth)
docs/DEPLOY.md             Render + Vercel setup, env vars, operations, room-code routing design
packages/protocol/         @tdt/protocol: wire contract
  src/types.ts             PROTOCOL_VERSION, Command, Snapshot, GameEvent, lobby types, Client/ServerMessage
  src/codec.ts             encode/decode; strict validation of untrusted client messages (names, codes, tokens)
  src/delta.ts             diffSnapshot / applySnapshotDelta (network deltas)
packages/sim/              @tdt/sim: pure deterministic simulation
  src/tuning.ts            ALL balance numbers (one file); `modes` = per-mode overrides, `tuningForMode` merges them
  src/game.ts              createGame, step, snapshot
  src/commands.ts          applyCommand: validation (gold, ownership, cooldowns, gifts…)
  src/map.ts               Map data format (MapData) and buildMap: tiles, lanes, pads with zones, safe zone
  src/maps/spire.ts        Spire (26×50, portrait): the only map; pure data
  src/pads.ts              Pad zones: padLayout (which pads exist for a team and who owns them), padBlocker
  src/pathfinding.ts       Hero A* on the tile grid
  src/waves.ts             Wave timer, income, call-early, spawning, player-count scaling
  src/creeps.ts            Lane walking, aggro/leash, taunts, stuns, tower attacks (anti-stall limit), leaks
  src/bosses.ts            Boss abilities: Ironhorn Stomp, Matriarch Hatch, Shardback Shifting Hide
  src/towers.ts            Tower targeting (First/Strongest/Closest), upgrades, projectiles, Snare Traps
  src/heroes.ts            Hero orders, auto-attack while idle or moving (melee / ranged, Keen Eye crits), respawn
  src/skills.ts            Q/W/E/R of every hero: ranks and learning (R from level 6), casts, zones (Arrow Storm, Meteor)
  src/combat.ts            Damage rule (physical vs armour, magic vs magic resist), auras, stuns, kills, bounty, XP, levelling
  src/bots.ts              Balance bot (own-zone pads, full tower kit from the wave list, upgrades, priorities; a hero that only walks) and idle bot
  src/headless.ts          runHeadlessMatch for balance tests (Heart lost per third, boss leaks)
  test/                    Vitest unit tests + balance*.test.ts
  scripts/balance.ts       `npm run balance`
  scripts/map.ts           `npm run map`
apps/client/               @tdt/client: Vite + PixiJS + HTML/CSS HUD
  src/main.ts              Chooses local solo (hero pick, no VITE_SERVER_URL), online (lobby) or the ?stress scene; sets up the PWA
  src/gameView.ts          Pixi app + HUD + controls + snapshot buffer, fed by any Transport; applies the layout (camera fit / follow),
                           routes menus (radial vs desktop panels), quality, pause / wake / Wake Lock, the e2e debug hook
  src/layout.ts            Pure layout: tall (phone) / wide (tablet, desktop) / rotate, tile size, control geometry, hero follow (tested)
  src/touch/gestures.ts    Pure touch rules: joystick, tap vs drag, smart cast, drag-aim + cancel, snap + tie picker, hold-to-sell, radial placement (tested)
  src/touch/touchControls.ts  Touch overlay (joystick, Q/W/E/R), map taps, radial build menu, tower ring, picker
  src/settings.ts          Settings in localStorage (controls layout, quality)
  src/stress.ts            ?stress=N scene: a fake Transport with N synthetic creeps
  src/platform/pwa.ts      Service worker registration, update banner, install prompt / iPhone sheet
  src/online.ts            Online flow: lobby ↔ NetworkTransport ↔ game view
  src/lobby/               Lobby screens (nickname, hero, mode, create/join, ready/start, invite link), hero and mode cards, solo pick
  src/heroInfo.ts          Hero and skill names / descriptions (display text only)
  src/padInfo.ts           Pad ownership as the client sees it (yours / a teammate's / not in this match)
  src/transport/           Transport interface, LocalTransport (Web Worker), SimHost, NetworkTransport
  src/snapshotBuffer.ts    Renders ~100 ms behind with interpolation
  src/render/              Pixi world renderer (shapes only; sprite pools, culling, entity scale), palette, quality.ts (DPR cap, Auto → Low, fxLevel)
  src/render/fx/           Effects: atlas.ts (canvas atlas), effects.ts (pooled particle layers + recipes), hits.ts (hits from HP drops),
                           shake.ts, motion.ts, numbers.ts (pure ones are tested)
  src/input/               Camera (frame fit, min zoom = fit, locked on phones) and mouse/keyboard controls (mouse pointers only)
  src/hud/                 DOM HUD, desktop tower panels, end screen, settingsPanel.ts; towerInfo.ts = tower stat text (DOM-free, tested);
                           counter.ts (smooth numbers, tested), coins.ts (coins flying to the gold counter), press.ts (button feedback)
  test/                    Client unit tests (node environment, no DOM; NetworkTransport vs a real server)
  e2e/                     Playwright browser tests (mobile / desktop / platform / perf specs; helpers.ts)
  playwright.config.ts     Projects: iphone, pixel (Chromium mobile emulation), desktop
  vite.config.ts           Also generates the service worker (sw.js) at build time
  public/                  manifest.webmanifest, icons/, favicon
  scripts/icons.ts         Generates the PWA icons
apps/server/               @tdt/server: Node + ws game server
  src/index.ts             Entry: env config, listen, SIGTERM → graceful drain
  src/server.ts            HTTP /health + WebSocket upgrade (origin check), connections, tick loop, drain
  src/room.ts              Lobby + authoritative match, reconnect seats, keyframe/delta broadcast
  src/config.ts            Env parsing (ALLOWED_ORIGINS, SHARD, …) and defaults
  src/origins.ts, roomCode.ts, rateLimit.ts, stats.ts
  src/testing/botClient.ts Bot player over a real WebSocket (tests + load test; not bundled)
  test/                    Integration (4 bots, 5 waves), lobby, reconnect, hardening, shutdown
  scripts/loadtest.ts      Load test (+ loadtestWorker.ts)
Dockerfile, .dockerignore  Server image (build from the repo root)
render.yaml                Render Blueprint for the server (Singapore, /health, 300 s shutdown delay)
vercel.json                Vercel static deploy of apps/client
```

## Architecture rules

- **The sim is pure and deterministic.** `packages/sim` has no DOM, no Node APIs and no networking. Its tsconfig uses `lib: ES2022` and `types: []`, so using them fails to compile. It uses a fixed 20 Hz timestep (`TICK_RATE`) and the seeded RNG in `rng.ts` (state is kept in `GameState.rng`). **Never** use `Math.random()`, `Date.now()` or `performance.now()` in `packages/sim`; a test enforces this.
- **The sim API** is `createGame(config, seed)`, `applyCommand(state, playerId, command)`, `step(state)` and `snapshot(state)`. The state is a plain, mutable, JSON-able object. `snapshot()` never mutates it. Hosts also call `setPlayerConnected` (drop / rejoin) and `setPlayerLeft` (gone for good: their empty pads open to everyone).
- **Match modes are tuning.** `createGame(config, seed)` takes `config.mode` (`full` default, or `quick`) and stores `tuningForMode(tuning, mode)` in `state.tuning`: the engine only ever reads `state.tuning`, never the mode. Mode numbers live in `TUNING.modes.<mode>` (partial `economy` / `waves` / `playerScaling` / `hero.xpForLevel`). Code outside the sim that needs a mode's numbers (bots, HUD) calls `tuningForMode(TUNING, snap.mode)`.
- **Maps are data.** A map is a `MapData` object (`src/maps/*.ts`): size, lanes (waypoints, portal first, Heart last), Heart, hero spawn, pads with zone tags (`west` / `mid` / `east` / `core`, `extra` for bigger teams), pad size and the safe-zone row. `buildMap` derives the tile grid; `getMap()` returns Spire. Never hard-code map coordinates in engine code or bots: derive them from the map (lanes, `heroSpawn`, pads).
- **Pad zones:** `padLayout` decides which pads exist for a team (base pads, plus `tuning.pads` extra pads per lane zone and Core pads by player count) and who owns them (solo: all; 2 players: West + west half of Mid / East + east half; 3: West / Mid / East; 4: + Core). `state.pads` / `snapshot.pads` hold `{ id, owner }` (owner `null` = open to all). `build` is rejected on pads that aren't in the match or belong to a teammate.
- **Events:** sim code emits into `state.pendingEvents`. At the end of `step()` they move to `state.events`, which the next `snapshot()` carries. Hosts apply commands, then `step`, then `snapshot`.
- **The client never mutates game state.** It sends `Command`s through a `Transport` and renders `Snapshot`s. Client-only UI state (input mode, selection, markers) lives in `uiState.ts`.
- **Transport:** `LocalTransport` runs `SimHost` in a Web Worker; `NetworkTransport` talks to the game server. Both exchange *encoded* protocol messages and both deliver complete `{ t: 'snapshot' }` messages to the game view. `NetworkTransport` rebuilds them from keyframes + deltas, so the renderer and HUD never see deltas.
- **The server is authoritative.** Each room owns the only real `GameState`. Commands are queued as they arrive and applied at the start of the next tick, in arrival order; then `step`, `snapshot`, and a broadcast (a full snapshot for new or reconnected clients and every `keyframeEveryTicks`, otherwise one encoded delta shared by all clients). Never trust anything from the client beyond a decoded message.
- **Rooms are self-contained** (lobby, sim, sockets in one process). Room codes start with the server's `SHARD` letter so a future router can route by code (docs/DEPLOY.md §7). Keep Render at one instance per shard.
- **Server config comes from env** (`config.ts`). Tests build configs with `defaultConfig({...})`, e.g. `tickMs: 1` to run game time fast.
- **Damage:** every hit goes through `damageMultiplier` (`combat.ts`): physical is reduced by armour, magic by magic resist, for creeps, heroes and towers alike. Creeps carry their current `armor` / `magicResist` (bosses change theirs). Bosses are creep kinds with `boss: true`; test for the flag, never for a kind name.
- **All balance numbers live in `packages/sim/src/tuning.ts`.** Durations are in seconds, distances in tiles and speeds in tiles/s. Convert with `secondsToTicks`. Don't scatter constants. Hero skills live under `tuning.hero.<kind>.<skill>`, with per-rank arrays (4 entries for Q/W/E, 3 for R).
- **Hero skills:** `skills.ts` owns every Q/W/E/R (`SKILL_MODES` says instant / point / passive). A new skill needs its tuning, a case in `skillInfo`'s tables and `castInstant` / `castAtPoint`, display text in `apps/client/src/heroInfo.ts`, and a test in `packages/sim/test/heroes.test.ts`.
- **Units:** the sim works in tiles (floats). The renderer multiplies by `TILE_PX` (32). Pads are `map.padSize` tiles square (3 on Spire).
- **Layout and touch (docs/MOBILE.md §4–5):** `computeLayout` decides everything about the screen (tall / wide / rotate, tile size, control positions, follow range) from the viewport, safe-area insets, touch and orientation; `GameView` applies it. Top bar is 44 px (the map must fit 412 × 839). Keep layout and gesture rules as pure functions in `layout.ts` / `touch/gestures.ts` with unit tests; `touchControls.ts` only wires them to DOM and pointer events. Canvas input splits by pointer type: mouse → `Controls`, touch / pen → `TouchControls`. Radial menus in the tall layout and on touch screens, desktop panels otherwise. The controls must never cover gameplay (lanes, pads, Heart) and radial menus must never cover the controls; the layout and e2e tests check both.
- **PWA:** the service worker is generated by `vite.config.ts` and only serves same-origin GETs (never the WebSocket). Solo pause is a worker control message (`{ ctl: 'pause' }`), not a protocol message. `import.meta.env.MODE === 'e2e'` code (the `window.__tdt` hook, `?lab` gold) must stay out of normal builds.
- **Shapes-only graphics until Phase 4.** Each entity type has a distinct shape and colour plus an HP bar; see `render/palette.ts` and `render/world.ts`.
- **Effects are client-only** (never in the sim, never in the protocol): `WorldRenderer` derives them from snapshots (HP drops = hits, new projectiles = shots) and events, and plays them through `Effects` (`render/fx/`). Everything is pooled: particles go in the four `ParticleContainer` layers via `fx.emit` / the recipes; persistent visuals (zones, Heart, portals, auras, trails) are created once and animated by transform / alpha / tint only. Mark an effect `essential` only if it shows gameplay (areas, hits); the rest disappears at Graphics → Low (`fxLevel`). Shake goes through `fx.bump`, which honours Low and the Screen shake setting.
- **The client may import static data from `@tdt/sim`:** `getMap()`, `TUNING`, `tuningForMode`, `towerTier`, `TILE_PX`, `padAtTile`. Pad ownership comes from `snapshot.pads`. It must not call sim functions that touch game state (`LocalTransport` / `SimHost` are the exception, since they *are* the host, and so is the `?stress` scene's `StressTransport`).
- **Protocol validation:** `decodeClientMessage` rejects unknown types, extra keys, non-finite or out-of-range numbers, and oversized messages. Game-rule validation (gold, range, cooldowns, ownership) happens in `applyCommand`, which emits a `rejected` event instead of throwing.

## Conventions

- Strict TypeScript everywhere (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `verbatimModuleSyntax`). Use `import type` for types.
- Workspaces export TypeScript source directly (`"main": "src/index.ts"`). There is no per-package build step; Vite and Vitest compile from source.
- ES modules, 2-space indent, single quotes, semicolons, trailing commas, ~120-column lines.
- Every sim mechanic gets a Vitest unit test. Use the helpers in `packages/sim/test/helpers.ts` (`labGame`, `placeCreep`, `parkHero`, `run`, `tuningCopy`) for isolated mechanic tests.
- **Balance gate (Spire, full mode):** on 5 seeds, the balance bot must win all 30 waves **with 40–80 Heart HP left** (`HEART_TARGET` in `test/helpers.ts`): solo Ranger and idle-bot losses in `balance.test.ts`, solo Warden / Arcanist in `balanceHeroes.test.ts`, 2-player pairs (one per seed) in `balanceDuo.test.ts`, a 4-bot mixed team in `balanceTeam.test.ts` (~40 s, the slowest file). The files run in parallel. 3 players are reported by `npm run balance`, not gated. **Quick mode** (`balanceQuick.test.ts`): on the same seeds the balance bot wins all 15 waves with 40–80 Heart HP solo (every hero) and with 4 bots, heroes reach level 8+, and the idle bot loses; 2 and 3 players are reported by `npm run balance quick`. After changing `tuning.ts` or `bots.ts`, check both modes. Results swing a lot between seeds (±20 Heart HP, more for 4 players), so check a wider seed list (`npm run balance 1 2 3 … 19`) before trusting a change. After changing `tuning.ts` or `bots.ts`, run `npm run balance` and keep every outcome true. Also watch the Heart lost per third (waves 1–10 / 11–20 / 21–30): losses should be spread across the match.
- Bots only read snapshots and act through commands, never by touching `GameState`. Online, `BotClient` wraps the same bots over a real WebSocket.
- Server tests start a real server on port 0 (`test/helpers.ts`: `startServer`, `bot`, `fullRoom`). When a test speeds up ticks (`tickMs: 1`), scale `rateLimit` up to match.
- Protocol changes: update `types.ts`, the validation in `codec.ts` (and its tests), and keep `diffSnapshot`/`applySnapshotDelta` exact. `delta.test.ts` checks this over a long match. **Bump `PROTOCOL_VERSION`** for any change to messages, commands or snapshots: the server announces it in `hello` and rejects entry messages with another `v`, and the client then shows "New version available — refresh".
- Towers: per-tier numbers live in `TUNING.towers[kind].tiers` (tier 1 = build); read them with `towerTier(tuning, kind, tier)`.
- Original names and art only: no Warcraft, Dota or other studio assets or names.
- Record new design decisions in the Decision Log in `docs/GAME_DESIGN.md`.
- Browser tests: Chromium only (the iPhone project emulates the iPhone's viewport, touch and DPR in Chromium). Drive touch through `Finger` (CDP touch events) in `e2e/helpers.ts`; assert on `window.__tdt.sent` (commands) and `latest()` (snapshots). The stress test asserts JavaScript cost per frame from a CPU profile; real FPS is asserted only on a hardware GPU. In the renderer, avoid redrawing small `Graphics` every frame: in Pixi v8 each redraw rebuilds the whole draw list (use sprites, or redraw only on change).
- End each session with a summary: what was built, how to test it, and open questions.

## Deployment

See [`docs/DEPLOY.md`](docs/DEPLOY.md).

- **Client:** Vercel imports the repo root. `vercel.json` runs `npm ci` and `npm run build`, and serves `apps/client/dist`. `VITE_SERVER_URL` (build time) switches on online mode.
- **Game server:** a Render web service from the root `Dockerfile` (`render.yaml`: Singapore, `/health`, 300 s shutdown delay, one instance). `ALLOWED_ORIGINS` must list the Vercel production and preview origins.
