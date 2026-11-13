// First-match lesson (T-03). Pure: what step is showing, when it advances, and the
// words on the card. The card itself is coach.ts. Nothing here touches the sim
// or the protocol — it only reads facts the client already has.

import type { GameMode, HeroKind } from '@tdt/protocol';
import { TUNING, towerTier } from '@tdt/sim';
import { HERO_INFO } from '../heroInfo';
import type { LessonGlyph } from '../render/art/icons';

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

const ARROW_COST = towerTier(TUNING, 'arrow', 1).cost;
const ARROW_UPGRADE = towerTier(TUNING, 'arrow', 2).cost;

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

/**
 * One piece of a lesson card's picture (q8): a keycap (CSS `<kbd>`), a glyph drawn in `render/art/icons.ts` (the
 * mouse with its button lit, or a touch gesture), or the small words between them.
 */
export type LessonPart = { key: string } | { glyph: LessonGlyph } | { word: 'or' | '+' };

/** What a card shows above its line: what to press. `cancel`: the card starts a mode, so a small X keycap says "cancel". */
export interface LessonPicture {
  parts: readonly LessonPart[];
  cancel: boolean;
}

export interface TutorialPrompt {
  kicker: string;
  title: string;
  /** One short line: what to do. The picture says which key or gesture. */
  body: string;
  /** What to press, or null on a card with nothing to press (the closing card). */
  picture: LessonPicture | null;
  /** Label of the forward button, or null when only Skip (and doing the action) moves on. */
  next: string | null;
  skip: boolean;
}

/** The longest line a step's card says (one sentence that fits the card in two lines on a 360 px phone). */
export const LESSON_LINE_MAX = 64;

/** The hero's Q is aimed at a point (only the Arcanist's Fireball today). */
function aimedQ(hero: HeroKind | null): boolean {
  return hero === 'arcanist';
}

/** What a step's card shows above its line, for a mouse and keyboard or for touch. Pure data. */
export function lessonPicture(step: TutorialStepId, input: 'touch' | 'desktop', hero: HeroKind | null): LessonPicture {
  const aimed = aimedQ(hero);
  if (input === 'touch') {
    switch (step) {
      case 'move':
        return { parts: [{ glyph: 'gestureStick' }], cancel: false };
      case 'build':
        return { parts: [{ glyph: 'gesturePad' }], cancel: false };
      case 'cast':
        return { parts: aimed ? [{ glyph: 'gestureTap' }, { word: 'or' }, { glyph: 'gestureAim' }] : [{ glyph: 'gestureTap' }], cancel: false };
      case 'upgrade':
        return { parts: [{ glyph: 'gestureTower' }], cancel: false };
      case 'ping':
        return { parts: [{ glyph: 'gestureHold' }], cancel: false };
      case 'emote':
        return { parts: [{ glyph: 'gestureChat' }], cancel: false };
    }
  }
  switch (step) {
    case 'move':
      return { parts: [{ glyph: 'mouseRight' }], cancel: false };
    case 'build':
      return { parts: [{ glyph: 'mouseLeft' }, { word: 'or' }, { key: 'B' }, { key: '1–5' }], cancel: true };
    case 'cast':
      return { parts: aimed ? [{ key: 'Q' }, { word: '+' }, { glyph: 'mouseLeft' }] : [{ key: 'Q' }], cancel: aimed };
    case 'upgrade':
      return { parts: [{ glyph: 'mouseLeft' }, { word: 'or' }, { key: 'U' }], cancel: false };
    case 'ping':
      return { parts: [{ key: 'Alt' }, { word: '+' }, { glyph: 'mouseLeft' }], cancel: false };
    case 'emote':
      return { parts: [{ key: 'C' }], cancel: false };
  }
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
      picture: null,
      next: 'Got it',
      skip: false,
    };
  }
  const n = TUTORIAL_STEPS.length;
  const index = TUTORIAL_STEPS.indexOf(step) + 1;
  const kicker = `Step ${index} of ${n}`;
  const touch = input === 'touch';
  const card = (title: string, body: string, next: string | null = null): TutorialPrompt => ({
    kicker,
    title,
    body,
    picture: lessonPicture(step, input, hero),
    next,
    skip: true,
  });
  switch (step) {
    case 'move':
      return card(
        'Move',
        touch
          ? floating
            ? 'Drag anywhere: a joystick appears and your hero walks.'
            : 'Drag the joystick to walk. Your hero keeps shooting.'
          : 'Click the ground to walk. Your hero keeps shooting.',
      );
    case 'build':
      return card('Build a tower', `Build an Arrow (${ARROW_COST} gold) on a pad beside a lane.`);
    case 'cast': {
      const name = hero ? HERO_INFO[hero].skills.Q.name : 'your skill';
      if (aimedQ(hero)) return card('Cast a skill', `Cast ${name} where it should land.`);
      return card('Cast a skill', wave < 1 ? `Cast ${name} near a creep, once the first wave starts.` : `Cast ${name} when a creep is close.`);
    }
    case 'upgrade':
      return card('Upgrade', `Open your tower and Upgrade it (${ARROW_UPGRADE} gold).`);
    case 'ping':
      return card(
        'Ping the map',
        touch && !floating ? 'Hold open ground, not the joystick, then lift.' : touch ? 'Hold still until the ring fills, then lift.' : 'Mark a spot on the map for your team.',
      );
    case 'emote':
      return card('Quick chat', 'Optional: pick a phrase, nothing to type.', 'Continue');
  }
}

/**
 * The Wisps note. It is not one of `TUTORIAL_STEPS`: those finish in the opening,
 * and the first flyers are later (Quick wave 4, Full wave 6). The card shows once,
 * the first time flyers are on the map, including after the early lesson is done
 * or skipped, until the player taps Got it or builds a tower that hits air.
 */
export function airPrompt(hero: HeroKind | null): TutorialPrompt {
  const ranged = hero ? TUNING.hero[hero].ranged : true;
  return {
    kicker: 'Lesson',
    title: 'Wisps fly',
    picture: null,
    body: ranged
      ? 'Cannon cannot hit Wisps. Arrow, Frost, Arcane and Flak can, and so can your shots. Each one wears a wing mark.'
      : 'Your swings cannot reach Wisps. Arrow, Frost, Arcane and Flak can. Each one wears a wing mark.',
    next: 'Got it',
    skip: false,
  };
}
