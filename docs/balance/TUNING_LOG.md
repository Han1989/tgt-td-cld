# Playtest 2 tuning log

Two rounds. Round 1 (the sections below, up to "Round 2") built the aimed-circle kit; Han's review of PR #66 replaced it with instant lane rains (round 2, at the end). `final.txt` and `final-targets.txt` are round 2; round 1's are `aimed-circles-final*.txt`, and `COMPARISON.md` puts the two side by side.

Every number below was tried on the balance matrix (`npm run balance:matrix`; the bots play whole matches headlessly).
Quick probes used 8–12 seeds and one team size; every full matrix (the tables in `baseline.txt` and `final.txt`) is 30 seeds.
One change at a time where the matrix allowed it. `--tuning '<json>'` tries a number without editing `tuning.ts`.

## Runs

| Run | What it was | What it showed |
|---|---|---|
| Baseline | `main` as it was (lane rains, one combo, Hard finale brace), novice bot added | Novice (the first-time player) already wins most Normal rows, except Quick solo Ranger (10–17%) and Hard. Casual Normal sits at 51–76 Heart. Ultimates are about 1–2% of all damage and a rain cast kills 1–2 creeps. Warden: 2.4–2.7 deaths solo, 6 in a Quick trio and 11 in a Full one. |
| v1 | First cut of the new kits (aimed ultimates at the old circle, 2× the old damage; Warden reaches flyers; Iron Vow heal and burst; three combos; no finale deduction), nothing else retuned | Warden solo 87–97 Heart against 53–61 for the others. Pairs and trios too strong; expert Hard teams 87–97 (target 40–80). Rank-1 ultimates already kill a Quick wave 8–10 pack. |
| v2 | Hero parity, Warden sturdier, team scaling, bots answer each other's ultimates | Quick casual Normal 73–83 for every team. Full trio too hard (54, one loss) and Hard still bimodal. |
| v3 | Ultimate cooldowns, Cleave, flat Hard multipliers | Casual Normal 75–94, expert Hard 50–88 by team. |
| v4, v5 (final) | Hard pairs and trio (a small ramp for the trio), Full trio; the Normal rows are v4, the Hard rows v5 | `final.txt`, `final-targets.txt` |

## Changes, in the order they were made

