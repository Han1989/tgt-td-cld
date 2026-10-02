# Soft-launch hook

This is the hook that ships on **main**. The throwaway spike (`claude/loving-hawking-7fvsu7`, `?spike=hook`) is design history only. Do not merge that branch.

Protocol is **17**. The Decision Log rows are 2026-10-02 in `docs/GAME_DESIGN.md` §13 (the kit rework of Playtest 2). Tracker: `TASKS.md` SL-04 and SL-05.

## What a match does

Always on. No spike flag.

1. **Arrow Storm and Meteor are instant lane rains** (Han, PR #66 review: no aiming). Press R and it rains on all three lanes, always, in every team size; the cast needs no point and the hero can stand anywhere. Every pulse, strikes land on the creeps of each lane: the strike goes where it covers the most creeps not yet struck that pulse, again and again until every creep of the lane has been hit once (`coop.ts` `pulseRain`). Strikes land on creeps, never on empty road; they hit ground **and** flyers; there is no per-lane cap and no Heart pocket (main's PR #45 rains had both). A creep takes one strike's damage per pulse however many strikes overlap it. The visuals are #52 / #55's (`aoe` events per strike, the rain sky).
   - **Arrow Storm** (Ranger R): 6 pulses over 3 s, strike radius 1.6, 80 / 92 / 105 physical per strike. Cooldown 75 / 68 / 62 s.
   - **Meteor** (Arcanist R): 4 pulses over 3 s, strike radius 1.8, 140 / 150 / 155 magic per strike, **every impact stuns** 0.9 / 1 / 1.1 s. Cooldown 75 / 68 / 62 s.
   - Iron Vow stays 50 / 46 / 42 s; no ultimate costs mana.
   - "Significant": at rank 1, on a Quick wave 8–10, one rain kills the Runners, Wisps and Grunts on every lane and takes at least half the HP of the rest (Brutes and bosses excepted), for 1, 2 and 3 players (`test/ultimates.test.ts`). Bosses take `combat.ultimateBossFactor` (0.75) of any ultimate's or combo's damage, so one ultimate takes at most about 8% of a Matriarch or Shardback (15% of an Ironhorn at wave 5, which comes before R unlocks). Rank 2 and 3 therefore add little damage (the boss cap) and shorten the cooldown instead.

2. **Three combos, one per hero pair, no overlap check.** Two ultimates cast within **5 s** (`coop.comboWindow`, `R_OVERLAP_SECONDS`) fuse, wherever the heroes stand: both originals end and one lane rain of the combo takes their place (the combo's own zone carries the Meteor caster's rank for Meteor Rain and Shockwave, the storm's for Stun Storm).
   - **Meteor Rain** (Arrow Storm + Meteor): one denser rain on all lanes, 10 pulses over 3.5 s (a pulse every 0.35 s), strike radius 1.8, magic 160 / 190 / 220 per strike by the Meteor's rank, every strike stuns 0.4 s. 1.65 × the damage of the two cast apart (the target is at least 1.5 ×; `test/coop.test.ts`).
   - **Stun Storm** (Iron Vow + Arrow Storm): the Arrow Storm rain with every strike 1.5 × as hard and a 0.6 s stun on every creep it hits. 1.67 × the Storm and the vow's burst cast apart (the vow's heal, armour and burst happen as always; the tests ask for 1.25 ×).
   - **Shockwave** (Meteor + Iron Vow): the Meteor rain where every impact first pulls the ground creeps of its lane within 3.5 tiles 2 tiles toward it (bosses half as far), then lands 1.4 × as hard with a 1.1 / 1.2 / 1.3 s stun. 1.4 × the Meteor and the vow's burst cast apart (more when the creeps are not already stacked).
   - **Three ultimates inside the window fire only the strongest pair, once** (`coop.comboOrder`: Meteor Rain, then Shockwave, then Stun Storm). The first two that pair fuse at once; a third that makes a stronger pair with one of them ends the weaker combo and fires the stronger (the ultimate left over rains apart, from now); one that does not makes no second combo and casts apart.
   `syncCast` still fires for any two living ultimates in the window and adds no damage. The casual and expert bots cast a rain once 12 creeps are out, hold it up to 25 s for a teammate whose ultimate is about to come back (so the two land together), and answer a teammate's ultimate cast in the last 4 s with their own (6 creeps out is enough); the novice answers nobody.

3. **Wave-10 shield (Quick only).** `coop.bossShield.waves` is `[10]`; Full sets the list to empty. Quick wave 10 Matriarch takes no damage until two different lanes hit it within 3 s (a tower counts as its pad's zone, a hero by the lane ribbon he stands in, beside Mid the nearer side lane). The hit that breaks the shield lands in full. The balance bots walk to a side while it is up.

4. **Solo practice.** The solo pick has **Practice**, and `?practice=meteor-rain` opens that pick with the button focused. All three heroes are enabled: the ally is the Arcanist for a Ranger, the Ranger for an Arcanist or a Warden. It levels with you, answers your ultimate 0.5 s later (they are instant, so it only has to be ready), does not count for pads, creep strength, surge share, income or call-early gold, and its kills pay you. Online rooms never add an ally.

5. **Warden.** Melee, but basic attacks and Cleave hit flying creeps within reach, and Taunt pulls flyers off the Heart to hover over him for its duration. E Blood Hunger heals a share of the damage dealt by auto-attacks **and Cleave**. R Iron Vow: at once, every living hero anywhere heals 40 / 50 / 60% of max HP; a burst of radius 3.5 around the Warden deals 100 / 150 / 200 physical (ground and air) and stuns 0.75 / 1 / 1.25 s; for 6 / 7 / 8 s every living hero also gains +5 / 8 / 11 armour and +5 / 7 / 10 HP/s (highest rank, no stack). The gold `shielded` ring is that vow; `shieldFor` is the ticks left.

6. **Stick.** While you are steering, a melee hero does not walk itself toward a creep. Attacks still land on anything already in reach. Releasing the stick lets it step in again.

7. **No Hard finale deduction.** Hard used to take Heart HP when the final wave started (a leak no creep caused, with a brace above it). Both are gone. Hard is a flat creep multiplier from wave 1 (`difficulty.hard.byPlayers`, `modes.quick.hard.byPlayers`).

## Wire (protocol 17)

| Piece | What it is |
|---|---|
| `ZONE_KINDS` | `arrowStorm`, `meteor`, `meteorRain`, `stunStorm`, `shockwave`; every zone has `radius` 0 (a lane rain: its strikes are `aoe` events) |
| `COMBO_KINDS` | `meteorRain`, `stunStorm`, `shockwave` |
| `AoeEffect` | adds `stunStorm`, `shockwave`; `ironVow` is the burst (with its radius) |
| `combo` | `{ combo, x, y, radius: 0, heroes }`; (x, y) is the lead caster |
| `R_OVERLAP_SECONDS` | 5 (was 2) |
| `MatchReport.coop` | `combos` by kind (was `meteorRains`) and the shield outcomes |
| removed | `FINALE_LEAK_CREEP_ID`, `FINALE_LEAK_LANE` |
| unchanged | `shieldUp` / `shieldHit` / `shieldBreak`, `CreepSnap.shield`, `Snapshot.practice`, `HeroSnap.shielded` / `shieldFor`, `syncCast`, `Replay.practice` |

All three ultimates are instant casts (`cast` with no point), as on main; a cast with a point is rejected.

A replay recorded before this version will not end on the same Heart (the kits and numbers changed); `npm run counterfactual` re-runs the two Playtest 2 matches on the current rules.

## What is still later

Pressure plates and a weekly raid boss. These stay Phase 6c. `p6c-combos` is done for the three hero pairs; presentation of Stun Storm and Shockwave is a separate pass.
