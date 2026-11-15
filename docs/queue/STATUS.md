# Queue status

Live: yes

The autopilot's work list (rules: [README.md](README.md)). Sessions read it top to bottom and take the first
`todo` row whose Needs are `done` on `main`. Status values: `todo`, `in-progress`, `done`, `blocked` (see Notes;
skipped until the decision named there is answered), `han` (Han's own step, skipped). `Merge` says who merges the
task's pull request: `autopilot` (a later run, once `ci` is green) or `Han`. The game's own tracker is still
`TASKS.md`; every brief says what to record there.

`Live: yes` since 15 Nov 2026: the game is submitted to CrazyGames (game ID 173418, awaiting review), and the copy
they hold talks to the game server on protocol 28. A pull request that restarts the game server or changes
`PROTOCOL_VERSION` is Han's to merge (README, "When the game is live").

## Build tasks

| Task | Title | Merge | Status | PR | Needs | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| q1 | [Laptop run fixes: whole numbers, a way back to the lobby, tidy skill buttons](q1-laptop-fixes.md) | autopilot | done | #170 |  | Client only. |
| q2 | [Call early waits for the wave, and End run for Endless](q2-call-early.md) | autopilot | done | #173 | q1 | Han confirmed the rule on 11 Nov. Merge condition in the file. |
| q3 | [No question before the first match (hosted builds), and counts that need no id](q3-no-question.md) | Han | done | #175 | q2 | Han reads the privacy page's new paragraph before merging, and answers the one question in the pull request. |
| q4 | [A lighter download: the hosted zip under 20 MB, a first match's art under 5 MB](q4-lighter-download.md) | Han | done | #176 | q2 | Han judges `docs/art/lighter-ab.png` on his Pixel before merging. May be built beside q3. |
| q5 | [CrazyGames prep: their build, an audit against their rules, the submission kit](q5-crazygames-prep.md) | autopilot | done | #177 | q3, q4 | After it merges the advisor writes the audit's fix as a new task. |
| q6 | [A bot teammate in solo](q6-bot-teammate.md) | Han | done | #181 | q5 | Han reviews the balance tables and plays it before merging. |

## Build tasks, continued (13 Nov: the fixes from the CrazyGames audit; 14 Nov: the previews, then the fixes from Han's three-device match; 15 Nov: the lobby, then the tidying after the CrazyGames submission, then three tasks while the review runs)

One list with the table above: a session reads both, top to bottom. They are in a table of their own only so that
adding them did not touch the lines a claimed task's branch is changing.

| Task | Title | Merge | Status | PR | Needs | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| q7 | [CrazyGames' frames: the desktop layout in every desktop frame, Play solo on the first screen, text of 11 px](q7-crazygames-frames.md) | autopilot | done | #183 | q5 | Client only. Merge condition in the file. |
| q8 | [Keys CrazyGames allows, and a lesson that shows them](q8-keys-and-lesson.md) | autopilot | done | #187 | q7 | Client only. Merge condition in the file. |
| q9 | [CrazyGames' previews again: the bot teammate and a combo on screen](q9-previews-with-the-ally.md) | autopilot | done | #189 | q8 | The script, two videos and docs: nothing in the game. Merge condition in the file. |
| q10 | [Previews, round 2: the hero alive at the end, and the kill count clear of the combo band](q10-previews-round-2.md) | autopilot | done | #191 | q9 | Client HUD (one small change), the script, two videos. Merge condition in the file. |
| q11 | [iPhone fix: a finger iOS takes away never leaves the stick held](q11-stick-never-stuck.md) | autopilot | done | #193 | q10 | Client only. From Han's three-device match of 14 Nov. Merge condition in the file; Han then tries it on the iPhone in Safari. |
| q12 | [Coming back to a running match: at any time, and by the room code too](q12-come-back-to-a-match.md) | autopilot | done | #194 | q11 | Sim, protocol (28), server and client: the merge restarts the game server and every hosted zip is built again. Han confirmed the rule by merging the brief. Merge condition in the file; Han tries it on the live site after the merge. |
| q13 | [The lobby: hero faces that live, and today's champions on the first screen](q13-lobby-faces-and-champions.md) | Han | done | #196 | q12 | Client, and one field more in GET /endless/today (the merge restarts the game server; the protocol stays 28). Han judges it on his phone from the pictures and clips in the pull request. |
| q14 | [After the CrazyGames submission: the kit as uploaded, the label zone, one privacy line](q14-after-the-submission.md) | autopilot | done | #198 | q13 | Scripts, privacy.html and docs: no game code, no server restart. Merge condition in the file. |
| q15 | [CrazyGames' SDK: their invites and instant multiplayer, their mute and usernames, and a data key that stays in this browser](q15-crazygames-sdk.md) | autopilot | done | #200 | q14 | The crazygames build only (client, the build script, the harness, privacy.html, docs): no server restart, the protocol stays 28, the site's build unchanged. Merge condition in the file. After the merge a new CrazyGames zip is built and its upload is Han's. |
| q16 | [A stricter name filter for the boards and the rooms, and the Daily run's top names in one answer](q16-name-filter.md) | Han | done | #201 |  | The game server only, with tests and docs: the merge restarts it, so it is Han's (the game is live); the protocol stays 28. May be built beside q15. |
| q17 | [Lobby touch-ups: the Warden's face readable, and the Daily run's leaders on the champions' ribbon](q17-lobby-touch-ups.md) | Han | todo |  | q15, q16 | Client only. It reads q16's two new fields from the live server. Han judges it on his phone from the pictures in the pull request. |

## Han's own steps (the autopilot skips these)

| Task | Title | Merge | Status | PR | Needs | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| h1 | One room across three devices (Pixel, iPhone, laptop): a Quick match to the end |  | done |  |  | Played 14 Nov: won. It found q11 (the stuck stick on the iPhone) and q12 (no way back into a running match). |
| h2 | Render origins, the itch zip, the itch.io Draft and its check |  | done |  |  | Done 15 Nov: the Draft is up (han1989.itch.io/tower-defense-together) and its checks passed on the laptop and the Pixel. It stays a Draft. |
| h3 | Submit to CrazyGames with the kit in docs/crazygames/ |  | done |  |  | Submitted 15 Nov, 14:43: Basic Launch, game ID 173418, awaiting review. |