1. **Ultimates aimed again.** Arrow Storm 50 / 70 / 90 per pulse (was 22 / 33 / 44 each on a lane rain; before PR #45: 25 / 37 / 50), radius 3, 6 pulses over 3 s, range 10. Meteor 300 / 400 / 500 (before PR #45: 200 / 300 / 400), radius 3, 1.2 s delay, stun 1 / 1.5 / 2 s, range 9. Probe (`ults.ts` style lab): at rank 1, all ordinary creeps of Quick waves 8, 9 and 10 die inside the circle; only Brutes (and Wisps for the Meteor) survive.
2. **Bosses take 75% of an ultimate** (`combat.ultimateBossFactor`). With the raw numbers a rank-1 Meteor took 10.4% of the wave-5 Ironhorn and a rank-3 Arrow Storm 9% of the wave-10 Matriarch. Raising the damage any further made packs die with room to spare; lowering it left archers (214 HP, 15% magic resist at wave 10) alive. A boss factor was the only way to have both. Now: 7.8% worst case (Meteor R1 on Ironhorn), 6.7% (Arrow Storm R3, Matriarch).
3. **Warden, the lever.** Lifesteal ×0.67, damage −25%, HP 420 → 340 and armour 4 → 3 each moved solo Warden Heart by less than 1. **Cleave damage** is the lever: 52 / 85 / 117 / 150 → 30 / 50 / 70 / 90 took Quick solo from 87 to 75; 28 / 45 / 62 / 80 is where Full solo sat level with the others (Warden solo 75, Ranger 81, Arcanist 83).
4. **Ranger and Arcanist** (solo 56–63 against Warden's 87): damage 20 → 24 and 18 → 24, per level 3 → 3.5 and 2.5 → 3.5; HP 320 → 360 and 280 → 320. The ranged pair (A+R) still trailed by 20: armour 2 → 4 and 1 → 3, regen 1.5 → 2.5 and 1.2 → 2 brought it level (72 against 80+). Range +0.5 as well gave 78 (not kept).
5. **Warden armour and HP** ("more armour"): armour was already 4 + 0.7 per level on `main`; now 6 + 0.8. HP 420 → 620 (per level 60 → 50), regen 2.2 → 3. 480 / 70 left his Quick trio deaths at 4–5; 620 / 50 together with the lower trio early bonus (8) brought them to 2–3.
6. **Casual melee hero retreats earlier** (30 / 60% → 40 / 70% of HP; ranged unchanged).
7. **Quick pair HP ×1.43 → 1.5.** A cliff: 1.55 dropped A+R to 36 Heart, 1.47 gave 59. (The pair of rangers is the first to break, as before.)
8. **Quick trio early bonus 1.2 → 0.8, late bonus 1.4 → 1.6.** The early waves of a trio were killing the Warden (waves 3–7); 0.8 / 1.6 puts the Heart at 76–80 with the last third at 84–90% of the loss, first third at 0–7%.
9. **Full scaling** (`playerScaling`): pairs early 0.46 → 0.3 and late 0.24 → 0.35 (the first third took 66–85% of the loss before), trio early 1.25 → 1.0 and late 0.62 → 0.95. Pairs late 0.42 / 0.5 sent A+R to 51 / 30 and the pair of W+A to 96 (a pair of rangers loses to the late flyers): 0.35 is where all three pairs win.
10. **Bots answer a teammate's ultimate** (`comboAim`): a Ranger casts at a Meteor's circle, an Arcanist at an Arrow Storm's, a Warden's vow just cast is answered at the Warden. Combos per match: 0–0.6 → 0.2–0.6 in Quick (casts are rare there), 2–3 in Full pairs and about 9 in the Full trio.
11. **Ultimate cooldowns** 60 / 55 / 50 → 40 / 36 / 32 and Iron Vow 70 / 65 / 60 → 50 / 46 / 42. R casts per match ×1.5; pair parity 78 / 73 / 77 and Warden deaths 2.4–2.9 (they were 3.3–4.9).
12. **Hard.** The old bands ramped toward the last wave (`lateHp`, `lateCount`, `extra`, `bossHp`, `finale`, `finaleBrace`). Without the brace every expert Hard team ended at about 100 or about 0 Heart. A flat multiplier from wave 1 drains the Heart wave by wave: Full solo 1.17, pairs 1.14, trio 1.25 with 1.1× creeps; Quick solo 1.2 with 1.05×, pairs 1.22 with 1.1×, trio 1.33 with 1.12×. Count only where the team has room: 1.1× creeps on Full pairs flooded the Mid lane with Wisps (15 Heart lost to flyers).
13. **Novice bot**: first built to hold half its gold for a third of the match; in Full that is ten waves and the novice lost 27–100% of its Full Normal matches, so the slow spending ends at wave 5 in both modes.
14. **Finale deduction removed** (and the brace and its floor): Hard no longer loses Heart to something no creep did.

## What was tried and dropped

- Warden lifesteal, damage, HP and armour cuts (no effect on solo Heart).
- Iron Vow armour, regen, burst damage and stun cuts (no effect on W+A; the heal and burst are not what makes the pair strong).
- Pair late bonuses 0.4–0.5 (cliffs, see 9).
- Hard `lateHp` / `lateCount` ramps and boss HP (bimodal, see 12).
- Ranged-hero attack range +0.5 (A+R 78, not needed once armour was raised).


# Round 2: instant lane rains (Han's review of PR #66)

Han: no aiming. Arrow Storm and Meteor are instant casts again, rain on all three lanes in every team size, strikes land on creeps (never on empty road) and hit flyers, no per-lane or near-Heart cap, Meteor stuns on every impact; combos fuse any two ultimates within 5 s with no overlap check; targets: casual bots in Quick average at least 10 kills per Arrow Storm and 8 per Meteor, ultimates are 8–15% of a team's damage, a boss still loses at most about 8% to one ultimate. Raise cooldowns if needed; toughen late waves rather than weaken the rains. Probes were 6–20 seeds and one or two team sizes (`--tuning`); the tables are 30.

## Runs

| Run | What it was | What it showed |
|---|---|---|
| r2-a | Rains first cut: Arrow Storm 65 / 80 / 95 per strike, Meteor 100 / 125 / 150, cooldown 40 / 36 / 32, round-1 scaling | Quick casual solo 70–86, pairs 85–92, trio 96: teams far too easy; ultimates 17–30% of damage; 21 kills per Arrow Storm solo, 8 in a trio (fused casts counted as casts). |
| r2-b | Damage up (80 / 92 / 105, 140 / 150 / 155) so rank 1 kills the weak creeps in a trio too; fused casts no longer count as casts | `test/ultimates.test.ts` passes for 1, 2 and 3 players on waves 8–10; boss share ≤ 8% except the wave-5 Ironhorn. |
| r2-c | Cooldowns 40 → 55 → 60 → 75 s | Ultimate share 17–30% → 11–14% (Quick) at 60 s; 75 s brings Full under 15% as well. |
| r2-d | Team scaling retuned for the rains (Quick, then Full), bots hold a rain for a teammate | Casual Normal 70–86 in every team; combos 3–10 a match in Full. |
| r2-e | Hard retuned (flat multipliers), novice ultimate chance, per-team novice gate | `final.txt`, `final-targets.txt`. |

## Changes, in the order they were made

1. **Lane rains with no caps** (`coop.ts` `pulseRain`): every pulse, per lane, strikes on the creeps (greedy cover: the creep whose spot covers the most creeps not yet struck, until every creep of the lane has been hit once). Main's random spot choice with a lane cap of 6 and a Heart cap of 4 made 6 strikes per lane per rain. Arrow Storm 22 / 33 / 44 → 80 / 92 / 105 per strike; Meteor 40 / 58 / 76 (boss ×2) → 140 / 150 / 155 magic with a stun on every impact (0.9 / 1 / 1.1 s), now hitting flyers. The boss factor 0.75 stays: rank 3 Arrow Storm was 8.6% of the wave-10 Matriarch at 115 and the rank-2 Meteor 8.7% at 170, which is why ranks 2 and 3 add so little damage.
2. **Cooldowns** 60 / 55 / 50 → 75 / 68 / 62 s (Iron Vow unchanged at 50 / 46 / 42). At 40 s a casual solo cast every 40–60 s and the rains were 17–30% of a team's damage; at 55 s, 12–20%; at 70–75 s, 9–14%. Kills per cast stay about 22 (Arrow Storm) and 23 (Meteor) in Quick.
3. **Combos without overlap** (`onUltCast`): any two ultimates inside 5 s fuse. Meteor Rain 10 pulses of 160 / 190 / 220 (the first try, 120 / 145 / 170, did 1.29× the two apart; the target is 1.5×; now 1.65×). Stun Storm: Arrow Storm × 1.5 with a 0.6 s stun on every creep (1.67× the Storm and the vow's burst apart). Shockwave: the Meteor × 1.4, every impact pulls the creeps of its lane within 3.5 tiles 2 tiles together first (1.4× the Meteor and the burst apart, more on creeps that are not already stacked). Three ultimates: the strongest pair (`coop.comboOrder`) fires once.
4. **Bots**: cast a rain when 12 creeps are out (3 is not enough, 12 gave 22 kills per cast), hold it up to 25 s for a teammate whose ultimate is about to come back (4 s: 1 combo a match in pairs, 12 s: 1.1, 25 s: 1.4–2.2), answer a teammate's ultimate in the last 4 s of the window. Combos per match, Quick pairs 0.5–1.3 → 1.1–1.8, trio 3.0; Full pairs 4.5–5, trio 10.
5. **Team scaling** (the late waves, as Han asked): Quick pairs unchanged at 1.5, trio 1.6 → 1.65 with late 1.6 → 1.9, pairs late 0.26 → 0.33. Quick trio at 1.9 / 1.6 gave 68 with a Warden dying 4.2 times; 1.7 / 1.9 → 62.8; 1.65 / 1.9 → 70 and 2.6 deaths. Full pairs hp 1.43 → 1.5, early bonus 0.3 → 0.2, late 0.35 → 0.5; trio hp 1.46 → 1.52, early 1.0 → 0.9, late 0.95 → 1.2. Cliffs again: Full pair late 0.6 sent the ranged pair to 63–67, 0.8 to 21–39; early 0.05–0.1 made the whole match one cliff in the last third (parity 17).
6. **Hard** (flat multipliers, the rains made Hard 5–10 Heart easier): Full solo 1.17 → 1.18, pairs 1.14 → 1.18; Quick pairs 1.22 → 1.28 with a 0.12 late bonus, trio late 0.2 → 0.3. 1.27 / 1.3 (Full solo, pairs) was a cliff (Ranger 77 → 17, pairs 0–27).
7. **Novice**: ultimate chance 0.5 → 0.75 and forget time 90 → 60 s (Quick solo Ranger 73% → 90% over 30 seeds: it used 1.7 rains a match, now 3.6).
8. **Practice ally** casts its R 0.5 s after yours (no aim, no walking into a circle).

## What was tried and dropped

- Cooldown 40 / 55 / 60 s (shares 17–30%, 12–20%, 11–17%).
- Pair late bonuses 0.6 and 0.8 and early bonuses of 0.05–0.1 in Full (cliffs and a bimodal last third).
- Waiting for a teammate 4 s or 12 s (1.0–1.1 combos a match in Quick pairs; 25 s gave 1.4–2.2).
- Hard 1.27 / 1.3 for Full solo and pairs.
- Boss damage cuts beyond `ultimateBossFactor` (kept at 0.75 as asked).
