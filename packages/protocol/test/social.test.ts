import { describe, expect, it } from 'vitest';
import { allowSocial, EMOTE_GAP_MS, freshSocialClock, PING_GAP_MS } from '../src/social';

describe('social rate gate', () => {
  it('allows a ping and an emote on separate clocks, and refuses a burst of either', () => {
    const clock = freshSocialClock();
    expect(allowSocial(clock, 'ping', 0)).toBe(true);
    expect(allowSocial(clock, 'ping', PING_GAP_MS - 1)).toBe(false);
    expect(allowSocial(clock, 'emote', 10)).toBe(true);
    expect(allowSocial(clock, 'emote', 10 + EMOTE_GAP_MS - 1)).toBe(false);
    expect(allowSocial(clock, 'ping', PING_GAP_MS)).toBe(true);
    expect(allowSocial(clock, 'emote', 10 + EMOTE_GAP_MS)).toBe(true);
  });
});
