// Solo pick for local mode (no game server configured, or "Play solo offline"):
// the lobby card with the hero cards, the mode cards and a Play button.
// A new player's first match is the lesson (Quick, Normal); Skip leaves their saved pick alone.

import type { Difficulty, GameMode, HeroKind } from '@tdt/protocol';
import { currentAnalytics } from '../analytics/install';
import { lessonStatus } from '../tutorial/logic';
import { sharedSettings } from '../settings';
import { DifficultyPicker, storedDifficulty, storeDifficulty } from './difficultyPicker';
import { HeroPicker, storedHero, storeHero } from './heroPicker';
import { ModePicker, storedMode, storeMode } from './modePicker';
import { SoloModifierPicker, type ModifierDeal } from './modifierPicker';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

let onPlayClick: (() => void) | null = null;
let onPracticeClick: (() => void) | null = null;
let onSkipClick: (() => void) | null = null;
let onHeroClick: (() => void) | null = null;

/**
 * Shows the solo pick and calls `onPlay` with the chosen hero, mode, difficulty, modifier deal,
 * and whether this start is Meteor Rain practice.
 * `practice` highlights that path (`?practice=meteor-rain`).
 */
export function showSoloPick(
  onPlay: (hero: HeroKind, mode: GameMode, difficulty: Difficulty, deal: ModifierDeal, practice: boolean) => void,
  practice = false,
): void {
  const root = $('lobby');
  for (const id of ['lobby-home', 'lobby-room', 'lobby-busy']) $(id).classList.add('hidden');
  $('lobby-solo').classList.remove('hidden');
  root.classList.remove('hidden');
  const picker = new HeroPicker($('lobby-heroes-solo'), storedHero(), storeHero);
  const modes = new ModePicker($('lobby-mode-solo'), storedMode(), storeMode);
  const difficulties = new DifficultyPicker($('lobby-difficulty-solo'), storedDifficulty(), storeDifficulty);
  const modifiers = new SoloModifierPicker($('lobby-modifiers-solo'));
  const play = $('lobby-solo-play');
  const practiceBtn = $('lobby-solo-practice') as HTMLButtonElement;
  const practiceNote = $('practice-solo-note');
  const skip = $('tutorial-solo-skip');
  const note = $('tutorial-solo-note');
  practiceNote.classList.toggle('hidden', !practice);

  const applyLesson = (lesson: boolean): void => {
    note.classList.toggle('hidden', !lesson);
    skip.classList.toggle('hidden', !lesson);
    modes.setEnabled(!lesson);
    difficulties.setEnabled(!lesson);
    modifiers.setLocked(lesson);
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

  const syncPractice = (): void => {
    practiceBtn.disabled = false;
    practiceBtn.title = 'Solo practice: an ally plays another hero and answers your ultimate, so you can try the combos';
  };
  syncPractice();
  const heroes = $('lobby-heroes-solo');
  if (onHeroClick) heroes.removeEventListener('click', onHeroClick);
  onHeroClick = syncPractice;
  heroes.addEventListener('click', onHeroClick);

  if (onPlayClick) play.removeEventListener('click', onPlayClick);
  if (onPracticeClick) practiceBtn.removeEventListener('click', onPracticeClick);
  if (onSkipClick) skip.removeEventListener('click', onSkipClick);
  onPlayClick = () => {
    root.classList.add('hidden');
    onPlay(picker.hero, modes.mode, difficulties.difficulty, modifiers.deal(), false);
  };
  onPracticeClick = () => {
    if (practiceBtn.disabled) return;
    root.classList.add('hidden');
    onPlay(picker.hero, modes.mode, difficulties.difficulty, modifiers.deal(), true);
  };
  onSkipClick = () => {
    currentAnalytics()?.funnel('tutorial_skip');
    sharedSettings().set({ tutorial: lessonStatus('skip') });
    applyLesson(false);
  };
  play.addEventListener('click', onPlayClick);
  practiceBtn.addEventListener('click', onPracticeClick);
  skip.addEventListener('click', onSkipClick);
  (practice ? practiceBtn : play).focus();
}
