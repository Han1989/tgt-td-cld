# Claude Code task
Status: READY
Updated: 2026-10-03T22:33:26+08:00
From: Grok Bot (night kickoff 2026-10-03)

## Goal
Client presentation for the two remaining combo ultimates from p6c-combos / SL-05: **Stun Storm** (Iron Vow + Arrow Storm) and **Shockwave** (Meteor + Iron Vow). Match the quality and patterns already on main for Meteor Rain (P2-04 #70 and P2-04b #73): each combo gets its own ribbon, strikes and colour; a finished rain/combo shows its kill count; cast-together / Combo! ring / flare / shake / heal feedback already exist — extend them for these two pairs without inventing new aim UX (ultimates are never aimed; R always rains on all three lanes).

**Start with an audit.** Main already has part of this from #70 / #73: `ZONE_COLORS` / palette entries (Stun Storm violet, Shockwave gold), ribbon copy in `apps/client/src/coop/cues.ts`, `Effects.comboImpact` in `render/fx/effects.ts`, combo names and `ultResult` kill counts in `apps/client/src/ult/cues.ts`. What still borrows from the single ultimates: `world.ts` draws the Stun Storm sky as Arrow Storm's and the Shockwave sky as Meteor's (`fx.rainSky(...)`), and the strike flights / fuse burst are Meteor Rain-only. List what is shared vs. own in the PR description, then close the gaps so both combos read as their own thing next to Meteor Rain (sky, strike flight and landing, fuse burst / band, sound if Meteor Rain has its own). Don't redo what already works.

## Constraints
- Client (and docs/tests) only unless an existing sim event is already emitted and only needs wiring. Prefer **no PROTOCOL_VERSION bump** (stays 18). If you must touch sim/report events, keep them additive and document why.
- Do **not** change hero kits, `packages/sim/src/tuning.ts`, balance tests, or balance targets.
- **Balance:** the soft-launch Heart 40–80 balance gate stays. Do not retune past that.
- **PROTOCOL:** any change to messages, commands or snapshots bumps `PROTOCOL_VERSION` and updates codec validation and snapshot deltas.
- Effects follow CLAUDE.md: colours only from `render/palette.ts` / `RL` tokens, pooled, `essential` only for gameplay, Graphics → Low and `FxLevel.calm` (reduced motion) honoured like Meteor Rain's, shake only through `fx.bump`.
- Never merge spike branch `claude/loving-hawking-7fvsu7`.
- **No spend:** no free→paid upgrades.
- One owner per branch: Claude Code cuts its own `claude/` feature branch from latest `main`; this kickoff PR's branch is `cursor/`.

## Acceptance
- Stun Storm and Shockwave have distinct presentation (ribbon / FX / kill count) consistent with Meteor Rain.
- No aim circles. R remains global lane rain / team ult presentation.
- `/?stress=12&combo=stunStorm` and `&combo=shockwave` show the new looks; `?showcase` lists them if Meteor Rain's look is there.
- `npm test` and `npm run build` pass. Touch e2e only if needed for the new FX.
- Update TASKS.md p6c-combos note and `apps/client/src/progress/data.ts` only if this PR itself finishes that presentation slice; otherwise leave tracker rows as-is.

## Context / files
- TASKS.md p6c-combos, SL-05, P2-04 / P2-04b
- docs/HOOK_SPIKE.md, docs/MOBILE_TESTING.md §10, docs/ART.md §6 / §13
- Existing Meteor Rain / combo presentation from #70 / #73: `render/fx/effects.ts` (`comboImpact`, rain impact), `render/fx/rain.ts`, `render/world.ts` (rain zones, sky), `coop/cues.ts`, `ult/cues.ts`, `hud/ultHud.ts`, `audio/sounds.ts`
- `.claude/inbox/README.md` for poll rules

## Done when
Claude Code opens a feature PR (not merged) with the presentation above, then sets this file to `DONE` with the PR link (or `BLOCKED` with why), `Updated` in Asia/Singapore.
