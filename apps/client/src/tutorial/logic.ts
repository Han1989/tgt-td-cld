// First-match lesson (T-03). Pure: what step is showing, when it advances, and the
// words on the card. The card itself is coach.ts. Nothing here touches the sim
// or the protocol — it only reads facts the client already has.

import type { HeroKind } from '@tdt/protocol';
import { TUNING, towerTier, tuningForMode } from '@tdt/sim';
import { HERO_INFO } from '../heroInfo';

/** `new` runs the lesson on the next solo match. The other two do not. */
export type TutorialStatus = 'new' | 'completed' | 'skipped';

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

/** The auto lesson is solo only. An online room never starts it. */
export function shouldStartLesson(status: TutorialStatus, solo: boolean): boolean {
  return solo && status === 'new';
}

/** Quick + Normal for that one match. Anything else keeps the player's pick. */
export function tutorialMatch(status: TutorialStatus): { mode: 'quick'; difficulty: 'normal' } | null {
  return status === 'new' ? { mode: 'quick', difficulty: 'normal' } : null;
}

export function lessonStatus(action: 'skip' | 'complete' | 'replay'): TutorialStatus {
  if (action === 'skip') return 'skipped';
  if (action === 'complete') return 'completed';
  return 'new';
}

/**
 * What the online home screen shows for the lesson.
 * A new player gets the Start lesson / Skip card. Replay is not on that screen:
 * finishing or skipping hides it, and it is not a second control next to the card.
 * ⚙ → Replay tutorial is the way back.
 */
export function homeLessonControls(status: TutorialStatus): { offer: boolean; replay: boolean } {
  switch (status) {
    case 'new':
      return { offer: true, replay: false };
    case 'completed':
    case 'skipped':
      return { offer: false, replay: false };
  }
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
): TutorialPrompt {
  if (step === 'done') {
    return {
      kicker: 'Lesson',
      title: "You're ready",
      body: 'You can move, build, cast, upgrade and ping. This Quick match keeps going. Replay the lesson any time from Settings.',
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
            ? 'Drag the joystick. A short push already walks at full speed, and your hero keeps shooting.'
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
            ? `Tap a pad beside a lane and build an Arrow tower (${ARROW_COST} gold). You'll upgrade it next.`
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
            ? `Tap the gold ↑ on your tower (${ARROW_UPGRADE} gold). One tap upgrades it. The first wave pays ${WAVE_ONE_GOLD}, which covers an Arrow.`
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
            ? 'Press and hold on open ground, not on the joystick, until the ring fills. A marker appears.'
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
