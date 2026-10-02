# Playtest 2 tuning log

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
