import { describe, expect, it } from 'vitest';
import { effectiveQuality, FpsMonitor, resolutionFor, WINDOW_MS } from '../src/render/quality';
import { DEFAULT_SETTINGS, parseSettings } from '../src/settings';

describe('settings', () => {
  it('keeps known values and falls back to the defaults', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{bad json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ thumbs: 'twoLeft', quality: 'low' }))).toEqual({ ...DEFAULT_SETTINGS, thumbs: 'twoLeft', quality: 'low' });
    expect(parseSettings(JSON.stringify({ thumbs: 'float', thumbsPicked: 'yes' }))).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ stickAnchor: 'left', stickFeel: 'light' }))).toMatchObject({ stickAnchor: 'left', stickFeel: 'light' });
    expect(parseSettings(JSON.stringify({ stickAnchor: 'loose', stickFeel: 'tiny' }))).toMatchObject({ stickAnchor: 'center', stickFeel: 'normal' });
    expect(parseSettings(JSON.stringify({ thumbs: 'three', quality: 7 }))).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ display: 'bright' })).display).toBe('bright');
    expect(parseSettings(JSON.stringify({ display: 'neon' })).display).toBe('normal');
  });

  it('defaults to the floating stick, and keeps a layout the player picked before it existed', () => {
    expect(DEFAULT_SETTINGS.thumbs).toBe('float');
    expect(parseSettings(JSON.stringify({ thumbs: 'floatLeft' })).thumbs).toBe('floatLeft');
    // Old saves wrote One thumb at Center for everyone: that was the default, not a choice.
    expect(parseSettings(JSON.stringify({ thumbs: 'one', stickAnchor: 'center', quality: 'low' }))).toMatchObject({ thumbs: 'float', quality: 'low' });
    // Any other old layout was picked, and stays.
    expect(parseSettings(JSON.stringify({ thumbs: 'two', stickAnchor: 'center' })).thumbs).toBe('two');
    expect(parseSettings(JSON.stringify({ thumbs: 'twoLeft' })).thumbs).toBe('twoLeft');
    expect(parseSettings(JSON.stringify({ thumbs: 'one', stickAnchor: 'right' }))).toMatchObject({ thumbs: 'one', stickAnchor: 'right' });
    // Picking One thumb at Center from now on is remembered.
    expect(parseSettings(JSON.stringify({ thumbs: 'one', stickAnchor: 'center', thumbsPicked: true }))).toMatchObject({ thumbs: 'one', thumbsPicked: true });
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
