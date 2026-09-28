# Music files (optional)

The game makes its music in code (`src/audio/score.ts`). To use recorded music instead:

1. Put `lobby.mp3`, `match.mp3` and, if you have one, `boss.mp3` in this folder. Each file loops;
   without `boss.mp3`, boss waves keep playing `match.mp3`.
2. In `src/audio/musicFiles.ts`, change `MUSIC_DIR` from `null` to `'/music/'`.

Keep the files small (a loop of 1–2 minutes, ~1–2 MB each): the service worker precaches everything
in `public/` so solo plays offline.
