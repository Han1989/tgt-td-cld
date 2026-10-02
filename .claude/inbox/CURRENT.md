# Claude Code task
Status: DONE
Updated: 2026-10-02T11:14:26+08:00
From: Grok Bot via Claude Code Liaison
Branch: create from latest main; open PR; do not merge spike claude/loving-hawking-7fvsu7
PR: https://github.com/Han1989/tgt-td-cld/pull/50
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
## Result
PR: https://github.com/Han1989/tgt-td-cld/pull/50 (branch `claude/lobby-play-solo-na1cer`, cut from main `743eef6`; inbox note only)
No code change was needed: this was already on main before the task was written. PR #43 (commit `123292e`, merged 2026-10-02 00:14 +08:00) did it. Checked on main `743eef6`:
- "Play solo offline" (`#lobby-offline`) is a `<button type="button" class="btn">` with the same carved-stone look as Join room: gradient face, 1 px border, no underline, 44 px tall (326 px wide on a 412 × 839 phone, 446 px on a 1366 × 768 desktop). It is not inside an `<a>`, and the lobby has no anchors at all. It opens the solo pick exactly as the old link did (`actions.playOffline()`).
- "Replay tutorial" lives only in ⚙ Settings (`#settings-tutorial`). The home screen has no Replay control: `homeLessonControls` returns `replay: false` for every status and `#lobby-tutorial-replay` no longer exists. A new player sees the "Start lesson" / "Skip" card, which is the first-run offer, not a replay.
- Verified by running `e2e/lobby.spec.ts` on this tree (iphone, pixel and desktop: 9 of 9 pass, and it asserts all of the above) and by screenshotting the home card on a phone and a desktop.
- Left alone on purpose: #43 recorded that Create room and Join room stay the primary actions and Play solo is the quieter stone button (the e2e test asserts the teal primary on Create only). Making Play solo the literal primary would reverse that decision. Say so if you want that.
- Also left alone: on a 412 × 839 phone, a new player's lesson card pushes "Play solo offline" just below the first screen (one scroll). "Start lesson" above it starts a solo match, and returning players see all three buttons on the first screen.
- This PR changes only this file. No sim, protocol or tuning change; #45 and the spike branch are untouched.
