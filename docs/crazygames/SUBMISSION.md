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
at its sides. (The portal's answer was "Both": see "What was submitted" and "When the review answers".)

## Multiplayer

Yes: 1 to 3 players (one per lane). A room is joined by its 5-letter code (Create room, then friends tap Join room and
type it); there is no invite link in this build. Solo is the home screen's main button. (The portal's answer was "Online with Friends", a lobby of 2 to 3: see "What was submitted".)

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

**The committed covers and previews are the ones uploaded on 15 Nov 2026.** The advisor made them by hand from the kit
of 14 Nov: the title moved clear of the portal's label zone (lower on the 16:9 and the 2:3, to the right of the zone on
the 1:1) and the first second of both previews rebuilt from the new covers. They stay as uploaded until the next real
run of the scripts below, which now place the title clear of the zone themselves (q14, `scripts/labelZone.ts`;
docs/DEPLOY.md §10, "CrazyGames' label zone"). `npm run cg-previews -w @tdt/client -- --sheet-only` remakes the sheet
from the committed videos with no recording.

| File | Use |
| --- | --- |
| [cover-1920x1080.png](cover-1920x1080.png) | Cover, 16:9 |
| [cover-800x1200.png](cover-800x1200.png) | Cover, 2:3 |
| [cover-800x800.png](cover-800x800.png) | Cover, 1:1 |
| [preview-landscape-1920x1080.mp4](preview-landscape-1920x1080.mp4) | Preview video, landscape |
| [preview-portrait-1080x1620.mp4](preview-portrait-1080x1620.mp4) | Preview video, portrait |

