// The sound pass (docs/ART.md §13): effects and music made in code with the Web Audio API, which
// recorded files can replace (docs/SOUND_FILES.md).
//   synth.ts      the synth: sounds as data (strings, drums, gongs, horns…), rendered once into samples (pure)
//   sounds.ts     the sound bank: every effect and music instrument, loudness, cooldowns, voices, variants
//   mix.ts        mixing rules: yours louder, off screen quieter or skipped, voice gate, each play's take (pure)
//   score.ts      the code-made music: the lobby and match loops, layers by scene, humanised (pure)
//   files.ts      recorded files: which there are, silence trimming, loudness levelling (pure)
//   fileList.ts   the files in this build (listed by vite.config.ts)
//   engine.ts     Web Audio: unlock on the first tap, iOS ambient session, background suspend, baking, reverb
//   music.ts      music players: the score, or a recorded file per scene
//   gameAudio.ts  game events → sounds, snapshot → music scene

import { AudioEngine } from './engine';
import { buildSoundFiles } from './fileList';
import { GameAudio } from './gameAudio';
import { Music } from './music';
import { allSynthDefs } from './sounds';

export interface Audio {
  engine: AudioEngine;
  music: Music;
  game: GameAudio;
}

export function createAudio(): Audio {
  const engine = new AudioEngine(allSynthDefs(), buildSoundFiles());
  const music = new Music(engine);
  return { engine, music, game: new GameAudio(engine, music) };
}
