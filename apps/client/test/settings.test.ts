import { describe, expect, it } from 'vitest';
import { effectiveQuality, FpsMonitor, resolutionFor, WINDOW_MS } from '../src/render/quality';
import { DEFAULT_SETTINGS, parseSettings } from '../src/settings';

describe('settings', () => {
  it('keeps known values and falls back to the defaults', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{bad json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ stick: 'fixed', skills: 'left', quality: 'low' }))).toEqual({
      ...DEFAULT_SETTINGS,
      stick: 'fixed',
      skills: 'left',
      quality: 'low',
    });
    expect(parseSettings(JSON.stringify({ stick: 'loose', skills: 'left' }))).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ stick: 'fixed', skills: 'top' }))).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ thumbs: 'float', thumbsPicked: 'yes' }))).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ thumbs: 'constructor', thumbsPicked: true }))).toEqual({ ...DEFAULT_SETTINGS, thumbsPicked: true });
    expect(parseSettings(JSON.stringify({ stickAnchor: 'left', stickFeel: 'light' }))).toMatchObject({ stickAnchor: 'left', stickFeel: 'light' });
    expect(parseSettings(JSON.stringify({ stickAnchor: 'loose', stickFeel: 'tiny' }))).toMatchObject({ stickAnchor: 'center', stickFeel: 'normal' });
    expect(parseSettings(JSON.stringify({ thumbs: 'three', quality: 7 }))).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ display: 'bright' })).display).toBe('bright');
    expect(parseSettings(JSON.stringify({ display: 'neon' })).display).toBe('normal');
  });

  it('defaults to the floating stick with the skills around it', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ stick: 'float', skills: 'around', stickAnchor: 'center', thumbsPicked: false });
    expect(parseSettings(JSON.stringify({ stick: 'fixed', skills: 'around', stickAnchor: 'left', thumbsPicked: true }))).toMatchObject({
      stick: 'fixed',
      skills: 'around',
      stickAnchor: 'left',
    });
  });

  it('maps every layout saved before the two rows to the stick and skills it had', () => {
    const was = (save: object) => {
      const s = parseSettings(JSON.stringify(save));
      return { stick: s.stick, skills: s.skills, stickAnchor: s.stickAnchor };
    };
    // Unpicked old defaults move to the new default: One thumb at Center (before the floating stick)
    // and PR #92's floating stick with the skills on the right.
    expect(parseSettings(JSON.stringify({ thumbs: 'one', stickAnchor: 'center', quality: 'low' }))).toMatchObject({
      stick: 'float',
      skills: 'around',
      quality: 'low',
    });
    expect(was({ thumbs: 'float', thumbsPicked: false })).toEqual({ stick: 'float', skills: 'around', stickAnchor: 'center' });
    // Every picked layout keeps its stick and skills (older saves without the flag picked any other layout).
    expect(was({ thumbs: 'float', thumbsPicked: true })).toEqual({ stick: 'float', skills: 'right', stickAnchor: 'center' });
    expect(was({ thumbs: 'floatLeft', thumbsPicked: true })).toEqual({ stick: 'float', skills: 'left', stickAnchor: 'center' });
    expect(was({ thumbs: 'floatLeft' })).toEqual({ stick: 'float', skills: 'left', stickAnchor: 'center' });
    expect(was({ thumbs: 'one', stickAnchor: 'center', thumbsPicked: true })).toEqual({ stick: 'fixed', skills: 'around', stickAnchor: 'center' });
    expect(was({ thumbs: 'one', stickAnchor: 'right' })).toEqual({ stick: 'fixed', skills: 'around', stickAnchor: 'right' });
    expect(was({ thumbs: 'two', stickAnchor: 'center' })).toEqual({ stick: 'fixed', skills: 'right', stickAnchor: 'center' });
    expect(was({ thumbs: 'twoLeft' })).toEqual({ stick: 'fixed', skills: 'left', stickAnchor: 'center' });
    // A save with the two rows wins over an old value left in it.
    expect(was({ thumbs: 'two', stick: 'float', skills: 'around', thumbsPicked: true })).toEqual({ stick: 'float', skills: 'around', stickAnchor: 'center' });
    // Saved again, the new rows carry the choice and no old value.
    expect(Object.keys(parseSettings(JSON.stringify({ thumbs: 'two' })))).not.toContain('thumbs');
  });

  it('keeps the sound settings: effects 80% and music 50% by default, volumes in 5% steps', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ sfx: 0.8, music: 0.5, muted: false });
    expect(parseSettings(JSON.stringify({ music: 0.33, sfx: 0, muted: true }))).toMatchObject({ music: 0.35, sfx: 0, muted: true });
    expect(parseSettings(JSON.stringify({ music: 2, sfx: -1, muted: 'yes' }))).toMatchObject({ music: 0.5, sfx: 0.8, muted: false });
    expect(parseSettings(JSON.stringify({ music: 'loud', sfx: null }))).toMatchObject({ music: 0.5, sfx: 0.8 });
  });

  it('remembers the lesson: new until it is finished or skipped', () => {
    expect(DEFAULT_SETTINGS.tutorial).toBe('new');
    expect(parseSettings(null).tutorial).toBe('new');
    expect(parseSettings(JSON.stringify({ tutorial: 'completed' })).tutorial).toBe('completed');
    expect(parseSettings(JSON.stringify({ tutorial: 'skipped' })).tutorial).toBe('skipped');
    expect(parseSettings(JSON.stringify({ tutorial: 'later' })).tutorial).toBe('new');
    expect(DEFAULT_SETTINGS.airLesson).toBe('new');
    expect(parseSettings(null).airLesson).toBe('new');
    expect(parseSettings(JSON.stringify({ airLesson: 'seen' })).airLesson).toBe('seen');
    expect(parseSettings(JSON.stringify({ airLesson: 'later' })).airLesson).toBe('new');
    expect(DEFAULT_SETTINGS.repairHint).toBe('new');
    expect(parseSettings(JSON.stringify({ repairHint: 'seen' })).repairHint).toBe('seen');
    expect(parseSettings(JSON.stringify({ repairHint: 1 })).repairHint).toBe('new');
  });
});

describe('render quality', () => {
  it('caps the pixel ratio at 2 and renders Low at 1×', () => {
    expect(resolutionFor('high', 3)).toBe(2);
    expect(resolutionFor('high', 1.5)).toBe(1.5);
    expect(resolutionFor('high', 0)).toBe(1);
    expect(resolutionFor('low', 3)).toBe(1);
  });

  it('Auto drops to Low only after a full slow window past the warm-up', () => {
    const m = new FpsMonitor();
    const run = (fps: number, ms: number) => {
      let hit = false;
      for (let t = 0; t < ms; t += 1000 / fps) hit = m.sample(1000 / fps) || hit;
      return hit;
    };
    expect(run(20, WINDOW_MS)).toBe(false); // warm-up window
    expect(run(60, WINDOW_MS)).toBe(false);
    expect(m.fps).toBeGreaterThan(55);
    expect(run(20, WINDOW_MS + 100)).toBe(true);
    // A long pause is not a slow frame.
    expect(m.sample(5000)).toBe(false);
  });

  it('maps the setting to what is rendered', () => {
    expect(effectiveQuality('auto', false)).toBe('high');
    expect(effectiveQuality('auto', true)).toBe('low');
    expect(effectiveQuality('high', true)).toBe('high');
    expect(effectiveQuality('low', false)).toBe('low');
  });
});
