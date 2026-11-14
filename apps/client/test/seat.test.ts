// q12: the seat in a running match this browser remembers ("Rejoin your match"), and "<name> is back".

import type { PlayerSnap } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { backLines, presenceOf } from '../src/hud/back';
import { forgetsSeat, seatOffer, SEAT_TTL_MS } from '../src/transport/seat';

const URL = 'wss://game.example';
const seat = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ url: URL, code: 'ABCDE', token: 'f'.repeat(32), savedAt: 1_000, ...over });

describe('the remembered seat (q12)', () => {
  it('is offered for this server for two hours after it was saved', () => {
    expect(seatOffer(seat(), URL, 1_000)).toMatchObject({ code: 'ABCDE', token: 'f'.repeat(32) });
    expect(seatOffer(seat(), URL, 1_000 + SEAT_TTL_MS)).not.toBeNull();
    expect(SEAT_TTL_MS).toBe(2 * 60 * 60 * 1000);
  });

  it('is not offered after two hours, for another server, from the future, or when it is not a seat', () => {
    expect(seatOffer(seat(), URL, 1_001 + SEAT_TTL_MS)).toBeNull();
    expect(seatOffer(seat(), 'wss://other.example', 1_000)).toBeNull();
    expect(seatOffer(seat(), URL, 999)).toBeNull();
    expect(seatOffer(null, URL, 1_000)).toBeNull();
    expect(seatOffer('not json', URL, 1_000)).toBeNull();
    expect(seatOffer('null', URL, 1_000)).toBeNull();
    expect(seatOffer(seat({ token: 7 }), URL, 1_000)).toBeNull();
    expect(seatOffer(seat({ code: '' }), URL, 1_000)).toBeNull();
    expect(seatOffer(seat({ savedAt: 'yesterday' }), URL, 1_000)).toBeNull();
  });

  it('is forgotten when the server says the room or the seat is gone, and not for anything else', () => {
    for (const code of ['rejoin_failed', 'room_not_found', 'wrong_server', 'seat_taken'] as const) expect(forgetsSeat(code)).toBe(true);
    for (const code of ['match_full', 'seat_recent', 'rate_limited', 'not_ready', 'bad_request'] as const) {
      expect(forgetsSeat(code)).toBe(false);
    }
  });
});

describe('"<name> is back" (q12)', () => {
  const p = (id: string, name: string, connected: boolean, bot = false): PlayerSnap =>
    ({ id, name, connected, gold: 0, heroId: 1, kills: 0, ...(bot ? { bot: true } : {}) }) as PlayerSnap;

  it('says so once for a teammate who was away and is connected now, under the name they play as', () => {
    const before = presenceOf([p('p1', 'Ada', true), p('p2', 'Bo', false), p('p3', 'Cy', false)]);
    const now = [p('p1', 'Ada', true), p('p2', 'Bo', true), p('p3', 'Zed', true)];
    expect(backLines(before, now, 'p1')).toEqual(['Bo is back', 'Zed is back']);
    expect(backLines(presenceOf(now), now, 'p1')).toEqual([]);
  });

  it('never for you, a teammate who stays away, the first snapshot, or the bot teammate', () => {
    const before = presenceOf([p('p1', 'Ada', false), p('p2', 'Bo', false)]);
    expect(backLines(before, [p('p1', 'Ada', true), p('p2', 'Bo', false)], 'p1')).toEqual([]);
    expect(backLines(null, [p('p2', 'Bo', true)], 'p1')).toEqual([]);
    expect(backLines(new Map([['p9', false]]), [p('p9', 'Bot', true, true)], 'p1')).toEqual([]);
  });
});
