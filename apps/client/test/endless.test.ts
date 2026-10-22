// Endless on the client (docs/GAME_DESIGN.md "Endless"): the best wave per hero in this browser (`tdt.endlessBest`), the
// Mode row's line and the end screen's words.

import { describe, expect, it } from 'vitest';
import { isBossWave } from '../src/audio/gameAudio';
import { bestLine, endlessEndCopy, parseBests, withRun } from '../src/endless/best';
import { modeSub } from '../src/lobby/modePicker';
import { waveListsFlyers } from '../src/teach/cues';

describe('the best Endless wave', () => {
  it('reads back only whole waves of known heroes', () => {
    expect(parseBests(null)).toEqual({});
    expect(parseBests('nope')).toEqual({});
    expect(parseBests('[37]')).toEqual({});
    expect(parseBests(JSON.stringify({ ranger: 37, warden: 0, arcanist: 4.5, ninja: 50 }))).toEqual({ ranger: 37 });
  });

  it('is kept per hero: a run counts only when it goes further', () => {
    const first = withRun({}, 'ranger', 37);
    expect(first.run).toEqual({ wave: 37, best: 37, previous: null, isNew: true });
    expect(first.bests).toEqual({ ranger: 37 });
    const worse = withRun(first.bests, 'ranger', 33);
    expect(worse.run).toEqual({ wave: 33, best: 37, previous: 37, isNew: false });
    expect(worse.bests).toBe(first.bests);
    const tie = withRun(first.bests, 'ranger', 37);
    expect(tie.run.isNew).toBe(false);
    const better = withRun(first.bests, 'ranger', 41);
    expect(better.run).toEqual({ wave: 41, best: 41, previous: 37, isNew: true });
    // Another hero has its own best.
    expect(withRun(better.bests, 'warden', 12).bests).toEqual({ ranger: 41, warden: 12 });
    // A run that never reached wave 1 does not count.
    expect(withRun({}, 'arcanist', 0)).toEqual({ bests: {}, run: { wave: 0, best: 0, previous: null, isNew: false } });
  });

  it('reads "Best: wave 37" on the Mode row, whose Endless segment shows ∞', () => {
    expect(bestLine(37)).toBe('Best: wave 37');
    expect(modeSub('full')).toBe('30 waves');
    expect(modeSub('quick')).toBe('15 waves');
    expect(modeSub('endless')).toBe('∞');
  });

  it('titles the end screen with the wave the Heart fell on, then the best or "New best"', () => {
    expect(endlessEndCopy(withRun({}, 'ranger', 37).run)).toEqual({ title: 'Fallen on wave 37', line: 'New best!' });
    expect(endlessEndCopy(withRun({ ranger: 35 }, 'ranger', 37).run)).toEqual({
      title: 'Fallen on wave 37',
      line: 'New best! Your best was wave 35.',
    });
    expect(endlessEndCopy(withRun({ ranger: 41 }, 'ranger', 37).run)).toEqual({ title: 'Fallen on wave 37', line: 'Best: wave 41.' });
    expect(endlessEndCopy(withRun({}, 'ranger', 0).run)).toEqual({ title: 'Fallen on wave 0', line: '' });
  });
});

describe('waves past the list', () => {
  it('bring their bosses (the music, the banner, the portals) and their flyers (the Wisps lesson)', () => {
    expect([30, 31, 34, 35, 40, 45].map((w) => isBossWave('endless', w))).toEqual([true, false, false, true, true, true]);
    expect(isBossWave('full', 35)).toBe(false);
    // Wave 35 repeats wave 25, the air wave.
    expect(waveListsFlyers('endless', 35)).toBe(true);
    expect(waveListsFlyers('full', 35)).toBe(false);
  });
});
