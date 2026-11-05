// Rampart Slam, round 2: the lane quake (Han, 4 Nov 2026).

import type { GameEvent, HeroKind, LaneId } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { createBalanceBot, createExpertBot } from '../src/bots';
import { applyCommand } from '../src/commands';
import { armorMultiplier } from '../src/combat';
import { snapshot } from '../src/game';
import { getMap } from '../src/map';
import { createMatch, matchCommand, matchOver, matchReplay, matchStep, replayMatch } from '../src/match';
import { laneLength, lanePointAt, laneSpot, quakeCatch, quakeTicks } from '../src/quake';
import type { Creep, GameState, Hero } from '../src/state';
import { secondsToTicks, TICK_RATE, TUNING } from '../src/tuning';
import { labGame, placeCreep, runCollect } from './helpers';

const S = TUNING.hero.warden.rampartSlam;
const R = { type: 'cast', slot: 'R' } as const;

/** A lab game, the heroes not auto-attacking, the Warden (first) with R at `rank` standing at (x, y). */
function lab(heroes: HeroKind[], x: number, y: number, rank = 1): { state: GameState; warden: Hero } {
  const state = labGame(TUNING, heroes.length, heroes);
  for (const h of state.heroes) {
    h.attackCd = 1_000_000;
    h.ranks.R = rank;
    h.mana = 1_000;
  }
  const warden = state.heroes[0]!;
  warden.x = x;
  warden.y = y;
  return { state, warden };
}

/** A tough creep that does not die of one hit, so each hit shows. */
function tough(state: GameState, kind: Creep['kind'], x: number, y: number, lane: LaneId = 1): Creep {
  const c = placeCreep(state, kind, x, y, lane);
  c.hp = c.maxHp = 100_000;
  return c;
}

/**
 * Casts the Warden's R (a command, before the tick it is applied in, as a player's is), runs `ticks` steps and records,
 * per creep, the ticks its HP dropped (the cast's own at the cast's tick). `events` collects every event, the cast's too.
 */
function slamAndWatch(state: GameState, creeps: Creep[], ticks: number, events: GameEvent[] = []): Map<number, number[]> {
  const hits = new Map(creeps.map((c) => [c.id, [] as number[]]));
  let hp = new Map(creeps.map((c) => [c.id, c.hp]));
  const look = () => {
    for (const c of creeps) {
      if (c.hp < hp.get(c.id)! - 1e-9) hits.get(c.id)!.push(state.tick);
    }
    hp = new Map(creeps.map((c) => [c.id, c.hp]));
  };
  expect(applyCommand(state, 'p1', R)).toBe(true);
  look();
  for (let i = 0; i < ticks; i++) {
    events.push(...runCollect(state, 1));
    look();
  }
  return hits;
}

