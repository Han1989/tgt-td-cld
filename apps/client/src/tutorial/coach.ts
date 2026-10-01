// The lesson card. Steps and wording live in logic.ts; this only shows them and
// notices when the player has done the action.

import type { HeroKind } from '@tdt/protocol';
import {
  absorbTutorial,
  advanceTutorial,
  continueTutorial,
  freshTutorial,
  stepSatisfied,
  tutorialMayAdvance,
  tutorialPrompt,
  type TutorialRun,
  type TutorialSample,
} from './logic';

export interface TutorialFeed extends TutorialSample {
  phase: string;
  wave: number;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

export class TutorialCoach {
  onSkip: () => void = () => {};
  /** The player reached the closing card (the lesson will not auto-run again). */
  onComplete: () => void = () => {};
  /** They dismissed the closing card. */
  onDismiss: () => void = () => {};

  private readonly root = $('tutorial');
  private readonly kicker = $('tutorial-kicker');
  private readonly title = $('tutorial-title');
  private readonly body = $('tutorial-body');
  private readonly skip = $('tutorial-skip');
  private readonly next = $('tutorial-next');

  private active = false;
  private run: TutorialRun | null = null;
  private shownAt = 0;
  private satisfiedOnShow = false;
  private heroKind: HeroKind | null = null;
  private wave = 0;
  private rendered = '';

  constructor(private readonly input: () => 'touch' | 'desktop') {
    this.skip.addEventListener('click', () => this.onSkip());
    this.next.addEventListener('click', () => this.forward());
    // The card itself is click-through (style.css). Button presses stop here so they do not reach the map.
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  /** Starts (or restarts) the lesson at Move. */
  begin(): void {
    this.active = true;
    this.run = freshTutorial();
    this.heroKind = null;
    this.wave = 0;
    this.markShown(performance.now());
    this.render();
  }

  stop(): void {
    this.active = false;
    this.run = null;
    this.rendered = '';
    this.root.classList.add('hidden');
  }

  /** One snapshot while the lesson is up. */
  feed(sample: TutorialFeed, now: number): void {
    if (!this.active || !this.run) return;
    if (sample.phase === 'victory' || sample.phase === 'defeat') {
      this.root.classList.add('hidden');
      return;
    }
    this.heroKind = sample.hero?.kind ?? this.heroKind;
    this.wave = sample.wave;
    this.run = absorbTutorial(this.run, sample);
    if (this.run.step !== 'done') {
      const satisfied = stepSatisfied(this.run.step, this.run.facts);
      if (tutorialMayAdvance(satisfied, this.satisfiedOnShow, now - this.shownAt)) {
        this.run = advanceTutorial(this.run);
        if (this.run.step === 'done') this.onComplete();
        else this.markShown(now);
      }
    }
    this.render();
  }

  private forward(): void {
    if (!this.run) return;
    if (this.run.step === 'done') {
      this.onDismiss();
      return;
    }
    if (this.run.step !== 'emote') return;
    this.run = continueTutorial(this.run);
    this.onComplete();
    this.render();
  }

  private markShown(now: number): void {
    this.shownAt = now;
    const step = this.run?.step;
    this.satisfiedOnShow = !!this.run && step !== 'done' && step !== undefined && stepSatisfied(step, this.run.facts);
  }

  private render(): void {
    const run = this.run;
    if (!run) return;
    const prompt = tutorialPrompt(run.step, this.input(), this.heroKind, this.wave);
    const key = `${run.step}|${prompt.body}|${prompt.next}|${prompt.skip}`;
    this.root.classList.remove('hidden');
    if (key === this.rendered) return;
    this.rendered = key;
    this.kicker.textContent = prompt.kicker;
    this.title.textContent = prompt.title;
    this.body.textContent = prompt.body;
    this.skip.classList.toggle('hidden', !prompt.skip);
    this.next.classList.toggle('hidden', prompt.next === null);
    if (prompt.next) this.next.textContent = prompt.next;
  }
}
