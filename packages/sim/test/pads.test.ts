// Pad zones (docs/MOBILE.md §2): who may build where, extra pads for bigger teams, and leavers.

import { describe, expect, it } from 'vitest';
import { applyCommand, setPlayerConnected, setPlayerLeft } from '../src/commands';
import { createGame, snapshot } from '../src/game';
import { getMap } from '../src/map';
import { padLayout } from '../src/pads';
import { TUNING } from '../src/tuning';
import { tuningCopy } from './helpers';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const game = (n: number) => createGame({ players: ids(n).map((id) => ({ id, name: id.toUpperCase(), hero: 'ranger' as const })) }, 1);
const map = getMap();
const base = map.pads.filter((p) => !p.extra);
const owners = (n: number) => {
  const byOwner = new Map<string | null, number[]>();
  for (const p of padLayout(map, TUNING, ids(n))) byOwner.set(p.owner, [...(byOwner.get(p.owner) ?? []), p.id]);
  return byOwner;
};

describe('pad zones', () => {
  it('solo: the player owns every base pad and there are no extra pads', () => {
    const layout = padLayout(map, TUNING, ['p1']);
    expect(layout.map((p) => p.id)).toEqual(base.map((p) => p.id));
    expect(layout.every((p) => p.owner === 'p1')).toBe(true);
  });

  it('2 players: West + the west half of Mid, and East + the east half of Mid', () => {
    const byOwner = owners(2);
    const zoneOf = (id: number) => map.pads[id]!;
    expect(byOwner.get('p1')!.length).toBe(byOwner.get('p2')!.length);
    expect(byOwner.get('p1')!.length + byOwner.get('p2')!.length).toBe(base.length);
    for (const id of byOwner.get('p1')!) expect(['west', 'mid']).toContain(zoneOf(id).zone);
    for (const id of byOwner.get('p2')!) expect(['east', 'mid']).toContain(zoneOf(id).zone);
    const midX = map.lanes[1]!.waypoints[0]!.x;
    for (const id of byOwner.get('p1')!) expect(zoneOf(id).x).toBeLessThan(midX);
    for (const id of byOwner.get('p2')!) expect(zoneOf(id).x).toBeGreaterThan(midX);
  });

  it('3 players: West / Mid / East, each with extra pads (about +15%)', () => {
    const byOwner = owners(3);
    const extra = TUNING.pads.extraPerLaneZone[2]!;
    expect(extra).toBeGreaterThan(0);
    ['west', 'mid', 'east'].forEach((zone, i) => {
      const pads = byOwner.get(`p${i + 1}`)!.map((id) => map.pads[id]!);
      expect(pads.every((p) => p.zone === zone)).toBe(true);
      expect(pads.filter((p) => p.extra)).toHaveLength(extra);
    });
    const total = [...byOwner.values()].flat().length;
    expect(total / base.length).toBeGreaterThan(1.1);
    expect(total / base.length).toBeLessThan(1.2);
  });

  it('4 players: a Core zone of extra pads where the lanes converge (about +25%)', () => {
    const byOwner = owners(4);
    const core = byOwner.get('p4')!.map((id) => map.pads[id]!);
    expect(core).toHaveLength(TUNING.pads.core[3]!);
    expect(core.every((p) => p.zone === 'core' && p.extra)).toBe(true);
    for (const p of core) expect(p.y).toBeGreaterThan(map.lanes[0]!.waypoints[1]!.y);
    const total = [...byOwner.values()].flat().length;
    expect(total / base.length).toBeGreaterThan(1.2);
    expect(total / base.length).toBeLessThan(1.35);
  });

  it('extra-pad amounts come from the tuning', () => {
    const tuning = tuningCopy();
    tuning.pads.extraPerLaneZone = [0, 0, 2, 2];
    tuning.pads.core = [0, 0, 0, 6];
    expect(padLayout(map, tuning, ids(3)).length).toBe(base.length + 6);
    expect(padLayout(map, tuning, ids(4)).length).toBe(base.length + 12);
    expect(padLayout(map, tuning, ids(1)).length).toBe(base.length);
  });

  it('only the owner may build on a pad; pads that do not exist in this match are rejected', () => {
    const state = game(2);
    for (const p of state.players) p.gold = 1_000;
    const mine = state.pads.find((p) => p.owner === 'p1')!;
    const theirs = state.pads.find((p) => p.owner === 'p2')!;
    const extra = map.pads.find((p) => p.extra)!;
    expect(applyCommand(state, 'p1', { type: 'build', padId: theirs.id, tower: 'arrow' })).toBe(false);
    expect(state.pendingEvents.at(-1)).toMatchObject({ type: 'rejected', reason: 'That pad belongs to P2' });
    expect(applyCommand(state, 'p1', { type: 'build', padId: extra.id, tower: 'arrow' })).toBe(false);
    expect(state.pendingEvents.at(-1)).toMatchObject({ type: 'rejected', reason: 'No build pad there' });
    expect(applyCommand(state, 'p1', { type: 'build', padId: mine.id, tower: 'arrow' })).toBe(true);
    expect(state.towers).toHaveLength(1);
  });

  it('snapshots list the pads of the match and their owners', () => {
    const state = game(4);
    const snap = snapshot(state);
    expect(snap.pads).toEqual(padLayout(map, TUNING, ids(4)));
    expect(snap.pads.some((p) => p.owner === 'p4')).toBe(true);
  });
});

describe('leavers', () => {
  it('a disconnect alone keeps the pads locked; leaving for good opens the empty ones to everyone', () => {
    const state = game(2);
    for (const p of state.players) p.gold = 1_000;
    const theirs = state.pads.filter((p) => p.owner === 'p2');
    expect(applyCommand(state, 'p2', { type: 'build', padId: theirs[0]!.id, tower: 'arrow' })).toBe(true);
    const tower = state.towers[0]!;

    setPlayerConnected(state, 'p2', false);
    expect(applyCommand(state, 'p1', { type: 'build', padId: theirs[1]!.id, tower: 'arrow' })).toBe(false);

    setPlayerLeft(state, 'p2');
    expect(state.players[1]!.left).toBe(true);
    expect(state.pads.filter((p) => theirs.some((t) => t.id === p.id)).every((p) => p.owner === null)).toBe(true);
    expect(snapshot(state).pads.find((p) => p.id === theirs[1]!.id)!.owner).toBeNull();
    expect(applyCommand(state, 'p1', { type: 'build', padId: theirs[1]!.id, tower: 'arrow' })).toBe(true);
    // Their tower stays theirs (upgrades are owner-only).
    expect(tower.owner).toBe('p2');
    expect(applyCommand(state, 'p1', { type: 'upgrade', towerId: tower.id })).toBe(false);
    // p1's own pads stay p1's.
    expect(state.pads.filter((p) => p.owner === 'p1').length).toBe(base.length / 2);
  });
});
