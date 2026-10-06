# Sound effect files (optional)

Every sound effect is made in code (`src/audio/sounds.ts`). Any of them can be replaced by a recorded
file: put `<name>.mp3` in this folder, with a name from the table below. It plays after the next
deploy; no code change. Step by step, with size targets and where to get sounds: `docs/SOUND_FILES.md`.

- The game trims the silence at both ends and levels each file to the loudness of the sound it
  replaces, so you don't need to match levels by hand.
- It still varies each play a little (pitch, level, timing) and adds a little of the room reverb.
- Mono, 44.1 kHz, 96–128 kbps, under 100 KB each (a warning at build time above 250 KB).
- Other names are ignored (the build prints a warning).

| File | When it plays | Length |
|---|---|---|
| `tap.mp3` | Any button | < 0.1 s |
| `ping.mp3` | A map ping | 0.3–0.6 s |
| `pingBurst.mp3` | Two players ping within a second | 0.4–0.8 s |
| `emote.mp3` | A quick-chat phrase | 0.2–0.5 s |
| `emoteBurst.mp3` | Two players use the same phrase within a second | 0.3–0.6 s |
| `twinCast.mp3` | Two ultimates within two seconds | 0.5–1 s |
| `togetherKill.mp3` | Two or more living heroes' damage on the same creep kill | 0.4–0.7 s |
| `noGold.mp3` | "Not enough gold" | 0.2–0.4 s |
| `deny.mp3` | "Not enough mana", "Nothing in range" | 0.1–0.3 s |
| `shot.arrow.mp3` | An Arrow tower fires (branches play it at another pitch) | 0.2–0.4 s |
| `shot.cannon.mp3` | A Cannon tower fires | 0.3–0.6 s |
| `shot.frost.mp3` | A Frost tower fires | 0.2–0.5 s |
| `shot.arcane.mp3` | An Arcane tower fires | 0.2–0.5 s |
| `shot.flak.mp3` | A Flak tower fires | 0.2–0.4 s |
| `blizzard.mp3` | A Blizzard tower's pulse | 0.4–0.8 s |
| `death.mp3` | A creep dies (small creeps play it higher, big ones lower) | 0.1–0.3 s |
| `bossDeath.mp3` | A boss dies | 1.5–3.5 s |
| `coin.mp3` | Your bounty, a gift to you | < 0.2 s |
| `stomp.mp3` | Ironhorn's Stomp | 0.5–1 s |
| `hideShift.mp3` | Shardback shifts its hide | 0.5–1 s |
| `heartHit.mp3` | A creep reaches the Heart (a warning) | 0.8–1.5 s |
| `waveStart.mp3` | A wave starts (a war horn) | 1–2 s |
| `bossWave.mp3` | A boss wave starts (a drum roll and a big gong) | 2–4.5 s |
| `attack.ranger.mp3` | The Ranger shoots | 0.2–0.4 s |
| `attack.warden.mp3` | The Warden's blade lands | 0.2–0.4 s |
| `attack.arcanist.mp3` | The Arcanist's staff | 0.2–0.4 s |
| `ranger.Q.mp3` | Multishot | 0.3–0.5 s |
| `ranger.W.mp3` | Snare Trap placed | 0.3–0.5 s |
| `ranger.R.mp3` | Arrow Storm | 1–1.5 s |
| `warden.Q.mp3` | Cleave | 0.4–0.6 s |
| `warden.W.mp3` | Taunt | 0.5–1.2 s |
| `warden.R.mp3` | Iron Vow | 1.5–3 s |
| `arcanist.Q.mp3` | Fireball cast | 0.3–0.5 s |
| `arcanist.W.mp3` | Frost Nova | 0.4–0.7 s |
| `arcanist.R.mp3` | Meteor cast | 1–2.5 s |
| `fireballHit.mp3` | Fireball lands | 0.3–0.6 s |
| `meteorHit.mp3` | Meteor lands | 1–1.5 s |
| `meteorFall.mp3` | Meteors falling before a rain's pulse (Meteor, Meteor Rain, Shockwave): a whistle into the landing | 0.5–0.7 s |
| `trap.mp3` | A Snare Trap springs | 0.2–0.4 s |
| `levelUp.mp3` | A hero levels up | 1–2 s |
| `heroDown.mp3` | A hero falls | 1.5–2.5 s |
| `respawn.mp3` | Your hero is back | 0.5–1 s |
| `build.mp3` | A tower is built | 0.4–0.8 s |
| `upgrade.mp3` | A tower is upgraded | 0.5–1.2 s |
| `branch.mp3` | A tower takes its tier-4 branch | 1–2.5 s |
| `sell.mp3` | A tower is sold | 0.2–0.4 s |
| `repair.mp3` | A tower is repaired | 0.3–0.8 s |
| `towerBreak.mp3` | A tower is destroyed | 0.3–0.6 s |
| `victory.mp3` | Victory | 3–4.5 s |
| `defeat.mp3` | Defeat | 3–4.5 s |
