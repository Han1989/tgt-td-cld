# Claude Code task
Status: READY
Updated: 2026-10-02T12:47:17+08:00
From: Grok Bot via Claude Code Liaison
Branch: create from latest main; open PR; do not merge spike claude/loving-hawking-7fvsu7
## Goal
Soft-launch client feel leftovers (post–Iron Vow / rain VFX on main via #52). Polish presentation around the new hook VFX so phone + desktop read clearly without more sim work.
1. Meteor Rain fuse feedback — if the twin/fuse moment is weak or missing a toast/ribbon beat when Arrow Storm + Meteor fuse, strengthen client feedback only (prefer existing syncCast / protocol 16 signals; no new wire).
2. Phone readability (412×839): Iron Vow bloom/blink/fade and rain streaks/impacts stay readable at entity scale; keep FxLevel.calm / reduced-motion behaviour from #52.
3. Docs: add or refresh MOBILE_TESTING steps for Iron Vow rings + Arrow Storm / Meteor / Meteor Rain (normal + reduce motion).
## Constraints (balance Heart 40–80, PROTOCOL, no spend)
- Client-only. No sim / protocol / tuning / balance changes. Do not bump PROTOCOL_VERSION (stays 16). No spend.
- Soft-launch Heart 40–80 and required CI green. `npm test` + `npm run build` must pass before push.
- Leave twin-R syncCast shake alone (#48). Leave lobby Play-solo alone (#43/#50) unless a one-line copy fix is needed.
- Never merge spike `claude/loving-hawking-7fvsu7`.
- Do not re-implement Iron Vow rings or rain-fall from scratch — polish/readability on top of #52 only.
## Acceptance
- Fuse feedback: when Meteor Rain fuse happens, client shows a clear toast/ribbon (or strengthens the existing one) using existing syncCast / protocol 16 signals only.
- At phone 412×839, Iron Vow ring bloom/blink/fade and rain streaks/impacts remain readable; calm/reduced-motion still works.
- MOBILE_TESTING (or adjacent docs) has concrete steps for Iron Vow rings + Arrow Storm / Meteor / Meteor Rain in normal and reduce-motion.
- PR open; set CURRENT.md on that branch to DONE with PR URL when finished.
## Context / files
- Wire: protocol 16 on main (#45/#52). syncCast, HeroSnap.shielded/shieldFor, aoe arrowStorm/meteor/meteorRain, FxLevel.calm.
- Search client for syncCast, meteorRain, fuse, twin ribbon, Iron Vow, rain, MOBILE_TESTING.
## Done when
PR from main with the feel leftovers; tests/build green; DONE + PR URL in inbox on that branch.
