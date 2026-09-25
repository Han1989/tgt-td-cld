# CLAUDE.md

**Source of truth: [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).** Read it first. Build only the phase or feature you were asked for. When you make a design decision the doc doesn't cover, add a row to its Decision Log (§13).

Current status: **Phases 1 (solo, local mode) and 2 (online co-op) are done.** Phase 3 (content) is next. Deployment steps are in [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Commands

Run everything from the repo root. You need Node ≥ 22.12 and npm workspaces.

| Command | What it does |
|---|---|
| `npm install` | Install all workspaces |
| `npm run dev` | Start the Vite dev server for the client (http://localhost:5173); local solo mode unless `VITE_SERVER_URL` is set |
| `npm run dev:server` | Run the game server with reload (ws://localhost:8080; allows localhost:5173/4173) |
| `VITE_SERVER_URL=ws://localhost:8080 npm run dev` | Client in online mode (lobby) against the local server |
| `npm test` | Vitest across all workspaces: unit tests, headless balance runs, the 4-bot server integration test |
| `npm run build` | Typecheck every workspace (`tsc`), build the client to `apps/client/dist`, bundle the server to `apps/server/dist/index.cjs` |
| `npm run loadtest [-- --url wss://… --origin …]` | Ramp rooms of 4 bots until the server's average tick exceeds 10 ms (see docs/DEPLOY.md §6) |
| `npm run typecheck` | Typecheck only |
| `npm run preview` | Serve the production build locally |
| `npm run balance [seeds…]` | Print balance-bot and idle-bot results; use it after editing `tuning.ts` |
| `npx vitest run --project sim` | Tests for one workspace (`sim`, `protocol`, `client` or `server`) |
| `docker build -t tdt-server .` | Build the server image exactly as Render does |

`npm test` and `npm run build` must pass before any push.

## Repo layout

```
docs/GAME_DESIGN.md        Design and build plan (source of truth)
docs/DEPLOY.md             Render + Vercel setup, env vars, operations, room-code routing design
packages/protocol/         @tdt/protocol: wire contract
  src/types.ts             Command, Snapshot, GameEvent, lobby types, Client/ServerMessage
  src/codec.ts             encode/decode; strict validation of untrusted client messages (names, codes, tokens)
  src/delta.ts             diffSnapshot / applySnapshotDelta (network deltas)
packages/sim/              @tdt/sim: pure deterministic simulation
  src/tuning.ts            ALL balance numbers (one file)
  src/game.ts              createGame, step, snapshot
  src/commands.ts          applyCommand: validation (gold, ownership, cooldowns…)
  src/map.ts               Crossroads map (generated deterministically, 80×60 tiles)
  src/pathfinding.ts       Hero A* on the tile grid
  src/waves.ts             Wave timer, income, call-early, spawning
  src/creeps.ts            Lane walking, aggro/leash, tower attacks, boss stomp, leaks
  src/towers.ts            Tower targeting, projectiles, Snare Traps
  src/heroes.ts            Hero orders, auto-attack, skills, respawn
  src/combat.ts            Damage/armour, kills, bounty, XP, levelling
  src/bots.ts              Balance bot and idle bot (they act through commands only)
  src/headless.ts          runHeadlessMatch for balance tests
  test/                    Vitest unit tests + balance.test.ts
  scripts/balance.ts       `npm run balance`
apps/client/               @tdt/client: Vite + PixiJS + HTML/CSS HUD
  src/main.ts              Wiring: transport → snapshot buffer → renderer/HUD
  src/main.ts              Chooses local solo (no VITE_SERVER_URL) or online (lobby)
  src/gameView.ts          Pixi app + HUD + controls + snapshot buffer, fed by any Transport
  src/online.ts            Online flow: lobby ↔ NetworkTransport ↔ game view
  src/lobby/               Lobby screens (nickname, hero, create/join, ready/start, invite link)
  src/transport/           Transport interface, LocalTransport (Web Worker), SimHost, NetworkTransport
  src/snapshotBuffer.ts    Renders ~100 ms behind with interpolation
  src/render/              Pixi world renderer (shapes only) and palette
  src/input/               Camera and mouse/keyboard controls
  src/hud/                 DOM HUD, tower menus, end screen
  test/                    Client unit tests (node environment, no DOM; NetworkTransport vs a real server)
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
- **The sim API** is `createGame(config, seed)`, `applyCommand(state, playerId, command)`, `step(state)` and `snapshot(state)`. The state is a plain, mutable, JSON-able object. `snapshot()` never mutates it.
- **Events:** sim code emits into `state.pendingEvents`. At the end of `step()` they move to `state.events`, which the next `snapshot()` carries. Hosts apply commands, then `step`, then `snapshot`.
- **The client never mutates game state.** It sends `Command`s through a `Transport` and renders `Snapshot`s. Client-only UI state (input mode, selection, markers) lives in `uiState.ts`.
- **Transport:** `LocalTransport` runs `SimHost` in a Web Worker; `NetworkTransport` talks to the game server. Both exchange *encoded* protocol messages and both deliver complete `{ t: 'snapshot' }` messages to the game view. `NetworkTransport` rebuilds them from keyframes + deltas, so the renderer and HUD never see deltas.
- **The server is authoritative.** Each room owns the only real `GameState`. Commands are queued as they arrive and applied at the start of the next tick, in arrival order; then `step`, `snapshot`, and a broadcast (a full snapshot for new or reconnected clients and every `keyframeEveryTicks`, otherwise one encoded delta shared by all clients). Never trust anything from the client beyond a decoded message.
- **Rooms are self-contained** (lobby, sim, sockets in one process). Room codes start with the server's `SHARD` letter so a future router can route by code (docs/DEPLOY.md §7). Keep Render at one instance per shard.
- **Server config comes from env** (`config.ts`). Tests build configs with `defaultConfig({...})`, e.g. `tickMs: 1` to run game time fast.
- **All balance numbers live in `packages/sim/src/tuning.ts`.** Durations are in seconds, distances in tiles and speeds in tiles/s. Convert with `secondsToTicks`. Don't scatter constants.
- **Units:** the sim works in tiles (floats). The renderer multiplies by `TILE_PX` (32).
- **Shapes-only graphics until Phase 4.** Each entity type has a distinct shape and colour plus an HP bar; see `render/palette.ts` and `render/world.ts`.
- **The client may import static data from `@tdt/sim`:** `getMap()`, `TUNING`, `TILE_PX`, `padAtTile`. It must not call sim functions that touch game state (`LocalTransport` / `SimHost` are the exception, since they *are* the host).
- **Protocol validation:** `decodeClientMessage` rejects unknown types, extra keys, non-finite or out-of-range numbers, and oversized messages. Game-rule validation (gold, range, cooldowns, ownership) happens in `applyCommand`, which emits a `rejected` event instead of throwing.

## Conventions

- Strict TypeScript everywhere (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `verbatimModuleSyntax`). Use `import type` for types.
- Workspaces export TypeScript source directly (`"main": "src/index.ts"`). There is no per-package build step; Vite and Vitest compile from source.
- ES modules, 2-space indent, single quotes, semicolons, trailing commas, ~120-column lines.
- Every sim mechanic gets a Vitest unit test. Use the helpers in `packages/sim/test/helpers.ts` (`labGame`, `placeCreep`, `parkHero`, `run`, `tuningCopy`) for isolated mechanic tests.
- **Balance gate:** `balance.test.ts` requires the balance bot to win all 10 waves and the idle bot to lose on 5 seeds. After changing `tuning.ts`, run `npm run balance` and keep both outcomes true.
- Bots only read snapshots and act through commands, never by touching `GameState`. Online, `BotClient` wraps the same bots over a real WebSocket.
- Server tests start a real server on port 0 (`test/helpers.ts`: `startServer`, `bot`, `fullRoom`). When a test speeds up ticks (`tickMs: 1`), scale `rateLimit` up to match.
- Protocol changes: update `types.ts`, the validation in `codec.ts` (and its tests), and keep `diffSnapshot`/`applySnapshotDelta` exact. `delta.test.ts` checks this over a long match.
- Original names and art only: no Warcraft, Dota or other studio assets or names.
- Record new design decisions in the Decision Log in `docs/GAME_DESIGN.md`.
- End each session with a summary: what was built, how to test it, and open questions.

## Deployment

See [`docs/DEPLOY.md`](docs/DEPLOY.md).

- **Client:** Vercel imports the repo root. `vercel.json` runs `npm ci` and `npm run build`, and serves `apps/client/dist`. `VITE_SERVER_URL` (build time) switches on online mode.
- **Game server:** a Render web service from the root `Dockerfile` (`render.yaml`: Singapore, `/health`, 300 s shutdown delay, one instance). `ALLOWED_ORIGINS` must list the Vercel production and preview origins.
