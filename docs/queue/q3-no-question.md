# q3: No question before the first match (hosted builds), and counts that need no id

| | |
| --- | --- |
| Roadmap row | No question before the first match (hosted builds), and counts that need no id |
| Merge | Han |
| Needs | q2 |
| Restarts the game server | yes (server HTTP) |
| Written | 11 Nov 2026, by the advisor |

How a session starts and ends is in [README.md](README.md). Where the brief below says otherwise (a branch
name, "no other pull request may be open", auto-merge, "stop and tell Han", who merges), the README decides.
Everything else in the brief is the task.

## Brief

No question before the first match in hosted builds, and a first-session funnel and return rates counted with no id. Read CLAUDE.md (Architecture rules: "Analytics respect the Play data switch" and "Hosted builds hang on one constant"), docs/ANALYTICS.md ("Age", "Before the age question", "Hosted builds", "Retention"), apps/client/src/privacy/ageCheck.ts (ageGate, ageNeeded), apps/client/src/analytics/ (session.ts: createCounter and COUNT_KINDS; preference.ts: countOn; install.ts; age.ts; matchTracker.ts), apps/client/src/main.ts and online.ts (where ageGate wraps Play solo, Learn to play, Create room and Join room), apps/server/src/analytics/ (channels.ts: COUNT_KINDS; counts.ts; page.ts; summary.ts) and apps/client/privacy.html first. New branch from the latest main; no other pull request may be open. Client, the server's HTTP analytics and docs: no sim, tuning or WebSocket message change, PROTOCOL_VERSION stays as main has it. The merge restarts the game server (server code), so Han merges it between his own tests.

## Why (the advisor's review of 10 Nov 2026; Han: go)
The game goes to CrazyGames' Basic Launch as its test with strangers. CrazyGames measures conversion (the share of players still playing a minute after they start; its bar is 80%), the average play time and the day-1 return. Today a stranger's first Play tap opens a typed "How old are you?" sheet before the first match, and nothing with an id is sent until it is answered: the first thing a stranger meets on a portal where players leave within seconds. Page opens and failed starts are already counted with no id before the answer (POST /analytics/count; Han, 8 Oct 2026). This task extends that idea, so the question is not needed before play.

## What to build
1. One constant, ASK_AGE_AT_PLAY, in a small pure module with a test: false in a hosted build (__EMBED__), true on the site. Where it is false, ageGate runs `next` at once, so Play solo, Learn to play, the Daily run's start, Create room and Join room never open the sheet. Everything else about the age rules stays: nothing with an id is sent before an answer (analyticsOn still needs one); the sheet still opens where a name is posted (the Daily run's Post my run, the Endless board's consent card) and when Play data is turned on in Settings; under 13 still sends nothing and deletes what was sent; 13 to 15 still starts off. On the site nothing changes. Follow the __EMBED__ rule: a new function called under the constant, never a changed shared body, and the site's dist/ compared with main's.
2. Counts with no id, on the site and in hosted builds, through createCounter and countOn only (so Play data off, GPC / DNT, under 13, and 13 to 15 without Play data still send nothing). New kinds beside `open`, each sent at most once per page load:
   - `first_open`: this browser's first counted open (nothing stored for it yet);
   - `match_start`: a match reached one second of match time, solo or in a room (never the stress scene);
   - `match_minute`: 60 s of match time played in one match (CrazyGames' conversion);
   - `match_end`: a match ended, won or lost;
   - `match_second`: a second match started in the same page load;
   - `return_d1` and `return_d7`: this page load is exactly 1 or 7 UTC days after this browser's first counted open.
   The body stays what, channel, platform and browser: no id, no time, no text. For the two returns the browser keeps, in localStorage only, the UTC day of its first counted open and which returns it has already counted (a pure module with tests: the day arithmetic, once per return, a cleared store starts again, no store means no returns and no error). Nothing stored is ever sent. A hosted frame with no storage sends the match counts and no returns. Delete my data clears the stored day.
3. Server: the new kinds in channels.ts COUNT_KINDS (a test compares the client's list with the server's), counts.json rows as today (a UTC day, kind, channel, platform, browser; 90 days), an extra field or an unknown kind still rejected. The dashboard's "Before the age question" table gains, per channel: first opens, matches started, played a minute, finished, a second match, each also as a share of first opens, and D1 / D7 as a day's `return_d1` over the `first_open` of the day before (`return_d7`: of 7 days before), labelled "counted without ids: approximate". /analytics/summary carries the same. npm run analytics:example -w @tdt/server shows them.
4. privacy.html: one paragraph in plain words beside the anonymous counts (what each new count says, that none carries an id, that the day of the first visit is kept on the device and never sent, and that the Play data switch and GPC / DNT turn them off), and the sentence on when the age question is asked, with the hosted builds' rule. Update the tests that list the fields and the sentences. Han reads this paragraph before he merges: quote it in the pull request.
5. docs/ANALYTICS.md ("Before the age question", "Age", "Hosted builds": a hosted build's funnel is read from the counts), docs/MOBILE_TESTING.md (a hosted build's first Play tap starts the match), a Decision Log row in docs/GAME_DESIGN.md, CLAUDE.md's status paragraph, TASKS.md and apps/client/src/progress/data.ts (a new done row in the Discovery list, the next free D- number, "No question before the first match", with this pull request's number; apps/client/test/progress.test.ts checks exact counts: work them out, don't guess).

## Checks
- Unit tests: ASK_AGE_AT_PLAY and ageGate in both builds; the send rule for every case of age band, choice, GPC and DNT for the new kinds (they follow countOn exactly); the return days; the server's parse and totals; the two kind lists equal.
- Browser tests, once each: e2e/privacy.spec.ts on pixel (the site still asks at Play; the counts go before the answer; nothing with an id does) and e2e/embed.spec.ts on pixel after `npm run build:embed -w @tdt/client -- itch --e2e` (Play solo starts the match with no sheet; match_start and match_minute are posted with no id; Post my run still opens the sheet).
- npm test and npm run build pass, run after the last edit.

Open the pull request, do not turn on auto-merge (Han reads the privacy paragraph first), and stop. In the summary: the paragraph, the list of everything sent before an age answer, and one question for Han: should the site drop the question at Play too (ASK_AGE_AT_PLAY false everywhere)?
