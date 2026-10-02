# Soft-launch hook

This is the hook that ships on **main**. The throwaway spike (`claude/loving-hawking-7fvsu7`, `?spike=hook`) is design history only. Do not merge that branch.

Protocol is **17**. The Decision Log rows are 2026-10-02 in `docs/GAME_DESIGN.md` §13 (the kit rework of Playtest 2). Tracker: `TASKS.md` SL-04 and SL-05.

## What a match does

Always on. No spike flag.

1. **Ultimates are aimed circles again** (as before the lane rains, and stronger). Arrow Storm (Ranger R): tap, aim, 6 pulses on a radius-3 circle over 3 s, ground and air, 50 / 70 / 90 physical per pulse, cast range 10. Meteor (Arcanist R): lands after 1.2 s on a radius-3 circle, ground only, 300 / 400 / 500 magic and a 1 / 1.5 / 2 s stun, cast range 9. Cooldowns are 40 / 36 / 32 s (Iron Vow 50 / 46 / 42 s), still no mana. A rank-1 cast kills every ordinary creep of a Quick wave 8–10 pack inside its circle (Brutes and bosses excepted). Bosses take `combat.ultimateBossFactor` (0.75) of any ultimate's or combo's damage, so one ultimate takes at most about 8% of a boss. `test/ultimates.test.ts` checks both.

2. **Three combos, one per hero pair.** Two ultimates cast within **5 s** (`coop.comboWindow`, `R_OVERLAP_SECONDS`) whose areas overlap fuse into one stronger effect; both originals end.
   - **Meteor Rain** (Arrow Storm + Meteor): the two circles overlap (centres no further apart than both radii). 20 small meteors over 3.5 s across both circles, magic, 200 / 260 / 320 by the Meteor's rank, 0.4 s stun.
   - **Stun Storm** (Iron Vow + Arrow Storm): the Warden stands inside the storm's circle when the second of the two is cast (either order). The storm, 0.5 tiles wider, and every volley also stuns 0.45 s.
   - **Shockwave** (Meteor + Iron Vow): the Warden stands inside the Meteor's circle. Creeps within 6.5 tiles are pulled to the Meteor's point for 0.9 s, then it lands for 1.5 × the Meteor's damage and a 1.5 / 2 / 2.5 s stun.
   Iron Vow's heal, armour and burst still happen when it fuses. `syncCast` still fires for any two living ultimates in the window and adds no damage. The casual and expert bots answer a teammate's ultimate (a zone still on the ground, or a Warden's vow just cast) so combos happen in the matrix; the novice does not.

3. **Wave-10 shield (Quick only).** `coop.bossShield.waves` is `[10]`; Full sets the list to empty. Quick wave 10 Matriarch takes no damage until two different lanes hit it within 3 s (a tower counts as its pad's zone, a hero by the lane ribbon he stands in, beside Mid the nearer side lane). The hit that breaks the shield lands in full. The balance bots walk to a side while it is up.

4. **Solo practice.** The solo pick has **Practice**, and `?practice=meteor-rain` opens that pick with the button focused. All three heroes are enabled: the ally is the Arcanist for a Ranger, the Ranger for an Arcanist or a Warden. It levels with you, answers your ultimate where you cast it (a Warden ally walks into the circle first) 0.5 s later, does not count for pads, creep strength, surge share, income or call-early gold, and its kills pay you. Online rooms never add an ally.

5. **Warden.** Melee, but basic attacks and Cleave hit flying creeps within reach, and Taunt pulls flyers off the Heart to hover over him for its duration. E Blood Hunger heals a share of the damage dealt by auto-attacks **and Cleave**. R Iron Vow: at once, every living hero anywhere heals 40 / 50 / 60% of max HP; a burst of radius 3.5 around the Warden deals 100 / 150 / 200 physical (ground and air) and stuns 0.75 / 1 / 1.25 s; for 6 / 7 / 8 s every living hero also gains +5 / 8 / 11 armour and +5 / 7 / 10 HP/s (highest rank, no stack). The gold `shielded` ring is that vow; `shieldFor` is the ticks left.

6. **Stick.** While you are steering, a melee hero does not walk itself toward a creep. Attacks still land on anything already in reach. Releasing the stick lets it step in again.

7. **No Hard finale deduction.** Hard used to take Heart HP when the final wave started (a leak no creep caused, with a brace above it). Both are gone. Hard is a flat creep multiplier from wave 1 (`difficulty.hard.byPlayers`, `modes.quick.hard.byPlayers`).

## Wire (protocol 17)

| Piece | What it is |
|---|---|
| `ZONE_KINDS` | `arrowStorm`, `meteor`, `meteorRain`, `stunStorm`, `shockwave`; every zone has an aimed `radius` again |
| `COMBO_KINDS` | `meteorRain`, `stunStorm`, `shockwave` |
| `AoeEffect` | adds `stunStorm`, `shockwave`; `ironVow` is the burst (with its radius) |
| `combo` | `{ combo, x, y, radius, heroes }`; (x, y) is the middle of the fused zone, `radius` its area (a Shockwave's pull radius) |
| `R_OVERLAP_SECONDS` | 5 (was 2) |
| `MatchReport.coop` | `combos` by kind (was `meteorRains`) and the shield outcomes |
| removed | `FINALE_LEAK_CREEP_ID`, `FINALE_LEAK_LANE` |
| unchanged | `shieldUp` / `shieldHit` / `shieldBreak`, `CreepSnap.shield`, `Snapshot.practice`, `HeroSnap.shielded` / `shieldFor`, `syncCast`, `Replay.practice` |

Casting Arrow Storm or Meteor is a point cast again (`cast` with `x`, `y`); Iron Vow is instant.

A replay recorded before this version will not end on the same Heart (the kits and numbers changed); `npm run counterfactual` re-runs the two Playtest 2 matches on the current rules.

## What is still later

Pressure plates and a weekly raid boss. These stay Phase 6c. `p6c-combos` is done for the three hero pairs; presentation of Stun Storm and Shockwave is a separate pass.
