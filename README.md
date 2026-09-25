# Tower Defense Together

A browser co-op tower defense for 1–4 players: build towers, control a hero and hold the Heart against waves of creeps.

- **Design and build plan:** [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)
- **Working in this repo (commands, layout, rules):** [`CLAUDE.md`](CLAUDE.md)
- **Deploying (Render game server + Vercel client):** [`docs/DEPLOY.md`](docs/DEPLOY.md)

**Status:** Phase 2, online co-op for 1–4 players (rooms, lobby, reconnect), plus offline solo.

```bash
npm install
npm run dev                                        # solo, offline, at http://localhost:5173
npm run dev:server                                 # game server on ws://localhost:8080
VITE_SERVER_URL=ws://localhost:8080 npm run dev    # online: lobby, rooms, invite links
npm test                                           # unit tests, balance runs, 4-bot server test
npm run build                                      # typecheck + client build + server bundle
```

## How to play

**Online:** enter a nickname, click **Create room** and share the invite link (or the 5-letter code). Friends click **Join**, then **Ready**; the host clicks **Start match**. Each player has their own gold and hero.

Hold the Heart for 30 waves. Creeps come down three lanes from the portals at the top. Wisps (from wave 5) fly straight at the Heart. Waves 10, 20 and 30 each bring a boss with its own trick: the Ironhorn stomps, the Matriarch hatches broods, and the Shardback shifts between a hide that resists physical damage and one that resists magic.

- **Right-click:** move, or attack a creep. **A** + left-click: attack-move.
- **Q:** Multishot. **W:** Snare Trap, then left-click where to place it. Spend skill points with the **+** buttons.
- **Left-click a build pad** to build (Arrow, Cannon, Frost), or press **B** then **1–3**. Left-click your own tower to sell it for 70% of its cost.
- **Camera:** screen edges, arrow keys, middle-mouse drag, mouse wheel to zoom, **Space** to centre on your hero.
- **Call early** starts the next wave now and pays bonus gold.
- **Online:** give gold to a teammate with the **Give** buttons in the team panel (top left).
