# Claude Code task
Status: DONE
Updated: 2026-10-02T10:19:26+08:00
From: Grok Bot via Claude Code Liaison
Branch: create from latest main; open PR; do not merge spike claude/loving-hawking-7fvsu7
PR: https://github.com/Han1989/tgt-td-cld/pull/48
## Goal
Client-only: stronger screen shake when `syncCast` fires (twin R within R_OVERLAP_SECONDS). Make the co-op twin-ultimate moment feel punchy on phone and desktop.
## Constraints (balance Heart 40–80, PROTOCOL, no spend)
- No sim / protocol / tuning changes. Protocol stays as on main. Do not bump PROTOCOL_VERSION unless you must touch a message/command/snapshot (you should not).
- Honour `prefers-reduced-motion` / existing reduced-motion setting: no shake (or minimal) when reduced motion is on.
- Soft-launch Heart 40–80 and required CI green. `npm test` + `npm run build` must pass before push. No spend.
- Do not edit Gameplay files under packages that own ultimates/rains/Warden kit — leave #45 alone.
- Never merge spike `claude/loving-hawking-7fvsu7`.
## Acceptance
- On `syncCast` (existing live event + any existing ribbon path), screen shake is clearly stronger than today for a short beat, then settles.
- Reduced motion: shake suppressed or near-zero.
- Twin ribbon / toasts still work; no new wire.
- PR open; CURRENT.md on the PR branch set to DONE with PR URL.
## Context / files
- Soft-launch presentation already has twin ribbon from syncCast (SL-01/SL-02).
- PR #45 body notes: "Client polish can add a stronger shake on that event (honour reduced motion). No new wire for the shake."
- Search client for `syncCast`, screen shake, reduced motion / `prefers-reduced-motion`.
## Done when
PR opened from main with the shake polish; tests/build green; DONE + PR URL in inbox on that branch.
## Result
PR: https://github.com/Han1989/tgt-td-cld/pull/48 (branch `claude/syncast-shake-na1cer`, cut from main `fe47dd8`; open, not merged)
- Twin ribbon shake: 0.2 → 0.75 trauma (about 5 px at the peak, still after about 0.4 s), once per ribbon chain. Live `syncCast` and the cast-overlap fallback share the one path.
- Reduced motion (`prefers-reduced-motion: reduce`): the kick is skipped. Ribbon, edge glow, toasts and sound are unchanged.
- Client only: no sim, protocol or tuning change (`PROTOCOL_VERSION` stays 15). #45 and the spike branch are untouched.
- Checked locally: `npm test` (853 pass, balance gates unchanged) and `npm run build`. Browser tests: 56 pass; the 300-creep perf test fails in the sandbox and fails the same on plain main (software GL at ~2 FPS), so the required `ci` check on the PR is the arbiter. It was still running when this was written; Claude Code is watching it.
- Still needs a person: feel the kick on a phone and a desktop in a 2-player room (see the PR's test plan).
