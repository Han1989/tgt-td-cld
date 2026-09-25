# CLAUDE.md

**Source of truth: [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).** Read it first. Build only the phase or feature you were asked for. When you make a design decision the doc doesn't cover, add a row to its Decision Log (§13).

Current status: **Phase 1 (solo playable slice, local mode) is done.** Phase 2 (online co-op) is next.

## Commands

Run everything from the repo root. You need Node ≥ 22.12 and npm workspaces.

| Command | What it does |
|---|---|
| `npm install` | Install all workspaces |
| `npm run dev` | Start the Vite dev server for the client (http://localhost:5173) |
| `npm test` | Vitest across all workspaces, including the headless balance runs |
| `npm run build` | Typecheck every workspace (`tsc`), then production-build the client to `apps/client/dist` |
| `npm run typecheck` | Typecheck only |
| `npm run preview` | Serve the production build locally |
| `npm run balance [seeds…]` | Print balance-bot and idle-bot results; use it after editing `tuning.ts` |
| `npx vitest run --project sim` | Tests for one workspace (`sim`, `protocol` or `client`) |

`npm test` and `npm run build` must pass before any push.

## Repo layout

```
docs/GAME_DESIGN.md        Design and build plan (source of truth)
packages/protocol/         @tdt/protocol: wire contract
  src/types.ts             Command, Snapshot, GameEvent, Client/ServerMessage
  src/codec.ts             encode/decode; strict validation of untrusted client messages
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
  src/transport/           Transport interface, LocalTransport (Web Worker), SimHost, sim.worker
  src/snapshotBuffer.ts    Renders ~100 ms behind with interpolation
  src/render/              Pixi world renderer (shapes only) and palette
  src/input/               Camera and mouse/keyboard controls
  src/hud/                 DOM HUD, tower menus, end screen
  test/                    Client unit tests (node environment, no DOM)
vercel.json                Vercel static deploy of apps/client
```

`apps/server` does not exist yet. It arrives in Phase 2.

## Architecture rules

- **The sim is pure and deterministic.** `packages/sim` has no DOM, no Node APIs and no networking. Its tsconfig uses `lib: ES2022` and `types: []`, so using them fails to compile. It uses a fixed 20 Hz timestep (`TICK_RATE`) and the seeded RNG in `rng.ts` (state is kept in `GameState.rng`). **Never** use `Math.random()`, `Date.now()` or `performance.now()` in `packages/sim`; a test enforces this.
- **The sim API** is `createGame(config, seed)`, `applyCommand(state, playerId, command)`, `step(state)` and `snapshot(state)`. The state is a plain, mutable, JSON-able object. `snapshot()` never mutates it.
- **Events:** sim code emits into `state.pendingEvents`. At the end of `step()` they move to `state.events`, which the next `snapshot()` carries. Hosts apply commands, then `step`, then `snapshot`.
- **The client never mutates game state.** It sends `Command`s through a `Transport` and renders `Snapshot`s. Client-only UI state (input mode, selection, markers) lives in `uiState.ts`.
- **Transport:** `LocalTransport` runs `SimHost` in a Web Worker and exchanges *encoded* protocol messages (`encodeClientMessage`/`decodeServerMessage`), exactly like a network would. Phase 2 adds a `NetworkTransport` with the same interface. Only `main.ts` should need to change.
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
- Bots only read snapshots and act through commands, never by touching `GameState`.
- Original names and art only: no Warcraft, Dota or other studio assets or names.
- Record new design decisions in the Decision Log in `docs/GAME_DESIGN.md`.
- End each session with a summary: what was built, how to test it, and open questions.

## Deployment

- **Client:** Vercel imports the repo root. `vercel.json` runs `npm ci` and `npm run build`, and serves `apps/client/dist`.
- **Game server (Phase 2+):** a container with a `/health` endpoint, not on Vercel. The client will read `VITE_SERVER_URL`.
