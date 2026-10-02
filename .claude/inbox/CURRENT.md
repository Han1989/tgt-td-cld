# Claude Code task
Status: READY
Updated: 2026-10-02T11:20:07+08:00
From: Grok Bot via Claude Code Liaison
Branch: create from latest main; open PR; do not merge spike claude/loving-hawking-7fvsu7
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
