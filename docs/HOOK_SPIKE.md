# Soft-launch hook

This is the hook that ships on **main**. The throwaway spike (`claude/loving-hawking-7fvsu7`, `?spike=hook`) is design history only. Do not merge that branch.

Protocol is **16**. The Decision Log row is 2026-10-02 in `docs/GAME_DESIGN.md` §13. Tracker row: `TASKS.md` SL-04.

## What a match does

Always on. No spike flag.

1. **Meteor Rain (the only combo).** Ranger Arrow Storm and Arcanist Meteor are instant global rains. Cast the second within 2 seconds (`coop.comboWindow`, the same window as `R_OVERLAP_SECONDS`) and both rains end. One denser shared rain replaces them (more impacts per pulse, magic, the Meteor's rank). The casters do not need to aim at the same place. Warden Iron Vow does not fuse with either. `syncCast` still fires for any two living ultimates in that window and still adds no damage. Client polish can shake harder on `syncCast` (honour reduced motion); the event is unchanged.

2. **Lane rains.** Each impact is a small circle on a lane waypoint, weighted toward creeps on the path. Empty corners are not in the pool. A lane and the tiles near the Heart stop receiving strikes once their caps are full, so three players do not erase an early wave. Impacts are `aoe` events (`arrowStorm`, `meteor`, `meteorRain`) at the spot, with the strike radius. The zone on the snapshot has radius 0 (no aimed warning circle). `x` and `y` on the zone and on the `combo` event are the caster.

3. **Wave-10 shield (Quick only).** `coop.bossShield.waves` is `[10]`. Full sets that list to empty (`modes.full.coop`), so Full wave 10 Ironhorn is a normal boss. Quick wave 10 Matriarch takes no damage until two different lanes hit it within 3 seconds. The hit that breaks the shield lands in full. A tower counts as its pad's zone (West / Mid / East). A hero inside a lane ribbon counts as that lane. Beside Mid, outside the ribbon, the hit counts as the nearer side lane, so a Warden standing in melee of a Mid-lane boss can tag West or East. The balance bot walks to that side while the shield is up, instead of sitting on the Heart.

4. **Solo practice.** The solo pick has **Practice Meteor Rain**, and `?practice=meteor-rain` opens that pick with the button focused. It does not start the match by itself. Ranger and Arcanist are enabled; Warden has no partner, so the button stays off. The match adds an ally (`practice-ally`) at level 6 who learns R and casts it about half a second after yours. The ally does not count for pads, creep strength, surge share, income or call-early gold. Kills pay you. Online rooms never add an ally. The worker control is `{ ctl: 'practice', on: true }`, the same kind of message as pause. The first-match lesson is skipped for that match only.

5. **Warden.** E Blood Hunger: a share of auto-attack damage dealt returns as health. Cleave does not. R Iron Vow: while it lasts, every living hero gains armour and health regeneration (highest rank, they do not stack). Towers are not armoured. The gold `shielded` ring is that vow. `shieldFor` is how many ticks are left (0 when it is off), the same number on every living hero.

6. **Stick.** While you are steering, a melee hero does not walk itself toward a creep. Attacks still land on anything already in reach. Releasing the stick lets it step in again.

7. **Hard final brace.** Normal matches are unchanged. On Hard, a Heart above 80 loses the excess when the final wave starts (the finale leak, no creep). Creep leaks on that wave cannot take the Heart below 48. Earlier waves are not braced. Full and Quick share the numbers (`finaleBrace`).

## Wire (protocol 16)

| Piece | What it is |
|---|---|
| `ZONE_KINDS` | adds `meteorRain` |
| `AoeEffect` | adds `meteorRain` and `ironVow`; `lastStand` is gone |
| `combo` | `{ combo: 'meteorRain', x, y, radius: 0, heroes }` |
| `shieldUp` / `shieldHit` / `shieldBreak` | boss id, side or lanes |
| `aoe` | one event per rain impact, at that spot |
| `CreepSnap.shield` | `'up' \| 'left' \| 'right' \| 'off'`, omitted only when the creep never had a shield |
| `Snapshot.practice` | `{ allyId, startLevel }` or null |
| `HeroSnap.shielded` | true on every living hero while any Iron Vow remains |
| `HeroSnap.shieldFor` | ticks left, always a number (0 clears the delta) |
| `MatchReport.coop` | meteor rains and shield outcomes |
| `Replay.practice` | the ally, also listed in `players` |
| `syncCast` | unchanged; no extra damage |

No new client commands. Practice is not a protocol message.

A replay recorded before this version, on a wave-10 match, will not end on the same Heart: the shield changes the fight.

## What is still later

Stun Storm, Shockwave and any third pair. More raid mechanics (pressure plates, a weekly boss). Those stay Phase 6c. This hook does not mark `p6c-combos` or `p6c-raids` done.
