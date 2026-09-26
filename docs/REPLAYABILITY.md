# Tower Defense Together: Replayability (Phase 5)

> Companion to `docs/GAME_DESIGN.md`. **Starts only after Phase 4 is done.**
>
> Goal: no two matches play the same, even on one map. Co-op should reward teamwork, not just knowing where the towers go. All numbers live in `tuning.ts`. Every feature must pass the balance gates.

## 1. Top-tier tower branches

> **Done (pulled forward into Phase 4a as the late-game gold sink for 3–4 player teams).** Numbers in `tuning.ts` `branches`; mechanics and results in the Decision Log in `GAME_DESIGN.md`. Glacier freezes on every 3rd hit; Void adds 3% of max HP per hit; Hailstorm shoots flyers first.

At the top tier, each tower **splits into one of two specialisations**. The same pad can then support different builds, and the player picks based on the waves ahead and their team.

| Tower | Branch A | Branch B |
|---|---|---|
| Arrow | **Sniper:** long range, big crits, slow | **Volley:** hits 3 targets at once |
| Cannon | **Mortar:** very long range, huge splash, slow | **Shrapnel:** smaller splash that shreds armour |
| Frost | **Glacier:** brief freeze on every Nth hit | **Blizzard:** slowing area over time |
| Arcane | **Prism:** chains between targets | **Void:** ignores magic resist and deals % HP damage (anti-boss) |
| Flak | **Skyguard:** stronger anti-air, and slows flyers | **Hailstorm:** can also hit ground targets at reduced damage (fixes Flak being defenceless against ground attackers) |

- The choice is made at the moment of upgrading, in the tower ring (two buttons) or the desktop panel. It can't be changed afterwards, except by selling.
- The balance bot picks branches from the wave list and its team's needs.

## 2. Lane surges and match modifiers

**Lane surges**
- From wave 6, some waves concentrate on one lane, with about 60% of that wave's creeps.
- A surge is **announced a wave ahead** with a banner on that lane.
- In co-op, the zone owner comes under pressure and teammates respond: heroes move across to help and gold gets gifted.
- In solo, surges are milder, so they don't simply punish one player defending three lanes.

**Match modifiers**
- Each match has 1–2 modifiers, shown in the lobby and before the first wave. The host can reroll once, or choose "No modifiers".
- Modifiers come from the match seed, so a match can be reproduced.
- Examples:
  - **Swift:** creeps +15% speed, bounty +10%.
  - **Ironclad:** more armoured creeps.
  - **Sky Tide:** more flyers.
  - **Fog:** tower range −10%, hero XP +20%.
  - **Gold Rush:** more gold, more creeps.

## 3. More maps over time

- Maps are data only: lanes, pads with zone tags, portals, Heart and safe zone, all in the format from `MOBILE.md` §2. **A new map needs no engine changes.**
- The host picks the map in the lobby, and solo has a map pick.
- Every map must fit the portrait rules: whole map visible on a 412 × 839 phone, a safe zone under the controls, and pad zones for 1–4 players.
- **First new map:** lanes that **split and merge**, so where a creep leaks depends on the path it takes.
- **Each map must pass the balance gates on its own** before it ships.

## 4. Done when

- The balance bot uses branches and handles surges.
- The balance gates for 1, 2 and 4 players pass on Spire with no modifiers, and with a fixed sample of modifier combinations.
- Solo still passes with surges enabled.
- A second map ships and passes its own gates.
- `npm test` and `npm run build` pass.

## 5. Not included (for now)

- Perk picks every few waves (considered, but not chosen).
- Daily challenge seeds; accounts; progression that carries between matches.
