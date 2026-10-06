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


# Round 3: tower repair (P2-06, protocol 19)

Han's decision after his 4 Oct solo Quick Normal match (Arcanist, seed 1113939891, build a620c32): towers can be repaired for gold. He sold and rebuilt a damaged tier-1 tower on the same pad 11 times (at 18–232 of 500 HP) and Archers destroyed 6 more: 37 towers for about 20 pads. **No creep, tower, hero or target number changed in this round.** Every run is 30 seeds of the full matrix; the tables are `repair-*.txt` (main: `repair-main.txt`, which reproduces `final.txt` exactly).

## Runs

| Run | Rule | What it showed |
|---|---|---|
| main | No repair | `repair-main.txt`, 44 of 79 targets pass. Casual and expert bots lose 11–35 towers a match to Archers and bosses and rebuild them at tier 1. |
| rule (0.3) | Repair instant, cost ceil(0.3 × spent × share missing); casual and expert bots repair every tower under half HP they can pay for, after their purchases | `repair-rule.txt`, 40 pass. Casual Normal 87–97 Heart (target 50–90), expert Hard 67–97 (target 40–80), casual Hard goes from 0–27% wins to 100% for every solo and pair. Bots repair 25–64 times a match; towers lost drop to 0–2. |
| rule (0.5) | The same at repairRate 0.5 | 42 pass, Heart within 1–2 of 0.3 everywhere. The bots pay with gold they used to leave unspent, so the price does not hold them back. (0.4 was not run to the end: Han kept 0.3.) |
| step 1 | Bots repair one tower at a time: expert every 15 s, casual every 30 s (from Han's play: about once every 50 s on a phone with the workaround) | `repair-step1.txt`, 39 pass. Heart unchanged within noise (casual Normal 87–97, expert Hard 67–97). Bots still repair 15–55 times a match; towers lost 0–10. |
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
