# Tower Defense Together

A browser co-op tower defense for 1–4 players: build towers, control a hero and hold the Heart against waves of creeps.

- **Design and build plan:** [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)
- **Working in this repo (commands, layout, rules):** [`CLAUDE.md`](CLAUDE.md)

**Status:** Phase 1, a solo playable slice running locally in the browser.

```bash
npm install
npm run dev      # play at http://localhost:5173
npm test         # unit tests + headless balance runs
npm run build    # typecheck + production build (apps/client/dist)
```

## How to play

Hold the Heart for 10 waves. Creeps come down three lanes from the portals at the top. Wisps (from wave 5) fly straight at the Heart. Wave 10 brings a Boss.

- **Right-click:** move, or attack a creep. **A** + left-click: attack-move.
- **Q:** Multishot. **W:** Snare Trap, then left-click where to place it. Spend skill points with the **+** buttons.
- **Left-click a build pad** to build (Arrow, Cannon, Frost), or press **B** then **1–3**. Left-click your own tower to sell it for 70% of its cost.
- **Camera:** screen edges, arrow keys, middle-mouse drag, mouse wheel to zoom, **Space** to centre on your hero.
- **Call early** starts the next wave now and pays bonus gold.
