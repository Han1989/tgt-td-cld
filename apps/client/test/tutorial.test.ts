import { describe, expect, it } from 'vitest';
import { TUNING, towerTier, tuningForMode } from '@tdt/sim';
import {
  absorbTutorial,
  advanceTutorial,
  beginSolo,
  continueTutorial,
  freshTutorial,
  heroMoved,
  learnToPlayPatch,
  lessonOffer,
  lessonStatus,
  parseTutorialStatus,
  soloMatch,
  statusAfterStart,
  stepSatisfied,
  tutorialMayAdvance,
  tutorialPrompt,
  TUTORIAL_HOLD_MS,
  TUTORIAL_MOVE_TILES,
  type SoloPick,
  type TutorialRun,
  type TutorialSample,
  type TutorialStatus,
} from '../src/tutorial/logic';

function sample(patch: Partial<TutorialSample> = {}): TutorialSample {
  return {
    me: 'local',
    hero: { id: 1, kind: 'ranger', x: 13, y: 33 },
    towers: [],
    events: [],
    ...patch,
  };
}

/** The first sample only records where the hero stood. */
function started(patch: Partial<TutorialSample> = {}): TutorialRun {
  return absorbTutorial(freshTutorial(), sample(patch));
}

const STATUSES: readonly TutorialStatus[] = ['new', 'completed', 'skipped'];

/** Every pick a player can make on the home card: a hero and a mode. */
const PICKS: readonly SoloPick[] = (['ranger', 'warden', 'arcanist'] as const).flatMap((hero) =>
  (['full', 'quick'] as const).map((mode) => ({ hero, mode })),
);

/** A settings store in memory, as `SettingsStore` keeps it. */
function store(tutorial: TutorialStatus) {
  let value = { tutorial, airLesson: 'seen', repairHint: 'seen' } as Record<string, string>;
  return {
    get: () => value as { tutorial: TutorialStatus; airLesson: string; repairHint: string },
    set: (patch: object) => void (value = { ...value, ...patch }),
  };
}

describe('tutorial status', () => {
  it('parses the stored status, new by default', () => {
    expect(parseTutorialStatus(undefined)).toBe('new');
    expect(parseTutorialStatus('later')).toBe('new');
    expect(parseTutorialStatus('completed')).toBe('completed');
    expect(parseTutorialStatus('skipped')).toBe('skipped');
    expect(lessonStatus('skip')).toBe('skipped');
    expect(lessonStatus('complete')).toBe('completed');
  });

  it('Play solo never starts the lesson, whatever is stored: the match is the pick', () => {
    for (const status of STATUSES) {
      for (const pick of PICKS) {
        expect(beginSolo(store(status), 'play', pick)).toEqual({ hero: pick.hero, mode: pick.mode, lesson: false });
      }
    }
  });

  it('Learn to play always starts the lesson: Quick, the picked hero', () => {
    for (const status of STATUSES) {
      for (const pick of PICKS) {
        expect(beginSolo(store(status), 'lesson', pick)).toEqual({ hero: pick.hero, mode: 'quick', lesson: true });
      }
    }
    // The pick is not changed by the lesson's match.
    const pick: SoloPick = { hero: 'warden', mode: 'full' };
    soloMatch('lesson', pick);
    expect(pick).toEqual({ hero: 'warden', mode: 'full' });
  });

  it('offers "Learn to play" only before the first solo match, and never brings it back on its own', () => {
    expect(lessonOffer('new')).toBe(true);
    expect(lessonOffer('completed')).toBe(false);
    expect(lessonOffer('skipped')).toBe(false);
    // Any first solo start ends the offer: Play solo or the lesson itself.
    for (const start of ['play', 'lesson'] as const) {
      const s = store('new');
      beginSolo(s, start, PICKS[0]!);
      expect(s.get().tutorial).toBe('skipped');
      expect(lessonOffer(s.get().tutorial)).toBe(false);
    }
    // Later starts keep what was stored: a finished lesson stays finished.
    expect(statusAfterStart('completed')).toBe('completed');
    expect(statusAfterStart('skipped')).toBe('skipped');
    const done = store('completed');
    beginSolo(done, 'play', PICKS[0]!);
    expect(done.get().tutorial).toBe('completed');
  });

  it('Learn to play arms the Wisps note and the repair line again; Play does not', () => {
    expect(learnToPlayPatch('completed')).toEqual({ tutorial: 'completed', airLesson: 'new', repairHint: 'new' });
    expect(learnToPlayPatch('new')).toEqual({ tutorial: 'skipped', airLesson: 'new', repairHint: 'new' });
    const lesson = store('skipped');
    beginSolo(lesson, 'lesson', PICKS[0]!);
    expect(lesson.get()).toMatchObject({ airLesson: 'new', repairHint: 'new' });
    const play = store('skipped');
    beginSolo(play, 'play', PICKS[0]!);
    expect(play.get()).toMatchObject({ airLesson: 'seen', repairHint: 'seen' });
  });

  it('Quick can pay for an Arrow and its upgrade inside the first wave; Full cannot', () => {
    const build = towerTier(TUNING, 'arrow', 1).cost;
    const upgrade = towerTier(TUNING, 'arrow', 2).cost;
    const quick = tuningForMode(TUNING, 'quick').economy;
    expect(quick.startingGold - build + quick.waveIncomeBase).toBeGreaterThanOrEqual(upgrade);
    expect(TUNING.economy.startingGold - build + TUNING.economy.waveIncomeBase).toBeLessThan(upgrade);
  });
});

