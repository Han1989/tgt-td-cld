# Claude Code task
Status: READY
Updated: 2026-10-02T15:28:39+08:00
From: Grok Bot via Claude Code Liaison
Branch: create from latest main; open PR; do not merge; never touch spike claude/loving-hawking-7fvsu7

## Goal
Playtest 2 Task 3 / P2-03 — kit rework + balance-by-simulation from the 2 Oct 2026 Gate 1 friends session. Use the anonymized playtest fixtures already on main under `packages/sim/test/fixtures/playtests/` (victory seed 1761350601, defeat seed 509923770) plus `npm run replay` / balance tooling — not bots alone.

Ship one feature PR that covers:
1. **Stronger ultimates** — retune R impact so ultimates feel decisive without breaking Heart gates.
2. **Warden kit gaps from playtest** — air answer / cleave heal feel; Iron Vow as heal + burst (not only armour/regen), informed by session notes (Warden casts R only ~3–4× in 3p; Ranger+Warden weakest pair).
3. **Every-pair combo ultimates** — fused effect for every hero pair (not only Meteor Rain). Target ~5s meaningful fuse window / twin timing where design already uses the 2s twin cast cue; extend combo coverage beyond SL-04 Meteor Rain. Do **not** merge spike `claude/loving-hawking-7fvsu7` — implement on a fresh branch from main.
4. **Optimizer bot** — a balance/optimizer bot (or extend expert bot) that can drive matrix runs for kit tuning; keep existing casual/expert bots usable.
5. **`balance:matrix` (or equivalent script)** — add/wire a matrix runner that sweeps hero pairs × mode/difficulty/player counts needed to validate the new kits; document how to run it.
6. **New Heart targets** — update balance gates / HEART_TARGET bands as needed for the rework; Full and Quick, 1–3 players; stay inside product band (document any intentional move). Casual bot on Normal still aims ~40–80 Heart unless Han brief requires a documented change.
7. Tracker: mark P2-03 progress in `TASKS.md` and mirror in `apps/client/src/progress/data.ts` in the same PR when the work is done (status in progress → done as appropriate).

## Constraints (balance Heart 40–80, PROTOCOL, no spend)
- Sim / tuning / kit / balance work is in scope. Bump `PROTOCOL_VERSION` if messages, commands, or snapshots change; update codec validation and snapshot deltas.
- Soft-launch Heart discipline: finish with Heart in the agreed band (Full and Quick, 1–3 players) unless you document a deliberate new target and keep tests green.
- No spend. Never merge spike `claude/loving-hawking-7fvsu7`.
- Do **not** do Client Polish work (P2-01 touch, P2-02 air/gold teaching, P2-04 ult presentation/combo cue UI, one-tap, joystick, skill card, louder twin shake).
- Do **not** invent fixtures — use the files already under `packages/sim/test/fixtures/playtests/`.
- Open the feature PR from latest main. **Do not merge** — Han must review/approve this kit/balance PR (Playtest 2 HARD RULE). Bots must not auto-merge it.
- `npm test` + `npm run build` must pass before push.

## Acceptance
- Kit + balance changes land on a feature branch PR with clear notes tied to the playtest fixtures/replay findings.
- Every hero pair has a combo ultimate path implemented (or a documented phased matrix if truly blocked — prefer ship all pairs).
- Optimizer/matrix tooling exists and is runnable; balance gates updated and green for the new targets.
- PROTOCOL bumped only if required, with codec/snapshot updates.
- TASKS.md P2-03 (+ data.ts mirror) updated.
- Feature PR open and unmerged; set this CURRENT.md to DONE with that PR URL when finished.

## Context / files
- Fixtures: `packages/sim/test/fixtures/playtests/playtest-2026-10-02-victory-seed-1761350601.json`, `...-defeat-seed-509923770.json` (from #62).
- Balance: `packages/sim/scripts/balance.ts`, `packages/sim/test/balance*.ts`, `test/helpers.ts` HEART_TARGET, `tuning.ts`.
- Kits / combos: Warden Blood Hunger + Iron Vow (protocol 16 / SL-04), Meteor Rain fuse; GAME_DESIGN Decision Log; TASKS.md P2-03 and g1-tune notes.
- Replay: `npm run replay`.

## Done when
Feature PR open from main with kit rework + balance-by-sim; tests/build green; CURRENT.md on that branch set to DONE with PR URL. Do not merge — wait for Han.
