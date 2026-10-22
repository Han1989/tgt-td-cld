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

## 2. Lane surges

> **Done.** Numbers in `tuning.ts` (`surges`). `PROTOCOL_VERSION` 15 brought surges (with match modifiers); 20 removed the modifiers (below). Mechanics in the Decision Log in `GAME_DESIGN.md`. More maps (§3) are not started.

**Lane surges**
- From wave 6, about one wave in nine concentrates walking creeps onto one lane. Two players put 60% of that wave's walking creeps there (`surges.share`). Three players put 40% (`surges.trioShare`). Solo uses 34% (`surges.soloShare`), a nudge over an even split.
- Wisps stay on the portal they were listed on (they fly straight to the Heart). Boss waves and the last two waves do not surge. Bosses stay on the lane they were listed on, still one per lane. The spawn gap tightens only on a surged lane, so the last creep still leaves before the next wave.
- A surge is **announced a wave ahead**: the `surge` event raises a toast (the lane from `laneName` and the wave number on the event), a chip stays under the top of the map (`Surge next`, and `Surge now` once that wave starts), and that lane's portal flares. The wave banner still names the surge when it starts, so the toast does not replace it. Reconnects read `snapshot.surgeLane` and `snapshot.nextSurge`.
- The schedule comes from the match seed (not the match RNG), so a replay repeats it.
- The casual balance bot answers: it prefers a free pad on the surged lane, a teammate may gift up to 20 gold (keeping 60), and a hero whose post is clear walks to that lane. The expert bot does not move its pads, gift, or walk for a surge.

**Match modifiers: removed (Han, 17 Oct 2026; `PROTOCOL_VERSION` 20)**
- Swift, Ironclad, Sky Tide, Fog and Gold Rush (protocol 15–19: a seeded draw of one or two per match, rerolled by the host in the lobby, shown as chips in the lobby, a banner before the first wave and chips in the match) are gone from the game: they changed a match's numbers, not what the player does, so they never brought anyone back. The sim, the protocol, the lobby, the match HUD, the reports and the balance sample (`balanceModifiers*.test.ts`) dropped them. Lane surges stay exactly as above: always on, announced a wave ahead, the chip and the portal flare; the surge schedule still mixes the match seed on its own (`surges.ts` `mix32`), so it follows the seed as before.
- A replay saved with modifiers set is refused with a message naming the build to check out; one saved with none (or before modifiers existed) re-runs as before.
- What replaces them for replayability: more maps (§3), a Daily run and Endless (Decision Log, 17 Oct 2026), which use Hard, chosen by the game, never by a row of buttons. The Daily run's first session is done (Quick on Hard, one seed a day, a verified board; `docs/GAME_DESIGN.md` "Daily run", Decision Log 22 Oct 2026).

## 3. More maps over time

- Maps are data only: lanes, pads with zone tags, portals, Heart and safe zone, all in the format from `MOBILE.md` §2. **A new map needs no engine changes.**
- The host picks the map in the lobby, and solo has a map pick.
- Every map must fit the portrait rules: whole map visible on a 412 × 839 phone, a safe zone under the controls, and pad zones for 1–3 players (one per lane).
- **First new map:** lanes that **split and merge**, so where a creep leaks depends on the path it takes.
- **Each map must pass the balance gates on its own** before it ships.

## 4. Done when

- The balance bot uses branches and handles surges. **Done.**
- The balance gates for 1, 2 and 3 players pass on Spire. **Done** (`balance*.test.ts`). Surges are always on, so the solo gates are the "surges enabled" check. (A modifier sample, `balanceModifiers*.test.ts`, ran until the modifiers were removed on 17 Oct 2026.)
- A second map ships and passes its own gates. **Not started** (§3).
- `npm test` and `npm run build` pass.

## 5. Not included (for now)

- Perk picks every few waves (considered, but not chosen).
- Daily challenge seeds; accounts; progression that carries between matches.
