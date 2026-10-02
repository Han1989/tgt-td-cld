# Claude Code task
Status: READY
Updated: 2026-10-02T14:02:00+08:00
From: Grok Bot via Claude Code Liaison
Branch: create from latest main; open PR; do not merge spike claude/loving-hawking-7fvsu7

## Goal
Solo + twin ult readability (cast feedback, not shake) — client-only polish after #55 on main.
1. Clearer impact on every successful R (ultimate) cast: impact flash / edge kick / hit-count pop using existing cast/hit events only; honour FxLevel.calm / reduced-motion; no new wire.
2. Stronger ult ready / charge affordance on mobile (R button readability when charged / charging) so players notice R is available.
3. First-time tip (once per install, skippable) when R unlocks: twin within ~2s; for Ranger/Arcanist mention Meteor Rain fuse and link/point to Practice Meteor Rain if that mode exists.

## Constraints (balance Heart 40–80, PROTOCOL, no spend)
- Client-only. No sim / protocol / tuning / balance changes. Do not bump PROTOCOL_VERSION (stays 16). No spend.
- Soft-launch Heart 40–80 and required CI green. `npm test` + `npm run build` must pass before push.
- Leave twin-R syncCast shake alone (Client Polish owns louder twin shake; #56 / related). Do NOT implement one-tap tower upgrade, joystick deadzone/placement, or mobile skill description sheet — Client Polish owns those.
- Do NOT touch Gameplay items (Normal ease, melee-vs-air, Blood Hunger).
- Never merge spike `claude/loving-hawking-7fvsu7`.
- Prefer existing events only; FxLevel.calm; no PROTOCOL bump.

## Acceptance
- Every successful R cast shows clearer client impact (flash and/or edge kick and/or hit pop) without relying on shake; calm/reduced-motion still sane.
- On phone-sized layout, charged/charging R button is more readable as ready.
- First-time tip when R unlocks appears once per install, is skippable, covers twin window + Meteor Rain coach for Ranger/Arcanist.
- PR open; set CURRENT.md on that branch to DONE with PR URL when finished.

## Context / files
- Protocol 16 on main (#45/#52/#55). Ult cast UX, HUD R button, tips/coach overlays, FxLevel.calm, syncCast (do not amplify shake).
- Search client for ultimate cast feedback, R button ready state, first-time tip / coach, Meteor Rain practice.

## Done when
PR from main with the solo+twin ult readability work; tests/build green; DONE + PR URL in inbox on that branch.
