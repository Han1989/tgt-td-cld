import { describe, expect, it } from 'vitest';
import { matchFlagFace, surgeToastCopy } from '../src/hud/surgeFace';

describe('surge presentation', () => {
  it('names the lane and the wave from the surge event', () => {
    expect(surgeToastCopy({ wave: 9, lane: 0 })).toEqual({ lane: 0, title: 'West', sub: 'Surge · wave 9' });
    expect(surgeToastCopy({ wave: 6, lane: 1 }).title).toBe('Mid');
    expect(surgeToastCopy({ wave: 12, lane: 2 }).title).toBe('East');
  });

  it('shows the surge on now and the one announced ahead as separate chips', () => {
    const face = matchFlagFace({ surgeLane: 0, nextSurge: { wave: 15, lane: 2 } });
    expect(face.now).toEqual({ lane: 0, title: 'West', sub: 'Surge now' });
    expect(face.next).toEqual({ lane: 2, title: 'East', sub: 'Surge next' });
    expect(matchFlagFace({ surgeLane: null, nextSurge: null })).toEqual({ now: null, next: null });
  });
});
