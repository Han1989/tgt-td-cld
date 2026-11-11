import { describe, expect, it } from 'vitest';
import { callEarlyFace, canCallNow } from '../src/hud/callEarly';

// One press, one wave (protocol 26): the button reads the snapshot's `canCallEarly`.
describe('the Call early button', () => {
  const snap = (over: Partial<Parameters<typeof callEarlyFace>[0]> = {}) => ({
    phase: 'waves' as const,
    nextWaveIn: 400,
    canCallEarly: true,
    callEarlyBonus: 12,
    ...over,
  });

  it('is on with its bonus once the wave has arrived, and before wave 1', () => {
    expect(callEarlyFace(snap(), false)).toEqual({ disabled: false, canCall: true, html: 'Call early <span class="bonus">+12</span>' });
    expect(callEarlyFace(snap({ phase: 'build' }), true)).toEqual({
      disabled: false,
      canCall: true,
      html: '<span class="call">Call</span> <span class="bonus">+12</span>',
    });
  });

  it('is off and reads "Wave arriving" while the wave comes out of the portals', () => {
    expect(callEarlyFace(snap({ canCallEarly: false }), false)).toEqual({ disabled: true, canCall: false, html: 'Wave arriving' });
    expect(callEarlyFace(snap({ canCallEarly: false }), true).html).toBe('<span class="call">Arriving</span>');
  });

  it('is off after the last wave and once the match is over', () => {
    expect(callEarlyFace(snap({ nextWaveIn: -1, canCallEarly: false }), false)).toEqual({ disabled: true, canCall: false, html: 'Call early' });
    expect(callEarlyFace(snap({ phase: 'defeat' }), false).disabled).toBe(true);
    expect(canCallNow({ phase: 'victory', canCallEarly: true })).toBe(false);
    expect(canCallNow({ phase: 'waves', canCallEarly: false })).toBe(false);
    expect(canCallNow({ phase: 'waves', canCallEarly: true })).toBe(true);
  });
});
