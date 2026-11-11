import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEAVE_QUESTION, settingsLeaveShown } from '../src/hud/leaveMatch';

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
