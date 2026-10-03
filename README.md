# Tower Defense Together

A browser co-op tower defense for 1–3 players (one per lane): build towers, control a hero and hold the Heart against waves of creeps.

- **Design and build plan:** [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)
- **Roadmap (vision, locked decisions, phases):** [`docs/ROADMAP.md`](docs/ROADMAP.md)
- **Task list:** [`TASKS.md`](TASKS.md)
- **Working in this repo (commands, layout, rules):** [`CLAUDE.md`](CLAUDE.md)
- **Deploying (Render game server + Vercel client):** [`docs/DEPLOY.md`](docs/DEPLOY.md)
- **Rollout analytics (one dashboard, channel tags):** [`docs/ANALYTICS.md`](docs/ANALYTICS.md)
- **Press kit (link preview, screenshots, clip, tagged links, first load on a phone):** [`docs/PRESS.md`](docs/PRESS.md)
- **Adding recorded music and sound effects (no code needed):** [`docs/SOUND_FILES.md`](docs/SOUND_FILES.md)

**Status:** Phases 1–3 are done (solo, online co-op for 1–3 players, and content). Phase 4a (portrait Spire, touch controls, PWA, Quick mode) and the Phase 4b polish list through T-04 are done: Runelight art and sound, Hard difficulty, team pings, and a first-match tutorial. Real-device checks and the optional app-store wrap are still open. Gate 1 (friends playtest) passed on 2 Oct 2026 (Android, PC, iPhone Safari), so Phase 6 may proceed and is not started. Playtest 2 work orders are open. Discovery D-02–D-06 and Gate 2 are the public soft-launch path. See the roadmap.

```bash
npm install
npm run dev                                        # solo, offline, at http://localhost:5173
npm run dev:server                                 # game server on ws://localhost:8080
VITE_SERVER_URL=ws://localhost:8080 npm run dev    # online: lobby, rooms, invite links
npm test                                           # unit tests, balance runs, 3-bot server test
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
