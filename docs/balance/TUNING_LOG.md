# Playtest 2 tuning log

Two rounds. Round 1 (the sections below, up to "Round 2") built the aimed-circle kit; Han's review of PR #66 replaced it with instant lane rains (round 2, at the end). `rains-final.txt` and `rains-final-targets.txt` are round 2 (named `final*.txt` until round 5, the chase rules, whose matrix `final.txt` now is); round 1's are `aimed-circles-final*.txt`, and `COMPARISON.md` puts the two side by side.

Every number below was tried on the balance matrix (`npm run balance:matrix`; the bots play whole matches headlessly).
Quick probes used 8–12 seeds and one team size; every full matrix (the tables in `baseline.txt` and `rains-final.txt`) is 30 seeds.
One change at a time where the matrix allowed it. `--tuning '<json>'` tries a number without editing `tuning.ts`.

## Runs

| Run | What it was | What it showed |
|---|---|---|
| Baseline | `main` as it was (lane rains, one combo, Hard finale brace), novice bot added | Novice (the first-time player) already wins most Normal rows, except Quick solo Ranger (10–17%) and Hard. Casual Normal sits at 51–76 Heart. Ultimates are about 1–2% of all damage and a rain cast kills 1–2 creeps. Warden: 2.4–2.7 deaths solo, 6 in a Quick trio and 11 in a Full one. |
| v1 | First cut of the new kits (aimed ultimates at the old circle, 2× the old damage; Warden reaches flyers; Iron Vow heal and burst; three combos; no finale deduction), nothing else retuned | Warden solo 87–97 Heart against 53–61 for the others. Pairs and trios too strong; expert Hard teams 87–97 (target 40–80). Rank-1 ultimates already kill a Quick wave 8–10 pack. |
| v2 | Hero parity, Warden sturdier, team scaling, bots answer each other's ultimates | Quick casual Normal 73–83 for every team. Full trio too hard (54, one loss) and Hard still bimodal. |
| v3 | Ultimate cooldowns, Cleave, flat Hard multipliers | Casual Normal 75–94, expert Hard 50–88 by team. |
| v4, v5 (final) | Hard pairs and trio (a small ramp for the trio), Full trio; the Normal rows are v4, the Hard rows v5 | `aimed-circles-final.txt`, `aimed-circles-final-targets.txt` |

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
| r2-e | Hard retuned (flat multipliers), novice ultimate chance, per-team novice gate | `rains-final.txt`, `rains-final-targets.txt`. |

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


# Round 3: tower repair (P2-06, protocol 19)

Han's decision after his 4 Oct solo Quick Normal match (Arcanist, seed 1113939891, build a620c32): towers can be repaired for gold. He sold and rebuilt a damaged tier-1 tower on the same pad 11 times (at 18–232 of 500 HP) and Archers destroyed 6 more: 37 towers for about 20 pads. **No creep, tower, hero or target number changed in this round.** Every run is 30 seeds of the full matrix; the tables are `repair-*.txt` (main: `repair-main.txt`, which reproduces `rains-final.txt` exactly).

## Runs