The covers: `npm run press-shots -w @tdt/client -- --only 7,cg` (into another folder with `--cg DIR` unless a new
upload is meant; one design, the Arcanist on the meadow in wave 10,
the wordmark the only text). The previews: `npm run cg-previews -w @tdt/client` (recorded in real time from a real
solo Quick match, no sound, no cursor, opening on the cover): the build phase, a wave on the towers with the Ranger and
his bot teammate, the Arcanist, both in the frame, the Ranger's Arrow Storm answered by her Meteor and fused into
Meteor Rain (the cut starts once the wave's banner has gone), and the wave-5 boss under the towers' fire with the
Ranger alive and out of its reach to the last frame. Seven frames of each, the last one included, are on
[previews-sheet.jpg](previews-sheet.jpg).

## What was submitted

Han submitted the game on 15 Nov 2026 at 14:43 (Singapore). The build was `main` at 1bc3492 (protocol 28), uploaded as
the unzipped files of `build:embed -- crazygames`.

| Where | What Han chose or answered |
| --- | --- |
| Launch | Basic Launch, game ID 173418, "Awaiting review" |
| Build | `main` at 1bc3492, `PROTOCOL_VERSION` 28, its unzipped files (the portal takes files or a folder, not a zip) |
| Engine | HTML5 |
| Progress saved | "using LocalStorage" (signed-in players' storage copied to their CrazyGames account: `privacy.html`, `hosted`) |
| Mobile | supports mobile devices; orientation "Both" |
| Multiplayer | an online multiplayer game, "Online with Friends", a lobby of 2 to 3. The portal refuses a minimum of 1 and says such a game should use their invite link and button and `IsInstantMultiplayer`; this build has no SDK, and Han declared it anyway |
| Muting through the SDK | not ticked |
| Fullscreen | works well in fullscreen |
| Category | Strategy |
| Age rating | PEGI 12, confirmed |
| QA: every Basic Launch row | Yes |
| QA: the four SDK rows | "Not detected" |
| QA: Invite Button used correctly | No |
| QA: IsInstantMultiplayer | No |
| QA: friend invitation flows | N/A |
| QA: the game retains friends in a lobby at the end of a round | Yes |
| QA: chat / disableChat | N/A / N/A |
| Covers | the three in this folder, the title moved clear of the portal's label zone (top left: 40% × 20.5% on 16:9, 40% × 10% on 2:3, 35.4% × 30.5% on 1:1) |
| Previews | the two videos in this folder, their first second rebuilt from the moved covers |

## When the review answers

- **Passed:** the game is live to a share of CrazyGames' players. From then on a change to `PROTOCOL_VERSION` needs a
  new upload within the same hour as the server deploy, or the uploaded copy cannot play online ("This copy is being
  updated").
- **They ask for the invite and instant-multiplayer features:** built in q15 ("Version 2: with their SDK", below):
  upload version 2.
- **They mind the orientation:** upload a new version with **Portrait** as the orientation. Today a phone held sideways
  shows the game's own "Rotate to portrait" card, which "Both" does not promise.

## A note for Han

The heroes', creeps', towers' and buildings' 3D models were generated with Meshy from the game's own designs, and the
code was written with Claude Code. CrazyGames asks for no AI label; itch.io and Steam do. The music was generated with
Google Gemini ([docs/SOUND_CREDITS.md](../SOUND_CREDITS.md): confirm Gemini's terms allow use in a paid game).

## Version 2: with their SDK

q15 (15 Nov 2026) adds CrazyGames' SDK v3 to the crazygames build, so their four SDK rows ("Not detected" in the
first upload's QA) are met. Nothing changes on the site or in the itch.io and Newgrounds builds; the protocol stays 28
and the game server is not restarted. Build the zip again after the merge (`VITE_SERVER_URL=wss://… npm run
build:embed -w @tdt/client -- crazygames`) and upload the contents of `apps/client/dist-embed-crazygames/`: that
upload is Han's.

**What changed** (`docs/DEPLOY.md` §10, "CrazyGames' SDK"):

- The SDK's script in the page's head; `init()` at start-up, the first screen waiting for it at most 1.5 s.
- `loadingStart` / `loadingStop` around the first screen and the wait before a match; `gameplayStart` / `gameplayStop`
  around play (the end card, the lobby, a lost connection and the invite's question are breaks); `happytime` on a
  victory or a new Endless best, once a match.
- Their mute: `muteAudio` silences the game whatever its own Sound switch says; ⚙ → Sound says "Muted by CrazyGames".
- **`disableChat`: the game has no chat to disable.** Its quick chat is six fixed emotes and team pings, with no free
  text anywhere, so there is nothing the setting could turn off.
- Their usernames: a signed-in player's name in a room is the CrazyGames username (the home card's field shows it as
  "CrazyGames name", not editable). The profile picture is never loaded or shown.
- Rooms: `updateRoom` with the room's code (joinable while it waits in its lobby with a free seat), `leftRoom` on
  leaving; **Copy invite link** copies their invite link, the code still under it; their invite joins the room with no
  tap; an invite accepted during a match asks "Join your friend's room? You leave this match." first; their instant
  multiplayer opens a new room at once as its host.
- The data key that lets a player download or delete their play data is kept in IndexedDB, out of the localStorage
  their Automatic Progress Save copies (the privacy page says so).

**In the portal, for the new upload:**

- Tick **muting through the SDK**.
- Mobile orientation: **Portrait**.
- Multiplayer: instant multiplayer **yes**; friends' invitations **yes**; the invite through **room data**
  (`updateRoom`) **and the invite link** (`inviteLink`).

**Checking it in their preview before submitting** (on the laptop, in the portal's preview of the new upload):

1. Load: the home card comes up; their QA panel shows the SDK detected and `loadingStart` then `loadingStop`.
2. A solo match to its end: Play solo, play a wave or two, lose or win: `gameplayStart` when the match starts,
   `gameplayStop` on the end card (a victory also `happytime`).
3. Their invite into a second window: Create room, then their "invite friends" (or Copy invite link) and open the link
   in a second, private window: it lands in the room with no tap; both seats show their names.
4. Their instant-multiplayer switch: the game opens straight on a new room's card, as its host.
5. Their mute switch: the game goes silent, ⚙ → Sound says "Muted by CrazyGames"; switching it back brings the sound
   back as the game's own switch had it.

**What stays in localStorage** (copied by their Automatic Progress Save to a signed-in player's account, as their docs
say: they name localStorage only, and IndexedDB only for Unity's PlayerPrefs, so IndexedDB staying out of their copy is
what their docs say, not something a session could test):

| Key | What it is |
| --- | --- |
| `tdt.settings` | ⚙ Settings: controls, sound, graphics, the one-time hints and lesson flags |
| `tdt.record` | Each hero's matches, wins and bests, kept here only and never sent |
| `tdt.endlessBest` | The best Endless wave per hero |
| `tdt.name` | The nickname the player typed (never the CrazyGames username) |
| `tdt.age` | The age question's answer, never sent |
| `tdt.analytics` | The Play data switch |
| `tdt.dailyPosted`, `tdt.endlessPosted` | The days a run was posted to a board |
| `tdt.firstDay` | The day of the first counted open, for the day-1 and day-7 return counts; never sent |
| `tdt.seat` | A remembered seat in a running match (forgotten at its end, after 2 h) |
| `tdt.hero`, `tdt.mode` | The picked hero and mode |
| `tdt.channel` | The link tag the game was first opened from |
| `tdt.musicGain` | The last measured level of a music file (sound) |

Not there: `tdt.visitorKey` and `tdt.visitor` (the data key and the id made from it) are in IndexedDB; one found in
localStorage from the first upload moves there and leaves localStorage at the first load of version 2.
