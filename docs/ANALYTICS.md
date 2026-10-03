# Rollout analytics

One page on the game server so Han can judge **roll out vs pivot**: are strangers staying, which link they used, and did the match feel good. There is no third-party analytics account. Events are HTTP, not WebSocket, so `PROTOCOL_VERSION` stays put.

Local solo with no `VITE_SERVER_URL` sends nothing. The Vercel build (online lobby, including **Play solo offline**) does, because that build knows the server.

Players can read what is sent at **`/privacy.html`** and turn it off for their browser (see [Privacy and the play-data switch](#privacy-and-the-play-data-switch)). Before the Reddit posts, put the privacy contact email on that page (`TASKS.md` H-07).

## Open the dashboard

```
https://<render-service>.onrender.com/analytics?key=<ANALYTICS_DASHBOARD_KEY>
```

The same numbers as JSON:

```
https://<render-service>.onrender.com/analytics/summary?key=<ANALYTICS_DASHBOARD_KEY>
```

Or send the header `x-analytics-key` instead of `?key=`. The page refreshes every 30 seconds. It is `noindex`. The key is not printed on the page. `?key=` can show up in the host's access logs; treat the URL like a password.

If `ANALYTICS_DASHBOARD_KEY` is unset, both URLs are **404** and events are still accepted. A wrong key is **401**.

## Set the key on Render

1. Open the game server service (Singapore, shard A) → **Environment**.
2. Add `ANALYTICS_DASHBOARD_KEY` to a long random string (up to 200 characters). Do not commit it. `render.yaml` lists the variable as `sync: false`, so a Blueprint apply asks for it instead of storing it in git.
3. Save and deploy.
4. Open the URL above. The startup log says `dashboard on at /analytics` or `dashboard off until ANALYTICS_DASHBOARD_KEY is set`.

The client posts to `POST /analytics/event` on the same host as `VITE_SERVER_URL` (`wss://` becomes `https://`). The browser origin must be in `ALLOWED_ORIGINS`, the same list as the WebSocket. A failed post never blocks play.

## Keep the numbers across deploys

| `ANALYTICS_DIR` | What you get |
|---|---|
| Unset | A JSONL file in the system temp dir, plus memory. **A deploy or a new instance clears it.** The dashboard says so. Fine for a live evening; not fine for D7. |
| A Render Disk mount, e.g. `/var/data` | `events.jsonl` in that directory. This is what survives a deploy. On Render: **Disks** → add a disk → mount path `/var/data` → set `ANALYTICS_DIR=/var/data`. The process user must be able to write there. |
| `memory` | RAM only. Lost when the process stops. |

Memory and the dashboard keep 30 days (and at most 20,000 events). The file is rewritten to that window when it passes 2 MB; until then older lines stay in it, unread (see [Retention, honestly](#privacy-and-the-play-data-switch)). If the directory cannot be created, the server stays up and keeps events in memory; the log and the yellow banner say so.

There is no database and no paid add-on required. Without a disk, do not read D1/D7 after a restart — the cohort was wiped.

## Tag the links

Put this on the URL Han posts. It wins over the referrer and over `utm_source` / `utm_campaign`.

| Where | URL |
|---|---|
| r/PlayMyGame | `https://<vercel-app>/?src=reddit-playmygame` |
| r/incremental_games | `https://<vercel-app>/?src=reddit-incremental` |
| r/cozygames | `https://<vercel-app>/?src=reddit-cozy` |
| CrazyGames | `https://<vercel-app>/?src=crazygames` |

`utm_source` or `utm_campaign` with the same id also works, plus the aliases `playmygame`, `incremental_games`, `cozygames` and `crazygames` (a trailing `-` or `_` suffix is fine, e.g. `playmygame-sept`).

**Reddit's referrer is only `reddit.com`.** It does not name the subreddit, so a link without `?src=` lands in **Other** (or keeps a channel saved from an earlier tagged visit). Use the query param.

A visit whose referrer host is `crazygames.com` (or a subdomain) counts as CrazyGames even without `?src=`. Set the portal URL with `?src=crazygames` anyway, in case the frame omits the referrer.

Anything else with a referrer is **Other**. No referrer and no tag is **Direct**. A later visit with no tag keeps the last saved acquisition channel (`reddit-*` or CrazyGames) in `localStorage`. `?src=direct` or `?src=other` clears that.

## What each panel means

The page is the last 30 days. Times are UTC.

**Reaction.** Ratings are 1–5 from the end screen (4–5 positive, 3 mixed, 1–2 negative). Notes are optional, at most 140 characters. The page shows how many notes were left, not the text. The text is only in `events.jsonl`. Under five ratings, the page says to use match results as well: wins, losses, average Heart HP left on a win, average wave on a loss. Those come from the client when the match ends, including when nobody rates.

**How many are playing.**

- **Active sessions** — a heartbeat in the last 90 seconds, and the tab has not closed. This includes someone in the lobby or in solo on the Vercel build.
- **In a room now** — WebSocket players connected to a room (the same count as `/health` `players`). Solo-offline from the lobby is not in a room.
- **Sessions today** — session starts on today's UTC date.
- **Last 7 days** — session starts in the rolling 7×24 hours.
- **Session starts** — sessions in the 30-day window.
- **Average playtime** — ended sessions only. A session ends when the tab closes, or 90 seconds after the last heartbeat. Capped at 4 hours. Accuracy is about one heartbeat (25 seconds).
- **Repeat visitors** — visitors with two or more sessions, over visitors.
- **D1** — of visitors whose first session was on a UTC day before today, the share who started another session on the next UTC day.
- **D7** — the same, on the UTC day seven days after the first. `—` means the cohort is empty (nobody has had that long yet, or the log was wiped).

A visitor id is a random id in `localStorage` (`tdt.visitor`). It is not an account. Clearing site data looks like a new person. Gate 2's bar, once a channel has dozens of visitors, is about 25–30% back the next day and 7–8% after a week, compared across Reddit and CrazyGames. The page shows the rates; it does not paint pass or fail.

**Where they came from.** One row per channel, including zeros. Sessions, playtime and rating use that visit's tag. Visitors, repeat and D1 use the channel of the visitor's **first** session, so a later Direct visit still counts as a return for the Reddit cohort. Wait for dozens of visitors on a channel before judging it.

**Platform.** Session counts for **Web**, **iOS** (iPhone, iPod, iPad, and iPadOS which reports as a Mac with a touch screen) and **Android**. An installed home-screen app stays in the device's bucket.

## What the client sends

| Event | When |
|---|---|
| `session_start` | Page open (not `?showcase`, `?stress`, or `?progress`) |
| `session_heartbeat` | Every 25 seconds while the tab is visible |
| `session_end` | The page is going away (`pagehide`: close, refresh, or a phone app switch). Hiding a desktop tab only stops heartbeats; 90 seconds without one ends the session. A return within 90 seconds continues the same session. |
| `match_end` | The Heart survives or falls: result, Heart HP, mode, wave, player count |
| `feedback` | One tap of 1–5 on the end screen, plus the optional note |

Every event carries the visitor id, the session id, the channel and the platform, and nothing else beyond the fields above (the server rejects unknown fields). The end-screen control is hidden when there is no server URL or play data is off. Under the note box it says **"Don't include personal details."** with a link to the privacy page. Tapping a rating never blocks **Play again**. If the post fails, the match is unchanged.

Showcase (`?showcase`), the stress scene, and the progress page (`?progress`) do not start a session.

## Privacy and the play-data switch

**The page.** `apps/client/privacy.html` is a static page (a second Vite entry; it loads none of the game) at `https://<vercel-app>/privacy.html`. It is plain text that reads the same without JavaScript: what is sent and why, no accounts, no ads, no third-party trackers, no cookies, kept 30 days, the hosts (Vercel, Render in Singapore), the GDPR and PDPA basis, how to turn it off, and how to ask for a copy or deletion. A small script (`src/privacy/page.ts`) adds the switch and shows this browser's visitor id with a Copy button, so a player can quote it in a deletion request. The service worker serves it as itself, not as the game.

**Links.** The lobby card's last line ("No accounts · anonymous play data · Privacy"), the line under the rating's note box, and ⚙ Settings → Play data. All open in a new tab, so the lobby or the end screen stays.

**The switch.** ⚙ Settings → **Play data: On / Off**, and the same switch on the privacy page. It is saved for this browser under its own key, `tdt.analytics` (`on` / `off`), not in `tdt.settings`, so a game tab saving its settings cannot put back an old choice. The client reads it before **every** post (`allowed` in `session.ts`), so Off holds from the next event in every open tab:

- Off: nothing is sent: no heartbeat, no `session_end`, no `match_end`, no rating. The rating control is not shown. The session in progress just stops; the server closes it after its 90-second idle window.
- On again: the next tick starts a new session (`session_start`), with the same visitor id.
- Off from the start: no visitor id is made and the acquisition channel is not saved.
- With no choice made, it is **on**, unless the browser sends **Global Privacy Control** or **Do Not Track**; then it starts off and the player can still turn it on. A player's own choice always wins.

The page says what each event holds. When `AnalyticsBody` (`session.ts`) gains a field, add it to the page; `test/analytics.test.ts` fails until the field list there is updated too.

**Copy and deletion requests.** There are no accounts, so the visitor id is the only key. For a copy, send the player their lines: `grep '"visitor":"<id>"' events.jsonl` in the Render Shell. To delete one visitor's events by hand:

1. Render → the game server → **Shell**. In `ANALYTICS_DIR`, keep every line without the id: `grep -v '"visitor":"<id>"' events.jsonl > events.tmp && mv events.tmp events.jsonl`.
2. Restart the service when nobody is playing (a restart drains rooms for up to 300 s). The server holds events in memory and would write the deleted lines back at its next compaction until it reloads the file.

Without a disk (`ANALYTICS_DIR` unset or `memory`) a restart clears everything anyway. Reply to the player within 30 days. Ratings' notes are only in `events.jsonl`, never on the dashboard.

**Retention, honestly.** The dashboard and memory keep 30 days. The file on disk is only rewritten when it passes 2 MB, so on a quiet server older lines can stay in `events.jsonl` past 30 days, unread. Until the server trims the file on its own (a separate server change), trim it by hand from the Render Shell, in `ANALYTICS_DIR`, when nobody is playing (no restart needed: memory never holds the old lines):

```
node -e 'const fs=require("fs"),f="events.jsonl",cut=Date.now()-30*864e5;fs.writeFileSync(f+".tmp",fs.readFileSync(f,"utf8").split("\n").filter(l=>{try{return JSON.parse(l).at>=cut}catch{return false}}).map(l=>l+"\n").join(""));fs.renameSync(f+".tmp",f)'
```

## Limits

Posts need an `Origin` in `ALLOWED_ORIGINS`. Bodies over 2 KB are rejected. Unknown fields are rejected. Each IP can burst 10 events and then about one per second. The server stamps the time; the client clock is not trusted.
