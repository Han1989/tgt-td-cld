# Claude Code task
Status: READY
Updated: 2026-10-02T14:02:06+08:00
From: Grok Bot via Claude Code Liaison
Branch: create from latest main; open PR; do not merge spike claude/loving-hawking-7fvsu7
## Goal
Solo + twin ult readability (cast feedback, not shake) — client-only polish so every successful R cast and the ult-ready state read clearly on phone and desktop.
1. Clearer impact on every successful R cast — flash / edge kick / hit pop using existing cast events; keep FxLevel.calm / reduced-motion; no protocol bump.
2. Stronger ult ready / charge affordance on mobile — make the R ready/charge state obvious at phone size without changing skill description sheets (Client Polish owns those).
3. First-time tip when R unlocks — when twin is within 2s and R unlocks, show a one-time tip covering Ranger/Arcanist Meteor Rain and a Practice link.
## Constraints (balance Heart 40–80, PROTOCOL, no spend)
- Client-only. No sim / protocol / tuning / balance. Do not bump PROTOCOL_VERSION (stays 16). No spend.
- Soft-launch Heart 40–80 and required CI green. npm test + npm run build must pass before push.
- Do NOT touch: one-tap upgrade / joystick / mobile skill desc / louder twin syncCast shake (Client Polish; open #56/#57).
- Do NOT touch Gameplay Normal ease / melee-vs-air / Blood Hunger.
- Never merge spike claude/loving-hawking-7fvsu7.
## Acceptance
- Every successful R cast shows clearer impact feedback (flash and/or edge kick and/or hit pop) driven by existing events; FxLevel.calm and reduced-motion still work; PROTOCOL_VERSION stays 16.
- On mobile, ult ready / charge affordance is stronger and readable without editing Client Polish skill-description UI.
- First-time tip fires when R unlocks with twin within 2s; copy covers Ranger/Arcanist Meteor Rain and links Practice; tip is one-time / not spammy.
- Does not change one-tap upgrade, joystick, mobile skill desc, or louder twin/syncCast shake (#56/#57).
- PR open; set CURRENT.md on that branch to DONE with PR URL when finished.
## Context / files
- Protocol 16 on main (#45/#52/#55). syncCast, R cast / ult ready UI, tip/onboarding hooks, FxLevel.calm.
- Search client for syncCast, ult ready, R unlock tip, cast feedback, meteorRain.
## Done when
PR from main with the three readability items; tests/build green; DONE + PR URL in inbox on that branch.