| Run | Rule | What it showed |
|---|---|---|
| main | No repair | `repair-main.txt`, 44 of 79 targets pass. Casual and expert bots lose 11–35 towers a match to Archers and bosses and rebuild them at tier 1. |
| rule (0.3) | Repair instant, cost ceil(0.3 × spent × share missing); casual and expert bots repair every tower under half HP they can pay for, after their purchases | `repair-rule.txt`, 40 pass. Casual Normal 87–97 Heart (target 50–90), expert Hard 67–97 (target 40–80), casual Hard goes from 0–27% wins to 100% for every solo and pair. Bots repair 25–64 times a match; towers lost drop to 0–2. |
| rule (0.5) | The same at repairRate 0.5 | 42 pass, Heart within 1–2 of 0.3 everywhere. The bots pay with gold they used to leave unspent, so the price does not hold them back. (0.4 was not run to the end: Han kept 0.3.) |
| step 1 (landed) | Bots repair one tower at a time: expert every 15 s, casual every 30 s (from Han's play: about once every 50 s on a phone with the workaround) | `repair-final.txt`, 39 pass. Heart unchanged within noise (casual Normal 87–97, expert Hard 67–97). Bots still repair 15–55 times a match; towers lost 0–10. |
| step 2 | A repair takes 3 s and the tower does not shoot meanwhile (`economy.repairSeconds`), then full HP | `repair-step2.txt`, 41 pass. Heart within −4 / +5 of step 1. The 3 s cost each bot 0.3–0.5% of its tower time (about 50–150 tower-seconds a match), too little to matter. |

## Targets that changed (main → step 2)

Now failing: the difficulty curve of casual Normal pairs (Full and Quick) and the Full trio, and of expert Hard pairs (Full and Quick) and the Quick trio: with repair the last third costs almost nothing. Now passing: the Quick trio's Warden-lane flyer loss. The Heart-band targets were already failing on main (a share of seeds outside the band); their means moved up as in the table above. Novice rows are identical (the novice never repairs).

## Why price and pace do not balance it

The casual and expert bots end most matches with gold to spare, and the towers they lose on main are the main way they lose Heart: a destroyed tower comes back at tier 1. With any repair at all they keep their upgraded front row, which is what Han wanted for players. The 3 s silence is a fraction of a percent of fire. What would move it is the strength of the waves (Hard's creep multiplier; Normal's targets), which this round did not touch.

## Step 2 in isolation (step 1 against step 1 + 2)

Heart and wins move by noise alone (−4 to +5). "Tower-seconds silent" is repairs × 3 s: each repair stops one tower for 3 s (an upper bound by a hair, since a tower destroyed mid-repair or a match ending cuts one short). The share is that over all tower time (towers at the end × match length, Full ≈ 1,190 s, Quick ≈ 560 s).

**casual · full · normal**

| team | Heart step 1 | Heart step 1+2 | Δ | win% step 1 → 1+2 | repairs / match | tower-seconds silent / match | share of tower time |
|---|---|---|---|---|---|---|---|
| R | 96.1 | 94.0 | -2.1 | 100 → 100 | 28.4 | 85 | 0.28% |
| W | 96.9 | 96.5 | -0.3 | 100 → 100 | 28.8 | 87 | 0.28% |
| A | 97.1 | 96.2 | -0.8 | 100 → 100 | 27.7 | 83 | 0.27% |
| R+W | 90.7 | 90.1 | -0.7 | 100 → 100 | 45.4 | 136 | 0.44% |
| W+A | 94.3 | 95.5 | +1.2 | 100 → 100 | 45.3 | 136 | 0.44% |
| A+R | 96.0 | 96.1 | +0.1 | 100 → 100 | 43.2 | 130 | 0.42% |
| R+W+A | 97.0 | 96.7 | -0.3 | 100 → 100 | 39.3 | 118 | 0.34% |

**expert · full · normal**

| team | Heart step 1 | Heart step 1+2 | Δ | win% step 1 → 1+2 | repairs / match | tower-seconds silent / match | share of tower time |
|---|---|---|---|---|---|---|---|
| R | 96.2 | 96.0 | -0.2 | 100 → 100 | 36.4 | 109 | 0.46% |
| W | 92.1 | 92.1 | -0.0 | 100 → 100 | 39.0 | 117 | 0.49% |
| A | 99.9 | 99.9 | +0.0 | 100 → 100 | 35.4 | 106 | 0.45% |
| R+W | 98.3 | 99.2 | +0.9 | 100 → 100 | 48.6 | 146 | 0.47% |
| W+A | 99.9 | 100.0 | +0.0 | 100 → 100 | 48.0 | 144 | 0.47% |
| A+R | 100.0 | 99.9 | -0.1 | 100 → 100 | 46.4 | 139 | 0.45% |
| R+W+A | 98.5 | 97.6 | -0.9 | 100 → 100 | 49.3 | 148 | 0.43% |

**casual · full · hard**

| team | Heart step 1 | Heart step 1+2 | Δ | win% step 1 → 1+2 | repairs / match | tower-seconds silent / match | share of tower time |
|---|---|---|---|---|---|---|---|
| R | 54.2 | 57.4 | +3.3 | 100 → 100 | 28.9 | 87 | 0.28% |
| W | 65.7 | 66.7 | +1.0 | 100 → 100 | 29.9 | 90 | 0.29% |
| A | 64.7 | 63.9 | -0.9 | 100 → 100 | 28.9 | 87 | 0.28% |
| R+W | 60.4 | 63.2 | +2.9 | 100 → 100 | 45.5 | 137 | 0.44% |
| W+A | 74.2 | 74.4 | +0.2 | 100 → 100 | 45.3 | 136 | 0.44% |
| A+R | 73.3 | 73.2 | -0.1 | 100 → 100 | 45.0 | 135 | 0.44% |
| R+W+A | 12.6 | 11.1 | -1.5 | 47 → 40 | 38.7 | 116 | 0.34% |

**expert · full · hard**

| team | Heart step 1 | Heart step 1+2 | Δ | win% step 1 → 1+2 | repairs / match | tower-seconds silent / match | share of tower time |
|---|---|---|---|---|---|---|---|
| R | 72.0 | 71.2 | -0.8 | 100 → 100 | 37.6 | 113 | 0.47% |
| W | 67.3 | 65.9 | -1.5 | 100 → 100 | 39.4 | 118 | 0.50% |
| A | 88.4 | 88.3 | -0.1 | 100 → 100 | 36.0 | 108 | 0.45% |
| R+W | 86.3 | 83.6 | -2.7 | 100 → 100 | 49.0 | 147 | 0.48% |
| W+A | 97.0 | 97.1 | +0.1 | 100 → 100 | 49.9 | 150 | 0.48% |
| A+R | 97.0 | 96.4 | -0.6 | 100 → 100 | 47.5 | 143 | 0.46% |
| R+W+A | 89.0 | 87.5 | -1.4 | 100 → 100 | 51.1 | 153 | 0.44% |

**casual · quick · normal**

| team | Heart step 1 | Heart step 1+2 | Δ | win% step 1 → 1+2 | repairs / match | tower-seconds silent / match | share of tower time |
|---|---|---|---|---|---|---|---|
| R | 90.2 | 87.5 | -2.7 | 100 → 100 | 15.7 | 47 | 0.32% |
| W | 88.6 | 85.0 | -3.6 | 100 → 100 | 15.8 | 48 | 0.33% |
| A | 89.3 | 90.1 | +0.9 | 100 → 100 | 15.5 | 47 | 0.32% |
| R+W | 87.2 | 88.8 | +1.6 | 100 → 100 | 23.3 | 70 | 0.48% |
| W+A | 88.0 | 88.5 | +0.5 | 100 → 100 | 23.3 | 70 | 0.48% |
| A+R | 90.6 | 90.3 | -0.3 | 100 → 100 | 23.6 | 71 | 0.49% |
| R+W+A | 87.9 | 93.0 | +5.2 | 100 → 100 | 22.1 | 66 | 0.41% |

**expert · quick · normal**

| team | Heart step 1 | Heart step 1+2 | Δ | win% step 1 → 1+2 | repairs / match | tower-seconds silent / match | share of tower time |
|---|---|---|---|---|---|---|---|
| R | 92.8 | 92.5 | -0.3 | 100 → 100 | 18.9 | 57 | 0.51% |
| W | 96.8 | 96.5 | -0.3 | 100 → 100 | 20.1 | 60 | 0.54% |
| A | 98.7 | 98.6 | -0.0 | 100 → 100 | 17.9 | 54 | 0.48% |
| R+W | 97.1 | 96.5 | -0.6 | 100 → 100 | 25.9 | 78 | 0.53% |
| W+A | 99.8 | 99.8 | +0.0 | 100 → 100 | 24.7 | 74 | 0.51% |
| A+R | 99.7 | 99.4 | -0.2 | 100 → 100 | 24.4 | 73 | 0.50% |
| R+W+A | 99.9 | 100.0 | +0.1 | 100 → 100 | 28.1 | 84 | 0.52% |

**casual · quick · hard**

| team | Heart step 1 | Heart step 1+2 | Δ | win% step 1 → 1+2 | repairs / match | tower-seconds silent / match | share of tower time |
|---|---|---|---|---|---|---|---|
| R | 47.7 | 48.9 | +1.2 | 100 → 100 | 15.7 | 47 | 0.32% |
| W | 51.4 | 50.5 | -0.9 | 100 → 100 | 15.9 | 48 | 0.33% |
| A | 45.0 | 44.6 | -0.4 | 100 → 97 | 15.5 | 46 | 0.32% |
| R+W | 14.6 | 9.2 | -5.4 | 47 → 30 | 24.7 | 74 | 0.51% |
| W+A | 26.9 | 24.2 | -2.7 | 70 → 63 | 25.4 | 76 | 0.52% |
| A+R | 22.4 | 18.6 | -3.7 | 63 → 60 | 25.3 | 76 | 0.52% |
| R+W+A | 0.0 | 0.0 | +0.0 | 0 → 0 | 19.1 | 57 | 0.35% |

**expert · quick · hard**

| team | Heart step 1 | Heart step 1+2 | Δ | win% step 1 → 1+2 | repairs / match | tower-seconds silent / match | share of tower time |
|---|---|---|---|---|---|---|---|
| R | 76.2 | 73.1 | -3.2 | 100 → 100 | 20.1 | 60 | 0.54% |
| W | 67.6 | 64.8 | -2.8 | 100 → 100 | 20.5 | 62 | 0.55% |
| A | 83.6 | 85.1 | +1.4 | 100 → 100 | 20.2 | 61 | 0.54% |
| R+W | 66.8 | 63.0 | -3.8 | 100 → 100 | 27.4 | 82 | 0.56% |
| W+A | 87.9 | 87.0 | -0.8 | 100 → 100 | 28.2 | 85 | 0.58% |
| A+R | 83.0 | 83.9 | +0.9 | 100 → 100 | 26.9 | 81 | 0.55% |
| R+W+A | 77.1 | 74.6 | -2.6 | 100 → 100 | 31.3 | 94 | 0.58% |

## Report only: Hard creep HP +0.05 (not committed)

Han asked, since expert Hard stayed above 80: one run of the expert and casual bots on Hard with every Hard creep-HP multiplier one round step higher, everything else as step 2. Full `difficulty.hard.byPlayers` hp 1.18 / 1.18 / 1.17 → 1.23 / 1.23 / 1.22; Quick `modes.quick.hard.byPlayers` hp 1.2 / 1.28 / 1.3 → 1.25 / 1.33 / 1.35 (counts and ramps unchanged). Run with `--tuning`; `tuning.ts` is unchanged. Expert Hard drops 0–10 Heart but Full Arcanist (85), W+A (94), A+R (94) and the trio (88), and Quick Arcanist (84), stay above 80, and most expert Hard teams now lose 65–91% of their Heart in the first third (the curve wants at most 45%). Casual Hard solo falls to 31–51 Heart and the Quick pairs to 20–47% wins.

**casual · full · hard**

| team | step 2: win% · Heart | Hard HP +0.05: win% · Heart | lost 1st/2nd/3rd (probe) |
|---|---|---|---|
| R | 100% · 57.4 | 100% · 40.3 (13–65) | 59%/19%/22% |
| W | 100% · 66.7 | 100% · 45.2 (13–69) | 58%/22%/20% |
| A | 100% · 63.9 | 100% · 51.4 (24–84) | 59%/18%/23% |
| R+W | 100% · 63.2 | 100% · 40.5 (3–67) | 62%/38%/0% |
| W+A | 100% · 74.4 | 100% · 61.3 (31–82) | 57%/43%/0% |
| A+R | 100% · 73.2 | 100% · 60.4 (33–85) | 62%/38%/0% |
| R+W+A | 40% · 11.1 | 23% · 5.0 (0–33) | 18%/12%/70% |

**expert · full · hard**

| team | step 2: win% · Heart | Hard HP +0.05: win% · Heart | lost 1st/2nd/3rd (probe) |
|---|---|---|---|
| R | 100% · 71.2 | 100% · 61.1 (48–71) | 84%/16%/0% |
| W | 100% · 65.9 | 100% · 57.8 (47–73) | 65%/28%/7% |
| A | 100% · 88.3 | 100% · 85.3 (77–98) | 85%/15%/0% |
| R+W | 100% · 83.6 | 100% · 73.4 (28–92) | 69%/31%/0% |
| W+A | 100% · 97.1 | 100% · 94.3 (85–100) | 87%/13%/0% |
| A+R | 100% · 96.4 | 100% · 94.1 (78–100) | 89%/11%/0% |
| R+W+A | 100% · 87.5 | 100% · 87.7 (72–94) | 91%/6%/4% |

**casual · quick · hard**

| team | step 2: win% · Heart | Hard HP +0.05: win% · Heart | lost 1st/2nd/3rd (probe) |
|---|---|---|---|
| R | 100% · 48.9 | 100% · 30.8 (6–52) | 27%/29%/44% |
| W | 100% · 50.5 | 100% · 38.2 (10–67) | 27%/41%/32% |
| A | 97% · 44.6 | 100% · 35.7 (11–52) | 30%/27%/42% |
| R+W | 30% · 9.2 | 20% · 4.0 (0–47) | 26%/42%/33% |
| W+A | 63% · 24.2 | 47% · 17.8 (0–70) | 27%/37%/36% |
| A+R | 60% · 18.6 | 37% · 10.7 (0–65) | 26%/32%/41% |
| R+W+A | 0% · 0.0 | 0% · 0.0 (0–0) | 28%/46%/26% |

**expert · quick · hard**

| team | step 2: win% · Heart | Hard HP +0.05: win% · Heart | lost 1st/2nd/3rd (probe) |
|---|---|---|---|
| R | 100% · 73.1 | 100% · 64.5 (29–84) | 41%/47%/13% |
| W | 100% · 64.8 | 100% · 58.2 (37–72) | 34%/53%/13% |
| A | 100% · 85.1 | 100% · 83.8 (71–92) | 53%/39%/8% |
| R+W | 100% · 63.0 | 100% · 56.5 (18–86) | 44%/53%/3% |
| W+A | 100% · 87.0 | 100% · 78.5 (54–94) | 43%/51%/6% |
| A+R | 100% · 83.9 | 100% · 80.2 (19–91) | 46%/50%/4% |
| R+W+A | 100% · 74.6 | 100% · 65.3 (24–86) | 36%/56%/8% |


# Round 4: late-wave creep growth with repair (inconclusive, stopped by Han)

Han's decision after round 3: repair goes back to instant (the 3 s repair was balance-neutral and a dimmed, silent tower read as a bug); keep repairRate 0.3 and the step-1 bot pace; raise creep strength in the later waves (waves 1–5 keep their strength), on Normal and Hard, to the playtest-2 targets. The knob is `waves.lateHpGrowthPerWave`: creep HP × (1 + hpGrowthPerWave × (wave − 1) + lateHpGrowthPerWave × max(0, wave − `lateGrowthFrom` 5)), with its own value for Quick (`modes.quick.waves`). All runs used `--tuning`; **the setting stays at 0** and no number changed.

## Runs

| Run | Seeds | What it showed |
|---|---|---|
| Quick +0.05 | 10, Normal, all bots | Novice Ranger solo wins 30% (main 90%), A+R 80%; casual solos come into the band (72–77) but pairs stay at 86–89; experts unchanged (90–100). |
| Quick +0.1 | 10, Normal, all bots | Novice wins 20–60% in five of seven teams; casual 50–81. |
| Full +0.05 | 10, Normal, all bots | Novice wins 0–60% in five of seven teams; casual 58–82 (in the band). |
| Full +0.1 | 10, Normal, all bots | Novice 0%, casual 0–20%, expert 24–90. |
| Full / Quick +0.02 | 10, Normal, novice and casual | Full: novice pairs 70–90% wins while casual is still 86–96. Quick: novice Ranger 60% while casual is 84–92. |
| Full / Quick +0.01 and +0.02 | 30, Normal, novice and casual | Table below. |

## The finding

With repair, a casual bot loses most of its Heart in the first third and almost none late (it keeps its towers); a novice, which never repairs, loses 10–35 towers a match and most of its Heart late. So any late-wave increase lands on the player who does not repair first. In Full, +0.02 takes casual down 2–8 Heart but sends novice pairs to 73–83% wins (−25 to −41 Heart); in Quick neither moves much at +0.02 on 30 seeds, but at +0.05 the novice Ranger falls to 30% while casual pairs are still above 85. The novice target (80% wins in every team) and the casual band (50–90) cannot both be met with late-wave growth while the bots' repair rate is a guess: we have no data on how often real players repair. Han stopped the round there: Playtest 3 measures it (repairs, repair gold and towers destroyed per player are in the match report), and the bots' repair pace and the rebalance are set once, after that.

### 30 seeds, Normal: repair only (instant, step-1 pace, growth 0) against late growth +0.01 and +0.02


**novice · full · normal** (Heart left; win% when not 100)

| team | repair only | +0.01 | +0.02 |
|---|---|---|---|
| R | 74.7 | 74.4 | 67.7 |
| W | 89.7 | 83.8 | 80.4 |
| A | 85.7 | 84.3 | 79.7 |
| R+W | 74.7 | 64.2 (90%) | 33.9 (73%) |
| W+A | 84.6 | 68.3 (97%) | 53.0 (83%) |
| A+R | 78.3 | 71.1 (97%) | 42.3 (83%) |
| R+W+A | 79.0 | 73.8 | 65.9 |

**casual · full · normal** (Heart left; win% when not 100)

| team | repair only | +0.01 | +0.02 |
|---|---|---|---|
| R | 96.1 | 93.4 | 89.0 |
| W | 96.9 | 95.3 | 93.5 |
| A | 97.1 | 94.9 | 93.4 |
| R+W | 90.7 | 89.4 | 85.3 |
| W+A | 94.3 | 90.8 | 91.5 |
| A+R | 96.0 | 93.8 | 90.3 |
| R+W+A | 97.0 | 96.1 | 94.4 |

**novice · quick · normal** (Heart left; win% when not 100)

| team | repair only | +0.01 | +0.02 |
|---|---|---|---|
| R | 28.1 (90%) | 27.7 (90%) | 22.5 (87%) |
| W | 52.6 | 51.6 | 48.4 |
| A | 50.1 | 48.5 | 45.9 |
| R+W | 41.0 | 41.0 | 40.0 |
| W+A | 49.3 | 49.2 | 49.1 |
| A+R | 43.8 | 43.3 | 41.9 |
| R+W+A | 46.8 | 48.1 | 46.5 |

**casual · quick · normal** (Heart left; win% when not 100)

| team | repair only | +0.01 | +0.02 |
|---|---|---|---|
| R | 90.2 | 89.2 | 85.7 |
| W | 88.6 | 87.9 | 86.9 |
| A | 89.3 | 87.3 | 84.5 |
| R+W | 87.2 | 87.1 | 87.0 |
| W+A | 88.0 | 88.0 | 87.9 |
| A+R | 90.6 | 90.9 | 90.9 |
| R+W+A | 87.9 | 88.8 | 85.1 |

## What landed, and the provisional test bounds

Han: land repair as it is (instant, repairRate 0.3, the step-1 bot pace, `lateHpGrowthPerWave` 0, no creep change); Playtest 3 measures how often real players repair, and the bots' pace and the rebalance are set once, after that. The final tables are `repair-final.txt` and `repair-final-targets.txt` (the step-1 run: 39 of 79 targets, main 44); `repair-step2*.txt` is the reverted 3 s repair, kept for the record.

The balance tests that assumed towers cannot be repaired failed with repair on (6 tests, and 8 Heart gates checked after their files' runs). In each, only the bound that failed was replaced by the measured 30-seed result with repair (each gate's own setup replayed on seeds 1–30) plus a small margin: mean +3 rounded up, share of seeds in the band −0.1 rounded down to 0.05, a third's share of the Heart lost ±0.1. Where the five gate seeds sit beyond that (they are fewer and less lucky), the bound is what they need, and both numbers are given. **All of them are provisional until Playtest 3** and marked so in the tests (`ProvisionalGate`, `expectTeamCurve(results, curve)` in `test/helpers.ts`). Tests that still passed were not touched.

| Test | Bound | Old → new | 30 seeds with repair (gate seeds) |
|---|---|---|---|
| `balance.test.ts` (casual Full solo, Ranger) | mean ceiling | 95 → 99 | mean 96.1 (97.2) |
| | share in 50–90 | 0.6 → 0 | 10% (0 of 5) |
| `balanceHeroes.test.ts` (casual Full solo, Warden and Arcanist) | mean ceiling | 95 → 100 | mean 97.0 (96.9) |
| | share in 50–90 | 0.6 → 0 | 3% (0 of 10) |
| `balanceExpertTeams.test.ts` (expert Full Hard, pairs and trio) | mean ceiling | 85 → 95 | mean 91.5 (89.2) |
| | share in 40–80 | 0.3 → 0 | 7% (1 of 10) |
| | first third, pairs / trio | 0.45 → 1 / 1 | 78% / 92% (94% pairs) |
| | last third, pairs / trio | 0.25 → 0 / 0 | 1% / 5% |
| `balanceModifiers.test.ts` (casual solo, modifier sample) | share in 50–90 | 0.6 → 0.15 | 29% (25%) |
| `balanceModifiersTeams.test.ts` (casual Full trio, Sky Tide) | share in 50–90 | 0.6 → 0 | 20% (0 of 5) |
| `balanceQuick.test.ts` (casual Quick solo) | share in 50–90 | 0.6 → 0.2 | 34% (33%) |
| `balanceQuickTeams.test.ts` (casual Quick pairs and trio) | share in 50–90 | 0.6 → 0.4 | 52% (50%) |
| | last third, pairs | 0.25 → 0 | 0% |
| | first third, trio | 0.45 → 0.55 | 17% (51%) |
| | last third, trio | 0.25 → 0 | 59% (0%) |
| `balanceTeam.test.ts` (casual Full trio) | mean ceiling | 95 → 100 | mean 97.0 (96.6) |
| | share in 50–90 | 0.6 → 0 | 3% (0 of 5) |
| | first third | 0.45 → 1 | 90% |
| | last third | 0.25 → 0 | 0% |
| `balanceDuo.test.ts` (casual Full pairs) | last third | 0.25 → 0 | 0% |
| `balanceExpertQuickTeams.test.ts` (expert Quick Hard, pairs and trio) | first third, pairs / trio | 0.45 → 0.8 / 0.55 | 57% / 45% (76% / 54%) |
| | last third, pairs / trio | 0.25 → 0 / 0 | 4% / 7% |

# Round 5: creeps that cannot be kited (Han, 21 Oct 2026)

Han's decision after the first Reddit cold tester, an experienced player who beat 30 waves on Normal with 4 Meteor casts and 706 kills by kiting: creeps chased a hero up to 9 tiles from where they stood, so the player gathered a wave, ran it through their towers, and each creep then walked back to its anchor through the towers again; nothing limited how many chased at once. Three rules (`creeps.ts`, `tuning.creepAi`): **a chase cap** (the nearest `chaseCap` ground creeps chase one hero; the rest keep walking their lane and strike a hero in their reach as they pass; taunted creeps do not count), **a shorter leash, a time limit and an aggro cooldown** (a chase ends `leashRange` tiles from where the creep left its lane or after `chaseSeconds`; a creep that gave up starts no chase for `aggroCooldown` seconds, but still strikes a hero in its reach), and **no walking back** (a creep that stops chasing rejoins its lane at the nearest point at or past where it left it, never behind; the `return` mode is gone, `rejoin` walks forward onto the lane). Flyers, the bosses' and Archers' tower attacks, Taunt and the Warden's auto-engage are unchanged.

Every full run is 30 seeds of the whole matrix (`npm run balance:matrix`, about 25 minutes on 4 cores); probes used 10 seeds (30 for the Warden-only probes) through `--tuning`, so no number was committed before it was measured. `chase-before.txt` / `chase-before-targets.txt` is main before this round (8b75077, 40 targets missed); `final.txt` / `final-targets.txt` is what landed (34 missed).

## Runs

| Run | What changed | Result |
|---|---|---|
| Han's numbers | cap 3, leash 9 → 4, 6 s, 5 s cooldown | Every team lost most of its Heart: the novice won 0–10% of seeds as a pair or a trio in Quick and 0% as Ranger + Warden or the trio in Full; the casual Full trio ended at 13 Heart, expert Hard teams at 0–50 (0% for the trio). Heart was lost in the first third. Gates: 14 tests failed, 8 of them the novice's 80% |
| p1–p4 (one rule at a time, novice) | no time limit / no cap / old leash / every old number with only the walk-back gone | No single rule did it: each of the first three alone still lost most pair and trio seeds. With only the walk-back gone the Full teams kept winning, but the Quick novice Ranger fell to 30% (8 Heart) |
| pursuit only (variant, dropped) | the cap and the time limit count only creeps out of reach (fighters stay), Han's numbers | About as good as cap 8 / leash 6 below, and it contradicts rule 1 ("the rest keep walking … as they pass"): dropped |
| creepAi sweeps A–H, then the Warden at 30 seeds | cap 5–10, leash 4–6, 6–12 s, cooldown 3–5 | Diminishing returns past cap 6–8. The Warden needs the leash: at 30 seeds leash 4 cost him 7–15 Heart against 5 or 6 (casual Quick 75 against 81; expert Full Hard 34 against 48) |
| cand1 | cap 6, leash 5, 10 s, cooldown 5; the team early bonus halved in Full (pairs 0.2 → 0.1, trio 0.9 → 0.5) and 0 in Quick (was 0.25 / 0.8) | Normal held (novice ≥ 87% everywhere, casual 69–99), 38 targets missed; expert Quick Hard pairs and trio at 4–51 Heart (Ranger + Warden won 27%), the expert Warden 73–76 on Normal |
| cand2 (landed) | cap 10, leash 5, 12 s, cooldown 3; the same early bonuses; the Quick trio's late bonus 1.9 → 1.6 | 34 targets missed (main 40). Tables below |

## The numbers that landed

| Number | Main | Han's first | Landed |
|---|---|---|---|
| `creepAi.chaseCap` | none | 3 | 10 |
| `creepAi.leashRange` | 9 | 4 | 5 |
| `creepAi.chaseSeconds` | none | 6 | 12 |
| `creepAi.aggroCooldown` | none (a walked-back creep ignored heroes until on its lane) | 5 | 3 |
| `playerScaling.earlyHpBonus` (Full: solo / pairs / trio) | 0 / 0.2 / 0.9 | | 0 / 0.1 / 0.5 |
| `modes.quick.playerScaling.earlyHpBonus` | 0 / 0.25 / 0.8 | | 0 / 0 / 0 |
| `modes.quick.playerScaling.lateHpBonus` | 0 / 0.33 / 1.9 | | 0 / 0.33 / 1.6 |

No Hard number changed (`difficulty.hard`, `modes.quick.hard`): every change is a shared creep number, which Hard multiplies.

## Before and after

"Han's numbers" is the first run (10 seeds; the novice was not run on Hard); main and final are 30 seeds. Mean Heart (a loss counts 0), with the win rate when under 100%.

**novice, normal** (mean Heart; win rate when under 100%)

| mode | Ranger | Warden | Arcanist | R+W | W+A | A+R | R+W+A |
|---|---|---|---|---|---|---|---|
| Full, main | 75 | 90 | 86 | 75 | 85 | 78 | 79 |
| Full, Han's numbers | 56 | 14 (90%) | 64 | 0 (0%) | 14 (70%) | 31 (80%) | 0 (0%) |
| Full, final | 61 | 70 | 72 | 60 (93%) | 68 | 72 | 82 |
| Quick, main | 28 (90%) | 53 | 50 | 41 | 49 | 44 | 47 |
| Quick, Han's numbers | 24 (90%) | 6 (60%) | 19 (90%) | 0 (0%) | 0 (0%) | 0 (10%) | 0 (0%) |
| Quick, final | 24 (87%) | 40 | 44 | 37 | 45 | 50 | 68 |

**casual, normal** (mean Heart; win rate when under 100%)

| mode | Ranger | Warden | Arcanist | R+W | W+A | A+R | R+W+A |
|---|---|---|---|---|---|---|---|
| Full, main | 96 | 97 | 97 | 91 | 94 | 96 | 97 |
| Full, Han's numbers | 96 | 85 | 97 | 51 | 48 | 76 | 13 |
| Full, final | 95 | 95 | 95 | 81 | 88 | 87 | 90 |
| Quick, main | 90 | 89 | 89 | 87 | 88 | 91 | 88 |
| Quick, Han's numbers | 82 | 51 | 86 | 42 | 54 | 57 | 25 |
| Quick, final | 88 | 79 | 84 | 89 | 90 | 91 | 90 |

**casual, hard** (mean Heart; win rate when under 100%)

| mode | Ranger | Warden | Arcanist | R+W | W+A | A+R | R+W+A |
|---|---|---|---|---|---|---|---|
| Full, main | 54 | 66 | 65 | 60 | 74 | 73 | 13 (47%) |
| Full, Han's numbers | 24 | 1 (20%) | 48 | 0 (0%) | 0 (0%) | 12 (80%) | 0 (0%) |
| Full, final | 36 (93%) | 38 | 46 | 32 | 37 | 50 | 0 (0%) |
| Quick, main | 48 | 51 | 45 | 15 (47%) | 27 (70%) | 22 (63%) | 0 (0%) |
| Quick, Han's numbers | 11 (80%) | 0 (10%) | 17 (70%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) |
| Quick, final | 10 (73%) | 24 (70%) | 15 (77%) | 0 (0%) | 0 (0%) | 0 (3%) | 0 (0%) |

**expert, normal** (mean Heart; win rate when under 100%)

| mode | Ranger | Warden | Arcanist | R+W | W+A | A+R | R+W+A |
|---|---|---|---|---|---|---|---|
| Full, main | 96 | 92 | 100 | 98 | 100 | 100 | 98 |
| Full, Han's numbers | 89 | 67 | 99 | 64 | 72 | 95 | 50 |
| Full, final | 94 | 82 | 100 | 84 | 98 | 100 | 95 |
| Quick, main | 93 | 97 | 99 | 97 | 100 | 100 | 100 |
| Quick, Han's numbers | 87 | 71 | 94 | 52 | 78 | 86 | 52 |
| Quick, final | 93 | 82 | 98 | 95 | 100 | 99 | 100 |

**expert, hard** (mean Heart; win rate when under 100%)

| mode | Ranger | Warden | Arcanist | R+W | W+A | A+R | R+W+A |
|---|---|---|---|---|---|---|---|
| Full, main | 72 | 67 | 88 | 86 | 97 | 97 | 89 |
| Full, Han's numbers | 47 | 3 (60%) | 72 | 1 (20%) | 34 | 50 | 0 (0%) |
| Full, final | 62 | 54 | 84 | 52 | 72 | 79 | 60 |
| Quick, main | 76 | 68 | 84 | 67 | 88 | 83 | 77 |
| Quick, Han's numbers | 43 | 2 (20%) | 66 | 0 (0%) | 1 (10%) | 2 (20%) | 0 (0%) |
| Quick, final | 68 | 40 | 78 | 18 (63%) | 55 (97%) | 59 (90%) | 38 (93%) |

## Where it lands

- **Novice (Normal):** at least 87% of the seeds for every team in both modes (the Quick Ranger, 90% on main; Full Ranger + Warden 93%). Its Heart fell by up to 20 for most teams (Full solo 61–72, pairs 60–72; Quick 24–50) and rose for the trios (Full 82, Quick 68: a smaller early team bonus, none in Quick).
- **Casual (Normal):** 79–95, from 87–97 on main: about the same band, still over 90 for Full solo (provisional since repair). Solo parity Quick 87.9 / 78.7 / 83.7 (within 10), pair parity Full 81 / 88 / 87 and Quick 89 / 90 / 91 (within 12).
- **Expert (Normal):** 82–100 (main 92–100). The expert's lead over the casual bot did not fall: both lost about 4–5 Heart in Full (expert 97.7 → 93.3 over the seven teams, casual 95.4 → 90.1). The expert bot was not more of a kiter than the casual one (below). The expert Warden ends Normal at 82 in both modes (target 85) and Full Ranger + Warden at 84.
- **Expert (Hard):** Full 52–84 (every team wins; main 67–97), so the solo Ranger and Warden now sit in 40–80; Quick 40–78 for the solo heroes and the other two pairs, but **Quick Ranger + Warden ends at 18 Heart and wins 63% of the seeds, the trio 38 (93%)**: the Warden's pair on Hard is the weak spot. Raising its Heart without Hard alone would push the casual Quick teams (89–91 already) over 90; that call is Han's.
- **The Warden:** no longer holds a lane's whole wave. Taunt (which ignores the cap, the leash and the time) and auto-engage work as before, but on Normal the expert Warden ends 11–18 Heart under the other heroes and the casual Quick Warden 9 under the Ranger (the parity gate's limit is 10).
- **Curves:** the expert Quick Hard pairs and trio now pass (35 / 35 / 31% and 14 / 37 / 49%); the casual Full pairs lose 87% of their Heart in the first third (main 68%).

