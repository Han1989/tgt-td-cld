// First-match lesson (T-03). Pure: what step is showing, when it advances, and the
// words on the card. The card itself is coach.ts. Nothing here touches the sim
// or the protocol — it only reads facts the client already has.

import type { GameMode, HeroKind } from '@tdt/protocol';
import { TUNING, towerTier, tuningForMode } from '@tdt/sim';
import { HERO_INFO } from '../heroInfo';

/**
 * The lesson is the player's choice (Han, 13 Oct 2026): it runs only from Learn to play.
 * `new`: no solo match started yet, so the home card offers "New here? Learn to play".
 * `skipped`: a solo match was started (or the coach card's Skip was tapped) without finishing the lesson.
 * `completed`: the lesson reached its closing card. Neither of the last two shows the line again.
 */
export type TutorialStatus = 'new' | 'completed' | 'skipped';

/** `new` shows the Wisps card the next time flyers are on the map. `seen` does not. */
export type AirLesson = 'new' | 'seen';

export function parseAirLesson(value: unknown): AirLesson {
  return value === 'seen' ? 'seen' : 'new';
}

/** `new` says once that towers can be repaired, the first time one of yours drops under half HP. `seen` does not. */
export type RepairHint = 'new' | 'seen';

export function parseRepairHint(value: unknown): RepairHint {
  return value === 'seen' ? 'seen' : 'new';
}

export const TUTORIAL_STEPS = ['move', 'build', 'cast', 'upgrade', 'ping', 'emote'] as const;
export type TutorialStepId = (typeof TUTORIAL_STEPS)[number];

/** The hero has to walk this far (tiles) before Move counts. A twitch does not. */
export const TUTORIAL_MOVE_TILES = 1.25;

/**
 * A step that was already done when it opened stays up this long, so the line can be read,
 * then advances. Doing it while the step is up advances at once.
 */
export const TUTORIAL_HOLD_MS = 900;

export interface TutorialFacts {
  moved: boolean;
  built: boolean;
  castQ: boolean;
  upgraded: boolean;
  pinged: boolean;
  emoted: boolean;
}

export interface TutorialRun {
  step: TutorialStepId | 'done';
  /** Where your hero stood when the lesson started. Move is measured from here. */
  origin: { x: number; y: number } | null;
  facts: TutorialFacts;
}

export interface TutorialEvent {
  type: string;
  slot?: string;
  heroId?: number;
  /** Player id, or null when the event has a source that is nobody (a kill with no owner). */
  by?: string | null;
}

export interface TutorialSample {
  me: string;
  hero: { id: number; kind: HeroKind; x: number; y: number } | null;
  towers: readonly { owner: string; tier: number }[];
  events: readonly TutorialEvent[];
}

const QUICK = tuningForMode(TUNING, 'quick');
const ARROW_COST = towerTier(TUNING, 'arrow', 1).cost;
const ARROW_UPGRADE = towerTier(TUNING, 'arrow', 2).cost;
/** Wave 1 pay in Quick. Together with starting gold it covers one Arrow and its upgrade. */
const WAVE_ONE_GOLD = QUICK.economy.waveIncomeBase;

export function freshFacts(): TutorialFacts {
  return { moved: false, built: false, castQ: false, upgraded: false, pinged: false, emoted: false };
}

export function freshTutorial(): TutorialRun {
  return { step: 'move', origin: null, facts: freshFacts() };
}

export function parseTutorialStatus(value: unknown): TutorialStatus {
  return value === 'completed' || value === 'skipped' || value === 'new' ? value : 'new';
}

/**
 * How a solo match is started: Play solo (the home card's main button, or "Play again"), or Learn to play (the line
 * under the main button, or ⚙ → Lesson). Online rooms never start the lesson.
 */
export type SoloStart = 'play' | 'lesson';

/** What the player has picked on the home card: the hero and the mode. Every match a player starts is Normal. */
export interface SoloPick {
  hero: HeroKind;
  mode: GameMode;
}

export interface SoloMatch extends SoloPick {
  /** The coach card runs on this match. */
  lesson: boolean;
}

/**
 * The match a solo start runs. Play solo is always the player's own pick, whatever is stored: never the lesson.
 * Learn to play is always the lesson as it has always run: Quick (Normal, like every match), the picked hero.
 */
export function soloMatch(start: SoloStart, pick: SoloPick): SoloMatch {
  if (start === 'lesson') return { hero: pick.hero, mode: 'quick', lesson: true };
  return { hero: pick.hero, mode: pick.mode, lesson: false };
}

