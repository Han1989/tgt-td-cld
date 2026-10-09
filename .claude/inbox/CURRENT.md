# Claude Code task
Status: BLOCKED
Updated: 2026-10-09T09:57:57+08:00
From: Grok Bot (night kickoff 2026-10-06)
Blocked: on hold by Han, 8 Oct 2026. Nothing in Phase 6 starts before the Discovery gate (D-06) is called.

## Goal
First slice of **p6d-weekly** (TASKS.md Phase 6d): a **Weekly Challenge** that gives players a reason to come back (D7 return is the Discovery measurement). Everyone plays the same seed this week, and the server re-runs the match from its replay to verify the score before it counts.

**Start with an audit.** Main already has seeded, deterministic matches and replays (`packages/sim/scripts/replay.ts`, `packages/sim/test/fixtures/playtests/*.json`, `docs/REPLAYABILITY.md`), and a server that keeps small JSON / JSONL files on disk for analytics (`apps/server/src/analytics`, `ANALYTICS_DIR`). Reuse those. List what you reused vs. added in the PR description.

Slice:
- The week's seed is derived from the ISO week (UTC) plus a fixed salt, so every client and the server agree with no admin step. The week rolls over Monday 00:00 UTC.
- A **Weekly Challenge** entry on the main menu (solo first; co-op rooms optional if cheap) that starts a match on that seed in one fixed mode and difficulty you pick from the existing ones, and says which in the PR.
- At match end the client submits its replay (inputs + seed + build/protocol) to a new server route. The server re-simulates it with the shared sim, rejects anything that doesn't reproduce the claimed result, wrong week/seed, oversized or rate-limited submissions, and records the verified score.
- A small weekly board: top 20 plus "your best this week", by the browser's existing visitor id from p6a-privacy (`tdt.visitorKey`), with a short display name (sanitised, length-capped, no free chat). Stored as a small JSON file beside the analytics files; keep the current and previous week only.
- Respect the Play data switch and the age rule from p6a-privacy: under 13 and data-switch-off players can play the challenge but are not submitted to the board, and the UI says so in plain words. Add the board data to the privacy page and to Download / Delete my data.

## Constraints
- Do **not** change hero kits, `packages/sim/src/tuning.ts`, balance tests, or balance targets. The soft-launch Heart 40–80 balance gate stays.
- Prefer **no PROTOCOL_VERSION bump** (stays 18): the submission is an HTTP route, not a room message. If you must change messages, commands or snapshots, bump `PROTOCOL_VERSION`, update codec validation and snapshot deltas, and say so at the top of the PR (that PR then waits for Han).
- **No new service, database or spend.** p6a-db is Han's open decision; don't pick one. Durable numbers need `ANALYTICS_DIR` on a persistent disk, same as analytics (document that, don't provision it).
- Follow CLAUDE.md (palette/RL tokens, pooled effects, reduced motion, mobile one-tap layout).
- Never merge spike branch `claude/loving-hawking-7fvsu7`. Do not push to other branches; cut your own `claude/` branch from latest `main`.

## Acceptance
- Same week, same seed on two browsers; a new week gives a new seed (unit test with fixed dates).
- A genuine replay is accepted and ranked; a tampered replay (edited score, inputs or seed) is rejected (server tests).
- Board shows top 20 and your best; survives a server restart when `ANALYTICS_DIR` is set.
- Privacy: data-switch off / under 13 never submits; Download / Delete my data include board entries.
- `npm test`, `npm run build` and `npm run test:e2e` pass.
- Update TASKS.md p6d-weekly note and `apps/client/src/progress/data.ts` to say what this slice did (leave the row open if parts remain).

## Context / files
- TASKS.md Phase 6d (p6d-weekly, p6d-boards), p6a-privacy, p6a-analytics
- docs/REPLAYABILITY.md, docs/ANALYTICS.md, packages/sim/scripts/replay.ts
- apps/server/src/server.ts, apps/server/src/analytics, apps/server/src/rateLimit.ts
- `.claude/inbox/README.md` for poll rules

## Done when
Claude Code opens a feature PR (not merged) with the slice above, then sets this file to `DONE` with the PR link (or `BLOCKED` with why), `Updated` in Asia/Singapore.
