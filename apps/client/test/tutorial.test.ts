import { describe, expect, it } from 'vitest';
import { TUNING, towerTier, tuningForMode } from '@tdt/sim';
import {
  absorbTutorial,
  advanceTutorial,
  continueTutorial,
  freshTutorial,
  heroMoved,
  lessonStatus,
  parseTutorialStatus,
  shouldStartLesson,
  stepSatisfied,
  tutorialMatch,
  tutorialMayAdvance,
  tutorialPrompt,
  TUTORIAL_HOLD_MS,
  TUTORIAL_MOVE_TILES,
  type TutorialRun,
  type TutorialSample,
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

describe('tutorial status', () => {
  it('runs once, for a new player, and only in solo', () => {
    expect(parseTutorialStatus(undefined)).toBe('new');
    expect(parseTutorialStatus('later')).toBe('new');
    expect(parseTutorialStatus('completed')).toBe('completed');
    expect(parseTutorialStatus('skipped')).toBe('skipped');
    expect(shouldStartLesson('new', true)).toBe(true);
    expect(shouldStartLesson('new', false)).toBe(false);
    expect(shouldStartLesson('completed', true)).toBe(false);
    expect(shouldStartLesson('skipped', true)).toBe(false);
    expect(tutorialMatch('new')).toEqual({ mode: 'quick', difficulty: 'normal' });
    expect(tutorialMatch('completed')).toBeNull();
    expect(tutorialMatch('skipped')).toBeNull();
    expect(lessonStatus('skip')).toBe('skipped');
    expect(lessonStatus('complete')).toBe('completed');
    expect(lessonStatus('replay')).toBe('new');
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
    expect(tutorialPrompt('ping', 'touch', 'ranger', 1).body).toContain('hold');
    expect(tutorialPrompt('ping', 'desktop', 'ranger', 1).body).toContain('Alt-click');
  });
});
