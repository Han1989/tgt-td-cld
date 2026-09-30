# Progress dashboard

`/?progress` on any build (production: https://tgt-td-cld.vercel.app/?progress) is a static client page. It does not talk to the game server, does not start an analytics session, and does not change `PROTOCOL_VERSION`.

**`TASKS.md` is the tracker.** The page reads [`apps/client/src/progress/data.ts`](../apps/client/src/progress/data.ts).

When a pull request finishes a task, update **both** in that same PR:

1. The task’s status in `TASKS.md`.
2. The matching item in `apps/client/src/progress/data.ts` (`status`, and `proof` with the PR link when it is done).

Filters on the page: All, Now, Han, Team, Done, Later. `status` is `done`, `todo`, `in_progress`, or `blocked`. `owner` is `Han`, `Team`, or `Both`.
