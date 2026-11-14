# Queue status

Live: no

The autopilot's work list (rules: [README.md](README.md)). Sessions read it top to bottom and take the first
`todo` row whose Needs are `done` on `main`. Status values: `todo`, `in-progress`, `done`, `blocked` (see Notes;
skipped until the decision named there is answered), `han` (Han's own step, skipped). `Merge` says who merges the
task's pull request: `autopilot` (a later run, once `ci` is green) or `Han`. The game's own tracker is still
`TASKS.md`; every brief says what to record there.

`Live: no` means no public page is up, so a merge may restart the game server at any time (README, "When the game
is live").

## Build tasks

| Task | Title | Merge | Status | PR | Needs | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| q1 | [Laptop run fixes: whole numbers, a way back to the lobby, tidy skill buttons](q1-laptop-fixes.md) | autopilot | done | #170 |  | Client only. |
| q2 | [Call early waits for the wave, and End run for Endless](q2-call-early.md) | autopilot | done | #173 | q1 | Han confirmed the rule on 11 Nov. Merge condition in the file. |
| q3 | [No question before the first match (hosted builds), and counts that need no id](q3-no-question.md) | Han | done | #175 | q2 | Han reads the privacy page's new paragraph before merging, and answers the one question in the pull request. |
| q4 | [A lighter download: the hosted zip under 20 MB, a first match's art under 5 MB](q4-lighter-download.md) | Han | done | #176 | q2 | Han judges `docs/art/lighter-ab.png` on his Pixel before merging. May be built beside q3. |
| q5 | [CrazyGames prep: their build, an audit against their rules, the submission kit](q5-crazygames-prep.md) | autopilot | done | #177 | q3, q4 | After it merges the advisor writes the audit's fix as a new task. |
| q6 | [A bot teammate in solo](q6-bot-teammate.md) | Han | done | #181 | q5 | Han reviews the balance tables and plays it before merging. |

## Build tasks, continued (13 Nov: the fixes from the CrazyGames audit; 14 Nov: the previews)

One list with the table above: a session reads both, top to bottom. They are in a table of their own only so that
adding them did not touch the lines a claimed task's branch is changing.

| Task | Title | Merge | Status | PR | Needs | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| q7 | [CrazyGames' frames: the desktop layout in every desktop frame, Play solo on the first screen, text of 11 px](q7-crazygames-frames.md) | autopilot | done | #183 | q5 | Client only. Merge condition in the file. |
| q8 | [Keys CrazyGames allows, and a lesson that shows them](q8-keys-and-lesson.md) | autopilot | done | #187 | q7 | Client only. Merge condition in the file. |
| q9 | [CrazyGames' previews again: the bot teammate and a combo on screen](q9-previews-with-the-ally.md) | autopilot | done | #189 | q8 | The script, two videos and docs: nothing in the game. Merge condition in the file. |

## Han's own steps (the autopilot skips these)

| Task | Title | Merge | Status | PR | Needs | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| h1 | One room across three devices (Pixel, iPhone, laptop): a Quick match to the end |  | han |  |  |  |
| h2 | Render origins, the itch zip, the itch.io Draft and its check |  | han |  |  |  |
| h3 | Submit to CrazyGames with the kit in docs/crazygames/ |  | han |  |  | After q9 (the new previews), with Han's own checks in Edge and Safari. |
