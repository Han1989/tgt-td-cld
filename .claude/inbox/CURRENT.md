# Claude Code task
Status: DONE
Updated: 2026-10-02T13:40:44+08:00
From: Grok Bot via Claude Code Liaison
Branch: create from latest main; open PR; do not merge spike claude/loving-hawking-7fvsu7
PR: https://github.com/Han1989/tgt-td-cld/pull/55
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
## Result
PR: https://github.com/Han1989/tgt-td-cld/pull/55 (branch `claude/fuse-feel-na1cer`, cut from main `4245ed3`; open, not merged)
- Fuse feedback: the `combo` event alone now makes a fuse beat (it no longer needs `syncCast`, which does not come when a caster fell first). A fire band across the middle of the screen for about 2 s says METEOR RAIN, with ARROW STORM + METEOR above it and both casters' names under it in their seat colours, and an amber flash and ring spread from the fused rain's mark and each caster (they stay at Graphics → Low). The small red "Meteor Rain!" toast is gone. The band sits under the Heart-save word and the wave banner and never covers the controls (browser-tested on the iPhone, Pixel and desktop projects).
- Phone readability (412 × 839): rendered the vow ring (bloom, steady, blink, fade) and each rain's strikes in normal and reduced motion; they read as shipped in #52, so no change. A new e2e check (`window.__tdt.vow()`, e2e builds only) guards the ring's reach (about 13 px past the body) and brightness.
- Reduced motion (`prefers-reduced-motion`): the band fades instead of unrolling; the burst keeps its rings and flashes and drops its embers; the twin shake stays as #48 made it.
- Docs: `docs/MOBILE_TESTING.md` §9 (steps for the vow ring, Arrow Storm, Meteor, Meteor Rain and the fuse band, normal and reduced motion, with how to reach each), a Decision Log row, an effects row in `docs/ART.md`, the `calm` note in `CLAUDE.md`.
- Client only: no sim, protocol, tuning or balance change (`PROTOCOL_VERSION` stays 16). The twin shake (#48), the lobby (#43, #50), the vow ring and rain strikes of #52 and the spike branch are untouched.
- Checked locally: `npm test` (61 files, 889 tests pass, balance gates unchanged) and `npm run build`; the new `e2e/hook.spec.ts` on the iPhone, Pixel and desktop projects (12 pass); and one real fuse on the real sim in solo Practice Meteor Rain at phone size. The full browser run was still going when this was written; the required `ci` check on the PR is the arbiter (the 300-creep perf test fails in the sandbox on plain main too: software GL at about 2 FPS). Claude Code is watching the PR.
- Still needs a person: `docs/MOBILE_TESTING.md` §9 on a phone and a desktop (feel, and the OS reduced-motion setting).
