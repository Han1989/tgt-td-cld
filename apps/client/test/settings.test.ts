import { describe, expect, it } from 'vitest';
import { effectiveQuality, FpsMonitor, resolutionFor, WINDOW_MS } from '../src/render/quality';
import { DEFAULT_SETTINGS, parseSettings } from '../src/settings';

describe('settings', () => {
  it('keeps known values and falls back to the defaults', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{bad json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ thumbs: 'twoLeft', quality: 'low' }))).toEqual({ thumbs: 'twoLeft', quality: 'low' });
    expect(parseSettings(JSON.stringify({ thumbs: 'three', quality: 7 }))).toEqual(DEFAULT_SETTINGS);
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
