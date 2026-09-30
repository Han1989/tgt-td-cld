// Solo pick for local mode (no game server configured, or "Play solo offline"):
// the lobby card with the hero cards, the mode cards and a Play button.
// A new player's first match is the lesson (Quick, Normal); Skip leaves their saved pick alone.

import type { Difficulty, GameMode, HeroKind } from '@tdt/protocol';
import { lessonStatus } from '../tutorial/logic';
import { sharedSettings } from '../settings';
import { DifficultyPicker, storedDifficulty, storeDifficulty } from './difficultyPicker';
import { HeroPicker, storedHero, storeHero } from './heroPicker';
import { ModePicker, storedMode, storeMode } from './modePicker';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

let onPlayClick: (() => void) | null = null;
let onSkipClick: (() => void) | null = null;

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
  const skip = $('tutorial-solo-skip');
  const note = $('tutorial-solo-note');

  const applyLesson = (lesson: boolean): void => {
    note.classList.toggle('hidden', !lesson);
    skip.classList.toggle('hidden', !lesson);
    modes.setEnabled(!lesson);
    difficulties.setEnabled(!lesson);
    if (lesson) {
      modes.select('quick');
      difficulties.select('normal');
      play.textContent = 'Start lesson';
    } else {
      modes.select(storedMode());
      difficulties.select(storedDifficulty());
      play.textContent = 'Play';
    }
  };
  applyLesson(sharedSettings().get().tutorial === 'new');

  if (onPlayClick) play.removeEventListener('click', onPlayClick);
  if (onSkipClick) skip.removeEventListener('click', onSkipClick);
  onPlayClick = () => {
    root.classList.add('hidden');
    onPlay(picker.hero, modes.mode, difficulties.difficulty);
  };
  onSkipClick = () => {
    sharedSettings().set({ tutorial: lessonStatus('skip') });
    applyLesson(false);
  };
  play.addEventListener('click', onPlayClick);
  skip.addEventListener('click', onSkipClick);
  play.focus();
}
