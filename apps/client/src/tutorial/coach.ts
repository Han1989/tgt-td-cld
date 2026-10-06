// The lesson card. Steps and wording live in logic.ts; this only shows them and
// notices when the player has done the action.

import type { HeroKind } from '@tdt/protocol';
import {
  absorbTutorial,
  advanceTutorial,
  airPrompt,
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
  /** A card came up: the lesson's first step when it starts, then each next one, `done` at the end. */
  onStep: (step: TutorialRun['step']) => void = () => {};
  /** They dismissed the closing card. */
  onDismiss: () => void = () => {};
  /** They read the Wisps note (Got it, or they built a tower that hits air). */
  onAirSeen: () => void = () => {};

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
  /** The Wisps card is up. The early lesson owns the card while `active` is set. */
  private air: 'off' | 'up' = 'off';
  /** How many anti-air towers they had when the Wisps card opened. Building one more finishes it. */
  private airTowersOnShow = 0;

  constructor(private readonly input: () => 'touch' | 'desktop') {
    this.skip.addEventListener('click', () => this.onSkip());
    this.next.addEventListener('click', () => this.forward());
    // The card itself is click-through (style.css). Button presses stop here so they do not reach the map.
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  /** The lesson card or the Wisps card is on screen. Gold stays quiet while it is. */
  get cardUp(): boolean {
    return !this.root.classList.contains('hidden');
  }

  /** Starts (or restarts) the lesson at Move. The early steps take the card back from the Wisps note. */
  begin(): void {
    this.air = 'off';
    this.root.classList.remove('air');
    this.active = true;
    this.run = freshTutorial();
    this.heroKind = null;
    this.wave = 0;
    this.markShown(performance.now());
    this.onStep(this.run.step);
    this.render();
  }

  stop(): void {
    this.active = false;
    this.run = null;
    this.air = 'off';
    this.rendered = '';
    this.root.classList.remove('air');
    this.root.classList.add('hidden');
  }

  /**
   * The Wisps card, once per browser, the first time flyers are on the map.
   * It waits while the early lesson still has the card, then stays up until
   * Got it or a new anti-air tower. A new match takes it down without counting
   * as seen (`dismissAir`).
   */
  offerAir(opts: { due: boolean; flyers: boolean; wave: number; airTowers: number; hero: HeroKind | null }): void {
    if (this.active) return;
    if (!opts.due) {
      if (this.air === 'up') this.hideAir();
      return;
    }
    if (this.air === 'up') {
      if (opts.airTowers > this.airTowersOnShow) {
        this.finishAir();
        return;
      }
      this.renderAir(opts.hero);
      return;
    }
    // Wave 0 is the opening build. A snapshot that already has Wisps there is the stress scene.
    if (!opts.flyers || opts.wave < 1) return;
    this.air = 'up';
    this.airTowersOnShow = opts.airTowers;
    this.rendered = '';
    this.renderAir(opts.hero);
  }

  /** A new match: take the card down without marking the note seen. */
  dismissAir(): void {
    if (this.air !== 'up' || this.active) return;
    this.hideAir();
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
        this.onStep(this.run.step);
        if (this.run.step === 'done') this.onComplete();
        else this.markShown(now);
      }
    }
    this.render();
  }

  private forward(): void {
    if (this.air === 'up') {
      this.finishAir();
      return;
    }
    if (!this.run) return;
    if (this.run.step === 'done') {
      this.onDismiss();
      return;
    }
    if (this.run.step !== 'emote') return;
    this.run = continueTutorial(this.run);
    this.onStep(this.run.step);
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
    this.root.classList.remove('hidden', 'air');
    if (key === this.rendered) return;
    this.rendered = key;
    this.kicker.textContent = prompt.kicker;
    this.title.textContent = prompt.title;
    this.body.textContent = prompt.body;
    this.skip.classList.toggle('hidden', !prompt.skip);
    this.next.classList.toggle('hidden', prompt.next === null);
    if (prompt.next) this.next.textContent = prompt.next;
  }

  private renderAir(hero: HeroKind | null): void {
    const prompt = airPrompt(hero);
    const key = `air|${prompt.body}`;
    this.root.classList.remove('hidden');
    this.root.classList.add('air');
    if (key === this.rendered) return;
    this.rendered = key;
    this.kicker.textContent = prompt.kicker;
    this.title.textContent = prompt.title;
    this.body.textContent = prompt.body;
    this.skip.classList.add('hidden');
    this.next.classList.remove('hidden');
    this.next.textContent = prompt.next ?? 'Got it';
  }

  private hideAir(): void {
    this.air = 'off';
    this.rendered = '';
    this.root.classList.remove('air');
    this.root.classList.add('hidden');
  }

  private finishAir(): void {
    this.hideAir();
    this.onAirSeen();
  }
}
