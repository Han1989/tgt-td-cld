/**
 * How often one player may ping or emote. The server (and the local host) enforce this;
 * the sim itself accepts every well-formed ping and emote so a replay stays a list of inputs.
 * Pings and emotes have separate clocks, so a ping does not silence a phrase.
 */

/** Least time (ms) between one player's map pings. */
export const PING_GAP_MS = 1000;
/** Least time (ms) between one player's quick-chat emotes. */
export const EMOTE_GAP_MS = 1500;

export type SocialKind = 'ping' | 'emote';

/** Last accepted time (ms) of each kind. `-Infinity` means none yet. */
export interface SocialClock {
  ping: number;
  emote: number;
}

export function freshSocialClock(): SocialClock {
  return { ping: -Infinity, emote: -Infinity };
}

/**
 * Whether this player may send `kind` at `now` (ms). When they may, the clock moves to `now`.
 * A second of the same kind inside the gap is refused.
 */
export function allowSocial(clock: SocialClock, kind: SocialKind, now: number): boolean {
  const gap = kind === 'ping' ? PING_GAP_MS : EMOTE_GAP_MS;
  if (now - clock[kind] < gap) return false;
  clock[kind] = now;
  return true;
}
