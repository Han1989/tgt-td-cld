# Music files (optional)

The game makes its music in code (`src/audio/score.ts`). A recorded file replaces it for its scene
as soon as it's in this folder (after the next deploy; no code change):

| File | Plays | If it's missing |
|---|---|---|
| `lobby.mp3` | The lobby and the end screen | The code-made lobby music (koto, shakuhachi, taiko) |
| `match.mp3` | A match: building and waves (and boss waves, without `boss.mp3`) | The code-made match music (war drums, erhu, guzheng) |
| `boss.mp3` | Boss waves and while a boss lives | `match.mp3`, else the code-made boss layers |

- Each file loops. The game trims the encoder's silence at both ends, so a file cut on the beat
  loops without a gap, and it levels every file to the same loudness.
- Stereo, 44.1 kHz, 128 kbps, a loop of 1–2 minutes: 1–2 MB (a warning at build time above 4.5 MB).
- Files aren't downloaded when the app installs: each one is fetched the first time it's needed (the
  lobby's on the first tap, the match's when a match is created) and then kept for offline play. It plays
  while it downloads (streamed), fading in within about a second of the tap, and the game switches to its
  own seamless copy of the loop once the whole file is in; the code-made music plays only if the file
  can't be played or downloaded at all.
- `npm run music-levels -w @tdt/client` measures each file's level (`src/audio/musicLevels.json`), so the
  streamed start is as loud as the loop; without it the build only warns.

Step by step, with where to get music you may use in a paid game: `docs/SOUND_FILES.md`.