describe('Rampart Slam: the lane quake', () => {
  it('measures the lane: progress from the portal, the point at a progress, the distance off the centreline', () => {
    const mid = getMap().lanes[1]!;
    expect(laneLength(mid)).toBeCloseTo(35.5);
    expect(laneSpot(mid, 13, 20.5)).toMatchObject({ progress: 20, dist: 0 });
    expect(laneSpot(mid, 15, 10.5).dist).toBeCloseTo(2);
    expect(lanePointAt(mid, 10)).toEqual({ x: 13, y: 10.5 });
    const west = getMap().lanes[0]!;
    const bend = laneSpot(west, 6, 23);
    expect(bend.progress).toBeCloseTo(22.5);
    expect(lanePointAt(west, laneLength(west))).toEqual(getMap().heart);
  });

  it('hits all 20 creeps of a lane spread over 30 tiles within 3 s, each once and for the whole catch', () => {
    const { state } = lab(['warden'], 13, 20);
    const creeps = Array.from({ length: 20 }, (_, i) => tough(state, 'grunt', 13, 2 + i * 1.55));
    const events: GameEvent[] = [];
    const hits = slamAndWatch(state, creeps, secondsToTicks(3), events);
    const quake = events.find((e) => e.type === 'quake');
    expect(quake).toMatchObject({ type: 'quake', lane: 1, from: 19.5 });
    const each = (S.base[0]! + 19 * S.echo[0]!) * armorMultiplier(TUNING, TUNING.creeps.grunt.armor);
    for (const c of creeps) {
      expect(hits.get(c.id), `creep at y ${c.y}`).toHaveLength(1);
      // The first hit is as hard as the last: the echo is counted over the whole catch at the cast.
      expect(c.maxHp - c.hp).toBeCloseTo(each);
      expect(c.stunUntil).toBeGreaterThan(0);
    }
    // The front runs both ways: the creeps near the Warden first, the far ends last.
    const first = (c: Creep) => hits.get(c.id)![0]!;
    expect(first(creeps[11]!)).toBeLessThanOrEqual(first(creeps[0]!));
    expect(first(creeps[19]!)).toBeLessThan(first(creeps[0]!));
    // One kill count for the whole slam, once its last creep is hit.
    expect(events.filter((e) => e.type === 'ultResult' && e.ult === 'rampartSlam')).toHaveLength(1);
  });

  it('runs to both ends of the longest lane in about 2.5 s', () => {
    const west = getMap().lanes[0]!;
    expect(quakeTicks(TUNING, laneLength(west), 0) / TICK_RATE).toBeLessThanOrEqual(2.5);
    expect(quakeTicks(TUNING, laneLength(west), laneLength(west) / 2) / TICK_RATE).toBeLessThanOrEqual(1.25);
  });

  it('a creep off the lane is not hit by the quake, but is by the local slam when within its radius', () => {
    const { state, warden } = lab(['warden'], 13, 20);
    // The quake's band is the lane's half width (1) plus `quakeBand` (1) plus half the creep's radius: these stand
    // 3.2 tiles off Mid's centreline, beyond it.
    const near = tough(state, 'grunt', 16.2, 21);
    const far = tough(state, 'grunt', 16.2, 8);
    const onLane = tough(state, 'grunt', 13.9, 8);
    const caught = quakeCatch(TUNING, state.creeps, warden.x, warden.y);
    expect(caught.onLane.map((c) => c.id)).toEqual([onLane.id]);
    expect(caught.local.map((c) => c.id)).toEqual([near.id]);
    const hits = slamAndWatch(state, [near, far, onLane], secondsToTicks(3));
    expect(hits.get(near.id), 'the local slam lands at once').toEqual([0]);
    expect(hits.get(far.id)).toHaveLength(0);
    expect(far.hp).toBe(far.maxHp);
    expect(hits.get(onLane.id)).toHaveLength(1);
    // Two creeps caught: both take the base plus one echo.
    expect(near.maxHp - near.hp).toBeCloseTo((S.base[0]! + S.echo[0]!) * armorMultiplier(TUNING, TUNING.creeps.grunt.armor));
  });

  it("catches the lane's shoulders: a creep within the half width plus the band plus half its radius (round 9)", () => {
    const { state, warden } = lab(['warden'], 13, 20);
    const r = TUNING.creeps.grunt.radius;
    const edge = getMap().laneHalfWidth + S.quakeBand + r / 2;
    expect(S.quakeBand).toBe(1);
    // A chaser beside the lane, just inside the band, and one just past it.
    const inside = tough(state, 'grunt', 13 + edge - 0.01, 8);
    const outside = tough(state, 'grunt', 13 - edge - 0.01, 6);
    const caught = quakeCatch(TUNING, state.creeps, warden.x, warden.y);
    expect(caught.onLane.map((c) => c.id)).toEqual([inside.id]);
    const hits = slamAndWatch(state, [inside, outside], secondsToTicks(3));
    expect(hits.get(inside.id)).toHaveLength(1);
    expect(hits.get(outside.id)).toHaveLength(0);
  });

  it('quakes a lane from 4 tiles off its centreline (round 9: `laneReach` 4)', () => {
    expect(S.laneReach).toBe(4);
    // 3.9 tiles east of West's centreline (x 6), 3.1 west of Mid's: the nearer lane, Mid, quakes.
    const { state, warden } = lab(['warden'], 9.9, 10);
    const onMid = tough(state, 'grunt', 13, 4);
    expect(quakeCatch(TUNING, state.creeps, warden.x, warden.y).lane).toBe(1);
    expect(slamAndWatch(state, [onMid], secondsToTicks(3)).get(onMid.id)).toHaveLength(1);
    // On the West pads, 3.9 tiles off West: West quakes.
    const west = lab(['warden'], 2.1, 10);
    expect(quakeCatch(TUNING, west.state.creeps, west.warden.x, west.warden.y).lane).toBe(0);
  });

  it('a flyer over the lane is hit', () => {
    const { state } = lab(['warden'], 13, 20);
    const wisp = tough(state, 'wisp', 13.2, 6);
    const hits = slamAndWatch(state, [wisp], secondsToTicks(3));
    expect(hits.get(wisp.id)).toHaveLength(1);
  });

  it('a boss on the lane takes the base hit alone, and the boss share of it', () => {
    const { state } = lab(['warden'], 13, 22);
    for (let i = 0; i < 10; i++) tough(state, 'grunt', 13, 4 + i);
    const boss = tough(state, 'ironhorn', 13, 15);
    boss.abilityCd = 1_000_000;
    slamAndWatch(state, [boss], secondsToTicks(3));
    expect(boss.maxHp - boss.hp).toBeCloseTo(S.base[0]! * TUNING.combat.ultimateBossFactor * armorMultiplier(TUNING, boss.armor));
  });

  it('caps the echo at 24 other creeps', () => {
    expect(S.echoCap).toBe(24);
    const { state } = lab(['warden'], 13, 20);
    const creeps = Array.from({ length: 34 }, (_, i) => tough(state, 'grunt', 13 + (i % 2) * 0.5, 2 + i * 0.9));
    slamAndWatch(state, creeps, secondsToTicks(3));
    const each = (S.base[0]! + 24 * S.echo[0]!) * armorMultiplier(TUNING, TUNING.creeps.grunt.armor);
    for (const c of creeps) expect(c.maxHp - c.hp).toBeCloseTo(each);
  });

  it('cast more than 4 tiles from every lane, only the local slam lands and no quake starts', () => {
    // On the West pads' outer edge: 4.5 tiles from West (x 6), farther from the others.
    const { state, warden } = lab(['warden'], 1.5, 10);
    const near = tough(state, 'grunt', 2.5, 10);
    const onWest = tough(state, 'grunt', 6, 4, 0);
    expect(quakeCatch(TUNING, state.creeps, warden.x, warden.y).lane).toBeNull();
    const events: GameEvent[] = [];
    const hits = slamAndWatch(state, [near, onWest], secondsToTicks(3), events);
    expect(events.some((e) => e.type === 'quake')).toBe(false);
    expect(near.hp).toBeLessThan(near.maxHp);
    expect(hits.get(onWest.id)).toHaveLength(0);
    expect(events.filter((e) => e.type === 'ultResult' && e.ult === 'rampartSlam')).toHaveLength(1);
  });

  it('on the stretch the lanes share above the Heart, quakes the lane with the most creeps', () => {
    const { state, warden } = lab(['warden'], 13, 33);
    for (let i = 0; i < 4; i++) tough(state, 'grunt', 20, 5 + i * 3, 2);
    tough(state, 'grunt', 13, 6);
    expect(quakeCatch(TUNING, state.creeps, warden.x, warden.y).lane).toBe(2);
  });

  it('hits every creep on the shared stretch whatever lane it walks, whichever lane quakes (round 9)', () => {
    // A Mid quake cast up Mid; West's, Mid's and East's creeps on the last 6 tiles above the Heart are all caught.
    const { state, warden } = lab(['warden'], 13, 20);
    const shared = [tough(state, 'grunt', 13, 30.5, 0), tough(state, 'grunt', 13.4, 31.5, 1), tough(state, 'grunt', 12.6, 32.5, 2)];
    const caught = quakeCatch(TUNING, state.creeps, warden.x, warden.y);
    expect(caught.lane).toBe(1);
    expect(caught.onLane.map((c) => c.id).sort()).toEqual(shared.map((c) => c.id).sort());
    const hits = slamAndWatch(state, shared, secondsToTicks(3));
    for (const c of shared) expect(hits.get(c.id)).toHaveLength(1);
    // The same from West's bend: a West quake hits Mid's and East's creeps there too.
    const west = lab(['warden'], 7, 22);
    const there = [tough(west.state, 'grunt', 13, 32, 1), tough(west.state, 'grunt', 13, 34, 2)];
    const fromWest = quakeCatch(TUNING, west.state.creeps, west.warden.x, west.warden.y);
    expect(fromWest.lane).toBe(0);
    expect(fromWest.onLane.map((c) => c.id).sort()).toEqual(there.map((c) => c.id).sort());
  });

  it('counts the local slam and the quake together in one kill count', () => {
    const { state } = lab(['warden'], 13, 20);
    const weak = [placeCreep(state, 'grunt', 15, 21), placeCreep(state, 'grunt', 13, 5), placeCreep(state, 'grunt', 13, 30)];
    expect(applyCommand(state, 'p1', R)).toBe(true);
    // A command's events go out with the next step's.
    const events = runCollect(state, secondsToTicks(3));
    expect(weak.every((c) => c.dead)).toBe(true);
    expect(events.filter((e) => e.type === 'ultResult' && e.ult === 'rampartSlam')).toEqual([
      { type: 'ultResult', ult: 'rampartSlam', by: 'p1', kills: 3 },
    ]);
  });

  it('still fuses with Arrow Storm into Stun Storm, and the quake still runs', () => {
    const { state } = lab(['warden', 'ranger'], 13, 20);
    const creeps = Array.from({ length: 6 }, (_, i) => tough(state, 'grunt', 13, 4 + i * 3));
    expect(applyCommand(state, 'p1', R)).toBe(true);
    const events: GameEvent[] = runCollect(state, 10);
    expect(applyCommand(state, 'p2', R)).toBe(true);
    events.push(...runCollect(state, secondsToTicks(3)));
    expect(events.filter((e) => e.type === 'combo' && e.combo === 'stunStorm')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'quake')).toHaveLength(1);
    for (const c of creeps) expect(c.hp).toBeLessThan(c.maxHp);
  });

  it('a match with quakes in it re-runs from its replay to the same end', () => {
    const players = [{ id: 'p1', name: 'A', hero: 'warden' as const }, { id: 'p2', name: 'B', hero: 'ranger' as const }];
    const match = createMatch({ players, mode: 'quick' }, 11);
    const bots = [createExpertBot('p1', undefined, 0), createBalanceBot('p2', undefined, 1)];
    let quakes = 0;
    while (!matchOver(match) && match.state.tick < 60 * 60 * TICK_RATE) {
      if (match.state.tick % 5 === 0) {
        const snap = snapshot(match.state);
        for (const bot of bots) for (const cmd of bot.decide(snap)) matchCommand(match, bot.playerId, cmd);
      }
      matchStep(match);
      quakes += match.state.events.filter((e) => e.type === 'quake').length;
    }
    expect(quakes).toBeGreaterThanOrEqual(3);
    const replay = JSON.parse(JSON.stringify(matchReplay(match)));
    const again = replayMatch(replay);
    expect(again.state.tick).toBe(match.state.tick);
    expect(again.state.heartHp).toBe(match.state.heartHp);
    expect(again.state.ultStats).toEqual(match.state.ultStats);
  }, 60_000);
});