describe('tutorial steps', () => {
  it('measures movement from where the hero stood when the lesson started', () => {
    const run = started();
    expect(run.origin).toEqual({ x: 13, y: 33 });
    expect(run.facts.moved).toBe(false);
    expect(heroMoved(run.origin!, { x: 13, y: 33 + TUTORIAL_MOVE_TILES - 0.05 })).toBe(false);
    const walked = absorbTutorial(run, sample({ hero: { id: 1, kind: 'ranger', x: 13, y: 33 - TUTORIAL_MOVE_TILES } }));
    expect(walked.facts.moved).toBe(true);
    expect(stepSatisfied('move', walked.facts)).toBe(true);
  });

  it('latches build, upgrade, your Q, your ping and your emote, and ignores everyone else', () => {
    let run = started();
    run = absorbTutorial(run, sample({ towers: [{ owner: 'p2', tier: 3 }] }));
    expect(run.facts.built).toBe(false);
    run = absorbTutorial(run, sample({ towers: [{ owner: 'local', tier: 1 }] }));
    expect(run.facts.built).toBe(true);
    expect(run.facts.upgraded).toBe(false);
    run = absorbTutorial(run, sample({
      towers: [{ owner: 'local', tier: 2 }],
      events: [
        { type: 'cast', slot: 'W', heroId: 1 },
        { type: 'cast', slot: 'Q', heroId: 9 },
        { type: 'ping', by: 'p2' },
        { type: 'emote', by: 'p2' },
      ],
    }));
    expect(run.facts.upgraded).toBe(true);
    expect(run.facts.castQ).toBe(false);
    expect(run.facts.pinged).toBe(false);
    run = absorbTutorial(run, sample({
      events: [
        { type: 'cast', slot: 'Q', heroId: 1 },
        { type: 'ping', by: 'local' },
        { type: 'emote', by: 'local' },
      ],
    }));
    expect(run.facts.castQ).toBe(true);
    expect(run.facts.pinged).toBe(true);
    expect(run.facts.emoted).toBe(true);
  });

  it('advances in order, and Continue skips only the optional emote', () => {
    let run = freshTutorial();
    expect(run.step).toBe('move');
    run = advanceTutorial({ ...run, facts: { ...run.facts, moved: true } });
    expect(run.step).toBe('build');
    expect(continueTutorial(run).step).toBe('build');
    run = { ...run, step: 'emote' };
    expect(continueTutorial(run).step).toBe('done');
    expect(advanceTutorial(run).step).toBe('done');
    expect(advanceTutorial({ ...run, step: 'done' }).step).toBe('done');
  });

  it('advances at once when the action happens on this step, and holds a step that was already done', () => {
    expect(tutorialMayAdvance(false, false, 10_000)).toBe(false);
    expect(tutorialMayAdvance(true, false, 0)).toBe(true);
    expect(tutorialMayAdvance(true, true, TUTORIAL_HOLD_MS - 1)).toBe(false);
    expect(tutorialMayAdvance(true, true, TUTORIAL_HOLD_MS)).toBe(true);
  });

  it('teaches the real controls, and tells a Ranger to wait for creeps', () => {
    expect(tutorialPrompt('move', 'touch', 'ranger', 0).body).toContain('joystick');
    expect(tutorialPrompt('move', 'desktop', 'ranger', 0).body).toContain('Right-click');
    expect(tutorialPrompt('move', 'desktop', 'ranger', 0).body).not.toContain('WASD');
    const waiting = tutorialPrompt('cast', 'touch', 'ranger', 0);
    expect(waiting.body).toContain('Multishot');
    expect(waiting.body).toContain('first wave');
    expect(tutorialPrompt('cast', 'desktop', 'arcanist', 0).body).toContain('Fireball');
    expect(tutorialPrompt('cast', 'desktop', 'arcanist', 0).body).not.toContain('first wave');
    expect(tutorialPrompt('cast', 'touch', 'ranger', 1).body).not.toContain('first wave');
    const emote = tutorialPrompt('emote', 'desktop', 'warden', 1);
    expect(emote.next).toBe('Continue');
    expect(emote.skip).toBe(true);
    expect(emote.body).toContain('nothing to type');
    const done = tutorialPrompt('done', 'touch', null, 2);
    expect(done.next).toBe('Got it');
    expect(done.skip).toBe(false);
    expect(done.body).toContain('Wisps');
    expect(tutorialPrompt('ping', 'touch', 'ranger', 1).body).toContain('hold');
    expect(tutorialPrompt('ping', 'desktop', 'ranger', 1).body).toContain('Alt-click');
  });

  it('teaches the floating stick by default, and the fixed joystick to players who picked one', () => {
    const floating = tutorialPrompt('move', 'touch', 'ranger', 0).body;
    expect(floating).toContain('anywhere');
    expect(floating).toContain('joystick appears under it');
    const fixed = tutorialPrompt('move', 'touch', 'ranger', 0, false).body;
    expect(fixed).toContain('Drag the joystick');
    expect(tutorialPrompt('ping', 'touch', 'ranger', 1).body).toContain('then lift');
    expect(tutorialPrompt('ping', 'touch', 'ranger', 1).body).toContain('Dragging walks');
    expect(tutorialPrompt('ping', 'touch', 'ranger', 1, false).body).toContain('not on the joystick');
    // Desktop does not change.
    expect(tutorialPrompt('move', 'desktop', 'ranger', 0, false).body).toBe(tutorialPrompt('move', 'desktop', 'ranger', 0).body);
  });
});