## The bots

None of the three bots leads creeps through towers on purpose. All three relied on what the old rule gave a hero who stands on a lane: every creep within 5 tiles chased it, a leashed creep walked back up the lane and, back on it, chased again, so a hero held a lane's wave as long as it stood there (the novice, which never retreats, the most). The casual and expert bots also retreat to the Heart when hurt, which pulled chasers through their own towers on the way. No bot was changed.

## A pattern the rules leave (not taught to the bots)

"Never behind" means a creep pulled back up its lane walks down again: a hero standing up the lane from creeps that have passed it can pull up to 10 of them back up to 5 tiles, through towers they had passed, and they walk through them again on the way down, once every 15 s (a 12 s chase, then 3 s of cooldown). It pays twice over 5 tiles instead of 9, for 10 creeps instead of a wave. The bots do not do it.

## Gates that moved (provisional, listed)

| Test | Bound | Old → new | 30 seeds (final) |
|---|---|---|---|
| `balanceExpert.test.ts` (expert Full Normal, solo) | share of seeds ≥ 85 | 0.8 → 0.6 | Warden 81.7, 25 of 30 under 85 (gate seeds 73%) |
| `balanceExpertQuick.test.ts` (expert Quick Normal, solo) | share of seeds ≥ 85 | 0.8 → 0.6 | Warden 82.1, 22 of 30 under 85 (gate seeds 67%) |
| `balanceDuo.test.ts` (casual Full pairs) | first third | 0.45 → 1 | 87% (main 68%) |

