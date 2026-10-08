# Rollout analytics

One page on the game server so Han can judge **roll out vs pivot**: are strangers staying (D1, D7, D30), which link they used, where new players stop, how matches go, whether the game crashes, and did the match feel good. There is no third-party analytics or crash-reporting account. Events are HTTP, not WebSocket, so `PROTOCOL_VERSION` stays put. D-01 built the funnel (PR #75 added the daily prune); p6a-analytics added D30, the new-player funnel, match breakdowns and crash reports.

Local solo with no `VITE_SERVER_URL` sends nothing. The Vercel build (online lobby, including **Play solo offline**) does, because that build knows the server.

Players can read what is sent at **`/privacy.html`**, turn it off for their browser, and download or delete what the server holds for it themselves (see [Privacy and the play-data switch](#privacy-and-the-play-data-switch)). Nothing is sent before a one-time age question, and nothing ever under 13 ([Age](#age)). Before the Reddit posts, put the privacy contact email on that page (`TASKS.md` H-07).

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

Beside it, `retention.json` holds the return-rate tables (see [Retention](#retention)); it is small (one short line per browser seen in the last month, plus daily counts) and is rewritten only when a new browser arrives, one comes back on day 1 / 7 / 30, or a browser is seen on a new day.

The file keeps 30 days (and at most the newest 20,000 events). The server drops older events and rewrites the file at startup and then every 24 hours of uptime, whatever the file size and whether or not anything was recorded that day. A deploy or restart also runs the startup prune. Between those, the file is also rewritten whenever an append pushes it past 2 MB. So nothing stays on disk for more than 30 days plus one day. Memory follows the same rule (see [Retention](#retention)). If the directory cannot be created, the server stays up and keeps events in memory; the log and the yellow banner say so.

There is no database and no paid add-on required. Without a disk, do not read D1/D7/D30 after a restart — the cohort was wiped.

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

The page is the last 30 days unless a panel says otherwise. Times are UTC. To see the layout without real data, `npm run analytics:example -w @tdt/server [-- out.html]` writes the page from made-up events with a red **EXAMPLE DATA** banner.

**Coming back.** D1, D7 and D30 in big numbers, then the newest ten first-visit days.

- **D1 / D7 / D30** — of the browsers whose first visit was at least 1, 7 or 30 UTC days ago, the share that started a session exactly 1, 7 or 30 UTC days after the first one. It covers first visits in the last 90 days (the cohort counts, see [Retention](#retention)), not just the 30-day event window, so a Reddit post's cohort keeps its D30 after day 30. Today's returns count as they come, so the newest cohort climbs during the day. `—` means the cohort is empty (nobody has had that long yet, or the log was wiped).
- **By first visit** — per UTC day: new browsers, and D1 / D7 / D30 for that day's cohort ("not yet" until it is old enough). A post day stands out.

A visitor id is a random id in `localStorage` (`tdt.visitor`). It is not an account. Clearing site data looks like a new person. Gate 2's bar, once a channel has dozens of visitors, is about 25–30% back the next day and 7–8% after a week, compared across Reddit and CrazyGames. The page shows the rates; it does not paint pass or fail.

**Where new players stop.** New players are browsers whose first session is in the 30-day window (the retention table says which session was first). For each step, how many did it **in that first session**, as a share of those who opened the game, and how many **stopped** there (it was the furthest step they reached). The yellow line names the step most stopped after, the last one aside.

| Step | From |
|---|---|
| Opened the game | `session_start` |
| Saw the lobby | `funnel` `lobby` (the online home screen came up; a page that fails before it, e.g. no WebGL, stops at "Opened") |
| Started a match | `match_start` (a second of match time, solo or a room) |
| Reached wave 3 / 5 / 10 | `funnel` `wave_3` / `wave_5` / `wave_10` |
| Finished a match (won or lost) | `match_end` |
| Started a second match | a second `match_start` in the same session |

A loss at wave 4 reaches "Finished a match" but not "Reached wave 5"; it stops at "Finished". Below it, **First-match lesson (solo)**: how many first sessions reached each lesson card (`tutorial_move` … `tutorial_emote`), finished it (`tutorial_done`) or skipped it (`tutorial_skip`, the card's Skip or the solo pick's Skip lesson). Online rooms never run the lesson.

**Reaction.** Ratings are 1–5 from the end screen (4–5 positive, 3 mixed, 1–2 negative). Notes are optional, at most 140 characters. The page shows how many notes were left, not the text. The text is only in `events.jsonl`. Under five ratings, the page says to use match results as well: wins, losses, average Heart HP left on a win, average wave on a loss. Those come from the client when the match ends, including when nobody rates.

**How many are playing.**

- **Active sessions** — a heartbeat in the last 90 seconds, and the tab has not closed. This includes someone in the lobby or in solo on the Vercel build.
- **In a room now** — WebSocket players connected to a room (the same count as `/health` `players`). Solo-offline from the lobby is not in a room.
- **Sessions today** — session starts on today's UTC date.
- **Last 7 days** — session starts in the rolling 7×24 hours.
- **Session starts** — sessions in the 30-day window.
- **Average playtime** — ended sessions only. A session ends when the tab closes, or 90 seconds after the last heartbeat. Capped at 4 hours. Accuracy is about one heartbeat (25 seconds).
- **Repeat visitors** — visitors with two or more sessions, over visitors.

**Where they came from.** One row per channel, including zeros. Sessions, playtime and rating use that visit's tag. Visitors, repeat and D1 / D7 / D30 use the channel of the visitor's **first** session, so a later Direct visit still counts as a return for the Reddit cohort. Wait for dozens of visitors on a channel before judging it.

**Matches.** Matches started and finished, then four small tables over the finished ones: by mode and difficulty, by team (players, and solo in the browser vs a room), by your hero, and by channel. Each row: matches, share won, average wave the match ended on, average length (match time, build phase included). Each player in a room reports the match, so a 3-player room is three rows' worth; reports from clients older than this change have no difficulty, length or hero and show as "difficulty not sent" or fall out of the hero table.

**Crashes and errors.** Uncaught errors and unhandled promise rejections in the page, grouped by message and the line they were thrown from: reports, sessions, browser families, builds (first 7 characters of the commit), last seen, and the newest stack under **Stack**. The header line is the share of sessions with any report. See [Crash reports](#crash-reports).

**Platform.** Session counts for **Web**, **iOS** (iPhone, iPod, iPad, and iPadOS which reports as a Mac with a touch screen) and **Android**. An installed home-screen app stays in the device's bucket.

## What the client sends

| Event | When |
|---|---|
| `session_start` | Page open (not `?showcase`, `?stress`, or `?progress`) |
| `session_heartbeat` | Every 25 seconds while the tab is visible |
| `session_end` | The page is going away (`pagehide`: close, refresh, or a phone app switch). Hiding a desktop tab only stops heartbeats; 90 seconds without one ends the session. A return within 90 seconds continues the same session. |
| `match_start` | A second of match time in (solo or a room): mode, difficulty, player count, solo or online (`online`), your hero, every hero in seat order |
| `match_end` | The Heart survives or falls: result, Heart HP, wave, length in seconds (`durationSec`), and the same fields as `match_start` |
| `funnel` | Once a session per step: `lobby`, `wave_3` / `wave_5` / `wave_10`, the lesson cards `tutorial_move` … `tutorial_emote`, `tutorial_done`, `tutorial_skip` |
| `client_error` | An uncaught error or unhandled rejection, or a start-up that was slow or had no graphics: `kind`, `message`, `stack`, `build`, `browser` (see [Crash reports](#crash-reports)) |
| `feedback` | One tap of 1–5 on the end screen, plus the optional note |

Every event carries the visitor id, the session id, the channel and the platform, and nothing else beyond the fields above (the server rejects unknown fields). The game view turns snapshots into the match events (`analytics/matchTracker.ts`); the HUD no longer sends `match_end` itself. The end-screen control is hidden when there is no server URL or play data is off. Under the note box it says **"Don't include personal details."** with a link to the privacy page. Tapping a rating never blocks **Play again**. If the post fails, the match is unchanged.

Showcase (`?showcase`), the stress scene, and the progress page (`?progress`) do not start a session. On the online build the session starts before the game view is created, so a page that cannot start (no WebGL) still counts as a visit and can send its reason (`webgl_unavailable`).

## Crash reports

`installAnalytics` listens for `error` and `unhandledrejection` on `window` and sends `client_error` through the same client as every other event, so the play-data switch, GPC and DNT apply exactly as they do for the rest (nothing is sent when off). What a report holds (`analytics/errors.ts`):

- `message`: the error's name and message, at most 160 characters.
- `stack`: the top six frames, at most 700 characters. Every web address loses its host, query and hash (`https://host/assets/a.js?src=…` becomes `assets/a.js`), so tagged links and room codes never travel.
- `build`: the commit Vercel built (`__BUILD__`, or `dev`). `browser`: Chrome, Safari, Firefox, Edge, Samsung Internet or other, from the user agent. Nothing else about the browser is kept.

**Start-up reasons.** The start-up watchdog (`startup/boot.ts`, main.ts) sends three fixed messages through this same path, with `kind: error` and no stack, so nothing else about the player or the page travels:

| `message` | When |
|---|---|
| `boot_timeout` | The game had not reached its first screen after 15 seconds of the page being on screen (time in the background does not count). The player is shown "Still loading…" with a Reload button. The start-up keeps going, so this counts **slow** starts: the game may well have started a moment later. |
| `webgl_unavailable` | The browser could not create WebGL (none, or the real context could not be made). Shown at once: "This browser could not start the game's graphics." with Reload. |
| `webgl_context_lost` | The WebGL context was lost while the renderer started. Shown at once, same line. |

They follow the rules below like any other report, the Play data switch and the age answer included. The dashboard groups them by message, so *Crash reports* shows how many reports and sessions each had and in which browsers; every event also carries the platform. Local solo (no game server, no analytics) sends none. A page that never runs `main.ts` at all (the script not arriving) sends nothing: the splash is plain HTML on purpose and has no script of its own.

Limits, per session: each error (message plus first stack line) is sent once; at most 5 reports; a report less than 5 seconds after the last one is dropped (a burst is usually one fault). A new session starts the count again. Errors in the simulation worker are not captured (the worker's own errors do not reach `window`). Errors before analytics is installed (the first lines of `main.ts`) are not either. The server accepts messages up to 200 characters and stacks up to 1,000 and rejects anything else.


## Privacy and the play-data switch

**The page.** `apps/client/privacy.html` is a static page (a second Vite entry; it loads none of the game) at `https://<vercel-app>/privacy.html`. It is plain text that reads the same without JavaScript: what is sent and why, no accounts, no ads, no third-party trackers, no cookies, kept 30 days, the hosts (Vercel, Render in Singapore), the GDPR and PDPA basis, the player's rights under both in plain words, the age rule, how to turn it off, how to download or delete it themselves, and how to ask by email. A small script (`src/privacy/page.ts`) adds the switch, the **Download my data** / **Delete my data** buttons, the age question when On is pressed before it was answered, and this browser's visitor id with a Copy button for an email request. The service worker serves it as itself, not as the game.

**Links.** The lobby card's last line ("No accounts · anonymous play data · Privacy"), the line under the rating's note box, and ⚙ Settings → Play data. All open in a new tab, so the lobby or the end screen stays.

**The switch.** ⚙ Settings → **Play data: On / Off**, and the same switch on the privacy page. It is saved for this browser under its own key, `tdt.analytics` (`on` / `off`), not in `tdt.settings`, so a game tab saving its settings cannot put back an old choice. The client reads it before **every** post (`allowed` in `session.ts`), so Off holds from the next event in every open tab:

- Off: nothing is sent: no heartbeat, no `session_end`, no match events, no funnel steps, no crash reports, no rating. The rating control is not shown. The session in progress just stops; the server closes it after its 90-second idle window.
- On again: the next tick starts a new session (`session_start`), with the same visitor id.
- Off from the start: no visitor id is made and the acquisition channel is not saved.
- With no choice made, it is **on** (16 and over, see [Age](#age)), unless the browser sends **Global Privacy Control** or **Do Not Track**; then it starts off and the player can still turn it on. A player's own choice always wins.
- Before the age question is answered nothing is sent, whatever the switch says; under 13 it is off and On cannot be picked (`analyticsAllowed` in `preference.ts`).

The page says what each event holds. When `AnalyticsBody` (`session.ts`) gains a field, add it to the page; `test/analytics.test.ts` fails until the field list there is updated too.

<a id="age"></a>**Age.** Before any play data is sent, the game asks once, **"How old are you?"**: one number field, no suggested answer, no hint of what any age changes (`src/privacy/ageCheck.ts`). The answer stays in the browser as `tdt.age` (`{ age, month }`; the age grows by full years since, never sooner) and is never sent. Everyone can play whatever the answer.

| Age | Play data |
|---|---|
| Not answered yet | Nothing is sent. |
| Under 13 | Off, and On cannot be picked. Anything this browser sent before is deleted with its data key, and its id and key are cleared. |
| 13 to 15 | Starts off. The player may turn it on. |
| 16 and over | The usual rule: on, unless GPC / DNT or the player turned it off. |

When it is asked: at the first **Play solo**, **Start lesson**, **Create room** or **Join room** tap (the solo pick's Play in a build with no lobby), and when the player turns play data on before answering. Never on first load: the lobby paints and is tappable exactly as before (D-08's first-load numbers do not change), and a returning browser never sees it. Continue goes straight on to what was tapped, so a new player's first match costs one extra step (type the age, Continue), once. It is only asked when the page could send something: a build with no game server, or play data already off (switch or GPC / DNT), skips it until the player turns play data on. The lobby funnel step is sent right after the answer, since nothing went before it. Typing a different age needs clearing the site's data; the game does not offer a second try.

<a id="your-data"></a>**Your data: copy and deletion, by the player.** ⚙ Settings → Play data → **Your data**, and the same two buttons on the privacy page:

- **Download my data** asks the server for everything it holds for this browser and saves it as `tdt-play-data-<date>.json` (the share sheet on a phone that has one): an `about` line, the time, the visitor id, its events and its retention line.
- **Delete my data** (tap twice) deletes the same from memory, `events.jsonl` and `retention.json` at once, then clears the id, the data key and the saved channel in this browser. An open game tab forgets the old id too (it listens for the key changing). If play data is still on, the next event starts a new id.

How it proves the browser is yours without accounts: every browser has a **data key**, 32 random bytes kept only in its storage (`tdt.visitorKey`) and never sent with events. Its visitor id is derived from it: the first 32 hex characters of SHA-256 of `tdt-visitor-v1:<key>` (`analytics/dataKey.ts` on both sides; a test checks they agree). The two buttons post `{"key": "<key>"}` to `POST /analytics/mine` and `POST /analytics/mine/forget`; the server derives the id itself. So:

- No request can name an id. An id seen anywhere (the dashboard, `events.jsonl`, an email, the privacy page) cannot be turned back into its key, and guessing a 256-bit key is hopeless.
- A wrong key gets the same answer as a right key with nothing held (`200`, no events, `removedEvents: 0`), so the routes do not even say whether an id exists.
- The key is in the POST body, never the URL, so it is not in access logs. Bodies over 256 bytes, other fields, or a key that is not 64 lowercase hex characters are `400` / `413`.
- Rate limit: each address can make 5 requests, then one every 20 seconds (`429`, `Retry-After: 20`); all addresses together, 60 at once, then one a second.
- Origins follow `ALLOWED_ORIGINS`, like events. The routes work whether or not `ANALYTICS_DASHBOARD_KEY` is set.
- After a deletion the server drops events for that id for 15 minutes (memory only), so a heartbeat already in flight cannot bring it back.

Ids made before data keys (a random `tdt.visitor` with no `tdt.visitorKey`) cannot prove they are this browser's, so at the next session start the game replaces them with a keyed id. That browser counts as a new visitor once. The old id's data goes in 30 days, or by email; Delete in such a browser clears the old id locally and says so.

**Requests by email** (a player who cleared the site's data, or uses another device). The visitor id is the only key. With the dashboard key set:

- **Copy:** `curl -H "x-analytics-key: $KEY" "https://<render-service>.onrender.com/analytics/visitor?id=<id>"` returns that browser's events and its retention line as JSON.
- **Delete:** `curl -X POST -H "x-analytics-key: $KEY" "https://<render-service>.onrender.com/analytics/forget?id=<id>"` removes every event with that id and its retention line, takes it out of its first day's counts, and rewrites `events.jsonl` and `retention.json` at once. It answers `{"visitor":"<id>","removedEvents":N}`. No restart is needed, and the daily prune cannot write the lines back.

Without the key (dashboard off), do it by hand in Render → the game server → **Shell**, in `ANALYTICS_DIR`: `grep -v '"visitor":"<id>"' events.jsonl > events.tmp && mv events.tmp events.jsonl`, delete `retention.json` (it is rebuilt from the log at startup), then restart when nobody is playing (a restart drains rooms for up to 300 s; until then the server holds the events in memory and would write them back).

Without a disk (`ANALYTICS_DIR` unset or `memory`) a restart clears everything anyway. Reply to the player within 30 days. Ratings' notes are only in `events.jsonl`, never on the dashboard.

<a id="retention"></a>**Retention.** Memory, the dashboard and `events.jsonl` keep 30 days of events. The server prunes older events and rewrites the file at startup and every 24 hours of uptime, whatever the file size, so no line stays on disk for more than 30 days plus one day (see Storage above).

D30 needs the day-30 visit and the first visit together, and the first visit is pruned during day 30 or 31. Rather than keep every event longer, the server keeps two small tables in `retention.json` (`apps/server/src/analytics/retention.ts`):

- **One line per visitor id**: the UTC day of its first visit, that visit's channel and session id, the last UTC day it was seen, and whether it came back on day 1, 7 and 30. It is deleted **31 days after the last day the id was seen**. That is at least one day past the browser's own events, long enough to mark a day-30 return, and it means a regular player is never counted as new again while they keep coming.
- **Daily cohort counts with no id**: per first-visit day and channel, how many browsers were new and how many came back on day 1, 7 and 30. Kept **90 days**, so D30 covers about two months of cohorts. These are totals, not personal data; a deletion request still takes its browser out of them while its line exists.

Both are filled in as events arrive and rebuilt from `events.jsonl` when the file is missing or torn (replaying an event twice changes nothing). The privacy page says the same. Nothing needs trimming by hand.

## Limits

Posts need an `Origin` in `ALLOWED_ORIGINS`. Bodies over 2 KB are rejected (a crash report is at most about 1.2 KB). Unknown fields are rejected. Each IP can burst 10 events and then about one per second. A player's own copy and deletion have their own, tighter limit (see [Your data](#your-data)). The server stamps the time; the client clock is not trusted.