/** Starting any solo match (the lesson too) ends `new`, so the line does not come back. The rest is kept. */
export function statusAfterStart(status: TutorialStatus): TutorialStatus {
  return status === 'new' ? 'skipped' : status;
}

/** The coach card's Skip, and its closing card. */
export function lessonStatus(action: 'skip' | 'complete'): TutorialStatus {
  return action === 'skip' ? 'skipped' : 'completed';
}

/** The settings a solo start reads and writes (`SettingsStore`). */
export interface LessonStore {
  get(): { tutorial: TutorialStatus };
  set(patch: { tutorial?: TutorialStatus; airLesson?: AirLesson; repairHint?: RepairHint }): void;
}

/**
 * A solo match starts (Play solo, or Learn to play from the home card or ⚙ → Lesson): stores what
 * the start changes and returns the match to run.
 */
export function beginSolo(store: LessonStore, start: SoloStart, pick: SoloPick): SoloMatch {
  const status = store.get().tutorial;
  store.set(start === 'lesson' ? learnToPlayPatch(status) : { tutorial: statusAfterStart(status) });
  return soloMatch(start, pick);
}

/** "New here? Learn to play" shows under the main button only before the first solo match. */
export function lessonOffer(status: TutorialStatus): boolean {
  return status === 'new';
}

/**
 * What Learn to play stores as the lesson starts, wherever it is tapped: the status after a solo start, and the
 * Wisps note and the repair line armed again for this lesson.
 */
export function learnToPlayPatch(status: TutorialStatus): {
  tutorial: TutorialStatus;
  airLesson: AirLesson;
  repairHint: RepairHint;
} {
  return { tutorial: statusAfterStart(status), airLesson: 'new', repairHint: 'new' };
}

export function heroMoved(origin: { x: number; y: number }, hero: { x: number; y: number }): boolean {
  const dx = hero.x - origin.x;
  const dy = hero.y - origin.y;
  return dx * dx + dy * dy >= TUTORIAL_MOVE_TILES * TUTORIAL_MOVE_TILES;
}

/** Folds one snapshot into the latched facts. Facts only ever turn on. */
export function absorbTutorial(run: TutorialRun, sample: TutorialSample): TutorialRun {
  const facts = { ...run.facts };
  let origin = run.origin;
  const hero = sample.hero;
  if (hero) {
    if (!origin) origin = { x: hero.x, y: hero.y };
    else if (heroMoved(origin, hero)) facts.moved = true;
  }
  for (const tower of sample.towers) {
    if (tower.owner !== sample.me) continue;
    facts.built = true;
    if (tower.tier >= 2) facts.upgraded = true;
  }
  for (const event of sample.events) {
    if (event.type === 'cast' && event.slot === 'Q' && hero && event.heroId === hero.id) facts.castQ = true;
    if (event.type === 'ping' && event.by === sample.me) facts.pinged = true;
    if (event.type === 'emote' && event.by === sample.me) facts.emoted = true;
  }
  return { ...run, origin, facts };
}

export function stepSatisfied(step: TutorialStepId, facts: TutorialFacts): boolean {
  switch (step) {
    case 'move':
      return facts.moved;
    case 'build':
      return facts.built;
    case 'cast':
      return facts.castQ;
    case 'upgrade':
      return facts.upgraded;
    case 'ping':
      return facts.pinged;
    case 'emote':
      return facts.emoted;
  }
}

export function advanceTutorial(run: TutorialRun): TutorialRun {
  if (run.step === 'done') return run;
  const next = TUTORIAL_STEPS[TUTORIAL_STEPS.indexOf(run.step) + 1];
  return { ...run, step: next ?? 'done' };
}

/** The quick-chat step is optional: Continue leaves it without an emote. */
export function continueTutorial(run: TutorialRun): TutorialRun {
  if (run.step !== 'emote') return run;
  return { ...run, step: 'done' };
}

export function tutorialMayAdvance(satisfied: boolean, satisfiedWhenShown: boolean, shownMs: number, holdMs = TUTORIAL_HOLD_MS): boolean {
  if (!satisfied) return false;
  if (!satisfiedWhenShown) return true;
  return shownMs >= holdMs;
}

export interface TutorialPrompt {
  kicker: string;
  title: string;
  body: string;
  /** Label of the forward button, or null when only Skip (and doing the action) moves on. */
  next: string | null;
  skip: boolean;
}

