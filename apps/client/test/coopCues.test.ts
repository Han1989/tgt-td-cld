import type { GameEvent, Snapshot } from '@tdt/protocol';
import { R_OVERLAP_SECONDS } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import { emptyCues, giftLine, PING_MIRROR_MS, playerTint, readCues, TWIN_CAST_MS, type CueMemory } from '../src/coop/cues';
import { PLAYER_COLORS } from '../src/render/palette';

function snap(): Snapshot {
  return {
    players: [
      { id: 'p1', name: 'Ann', gold: 80, heroId: 1, kills: 0, connected: true },
      { id: 'p2', name: 'Bo', gold: 40, heroId: 2, kills: 0, connected: true },
    ],
    heroes: [
      { id: 1, owner: 'p1', x: 6, y: 20 },
      { id: 2, owner: 'p2', x: 20, y: 18 },
    ],
  } as Snapshot;
}

function feed(memory: CueMemory, events: GameEvent[], now: number, state: Snapshot = snap()) {
  return readCues(memory, events, state, now);
}

describe('coop presentation cues', () => {
  it('pairs the twin-cast window with the match report overlap', () => {
    expect(TWIN_CAST_MS).toBe(R_OVERLAP_SECONDS * 1000);
    expect(PING_MIRROR_MS).toBe(1000);
  });

  it('bursts when two players ping within 1s, including the same frame', () => {
    const first = feed(emptyCues(), [{ type: 'ping', by: 'p1', x: 4, y: 8 }], 1000);
    expect(first.beat.ping).toBeNull();
    const same = feed(emptyCues(), [
      { type: 'ping', by: 'p1', x: 4, y: 8 },
      { type: 'ping', by: 'p2', x: 12, y: 9 },
    ], 1000);
    expect(same.beat.ping?.a.by).toBe('p1');
    expect(same.beat.ping?.b.by).toBe('p2');
    expect(same.beat.ping?.b.data).toEqual({ x: 12, y: 9 });

    const later = feed(first.memory, [{ type: 'ping', by: 'p2', x: 3, y: 3 }], 1000 + PING_MIRROR_MS);
    expect(later.beat.ping).not.toBeNull();
    const late = feed(first.memory, [{ type: 'ping', by: 'p2', x: 3, y: 3 }], 1000 + PING_MIRROR_MS + 1);
    expect(late.beat.ping).toBeNull();
  });

  it('does not burst one player pinging twice, and does not strobe the same pair', () => {
    const solo = feed(emptyCues(), [
      { type: 'ping', by: 'p1', x: 1, y: 1 },
      { type: 'ping', by: 'p1', x: 2, y: 2 },
    ], 0);
    expect(solo.beat.ping).toBeNull();

    const once = feed(emptyCues(), [
      { type: 'ping', by: 'p1', x: 1, y: 1 },
      { type: 'ping', by: 'p2', x: 2, y: 2 },
    ], 0);
    expect(once.beat.ping).not.toBeNull();
    const again = feed(once.memory, [{ type: 'ping', by: 'p1', x: 5, y: 5 }], 400);
    expect(again.beat.ping).toBeNull();
    const after = feed(once.memory, [{ type: 'ping', by: 'p1', x: 5, y: 5 }], PING_MIRROR_MS);
    expect(after.beat.ping?.b.data).toEqual({ x: 5, y: 5 });
  });

  it('bursts only when both players use the same emote', () => {
    const mismatch = feed(emptyCues(), [
      { type: 'emote', by: 'p1', emote: 'help' },
      { type: 'emote', by: 'p2', emote: 'thanks' },
    ], 0);
    expect(mismatch.beat.emote).toBeNull();
    const match = feed(emptyCues(), [
      { type: 'emote', by: 'p1', emote: 'defend' },
      { type: 'emote', by: 'p2', emote: 'defend' },
    ], 500);
    expect(match.beat.emote?.emote).toBe('defend');
    expect(match.beat.emote?.a.by).toBe('p1');
    expect(match.beat.emote?.b.by).toBe('p2');
  });

  it('ribbons two R casts within the overlap window and ignores Q', () => {
    const qs = feed(emptyCues(), [
      { type: 'cast', heroId: 1, slot: 'Q', x: 1, y: 1 },
      { type: 'cast', heroId: 2, slot: 'R', x: 9, y: 9 },
    ], 0);
    expect(qs.beat.twin).toBeNull();

    const held = feed(qs.memory, [{ type: 'cast', heroId: 1, slot: 'R', x: 0, y: 0 }], 1500);
    expect(held.beat.twin).not.toBeNull();
    expect(held.beat.twin?.a.data).toEqual({ x: 20, y: 18 });
    expect(held.beat.twin?.b.data).toEqual({ x: 6, y: 20 });

    const apart = feed(qs.memory, [{ type: 'cast', heroId: 1, slot: 'R', x: 0, y: 0 }], TWIN_CAST_MS + 1);
    expect(apart.beat.twin).toBeNull();
  });

  it('describes a gift the local player sent or received', () => {
    const state = snap();
    expect(giftLine({ from: 'p2', to: 'p1', amount: 25 }, state, 'p1')).toEqual({
      kind: 'received',
      amount: 25,
      who: 'Bo',
      partnerId: 'p2',
    });
    expect(giftLine({ from: 'p1', to: 'p2', amount: 100 }, state, 'p1')).toEqual({
      kind: 'sent',
      amount: 100,
      who: 'Bo',
      partnerId: 'p2',
    });
    expect(giftLine({ from: 'p1', to: 'p2', amount: 25 }, state, null)).toBeNull();
    expect(playerTint(state, 'p1')).toBe(PLAYER_COLORS[0]);
    expect(playerTint(state, 'p2')).toBe(PLAYER_COLORS[1]);
  });
});
