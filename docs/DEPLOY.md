# Deploying Tower Defense Together

There are two independent deployments:

| Part | Where | What |
|---|---|---|
| Client (`apps/client`) | **Vercel** | Static site; `vercel.json` at the repo root builds it. |
| Game server (`apps/server`) | **Render** web service, Docker, **Singapore** | One Node process running every room; `render.yaml` + `Dockerfile` at the repo root. |

The client finds the server through the build-time variable `VITE_SERVER_URL`. If it is unset, the client runs Phase 1 local solo mode and needs no server.

---

## 1. Create the game server on Render

1. Sign in at <https://dashboard.render.com> with your GitHub account. Give Render access to the `Han1989/tgt-td-cld` repository when asked.
2. Click **New → Blueprint**. Pick the `tgt-td-cld` repository and the branch to deploy (normally `main`). Render reads `render.yaml` and proposes one web service, **tgt-td-server**:
   - runtime Docker, region **Singapore**
   - plan **Starter**
   - health check `/health`
   - max shutdown delay **300 s**
3. Render asks for **`ALLOWED_ORIGINS`**, because it is marked `sync: false`. Enter the origins that may open WebSocket connections (see [§3](#3-allowed_origins)). For example:

   ```
   https://tgt-td-cld.vercel.app,https://tgt-td-cld-*-YOUR-VERCEL-SCOPE.vercel.app,http://localhost:5173,http://localhost:4173
   ```

4. **Plan:** the blueprint uses **Starter** (paid). The **Free** plan works for testing, but it sleeps after 15 minutes without traffic. The next visitor then waits about a minute, and a sleeping instance drops all connections. To use Free, change `plan: starter` to `plan: free` in `render.yaml` before applying, or change the instance type later in the dashboard.
5. Click **Apply**. The first Docker build takes a few minutes.
6. When the deploy is live, open `https://<service-name>.onrender.com/health`. The exact URL is shown at the top of the service page; if `tgt-td-server` was taken, Render adds a suffix. You should see something like:

   ```json
   {"status":"ok","shard":"A","uptimeSec":12,"rooms":0,"roomsPlaying":0,"players":0,"connections":0,
    "avgTickMs":0.01,"maxTickMs":0.03,"avgRoomTickMs":0,"bytesOutPerSec":0,"tickMs":50}
   ```

7. Check **Settings** on the service:
   - **Region** is Singapore. It can't be changed after creation; to move, create a new service.
   - **Shutdown delay** is 300 s, from `maxShutdownDelaySeconds`. If your Render workspace doesn't support that field, set it by hand under *Settings → Shutdown Delay*.
   - **Instances** is **1**. Don't scale this service beyond one instance (see [§7](#7-room-codes-and-scaling-out)).

`render.yaml` has a `buildFilter`, so only changes to the server, shared packages, Dockerfile or lockfile trigger a server redeploy. Client-only commits don't.

## 2. Point the Vercel client at the server

1. Open your project on Vercel → **Settings → Environment Variables**.
2. Add **`VITE_SERVER_URL`** = `wss://<service-name>.onrender.com`. Use the same host as your `/health` URL, but with `wss://` and no path. Tick **Production** and **Preview**. Optionally add it to **Development** with `ws://localhost:8080`.
3. **Redeploy.** Vite bakes the variable into the build, so existing deployments don't pick it up. Go to *Deployments → ⋯ → Redeploy* on the latest production deployment, or push a commit.
4. Open the production site. You should see the lobby (nickname, **Create room**, **Join room**, **Play solo offline**) instead of going straight into a solo match.

## 3. `ALLOWED_ORIGINS`

The server accepts a WebSocket only if the browser's `Origin` header matches this comma-separated list. Other upgrades get HTTP 403, and so do upgrades without an `Origin` header.

- Exact origins: `https://tgt-td-cld.vercel.app`, `http://localhost:5173`. There is no trailing slash and no path.
- `*` matches one run of letters, digits and hyphens. It never matches a dot, so it can't escape the domain.
- Vercel preview URLs look like `https://tgt-td-cld-<hash>-<scope>.vercel.app` or `https://tgt-td-cld-git-<branch>-<scope>.vercel.app`. `<scope>` is your Vercel account or team slug, visible in any preview URL. One pattern covers both: `https://tgt-td-cld-*-<scope>.vercel.app`.
- Add any custom domain you attach to the Vercel project.
- In production the server **refuses to start** if `ALLOWED_ORIGINS` is empty. The deploy fails with a clear log line instead of accepting everyone.

After changing it: Render → *Environment* → edit → **Save, rebuild and deploy** (or *Save and deploy*).

## 4. Verify two-browser co-op

1. Open the production URL. Enter a nickname and click **Create room**. You get a 5-letter code.
2. Click **Copy invite link**. Open it in a second browser, or a private window (each tab keeps its own seat). Enter a nickname and click **Join room**.
3. The guest clicks **Ready**; the host clicks **Start match**.
4. Play a few waves. Both players should see the same creeps, towers and Heart HP. Each player has their own gold, and the team panel (top left) lists both heroes.
5. Reconnect check: reload one tab mid-match. It should rejoin the same seat, with the same hero and gold, within a couple of seconds.

## 5. Server environment variables

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` (Render sets `10000`) | HTTP + WebSocket port. |
| `NODE_ENV` | — | `production` makes `ALLOWED_ORIGINS` mandatory. |
| `ALLOWED_ORIGINS` | localhost dev origins | See [§3](#3-allowed_origins). |
| `SHARD` | `A` | First letter of room codes created here (see [§7](#7-room-codes-and-scaling-out)). |
| `SHUTDOWN_GRACE_SECONDS` | `280` | How long running matches may continue after SIGTERM. Keep it below Render's 300 s shutdown delay. |
| `MAX_ROOMS` | `200` | New rooms are refused (`server_full`) beyond this. |
| `WS_COMPRESSION` | on | `off` disables permessage-deflate. |

## 6. Operations

**Health.** `GET /health` returns JSON:

| Field | Meaning |
|---|---|
| `status` | `ok` or `draining` |
| `rooms`, `roomsPlaying` | Rooms, and how many are mid-match |
| `players` | Connected players |
| `connections` | Open sockets |
| `avgTickMs`, `maxTickMs` | Wall time of one whole server tick (all rooms) over the last ~5 s. The target is under 10 ms. |
| `avgRoomTickMs` | Average cost of ticking one playing room |
| `bytesOutPerSec` | Uncompressed payload the server sends per second |

**Graceful shutdown** (deploys, restarts). Render sends SIGTERM and waits up to 300 s. The server then:

1. Refuses new connections (HTTP 503) and new rooms.
2. Sends every client `{ t: 'notice', kind: 'server_restarting', closesInMs }`. The client shows a banner with a countdown.
3. Closes lobbies and finished matches right away, with close code 1012 (service restart).
4. Lets running matches continue until they end or `SHUTDOWN_GRACE_SECONDS` (280 s) runs out, then closes them with 1012 and exits.

After the restart, players create a new room; room state is not persisted. With a zero-downtime deploy, the new instance takes new rooms while the old one drains.

**Protocol version.** `PROTOCOL_VERSION` (in `packages/protocol/src/types.ts`) is compiled into both the client and the server. The server sends `{ t: 'hello', v }` first on every connection, and answers a `create` / `join` / `rejoin` carrying another `v` with the error `version_mismatch` and close code 4001. Either way the client stops reconnecting and shows "New version available — refresh" with a Refresh button. Bump the version in any change to messages, commands or snapshots. Client (Vercel) and server (Render) deploy separately, so for a short while after a protocol change one side is ahead; players who see the message just reload once both are live.

**Load test.** It ramps up rooms of 4 bot players each. Every bot is the balance bot speaking the real protocol, and room hosts call the first wave early and restart finished matches. It stops when the server's `avgTickMs` passes 10 ms:

```bash
npm run loadtest                                   # local server (builds apps/server first)
npm run loadtest -- --start 10 --step 10 --step-seconds 15 --max-rooms 300
npm run loadtest -- --url wss://<service>.onrender.com --origin https://tgt-td-cld.vercel.app
```

The bots run in worker threads on your machine. If they saturate it, the table shows `LOADGEN SATURATED` and the test stops. Use a bigger machine, or run against a remote server. Load-test a remote server only when nobody is playing on it. Its `--origin` must be in `ALLOWED_ORIGINS`.

## 7. Room codes and scaling out

A room lives entirely inside one server process: its lobby, its simulation and its sockets. Scaling out therefore means *routing each room to the process that owns it*. The room code is designed for that; the router itself is not built yet.

- **Format:** 5 letters from a 24-letter alphabet (no `I` or `O`). The **first letter is the shard** that created the room (`SHARD`). The other 4 are random, giving 24⁴ ≈ 330 000 codes per shard.
- **Guard:** a server asked to join a code with another shard letter answers `wrong_server` instead of `room_not_found`. A client or router can tell "wrong place" apart from "no such room".
- **Future lobby/router:**
  1. Run one Render service per shard (`tgt-td-server-a`, `-b`, …), each with `numInstances: 1` and its own `SHARD` letter.
  2. Keep a shard → URL table, e.g. `A → wss://tgt-td-server-a.onrender.com`, as static config or in a tiny registry.
  3. **Create:** the client asks the router for a shard. The router picks the least-loaded one using each shard's `/health` (`rooms`, `avgTickMs`) and returns its URL, and the client connects there.
  4. **Join / invite link / reconnect:** route by `code[0]`. No shared database is needed, because codes are self-describing.
  5. `?room=CODE` invite links keep working unchanged.
- **Why not `numInstances > 1` on one service:** Render's load balancer spreads new connections across instances with no way to route by room code. Players of one room would land on different processes. Scale with more single-instance shards instead.
- **Growth:** 24 shards × one instance each. If that is ever too few, add a sixth letter or a two-letter prefix.

## 8. Local development

```bash
npm install
npm run dev:server                                   # ws://localhost:8080, allows localhost:5173/4173
VITE_SERVER_URL=ws://localhost:8080 npm run dev      # client with the lobby
npm run dev                                          # client in local solo mode (no server)
```

Docker, as Render runs it:

```bash
docker build -t tdt-server .
docker run --rm -p 8080:8080 -e ALLOWED_ORIGINS=http://localhost:5173 tdt-server
curl localhost:8080/health
```

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Lobby says "Disconnected from the server" immediately; server log shows nothing | Origin not in `ALLOWED_ORIGINS` (HTTP 403), or a wrong `VITE_SERVER_URL`. Use `wss://` for Render, `ws://` only for localhost. |
| Client goes straight into a solo game on Vercel | `VITE_SERVER_URL` not set for that environment, or no redeploy after setting it. |
| Deploy fails health checks; log says `ALLOWED_ORIGINS must be set` | Set the variable in Render → Environment. |
| First connection takes ~1 minute | Free plan instance was asleep. |
| "That room is hosted on another server" | The code's first letter is another shard's `SHARD`. |
| "New version available — refresh" | Client and server were built with different `PROTOCOL_VERSION`s. Reload the page; if it persists, the Vercel and Render deploys are from different commits. |
