# Progress dashboard

`/?progress` on any build (production: https://tgt-td-cld.vercel.app/?progress) is a static client page. It does not talk to the game server, does not start an analytics session, and does not change `PROTOCOL_VERSION`. It does not call GitHub.

**`TASKS.md` is the only tracker.** The page reads [`apps/client/src/progress/data.ts`](../apps/client/src/progress/data.ts), which mirrors `TASKS.md`. **Do not add a third list** (no queue file, no `AUTO_QUEUE`, no bot-only list). When a pull request finishes a task, update both in that same PR:

1. The task’s status in `TASKS.md`.
2. The matching item in `apps/client/src/progress/data.ts` (`status`, and `proof` with the PR link when it is done).

A task with no code change (a setting Han confirms) is still closed in both files. Proof may be a Decision Log row or a Han note instead of a pull request.

## Cooking now

The strip at the top of `/?progress` lists items whose `status` is `in_progress`, in tracker order. That is the whole strip. It does not fetch open pull requests.

Open pull requests and CI are the Ops Dashboard’s live feed. This page does not copy them. An empty strip means nothing on the tracker is marked in progress.

## Now, for overnight bots

Open **Team** to-dos in the **Now** section of `TASKS.md`, top to bottom, are the auto-pull order. Skip Han rows and anything already done. The page repeats that sentence. The order lives only in `TASKS.md`.

Filters on the page: All, Now, Han, Team, Done, Later. `status` is `done`, `todo`, `in_progress`, or `blocked`. `owner` is `Han`, `Team`, or `Both`.
