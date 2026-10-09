# Claude Code task inbox

Claude Code polls this folder on **`main`** once an hour. There is only one active task, in `CURRENT.md`. A bot writes `READY` tasks into that file. Claude Code does the work, opens a pull request, and does not merge it.

## How to poll

1. Check out the latest `main` (this repo is GitHub-connected to `main`).
2. Read `.claude/inbox/CURRENT.md`.
3. Act on `Status` (below). If it is `IDLE`, `DONE`, or `BLOCKED`, stop. Do not start new work.
4. Poll again in one hour.

## Status

| Status | Meaning |
|---|---|
| `READY` | A task is waiting. Do it. |
| `IDLE` | No task. A bot sets this after a finished task is cleared. |
| `DONE` | Claude Code finished. The PR link (or clear notes) is in the file. A bot will archive or clear it and set `IDLE`. |
| `BLOCKED` | Claude Code could not finish. The file says why. A bot will set `IDLE` after a person handles it. |

Only one active task lives in `CURRENT.md` at a time. Do not add a second task beside it.

## When status is READY

1. Read **Goal**, **Constraints**, **Acceptance**, **Context / files**, and **Done when**.
2. Create a branch from the **latest `main`**.
3. Do only that task.
4. Open a pull request.
5. Do **not** merge. Do **not** merge the spike branch `claude/loving-hawking-7fvsu7`.

## After finishing

Update `.claude/inbox/CURRENT.md`:

- Set `Status` to `DONE`, or to `BLOCKED` and write why.
- Include the PR link in the file, or leave clear notes.
- Set `Updated` to an ISO timestamp in `Asia/Singapore` (for example `2026-10-02T08:50:00+08:00`).

A bot then sets `Status` back to `IDLE`. It may move the old task into `history/`.

## History

`.claude/inbox/history/` is optional. Finished tasks can be copied there (one file per task) so `CURRENT.md` stays a single active task. An empty `.gitkeep` keeps the folder in git.

## Constraints that stay visible

Every task keeps these constraints in **Constraints**, even when the goal does not mention them:

- **Balance:** the balance bot must finish with Heart HP in the **40–80** band (Full and Quick, 1–3 players). Do not retune past that gate.
- **PROTOCOL:** any change to messages, commands, or snapshots bumps `PROTOCOL_VERSION` and updates codec validation and snapshot deltas.
- **No spend:** never spend money, and never change a free tier into a paid tier.
- **Browser tests:** where a task says "`npm run test:e2e` passes", it means on CI. In the session follow `CLAUDE.md`, Session rules: only the specs you touched, and once the pull request is open and `CURRENT.md` is updated, stop.

`CURRENT.md` starts `IDLE`. Bots overwrite it with `READY` tasks.
