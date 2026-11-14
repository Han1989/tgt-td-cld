# CrazyGames submission kit (q5)

Everything Han types or uploads in CrazyGames' developer portal for the Basic Launch (roadmap row h3). The build is
`VITE_SERVER_URL=wss://… npm run build:embed -w @tdt/client -- crazygames` (docs/DEPLOY.md §10, "CrazyGames"); the
audit of that build against CrazyGames' rules is [AUDIT.md](AUDIT.md), and the advisor turns its FAILs into a task
before this goes in.

## Title

Tower Defense Together

## Description

Tower Defense Together is a browser co-op tower defense for one to three players, one per lane. Build towers on
your pads, steer a hero with skills of their own, and hold the Heart against waves of creeps coming down three lanes
from the portals at the top.

Pick the Ranger, the Warden or the Arcanist. Every tower grows through three tiers and then into one of two branches;
flyers ignore the lanes and head straight for the Heart, and three bosses each bring a trick of their own. Cast
ultimates within a few seconds of a teammate's and they fuse into a combo.

Play a Quick match of 15 waves (about 11 minutes) or the Full 30, alone or with friends in a room joined by its code,
take on the Daily run, or see how far Endless goes on today's top 10. A solo match starts with a bot teammate beside
you, and your ultimate cast with its own fuses into a combo.

## Controls

**Mouse and keyboard**

- Right-click: move, or attack a creep. **A** + left-click: attack-move. **S**: stop.
- Left-click a build pad to build, or **B** then **1–5**. Left-click your own tower to upgrade it (**U**), repair it
  (**F**) or sell it.
- **Q W E R**: cast your hero's skills (**Shift** + the key spends a skill point on it).
- Arrow keys, the screen edges, middle-mouse drag and the wheel move and zoom the camera; **Space** centres it on your
  hero.
- **C**: quick-chat. **Alt** + click: ping the map.
- **X** or right-click: cancel a build, an aim or a selection.

**Touch**

- The joystick moves your hero; your hero attacks on its own as it walks.
- Tap a pad to build (one tap on a tower in the ring); hold a tower's button to see its range first.
- Tap your tower for its ring: Upgrade, Repair, Sell.
- **Q W E R** buttons cast; drag a button to aim, drag back to cancel.
- Long-press the map to ping it; pinch to zoom, double-tap to zoom back out.

Learn to play teaches moving, building, casting, upgrading and pinging inside a real match, each step a picture of the
keys and the mouse button (or the touch gesture) over one line; it can be skipped. In a small desktop window a one-time
line says the wheel zooms and Space centres on your hero.

## Tags

tower defense, strategy, co-op, multiplayer

## Orientation

Portrait on phones and tablets. On desktop the portrait map stands in the middle with the game's panels and background
at its sides.

## Multiplayer

Yes: 1 to 3 players (one per lane). A room is joined by its 5-letter code (Create room, then friends tap Join room and
type it); there is no invite link in this build. Solo is the home screen's main button.

## Notes for the age rating (PEGI 12)

- Fantasy violence: heroes and towers fight skeletons, ghosts and monsters; creeps fade away when they fall.
- No blood and no gore.
- No typed chat: players talk only with six fixed quick-chat lines and map pings.
- No purchases, no ads, no accounts.

## What the game sends

- Anonymous counts with no id (the page opened, a match started, reached a minute, ended), to the game's own server;
  no third-party trackers.
- Play data with a browser id only if the player turns it on in ⚙ Settings → Play data (the age question first).
- A nickname only when a player posts a Daily run or an Endless run to a public board (the age question first, never
  under 13).
- The privacy policy: https://tgt-td-cld.vercel.app/privacy.html (opened from the home screen's Privacy link).

## The pictures

| File | Use |
| --- | --- |
| [cover-1920x1080.png](cover-1920x1080.png) | Cover, 16:9 |
| [cover-800x1200.png](cover-800x1200.png) | Cover, 2:3 |
| [cover-800x800.png](cover-800x800.png) | Cover, 1:1 |
| [preview-landscape-1920x1080.mp4](preview-landscape-1920x1080.mp4) | Preview video, landscape |
| [preview-portrait-1080x1620.mp4](preview-portrait-1080x1620.mp4) | Preview video, portrait |

The covers: `npm run press-shots -w @tdt/client -- --only 7,cg` (one design, the Arcanist on the meadow in wave 10,
the wordmark the only text). The previews: `npm run cg-previews -w @tdt/client` (recorded in real time from a real
solo Quick match, no sound, no cursor, opening on the cover): the build phase, a wave on the towers with the Ranger and
his bot teammate, the Arcanist, both in the frame, the Ranger's Arrow Storm answered by her Meteor and fused into
Meteor Rain (the cut starts once the wave's banner has gone), and the wave-5 boss under the towers' fire with the
Ranger alive and out of its reach to the last frame. Seven frames of each, the last one included, are on
[previews-sheet.jpg](previews-sheet.jpg).

## A note for Han

The heroes', creeps', towers' and buildings' 3D models were generated with Meshy from the game's own designs, and the
code was written with Claude Code. CrazyGames asks for no AI label; itch.io and Steam do. The music was generated with
Google Gemini ([docs/SOUND_CREDITS.md](../SOUND_CREDITS.md): confirm Gemini's terms allow use in a paid game).