Every other gate passes with its bound unchanged. The new rules' own tests are in `test/chase.test.ts` (the cap tests use Han's cap of 3 so it binds in a small scene).

## Replays

A match file saved before this round re-runs differently on this build (the creeps chase differently); `npm run replay` already warns with the commit that recorded it. Nothing else to do.

# Endless: the loop past wave 30 (Han, 17 and 22 Oct 2026)

Endless (`docs/GAME_DESIGN.md` "Endless") is Full on Hard for 30 waves, then waves 21–30 again, × `hpGrowthPerCycle` creep HP and × `countGrowthPerCycle` regular creeps per full cycle, with a boss every fifth wave past 30. Only `tuning.endless` was tuned: no shared creep number, no Hard band, no bot. The gate (`test/balanceEndless.test.ts`, solo, every hero, the five gate seeds, on the mean): the expert falls between waves 33 and 55 (every match inside it), the casual bot before 40, the novice before 30.

## Runs (solo, seeds 1–5 unless said)

| hpGrowthPerCycle / countGrowthPerCycle | expert fell on (mean, range) | casual fell on (mean, range) | |
|---|---|---|---|
| 1.35 / 1.15 (Han's start) | 66.7 (60–69) | 56.6 (37–68) | both past their bands |
| 1.6 / 1.2 | 53.2 (51–57) | 37.7 (32–48) | casual Arcanist 42.2 |
| 1.7 / 1.2 | 49.1 (43–53) | 36.1 (32–40) | casual Arcanist reaches 40 |
| 1.7 / 1.25 | 49.4 (47–52) | 35.1 (32–37) | |
| 1.9 / 1.2 | 45.4 (40–50) | 34.1 (32–37) | |
| 2.0 / 1.25 | 43.5 (40–47) | 33.6 (32–37) | a wall at cycle 2 |
| **1.8 / 1.25 (landed)** | **46.3 (41–49)** | **34.5 (32–37)** | |

1.8 / 1.25 puts the expert in the middle of its band with room on both sides, keeps the casual bot under 40 on every seed, and still leaves a spread of a few waves between heroes and seeds (a steeper cycle ends every run on the same few waves). The novice is Hard Full's own result: it falls on 13–31 (mean 24.2 on the gate seeds) whatever `tuning.endless` says, since the loop starts at 31.

## Where it lands (10 seeds, `docs/balance/endless.txt`)

Mean wave the Heart fell on:

| Bot | Ranger | Warden | Arcanist | R+W | W+A | A+R | R+W+A |
|---|---|---|---|---|---|---|---|
| novice | 20.9 | 26.5 | 28.0 | 25.0 | 29.9 | 29.3 | 28.7 |
| casual | 32.7 | 33.0 | 36.8 | 34.2 | 35.5 | 36.5 | 24.1 |
| expert | 46.0 | 45.7 | 47.9 | 41.7 | 43.7 | 44.0 | 36.2 |

Gate seeds (1, 2, 3, 42, 1234), solo: expert 46.9 (43–49), casual 34.3 (32–37), novice 24.2 (13–31). Teams fall a little earlier than solo players (their late-wave team bonus is full in every repeated wave); the casual trio already loses Full on Hard (casual Hard may lose), so it never reaches the loop. Pairs and the trio are not gated.

## Replays

Full and Quick are unchanged: the bots time their thirds, their forward post and their branches by the list's length (the same number as `totalWaves` there), and every wave of those modes is the list's. A match file from before protocol 21 re-runs as before.

# Round 6: Endless, the hero and the gold keep pace (Han's match of 24 Oct 2026)

Han's Endless match (Arcanist, seed 242266368) fell on wave 46: level 10 on wave 21, every pad built and branched by the mid-40s with about 2,000 gold and nothing to buy, the Heart 100 at wave 30, 89 at 31, 48 at 41, 44 at 46. Two levers that keep working (`docs/GAME_DESIGN.md` "Endless", Decision Log 24 Oct 2026): **veteran levels** (`hero.veteran`: past 10, each step 1.25 × the last; +6% damage, +6% HP, +4% mana regen a level) and **Reinforce** (`reinforce`: rank n of a branched tower at the tier-3 price × `priceGrowth`^(n − 1), × (1 + `perRank`) damage and max HP a rank), both Endless only; then the loop retuned around them. Targets: the expert falls on 60–90 (mean), the casual on 40–60, the novice before 40; no team loses more than 30 Heart in any ten waves on the mean curve; the expert's Heart at wave 31 is at least 80.

Every probe is solo on the gate seeds (1, 2, 3, 42, 1234) through `--tuning` (`npm run balance:matrix -- endless solo --seeds 1,2,3,42,1234`), then the landed numbers on 30 seeds and every team. The matrix's Endless table gained the mean Heart curve (every seed's Heart as each wave starts, a fallen run 0) at waves 31–71, its worst ten waves over the match and from wave 31 on, the level at the end, Reinforce ranks (and their gold) and the gold left. "w10" below is the worst ten waves from 31 on, the worst team.

