# Claude Code task
Status: DONE
Updated: 2026-10-02T12:29:54+08:00
From: Grok Bot via Claude Code Liaison
Branch: create from latest main; open PR; do not merge spike claude/loving-hawking-7fvsu7
PR: https://github.com/Han1989/tgt-td-cld/pull/52
## Goal
Client-only presentation (protocol 16 on main): (1) richer Iron Vow aura rings on living allies for the vow duration; (2) readable rain-fall VFX for Arrow Storm / Meteor / Meteor Rain — falling impacts that read clearly on phone and desktop.
## Constraints (balance Heart 40–80, PROTOCOL, no spend)
- Client-only. No sim / protocol / tuning changes. Do not bump PROTOCOL_VERSION. Protocol 16 wire already on main — consume it, do not redefine it.
- Honour `prefers-reduced-motion` / existing reduced-motion setting where relevant (rings/rain motion toned down or skipped).
- Soft-launch Heart 40–80 and required CI green. `npm test` + `npm run build` must pass before push. No spend.
- Leave twin-R syncCast shake alone (already on main via #48).
- Never merge spike `claude/loving-hawking-7fvsu7`.
## Acceptance
- Iron Vow: while any vow is active, living allies show clearer aura/rings driven by existing `HeroSnap.shielded` and `HeroSnap.shieldFor` (longest remaining ticks). Dead heroes stay unringed. Basic gold shielded ring can be upgraded for readability; do not invent new wire.
- Rain: draw falling impacts from existing `aoe` events with `effect` `arrowStorm`, `meteor`, or `meteorRain` (impact position + strike radius). Zones with `radius: 0` are global rains — use `startTick`/`endTick` and caster x,y from the zone snapshot; do not invent aim circles for global rains.
- Combo Meteor Rain and single rains both look readable; existing toasts / basic presentation still work.
- Reduced motion: heavy motion suppressed or minimal.
- PR open; set CURRENT.md on that branch to DONE with PR URL when finished.
## Context / files
- Wire map: PR #45 body (protocol 16) — `AoeEffect` adds `meteorRain` and `ironVow`; rain impacts are existing `aoe` events; zones snapshot with radius 0 for rains; `HeroSnap.shielded` / `shieldFor` for Iron Vow.
- Search client for Iron Vow, shielded, shieldFor, aoe, arrowStorm, meteor, meteorRain, rain VFX.
- Twin shake already done (#48). Lobby Play-solo already done (#43/#50). Do not rework those.
## Done when
PR from main with Iron Vow rings + rain-fall VFX; tests/build green; DONE + PR URL in inbox on that branch.
## Result
PR: https://github.com/Han1989/tgt-td-cld/pull/52 (branch `claude/vow-rain-vfx-na1cer`, cut from main `3a83736`; open, not merged)
- Iron Vow: a living ally wears a ring (a glow, a thin ring and a dashed ring that turns) while `shielded` and `shieldFor > 0`. It blooms in, blinks over its last 1.5 s and dims out; a dead hero wears none.
- Rains: every `aoe` strike of `arrowStorm`, `meteor` and `meteorRain` gets a streak falling onto a ring at its strike radius, a flash, embers and a burn mark. A running global rain (radius 0) gets a faint cast marker and sky streaks over the map, from its start tick to its end tick, with no aimed circle. The old per-strike Meteor blast (about 64 particles and a 0.8 shake each) is replaced.
- Reduced motion (`prefers-reduced-motion`, as `FxLevel.calm`): rings, flashes and burn marks stay; streaks, sky, bloom, turning, blink and shake go.
- Client only: no sim, protocol or tuning change (`PROTOCOL_VERSION` stays 16). The twin shake (#48), the lobby (#43, #50) and the spike branch are untouched.
- Checked locally: `npm test` (885 pass, balance gates unchanged) and `npm run build`. Browser tests: 56 pass; the 300-creep perf test fails in the sandbox and fails the same on plain main (software GL at about 2 FPS), so the required `ci` check on the PR is the arbiter. It was still running when this was written; Claude Code is watching it. Also rendered in a real browser on phone and desktop, in normal and reduced motion.
- Still needs a person: feel it on a phone and a desktop in a 3-player match (see the PR's test plan).
