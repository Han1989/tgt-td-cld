# The autopilot prompt

One prompt starts every build session, whether Han pastes it or a scheduled task sends it. Keep it
here so both use the same text.

## Prompt

```
Run autopilot on Han1989/tgt-td-cld.

Read CLAUDE.md, docs/queue/README.md and docs/queue/STATUS.md, then follow the loop in
docs/queue/README.md from step 0: answered decisions and open task pull requests first, then the
first free `todo` task. One task for this session, claimed before you build. Merge only what the
README lets a run merge.

Nobody is watching this session. Do not ask me questions here and do not wait for me: when a
decision is needed, record it as the README's "Decisions" section says and end with the report.
Start every issue and comment you write with "Autopilot:". If there is nothing to do, say so in
one line and end.

Push task branches as queue/q<n>-<slug> (or claude/queue-q<n>-<slug> if that is all this session
may push). Never push to main.

End with the report from the README, five lines at most.
```

## Running it without pasting

Create one cloud scheduled task, in a browser at claude.ai/code/routines (New task) or in the
Claude desktop app (Code → Scheduled → New task → Cloud), with:

| Setting     | Value                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| Name        | TGT autopilot                                                            |
| Prompt      | The text in the block above, unchanged                                   |
| Model       | The model Han uses for build sessions                                    |
| Repository  | `Han1989/tgt-td-cld`                                                     |
| Environment | The one the game's build sessions use (packages install there)           |
| Trigger     | Schedule, every hour (custom cron `33 * * * *`)                          |
| Connectors  | None needed; remove the ones the build does not use                      |

Each run is a fresh session. A run that finds another session's task pull request still active
ends at once (README, step 0), so overlapping runs do not collide. Pause the scheduled task
whenever the build should stand still; resume it after a new task file is merged.

Han's part while it runs: merge the pull requests whose row says `Han` after looking at what the
report names, answer the few `Decision needed` issues with a one-line comment, and do his own
steps (the `han` rows in STATUS.md) when he wants what they unlock.
