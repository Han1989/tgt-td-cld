// The sound pass (docs/ART.md §13): everything made in code with the Web Audio API, no sound files.
//   synth.ts      the synth: sounds as data, rendered once into samples (pure)
//   sounds.ts     the sound bank: every effect and music instrument, loudness, cooldowns, voice caps
//   mix.ts        mixing rules: yours louder, off screen quieter or skipped, voice gate (pure)
//   score.ts      the code-made music: lobby and match loops, layers by scene (pure)
//   engine.ts     Web Audio: unlock on the first tap, iOS ambient session, background suspend, baking
//   music.ts      music players: the score, or recorded files (musicFiles.ts: one line to switch)
//   gameAudio.ts  game events → sounds, snapshot → music scene

import { AudioEngine } from './engine';
import { GameAudio } from './gameAudio';
import { createMusic, type MusicPlayer } from './music';
import { allSynthDefs } from './sounds';

export interface Audio {
  engine: AudioEngine;
  music: MusicPlayer;
  game: GameAudio;
}

export function createAudio(): Audio {
  const engine = new AudioEngine(allSynthDefs());
  const music = createMusic(engine);
  return { engine, music, game: new GameAudio(engine, music) };
}