export function tutorialPrompt(
  step: TutorialStepId | 'done',
  input: 'touch' | 'desktop',
  hero: HeroKind | null,
  wave: number,
  /** Touch with the floating stick (the default layout): drag anywhere to walk. False: a fixed joystick. */
  floating = true,
): TutorialPrompt {
  if (step === 'done') {
    return {
      kicker: 'Lesson',
      title: "You're ready",
      body: 'You can move, build, cast, upgrade and ping. This Quick match keeps going. The first time Wisps appear, one note explains them. Settings → Learn to play runs the lesson again.',
      next: 'Got it',
      skip: false,
    };
  }
  const n = TUTORIAL_STEPS.length;
  const index = TUTORIAL_STEPS.indexOf(step) + 1;
  const kicker = `Step ${index} of ${n}`;
  switch (step) {
    case 'move':
      return {
        kicker,
        title: 'Move',
        body:
          input === 'touch'
            ? floating
              ? 'Drag your thumb anywhere on the map: a joystick appears under it and your hero walks. Let go to stop. Your hero keeps shooting.'
              : 'Drag the joystick. A short push already walks at full speed, and your hero keeps shooting.'
            : 'Right-click the ground, or hold the arrow keys. Your hero walks and keeps shooting.',
        next: null,
        skip: true,
      };
    case 'build':
      return {
        kicker,
        title: 'Build a tower',
        body:
          input === 'touch'
            ? `Tap a pad beside a lane, then tap Arrow (${ARROW_COST} gold) to build it. Hold a tower button to see its range first. You'll upgrade it next.`
            : `Left-click a pad and choose Arrow (${ARROW_COST} gold). With the pad open, 1 builds it too.`,
        next: null,
        skip: true,
      };
    case 'cast': {
      const name = hero ? HERO_INFO[hero].skills.Q.name : 'your skill';
      const aim =
        hero === 'arcanist'
          ? input === 'touch'
            ? `Tap Q (${name}), then tap where it should land. You can drag the button to aim.`
            : `Press Q (${name}), then left-click where it should land.`
          : input === 'touch'
            ? `When a creep is close, tap Q (${name}). Hold a skill button to read what it does. If it says nothing in range, walk nearer and tap again.`
            : `When a creep is close, press Q (${name}). If nothing is in range, walk nearer and press it again.`;
      const wait = hero !== 'arcanist' && wave < 1 ? ' Creeps arrive when the first wave starts.' : '';
      return { kicker, title: 'Cast a skill', body: aim + wait, next: null, skip: true };
    }
    case 'upgrade':
      return {
        kicker,
        title: 'Upgrade',
        body:
          input === 'touch'
            ? `Tap your tower, then tap Upgrade (${ARROW_UPGRADE} gold). The ring stays open, so the next tier is one more tap. The first wave pays ${WAVE_ONE_GOLD}.`
            : `Left-click your tower, then Upgrade (${ARROW_UPGRADE} gold), or press U. The first wave pays ${WAVE_ONE_GOLD}.`,
        next: null,
        skip: true,
      };
    case 'ping':
      return {
        kicker,
        title: 'Ping the map',
        body:
          input === 'touch'
            ? floating
              ? 'Press and hold a finger still on open ground until the ring fills, then lift it. A marker appears. Dragging walks instead.'
              : 'Press and hold on open ground, not on the joystick, until the ring fills, then lift. A marker appears.'
            : 'Alt-click the ground. A marker appears for your team.',
        next: null,
        skip: true,
      };
    case 'emote':
      return {
        kicker,
        title: 'Quick chat',
        body:
          input === 'touch'
            ? 'Optional. Tap the speech button and pick a phrase. There is nothing to type.'
            : 'Optional. Press C, or tap the speech button, and pick a phrase. There is nothing to type.',
        next: 'Continue',
        skip: true,
      };
  }
}

/**
 * The Wisps note. It is not one of `TUTORIAL_STEPS`: those finish in the opening,
 * and the first flyers are later (Quick wave 3, Full wave 5). The card shows once,
 * the first time flyers are on the map, including after the early lesson is done
 * or skipped, until the player taps Got it or builds a tower that hits air.
 */
export function airPrompt(hero: HeroKind | null): TutorialPrompt {
  const ranged = hero ? TUNING.hero[hero].ranged : true;
  return {
    kicker: 'Lesson',
    title: 'Wisps fly',
    body: ranged
      ? 'Cannon cannot hit Wisps. Arrow, Frost, Arcane and Flak can, and so can your shots. Each one wears a wing mark.'
      : 'Your swings cannot reach Wisps. Arrow, Frost, Arcane and Flak can. Each one wears a wing mark.',
    next: 'Got it',
    skip: false,
  };
}
