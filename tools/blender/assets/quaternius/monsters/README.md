# Quaternius — Ultimate Monsters (added 17 Oct 2026)

From **Ultimate Monsters** by Quaternius (October 2022), https://quaternius.com/packs/ultimatemonsters.html,
**CC0 1.0** (`LICENSE.txt`, the pack's own file). The pack holds 50 animated monsters in glTF / FBX / OBJ / Blend
(215 MB); only the models the game maps are here, as glTF with embedded buffers, plus the shared palette texture
`Atlas_Monsters.png` (every model's UVs point at it; the painter repaints them in Runelight's tokens anyway).
To use another monster, copy its `.gltf` from the pack into the matching folder and add a row below.

Each model carries its own clips (names below). Flyers have no walk: use `Fast_Flying` as the gait and
`Flying_Idle` as the stand.

| Folder | Model | Clips | Mapped to (V-05c) |
|---|---|---|---|
| `flying/` | `Ghost` | Death Fast_Flying Flying_Idle Headbutt HitReact Punch | **Wisp** (the flyer): hooded, winged, hovers |
| `flying/` | `Hywirl` | same | alternate Wisp |
| `big/` | `BlueDemon` | Death Duck HitReact Idle Jump Punch Run Walk Weapon | **Ironhorn** (boss, Stomp): horned, heavy; `Jump_Land` for the Stomp |
| `big/` | `Demon` | same | alternate Ironhorn |
| `big/` | `MushroomKing` | same | **Matriarch** (boss, Hatch): crowned, broad; `Weapon` or `Wave` for the Hatch |
| `blob/` | `Mushnub` | Bite_Front Death HitRecieve Idle Jump Walk | the Matriarch's **hatchlings** (small, match the Matriarch's look) |
| `big/` | `Dino` | as BlueDemon | **Shardback** (boss, Shifting Hide): spined back = the shards; `Duck` for the hide shift |
| `big/` | `Cactoro` | as BlueDemon | alternate Shardback (spikes) |

The walking creeps (Grunt, Runner, Archer, Brute) come from the KayKit Skeletons (`../../kaykit/README.md`).
