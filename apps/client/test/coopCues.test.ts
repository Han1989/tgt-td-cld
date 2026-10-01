import {
  BOSS_KINDS,
  BOSS_LANE_HINTS,
  BOSS_WAVES,
  FINALE_LEAK_CREEP_ID,
  FINALE_LEAK_LANE,
  LANE_NAMES,
  R_OVERLAP_SECONDS,
  bossLaneHint,
  type GameEvent,
  type Snapshot,
} from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import {
  CLUTCH_GAP_MS,
  bossLaneRoles,
  emptyCues,
  giftLine,
  giftTotalsLines,
  PING_MIRROR_MS,
  playerTint,
  readCues,
  showGiftTotals,
  TWIN_CAST_MS,
  type CueMemory,
} from '../src/coop/cues';
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

  it('prefers a live syncCast over cast overlap, and keeps the overlap when sync cannot draw', () => {
    const both = feed(emptyCues(), [
      { type: 'cast', heroId: 1, slot: 'R', x: 1, y: 1 },
      { type: 'cast', heroId: 2, slot: 'R', x: 9, y: 9 },
      { type: 'syncCast', heroIds: [1, 2], slot: 'R' },
    ], 0);
    expect(both.beat.twin).toBeNull();
    expect(both.beat.sync?.spots).toEqual([
      { heroId: 1, by: 'p1', x: 6, y: 20 },
      { heroId: 2, by: 'p2', x: 20, y: 18 },
    ]);

    const missing = feed(emptyCues(), [
      { type: 'cast', heroId: 1, slot: 'R', x: 0, y: 0 },
      { type: 'cast', heroId: 2, slot: 'R', x: 0, y: 0 },
      { type: 'syncCast', heroIds: [9, 10], slot: 'R' },
    ], 0);
    expect(missing.beat.sync).toBeNull();
    expect(missing.beat.twin).not.toBeNull();
  });

  it('names a leaking lane and skips the Hard finale strain', () => {
    const finale = feed(emptyCues(), [
      { type: 'leak', creepId: FINALE_LEAK_CREEP_ID, damage: 2, lane: FINALE_LEAK_LANE },
    ], 0);
    expect(finale.beat.clutch).toBeNull();

    const west = feed(emptyCues(), [{ type: 'leak', creepId: 4, damage: 3, lane: 0 }], 1000);
    expect(west.beat.clutch).toMatchObject({
      lane: 0,
      name: 'West',
      lanes: [0],
      title: 'Heart save',
      line: 'West leaking',
      damage: 3,
    });
    const again = feed(west.memory, [{ type: 'leak', creepId: 5, damage: 9, lane: 0 }], 1000 + CLUTCH_GAP_MS - 1);
    expect(again.beat.clutch).toBeNull();
    const other = feed(west.memory, [{ type: 'leak', creepId: 6, damage: 4, lane: 2 }], 1000 + 400);
    expect(other.beat.clutch).toMatchObject({ lane: 2, name: 'East', line: 'East leaking' });
    const later = feed(west.memory, [{ type: 'leak', creepId: 7, damage: 1, lane: 0 }], 1000 + CLUTCH_GAP_MS);
    expect(later.beat.clutch?.name).toBe('West');

    const both = feed(emptyCues(), [
      { type: 'leak', creepId: 4, damage: 1, lane: 0 },
      { type: 'leak', creepId: 8, damage: 6, lane: 2 },
      { type: 'leak', creepId: FINALE_LEAK_CREEP_ID, damage: 2, lane: FINALE_LEAK_LANE },
    ], 0);
    expect(both.beat.clutch).toMatchObject({
      lane: 2,
      name: 'East',
      lanes: [0, 2],
      names: ['West', 'East'],
      line: 'West · East leaking',
      damage: 6,
    });
    expect(LANE_NAMES[both.beat.clutch!.lane]).toBe('East');
  });

  it('lists advisory boss lane roles and gift totals, with old saves as zero', () => {
    for (const kind of BOSS_KINDS) {
      const banner = bossLaneRoles(kind);
      expect(banner.waves).toEqual(BOSS_WAVES[kind]);
      expect(banner.lanes.map((l) => l.name)).toEqual(['West', 'Mid', 'East']);
      expect(banner.lanes.map((l) => l.hint)).toEqual([...BOSS_LANE_HINTS[kind]]);
      expect(banner.lanes[1]!.hint).toBe(bossLaneHint(kind, 1));
    }
    const lines = giftTotalsLines([
      { name: 'Ann', hero: 'ranger' },
      { name: 'Bo', hero: 'warden', goldGifted: 40 },
      { name: 'Cy', hero: 'arcanist', goldGifted: 10, goldReceived: 25 },
    ]);
    expect(lines).toEqual([
      { name: 'Ann', hero: 'ranger', goldGifted: 0, goldReceived: 0 },
      { name: 'Bo', hero: 'warden', goldGifted: 40, goldReceived: 0 },
      { name: 'Cy', hero: 'arcanist', goldGifted: 10, goldReceived: 25 },
    ]);
    expect(showGiftTotals(lines)).toBe(true);
    expect(showGiftTotals([{ name: 'Ann', hero: 'ranger', goldGifted: 0, goldReceived: 0 }])).toBe(false);
    expect(showGiftTotals([{ name: 'Ann', hero: 'ranger', goldGifted: 25, goldReceived: 0 }])).toBe(true);
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
