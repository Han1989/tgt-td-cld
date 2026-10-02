# Claude Code task
Status: READY
Updated: 2026-10-02T10:49:41+08:00
From: Grok Bot via Claude Code Liaison
Branch: create from latest main; open PR; do not merge spike claude/loving-hawking-7fvsu7
## Goal
Client/UI only: make lobby “Play solo” / offline practice a real button (not a URL link). Keep “Replay tutorial” in Settings only — remove any duplicate tutorial entry from the main lobby if present.
## Constraints (balance Heart 40–80, PROTOCOL, no spend)
- No sim / protocol / tuning changes. Do not bump PROTOCOL_VERSION. Do not touch soft-launch hook PR #45 (`cursor/soft-launch-hook-5681`) or spike `claude/loving-hawking-7fvsu7`.
- Client/lobby presentation only. Heart gates and CI must stay green (`npm test` + `npm run build` before push). No spend.
- Honour existing mobile layout / CrazyGames-friendly patterns already in the lobby.
## Acceptance
- Lobby shows a clear primary “Play solo” (or equivalent) control that starts offline/solo practice the same way the current link path does — as a button/control, not a raw URL or bare `<a href>` that looks like a link.
- “Replay tutorial” (or tutorial replay) lives only under Settings; not duplicated as a main lobby action.
- No new protocol wire. Online co-op lobby flow unchanged aside from this presentation cleanup.
- PR open; set CURRENT.md on that branch to DONE with PR URL when finished.
## Context / files
- Search lobby / home / settings UI for solo, practice, offline, tutorial, replay.
- Soft-launch #45 still open on Gameplay — leave rains, Warden kit, Iron Vow, syncCast sim alone.
- Prior twin-R shake already merged (#48); do not rework shake.
## Done when
PR from main with lobby button polish; tests/build green; DONE + PR URL in inbox on that branch.
