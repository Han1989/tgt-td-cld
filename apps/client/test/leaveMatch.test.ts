import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { endRunQuestion, endRunShown, endRunWave, LEAVE_QUESTION, settingsLeaveShown } from '../src/hud/leaveMatch';

describe('Settings → Back to lobby', () => {
  it('shows during a solo match only', () => {
    expect(settingsLeaveShown({ attached: true, online: false })).toBe(true);
    expect(settingsLeaveShown({ attached: true, online: true })).toBe(false);
    expect(settingsLeaveShown({ attached: false, online: false })).toBe(false);
    expect(settingsLeaveShown({ attached: false, online: true })).toBe(false);
  });
  it('asks inside the sheet with the same words as the page', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toContain(LEAVE_QUESTION);
    expect(html).toMatch(/id="settings-leave-yes"[^>]*>Leave</);
    expect(html).toMatch(/id="settings-leave-no"[^>]*>Stay</);
    expect(html).toMatch(/id="end-change-hero"[^>]*>Back to lobby</);
  });
});

describe('Settings → End run (solo Endless, protocol 26)', () => {
  const snap = (over: Partial<Parameters<typeof endRunWave>[0] & { mode: 'full' | 'quick' | 'endless' }> = {}) => ({
    mode: 'endless' as const,
    phase: 'waves' as const,
    wave: 43,
    nextWaveIn: 300,
    canCallEarly: true,
    ...over,
  });
  it('shows in a solo Endless match only, while it is on', () => {
    expect(endRunShown({ attached: true, online: false, snap: snap() })).toBe(true);
    expect(endRunShown({ attached: true, online: false, snap: snap({ phase: 'build', wave: 0 }) })).toBe(true);
    expect(endRunShown({ attached: true, online: true, snap: snap() })).toBe(false);
    // Full, Quick and the Daily run (Quick on Hard).
    expect(endRunShown({ attached: true, online: false, snap: snap({ mode: 'full' }) })).toBe(false);
    expect(endRunShown({ attached: true, online: false, snap: snap({ mode: 'quick' }) })).toBe(false);
    expect(endRunShown({ attached: true, online: false, snap: snap({ phase: 'defeat' }) })).toBe(false);
    expect(endRunShown({ attached: true, online: false, snap: null })).toBe(false);
    expect(endRunShown({ attached: false, online: false })).toBe(false);
  });
  it('names the wave the sim ends it on: this one, or the one before while it is still arriving', () => {
    expect(endRunWave(snap())).toBe(43);
    expect(endRunWave(snap({ canCallEarly: false }))).toBe(42);
    expect(endRunWave(snap({ phase: 'build', wave: 0, canCallEarly: true }))).toBe(0);
    expect(endRunQuestion(43)).toBe('End this run on wave 43? It counts and can be posted.');
  });
  it('asks inside the sheet: End run and Keep playing', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toMatch(/id="settings-endrun-btn"[^>]*>End run</);
    expect(html).toMatch(/id="settings-endrun-yes"[^>]*>End run</);
    expect(html).toMatch(/id="settings-endrun-no"[^>]*>Keep playing</);
  });
});
