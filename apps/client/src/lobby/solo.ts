// The solo pick (docs/ART.md §12): the picked hero on a stage, the hero buttons, Mode and Difficulty as two
// segmented rows, the modifiers, then one main button, Play, docked at the bottom of the card. Play and Practice
// start the player's own pick, never the lesson; a player who has not started a solo match yet gets one line under
// Play, "New here? Learn to play", which starts the lesson (tutorial/logic.ts `soloMatch`). It is the first screen
// of a build with no game server; the online build reaches it from Play solo and gets a Back to the home card.

import { HERO_KINDS, type HeroKind } from '@tdt/protocol';
import { HERO_INFO } from '../heroInfo';
import { ageGate } from '../privacy/ageCheck';
import { sharedSettings } from '../settings';
import { lessonOffer, type SoloPick, type SoloStart } from '../tutorial/logic';
import { DifficultyPicker, storedDifficulty, storeDifficulty } from './difficultyPicker';
import { HeroPicker, storedHero, storeHero } from './heroPicker';
import { HeroStage } from './heroStage';
import { ModePicker, storedMode, storeMode } from './modePicker';
import { SoloModifierPicker } from './modifierPicker';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

/** Starts a solo match: how it was started, what was picked, and the seed of the modifier draw on screen. */
export type SoloStarter = (start: SoloStart, pick: SoloPick, seed: number) => void;

export interface SoloPickOptions {
  /** `?practice=meteor-rain`: the practice note shows and Practice Meteor Rain has the focus. */
  practice?: boolean;
  /** The online build: a Back at the top left returns to the home card. A build with no game server has none. */
  back?: () => void;
}

/** The picks stored from the last solo pick, with `hero` (the lesson's match takes only the hero from them). */
export function storedPick(hero: HeroKind = storedHero()): SoloPick {
  return { hero, mode: storedMode(), difficulty: storedDifficulty(), modifiers: [] };
}

let stage: HeroStage | null = null;
let onPlayClick: (() => void) | null = null;
let onPracticeClick: (() => void) | null = null;
let onLearnClick: (() => void) | null = null;
let onBackClick: (() => void) | null = null;

/** Rebinds one button's click handler (the pick is shown again after every "Change hero / mode"). */
function rebind(el: HTMLElement, old: (() => void) | null, next: () => void): () => void {
  if (old) el.removeEventListener('click', old);
  el.addEventListener('click', next);
  return next;
}

/** Shows the solo pick; `onStart` gets the start (Play, Practice or Learn to play), the pick and the draw's seed. */
export function showSoloPick(onStart: SoloStarter, opts: SoloPickOptions = {}): void {
  const root = $('lobby');
  for (const id of ['lobby-home', 'lobby-room', 'lobby-busy']) $(id).classList.add('hidden');
  $('lobby-solo').classList.remove('hidden');
  root.classList.remove('hidden');
  root.querySelector('.lobby-card')?.scrollTo(0, 0);

  const role = $('lobby-solo-role');
  const blurb = $('lobby-solo-blurb');
  const showHero = (hero: HeroKind): void => {
    stage?.show(hero);
    role.textContent = HERO_INFO[hero].role;
    blurb.textContent = HERO_INFO[hero].blurb;
  };
  const first = storedHero();
  stage ??= new HeroStage($('solo-stage'), HERO_KINDS, first);
  const picker = new HeroPicker($('lobby-heroes-solo'), first, (hero) => {
    storeHero(hero);
    showHero(hero);
  });
  showHero(first);
  stage.start();

  const modes = new ModePicker($('lobby-mode-solo'), storedMode(), storeMode, $('lobby-mode-solo-line'));
  const difficulties = new DifficultyPicker(
    $('lobby-difficulty-solo'),
    storedDifficulty(),
    storeDifficulty,
    $('lobby-difficulty-solo-line'),
  );
  const modifiers = new SoloModifierPicker($('lobby-modifiers-solo'));
  const play = $('lobby-solo-play');
  const practiceBtn = $('lobby-solo-practice');
  const learn = $('lobby-solo-learn-btn');
  const back = $('lobby-solo-back');
  $('practice-solo-note').classList.toggle('hidden', !opts.practice);
  practiceBtn.title = 'Solo practice: an ally plays another hero and answers your ultimate, so you can try the combos';
  // Only before the first solo match; it does not come back on its own (⚙ → Lesson stays).
  $('lobby-solo-learn').classList.toggle('hidden', !lessonOffer(sharedSettings().get().tutorial));
  back.classList.toggle('hidden', !opts.back);

  // The online lobby asks the age question before this pick; a build with no lobby asks it at the first start.
  const go = (start: SoloStart) => () =>
    ageGate(() => {
      root.classList.add('hidden');
      stage?.stop();
      const deal = modifiers.deal();
      onStart(start, { hero: picker.hero, mode: modes.mode, difficulty: difficulties.difficulty, modifiers: deal.modifiers }, deal.seed);
    });
  onPlayClick = rebind(play, onPlayClick, go('play'));
  onPracticeClick = rebind(practiceBtn, onPracticeClick, go('practice'));
  onLearnClick = rebind(learn, onLearnClick, go('lesson'));
  onBackClick = rebind(back, onBackClick, () => {
    stage?.stop();
    opts.back?.();
  });

  // The practice link (`?practice=meteor-rain`) brings its note and button into view above the docked Play.
  if (opts.practice) practiceBtn.scrollIntoView({ block: 'center' });
  // Keyboard focus on the main button (or Practice, for the practice link) with a mouse or trackpad; a phone shows no
  // ring. Never scroll the card for it.
  if (opts.practice || matchMedia('(pointer: fine)').matches) (opts.practice ? practiceBtn : play).focus({ preventScroll: true });
}
