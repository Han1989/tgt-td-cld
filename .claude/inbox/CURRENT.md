# Claude Code task
Status: DONE
Updated: 2026-10-03T05:38:09+08:00
From: Claude Code Liaison (standing Playtest 2 queue after #66)
Branch: create from latest main; open PR; do not merge spike claude/loving-hawking-7fvsu7

## Goal
Playtest 2 Task 4 / P2-04 — ultimate presentation and combo cue (client). Kit/sim is on main via #66 (protocol 17). Make rains and the three combos read clearly on phone and desktop.

Product rule (Han 2026-10-02): ultimates are NOT aimed. Press R and Arrow Storm / Meteor rain on all three lanes always. **No aim circles.** This task is **combo cue + kill count only**.

1. **Combo cue** — when a `combo` fires (Meteor Rain, Stun Storm, Shockwave within the 5 s window), show a clear client cue (toast/ribbon/name + seat colours). Prefer existing `combo` / `syncCast` / aoe signals already on the wire. Stun Storm and Shockwave need a first-class presentation pass (Meteor Rain already has fuse feel from earlier soft-launch work — strengthen if thin).
2. **Kill count** — for an ultimate rain or combo, surface how many creeps that cast killed (short floating count or toast). Use client-side kill attribution from existing events only; no new wire fields.
3. Keep FxLevel.calm / `prefers-reduced-motion` readable (cue + count stay; drop heavy particles/shake if calm).

## Constraints (balance Heart 40–80, PROTOCOL, no spend)
- Client-only. No sim / protocol / tuning / balance changes. Do **not** bump PROTOCOL_VERSION (stays 17). No spend.
- Soft-launch Heart 40–80 and required CI green. `npm test` + `npm run build` must pass before push; run `npm run test:e2e` if client paths change.
- **No aim circles**, no cast targeting UI for R, no re-introducing aimed ultimate zones.
- Do not put Client Polish work here (one-tap upgrade, joystick, mobile skill desc, louder twin shake).
- Leave open #68 (SL-05 tracker catch-up) alone unless a one-line conflict fix is required.
- Never merge spike `claude/loving-hawking-7fvsu7`.
- Feature PRs that change hero kits / balance / gate status still need Han approval — this task is presentation only and may auto-merge when green.

## Acceptance
- Combos Meteor Rain / Stun Storm / Shockwave each show a clear on-screen cue when they fire.
- Ultimate rain and combo casts show a kill count for that cast.
- No aim-circle UI for R; rains stay instant lane rains.
- Calm / reduced-motion still readable.
- PR open; set CURRENT.md on that branch to DONE with PR URL when finished.
- Mark P2-04 done in TASKS.md + `apps/client/src/progress/data.ts` (+ progress tests) in the same PR.

## Context / files
- Protocol 17 on main (#66). Wire: `combo` event, `COMBO_KINDS` meteorRain/stunStorm/shockwave, `syncCast`, radius-0 rain zones, aoe strikes.
- Docs: `docs/HOOK_SPIKE.md` (combos + “presentation of Stun Storm and Shockwave is a separate pass”), Decision Log 2026-10-02 in `docs/GAME_DESIGN.md`, TASKS.md P2-04.
- Prior client feel: #52 / #55 rain + Iron Vow VFX, twin ribbon / syncCast path.
- Search client for combo, syncCast, meteorRain, stunStorm, shockwave, kill, togetherKill, FxLevel.calm.

## Done when
PR from main with combo cue + kill count presentation; tests/build green; DONE + PR URL in inbox on that branch; P2-04 marked done in tracker/progress.

## Result
PR https://github.com/Han1989/tgt-td-cld/pull/70 (client only, protocol stays 17). Combo cue (own ribbon colour, effect line, burst and strike look for Meteor Rain / Stun Storm / Shockwave) and a kill count after every rain or combo; no aim circles. P2-04 marked done in TASKS.md and progress/data.ts. Not merged.