## Runs (solo, gate seeds; mean wave fell on (range), Heart at wave 31, w10)

| Run | Loop (first cycle / per cycle HP, count) | Levers | Waves 1–30 | novice | casual | expert |
|---|---|---|---|---|---|---|
| r0 | 1.8 / 1.8, × 1.25 (main) | veteran 1.25 / 6% / 6% / 4%, Reinforce 1.5 / 12% | Full's Hard | 24.6 (13–32), 4 | 35.4 (32–38), 35 | 47.9 (43–50), 67, w10 84 |
| r1 | 1.5 / 1.5, × 1.2 (Han's first try) | as r0 | Full's Hard | 24.9 (13–34) | 42.1 (34–52), w10 33 | 58.5 (49–62), 67, w10 84 |
| b100 | 1.5 / 1.5, × 1.2 | as r0 | × 1.0 (Normal's) | 41.9 (40–45), 71 | 56.2 (51–59), 97, w10 95 | 62.4 (60–69), 92, w10 99 |
| c1–c4 | 1.3 × 1.3, 1.2 × 1.45, 1.5 × 1.2, 1.35 × 1.15 | as r0 | × 1.06 | 40.5–49.0 | 53.0–68.5 | 60.9–76.4, w10 82–96 |
| d1–d3 | 1.6 / 1.8 / 2.0 a cycle, × 1.0 | as r0 | × 1.09 | 34.3–39.6 | 43.3–67.4, w10 43–68 | 52.5–69.0, w10 83–89 |
| e1, e2 | 1.9, 2.1 a cycle, × 1.0 | Reinforce 1.2, 1.15 / 15% | × 1.09 | 34–35 | 40.5–47.8 | 51.1–56.5 |
| f1–f3 | 1.8 / 1.4, 2.0 / 1.35 (step, then climb) | as r0 (f3: price 1.25) | × 1.09 | 34.3–36.9 | 59.3–72.5 (38–89) | 77.6–79.3, w10 66–71 |
| g | 1.2–1.5 / 1.4–1.6 | as r0 | × 1.09 | 44–64 | 77–87 | 78–89 |
| h | 2.0–2.2 / 1.4–1.5 | Reinforce 1.12 / 12% | × 1.09 | 33.7–34.3 | 40.6–54.0 | 61.5–75.7, w10 64–82 |
| i | 2.0–2.3 / 1.3–1.4 | Reinforce 1.12 / 12% | × 1.07 | 33.9–35.6 | 37.6–59.1 | 77.8–94.7, w10 55–60 |
| **landed** | **2.0 / 1.4, × 1.0** | **veteran 1.25 / 6% / 6% / 4%, Reinforce 1.12 / 12%** | **× 1.07** | **35.6 (33–38), 47** | **53.1 (37–79), 79, w10 74** | **77.8 (69–87), 83.2, w10 60** |

From run g on, the expert also builds the pads it leaves empty in Full once its planned towers are branched (the runs before it reinforced at 20 of 26 pads).

## What each step found

- **The levers alone (r0).** With the loop as it was, the expert bot never reached "every pad branched" before it fell (18 of its 20 towers branched on wave 47, about 300–700 gold a wave going to repairs), so Reinforce bought 1–2 ranks; veteran levels took it to 17–18. The fall waves did not move.
- **Han's first try, 1.5 / 1.2 (r1).** Every run, every bot, holds its Heart flat and then loses it in 2–6 waves. The breaking wave is each cycle's Runner wave (wave 28's creeps: 14 Runners, 8 Brutes, 7 Wisps a lane): it leaks nothing one cycle and 40–60 the next.
- **Waves 1–30 (b100, the `_h31` probe).** The expert's Heart at wave 31 is decided by waves 1–15 (it loses nothing from 15 to 46): on Full's Hard bands it is 66 on the mean (the Warden 51). A band of its own for Endless: × 1.08 → expert 83.9, casual 76.4, novice 41.5 at wave 31; × 1.10 → 78.5 / 67.7 / 33.1; × 1.12 → 77.0 / 56.7 / 24.5; × 1.14 → 73.6 / 53.7 / 15.1. × 1.07 landed (83.2 on the gate).
- **More creeps per cycle make the cliff (c, d).** With `countGrowthPerCycle` above 1, a late wave's spawning (36 creeps a lane × 0.9 s, × 1.2 a cycle) runs past the 40 s timer, the waves overlap and the lane's density jumps: the Brutes break through all at once. HP alone (× 1.0 creeps) gives a gradual phase of 1–3 Heart a wave for about ten waves before the end (d).
- **A step, then a climb (f, h, i).** The bots' late defences converge (the casual fills all 26 pads, the expert 20 then 26 plus ranks), so a gentle loop leaves every bot alive past wave 80 (g; even the novice to 60). What separates them is where their defence stands when the loop starts: the expert's holds about 4× the wave-30 creeps, the casual's about 2.8×. `hpFirstCycle` (new) is that step, × 2 at wave 31; × 1.4 a cycle after it puts the expert on 70–87 and the casual on 37–79.
- **Reinforce's price (h).** At × 1.5 a rank the third rank costs 3.4 × the first for the same 12%: the bots' gold piled up again once their towers had two ranks. Priced at its own multiplier (× 1.12) every rank is worth its gold, its power grows with the gold spent, and the expert now spends 17–23 k gold on 50–66 ranks before it falls, with 400–600 left.

## Not met: the mean curve's worst ten waves

No setting tried brings the worst ten waves from wave 31 under 30 Heart for any team: the casual loses 50–75 in the cycle after the step (32–42), the expert 50–64 in its last ten waves. Every run holds its Heart while its defence outgrows the creeps and loses it in 2–6 waves once a cycle's Runner or Brute wave breaks through, and the seeds fall within a few waves of each other, so the mean curve drops nearly as fast as one run. A gentler loop moves the break later, not slower (the gentlest left every bot alive past 80), and a steeper one makes it sharper. It needs a rule, not a number. Three that would spread a fall over several waves, for Han to choose from after his match:

1. **A leak costs the Heart its creep's share of HP left** (a Brute that barely gets through costs a fraction): the same wave leaking a little more each cycle then drains the Heart over cycles instead of in one wave.
2. **A wave can take at most N Heart** (say 10 past the list, bosses aside): falling takes several bad waves, and a strong player sees the slide and has waves to answer it.
3. **The Heart mends a little after a wave with no leak** (say +2): a defence on the edge trades Heart back and forth before it breaks, which reads as a climb.

## Where it lands (30 seeds, every team, `docs/balance/endless.txt`)

Mean wave the Heart fell on (lowest–highest), and the Heart as wave 31 started:

| Bot | Ranger | Warden | Arcanist | R+W | W+A | A+R | R+W+A | all |
|---|---|---|---|---|---|---|---|---|
| novice | 33.7 | 35.9 | 36.9 | 31.2 | 33.9 | 32.7 | 35.5 | **34.3** (29–39) |
| casual | 61.7 | 59.4 | 62.2 | 49.1 | 48.6 | 51.9 | 43.7 | **53.8** (33–81) |
| expert | 74.4 | 78.8 | 77.8 | 63.0 | 66.9 | 68.1 | 63.9 | **70.4** (51–87) |
| expert, Heart at 31 | 82.2 | 73.7 | 97.8 | 72.5 | 93.5 | 96.3 | 85.6 | **85.9** |

- **Expert:** every team on 60–90, solo 74–79, teams 63–68; 85.9 Heart at wave 31 on the mean (the Warden 74, the Warden's pair 73: his early waves on Hard). Solo it ends at level 19–20 and buys 47–67 Reinforce ranks (16–23 k gold), with 430–530 gold left: the gold no longer piles up.
- **Casual:** 53.8 over every team; solo 59–62, at the band's top (the gate seeds give 53.1): a solo casual run either breaks in the cycle after the step (wave 33–42) or survives it with 20–30 Heart and limps on for 20–40 waves while its 26 towers branch and then reinforce. Pairs 49–52, the trio 44.
- **Novice:** every team before 40 (29–39). It enters the loop with 33–73 Heart and falls in the first cycle.
- **The mean curve:** the worst ten waves from wave 31 lose 33–73 Heart for every team (above: not met).
- **Full and Quick** do not change: 120 headless matches (Full and Quick, Normal and Hard, the three bots, solo, a pair and the trio, two seeds) give the same reports and replay logs, byte for byte, as main; and the expert solo matrix on 30 seeds (`npm run balance:matrix -- full quick expert solo`) prints the same 12 rows as `docs/balance/final.txt`, character for character.

## The gate

`balanceEndless.test.ts` (casual 40 ≤ mean < 60, novice mean < 40) and `balanceEndlessExpert.test.ts` (every expert match 60 ≤ wave < 90, mean Heart at wave 31 ≥ 80), solo, every hero, the gate seeds; every match ends in defeat. The expert has a file of its own so the slow runs (past wave 80) run beside the others.

## Replays

An Endless replay recorded before protocol 22 is refused (`replayRefusal`), with the commit to check out: veteran levels, Reinforce and the loop's numbers make it run differently. Han's match file of 24 Oct 2026 is one. Full and Quick replays re-run as before.
