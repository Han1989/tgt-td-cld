// Solo pick for local mode (no game server configured, or "Play solo offline"):
// the lobby card with the hero cards, the mode cards and a Play button.

import type { Difficulty, GameMode, HeroKind } from '@tdt/protocol';
import { DifficultyPicker, storedDifficulty, storeDifficulty } from './difficultyPicker';
import { HeroPicker, storedHero, storeHero } from './heroPicker';
import { ModePicker, storedMode, storeMode } from './modePicker';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

/** Shows the solo pick and calls `onPlay` with the chosen hero, mode and difficulty. */
export function showSoloPick(onPlay: (hero: HeroKind, mode: GameMode, difficulty: Difficulty) => void): void {
  const root = $('lobby');
  for (const id of ['lobby-home', 'lobby-room', 'lobby-busy']) $(id).classList.add('hidden');
  $('lobby-solo').classList.remove('hidden');
  root.classList.remove('hidden');
  const picker = new HeroPicker($('lobby-heroes-solo'), storedHero(), storeHero);
  const modes = new ModePicker($('lobby-mode-solo'), storedMode(), storeMode);
  const difficulties = new DifficultyPicker($('lobby-difficulty-solo'), storedDifficulty(), storeDifficulty);
  const play = $('lobby-solo-play');
  play.focus();
  play.addEventListener(
    'click',
    () => {
      root.classList.add('hidden');
      onPlay(picker.hero, modes.mode, difficulties.difficulty);
    },
    { once: true },
  );
}
