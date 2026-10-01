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

> **Done.** Numbers in `tuning.ts` (`surges`, `modifierStats`). `PROTOCOL_VERSION` 15. Mechanics in the Decision Log in `GAME_DESIGN.md`. More maps (§3) are not started.

**Lane surges**
- From wave 6, about one wave in three concentrates regular creeps onto one lane. Co-op puts 60% of that wave's regular creeps there (`surges.share`). Solo uses 44% (`surges.soloShare`).
- Bosses stay on the lane they were listed on, still one per lane. The spawn gap on a piled lane tightens so the last creep still leaves before the next wave.
- A surge is **announced a wave ahead**: a `surge` event, a chip under the top bar, and that lane's portal flares. The wave banner names the surge when it starts. Reconnects read `snapshot.surgeLane` and `snapshot.nextSurge`.
- The schedule comes from the match seed (not the match RNG), so a replay repeats it.
- The balance bot answers: it prefers a free pad on the surged lane, a teammate may gift up to 40 gold (keeping 60), and a hero whose post is clear walks to that lane. Under Swift the hero stays on its post.

**Match modifiers**
- A match runs 1–2 modifiers, or none. The draw and the one reroll come from the match seed (`modifierRolls`), so the same seed reproduces them. Choosing none does not spend the reroll; "Use modifiers" turns the current draw back on.
- Online: the room rolls them when it is created (and again on Back to lobby). The host sends `{ t: 'modifiers', action: 'reroll' | 'none' | 'offer' }`. Guests see the draw and cannot change it.
- Solo: the hero pick shows the draw. The lesson locks it to none. Play again keeps the chosen modifiers and takes a new seed.
- Shown in the lobby and as a banner before the first wave. The match report and the server log name them (`swift+fog`, or `plain`).
- **Swift:** creeps +15% speed, bounty +10%.
- **Ironclad:** from wave 1, every 32nd spread slot of eligible ground creeps becomes a Brute (`ironclad.every`). Brutes, bosses and flyers are not converted. The slot mixes wave, lane and index, so the lead creep of every lane is not always the one that changes.
- **Sky Tide:** every 9th eligible ground creep becomes a Wisp. Brutes stay Brutes. With both, the two replacements take different slots of one combined span.
- **Fog:** tower range −10%, hero XP +20%.
- **Gold Rush:** starting gold and wave income +10%, bounty +10%, non-boss count +12%. Swift bounty and Gold Rush bounty stack.
- The modifier balance sample is solo Full Ironclad, Sky Tide and Gold Rush, solo Quick Ironclad, and Full 3-player Sky Tide (Heart 40–80, curve not asserted). Swift and Fog stay at these rates and are outside that sample. 2-player modifiers and Quick teams are outside it too; the no-modifier team gates still cover 2 and 3 players with surges on.

## 3. More maps over time

- Maps are data only: lanes, pads with zone tags, portals, Heart and safe zone, all in the format from `MOBILE.md` §2. **A new map needs no engine changes.**
- The host picks the map in the lobby, and solo has a map pick.
- Every map must fit the portrait rules: whole map visible on a 412 × 839 phone, a safe zone under the controls, and pad zones for 1–3 players (one per lane).
- **First new map:** lanes that **split and merge**, so where a creep leaks depends on the path it takes.
- **Each map must pass the balance gates on its own** before it ships.

## 4. Done when

- The balance bot uses branches and handles surges. **Done.**
- The balance gates for 1, 2 and 3 players pass on Spire with no modifiers, and with a fixed sample of modifier combinations. **Done** (no-modifier gates in `balance*.test.ts`; the sample in `balanceModifiers.test.ts` and `balanceModifiersTeams.test.ts`). Surges are always on, so the solo gates are the "surges enabled" check.
- A second map ships and passes its own gates. **Not started** (§3).
- `npm test` and `npm run build` pass.

## 5. Not included (for now)

- Perk picks every few waves (considered, but not chosen).
- Daily challenge seeds; accounts; progression that carries between matches.
