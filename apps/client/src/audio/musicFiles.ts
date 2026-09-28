// Recorded music, for later (the sound pass, docs/ART.md §13). Today the music is made in code
// (score.ts). To use real music files instead:
//   1. put `lobby.mp3`, `match.mp3` and, if you have one, `boss.mp3` in apps/client/public/music/
//      (each loops; without a boss file boss waves keep playing `match`), and
//   2. change the line below to '/music/'.
export const MUSIC_DIR: string | null = null;
