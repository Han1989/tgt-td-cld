// Soft-launch hook: global lane rains, Meteor Rain (time window only), the wave-10
// two-lane shield, and solo practice. Always on.

import type { LaneId } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands';
import { damageCreep } from '../src/combat';
import { heroHitLane, hitFrom, shieldStandPoint, teamSize } from '../src/coop';
import { createGame, snapshot, step } from '../src/game';
import { getMap } from '../src/map';
import { createPracticeAlly } from '../src/practiceAlly';
import type { GameState } from '../src/state';
import { secondsToTicks, TUNING, type Tuning } from '../src/tuning';
import { spawnCreep } from '../src/waves';
import { dist } from '../src/vec';
import { labGame, placeCreep, run, runCollect, tuningCopy } from './helpers';

function learnR(state: GameState, playerId: string): void {
  const hero = state.heroes.find((h) => h.owner === playerId)!;
  hero.level = Math.max(hero.level, 6);
  hero.skillPoints = Math.max(hero.skillPoints, 1);
  expect(applyCommand(state, playerId, { type: 'learn', slot: 'R' })).toBe(true);
}

describe('global rains', () => {
  it('lands on the lane with the creeps and never in an empty corner', () => {
    const { state } = labRain(['ranger']);
    const pack = { x: 6, y: 10 };
    const brute = placeCreep(state, 'brute', pack.x, pack.y, 0);
    const corner = placeCreep(state, 'grunt', 0.4, 49, 0);
    brute.rootUntil = 1_000_000;
    corner.rootUntil = 1_000_000;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R' })).toBe(true);
    const s = TUNING.hero.ranger.arrowStorm;
    const events = runCollect(state, secondsToTicks(s.duration) + 2);
    const impacts = events.filter((e) => e.type === 'aoe' && e.effect === 'arrowStorm');
    expect(impacts.length).toBeGreaterThan(0);
    let nearPack = 0;
    for (const e of impacts) {
      if (e.type !== 'aoe') continue;
      expect(e.radius).toBe(s.strikeRadius);
      expect(dist(e.x, e.y, corner.x, corner.y)).toBeGreaterThan(8);
      if (dist(e.x, e.y, pack.x, pack.y) <= 2.4) nearPack++;
    }
    expect(nearPack).toBeGreaterThanOrEqual(s.laneCap);
    expect(corner.hp).toBe(corner.maxHp);
    expect(brute.hp).toBeLessThan(brute.maxHp);
  });

  it('stops adding strikes on a lane and near the Heart once those caps are full', () => {
    const tuning = tuningCopy();
    tuning.hero.ranger.arrowStorm.laneCap = 1;
    tuning.hero.ranger.arrowStorm.heartCap = 1;
    tuning.hero.ranger.arrowStorm.heartRadius = 8;
    const { state } = labRain(['ranger'], tuning);
    const heart = getMap().heart;
    placeCreep(state, 'brute', heart.x, heart.y).rootUntil = 1_000_000;
    placeCreep(state, 'brute', 6, 10, 0).rootUntil = 1_000_000;
    placeCreep(state, 'brute', 13, 10, 1).rootUntil = 1_000_000;
    placeCreep(state, 'brute', 20, 10, 2).rootUntil = 1_000_000;
    applyCommand(state, 'p1', { type: 'cast', slot: 'R' });
    const events = runCollect(state, secondsToTicks(tuning.hero.ranger.arrowStorm.duration) + 2);
    const impacts = events.filter((e) => e.type === 'aoe' && e.effect === 'arrowStorm');
    const lanes: Record<LaneId, number> = { 0: 0, 1: 0, 2: 0 };
    let nearHeart = 0;
    for (const e of impacts) {
      if (e.type !== 'aoe') continue;
      lanes[laneOf(e.x, e.y)]++;
      if (dist(e.x, e.y, heart.x, heart.y) <= 8) nearHeart++;
    }
    expect(lanes[0]).toBeLessThanOrEqual(1);
    expect(lanes[1]).toBeLessThanOrEqual(1);
    expect(lanes[2]).toBeLessThanOrEqual(1);
    expect(nearHeart).toBeLessThanOrEqual(1);
    expect(impacts.length).toBeLessThanOrEqual(3);
  });
});

describe('Meteor Rain', () => {
  it('fuses the two rains inside the window even when the casters are across the map', () => {
    const { state, heroes } = labRain(['ranger', 'arcanist']);
    heroes[0]!.x = 2;
    heroes[1]!.x = 24;
    applyCommand(state, 'p1', { type: 'cast', slot: 'R' });
    applyCommand(state, 'p2', { type: 'cast', slot: 'R' });
    const events = runCollect(state, 1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'combo', combo: 'meteorRain', radius: 0, heroes: [heroes[0]!.id, heroes[1]!.id] }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'syncCast', slot: 'R', heroIds: [heroes[0]!.id, heroes[1]!.id] }),
    );
    expect(state.zones.map((z) => z.kind)).toEqual(['meteorRain']);
    expect(state.zones[0]).toMatchObject({ radius: 0 });
    const rain = runCollect(state, secondsToTicks(TUNING.coop.meteorRain.duration) + 2).filter(
      (e) => e.type === 'aoe' && e.effect === 'meteorRain',
    );
    const solo = Math.floor(TUNING.hero.arcanist.meteor.duration / TUNING.hero.arcanist.meteor.pulseInterval);
    expect(rain.length).toBeGreaterThan(solo);
  });

  it('does not fuse, and does not sync, once the window has passed', () => {
    const { state } = labRain(['ranger', 'arcanist']);
    applyCommand(state, 'p1', { type: 'cast', slot: 'R' });
    run(state, secondsToTicks(TUNING.coop.comboWindow) + 2);
    state.zones = [];
    applyCommand(state, 'p2', { type: 'cast', slot: 'R' });
    const events = runCollect(state, 1);
    expect(events.some((e) => e.type === 'combo' || e.type === 'syncCast')).toBe(false);
    expect(state.zones.map((z) => z.kind)).toEqual(['meteor']);
  });

  it('still syncs a second rain cast inside the window', () => {
    const { state, heroes } = labRain(['ranger', 'arcanist']);
    applyCommand(state, 'p1', { type: 'cast', slot: 'R' });
    run(state, secondsToTicks(1));
    applyCommand(state, 'p2', { type: 'cast', slot: 'R' });
    const events = runCollect(state, 1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'syncCast', heroIds: [heroes[0]!.id, heroes[1]!.id] }),
    );
    expect(state.zones.map((z) => z.kind)).toEqual(['meteorRain']);
  });
});

describe('wave-10 shield', () => {
  it('takes no damage from one lane, then the second lane breaks it and lands', () => {
    const state = labGame();
    const boss = spawnCreep(state, 'ironhorn', 1, 10);
    expect(snapshot(state).creeps.find((c) => c.id === boss.id)?.shield).toBe('up');
    const hp = boss.hp;
    damageCreep(state, boss, 80, 'physical', 'p1', false, { x: 6, lane: 0 });
    expect(boss.hp).toBe(hp);
    expect(state.pendingEvents).toContainEqual(expect.objectContaining({ type: 'shieldHit', lane: 0 }));
    damageCreep(state, boss, 80, 'physical', 'p1', false, { x: 20, lane: 2 });
    expect(boss.hp).toBeLessThan(hp);
    expect(state.pendingEvents).toContainEqual(expect.objectContaining({ type: 'shieldBreak' }));
    expect(snapshot(state).creeps.find((c) => c.id === boss.id)?.shield).toBe('off');
  });

  it('forgets the first lane after the window', () => {
    const state = labGame();
    const boss = spawnCreep(state, 'ironhorn', 1, 10);
    damageCreep(state, boss, 40, 'physical', 'p1', false, { x: 6, lane: 0 });
    const hp = boss.hp;
    state.tick += secondsToTicks(TUNING.coop.bossShield.window) + 1;
    damageCreep(state, boss, 40, 'physical', 'p1', false, { x: 20, lane: 2 });
    expect(boss.hp).toBe(hp);
    expect(state.pendingEvents.some((e) => e.type === 'shieldBreak')).toBe(false);
  });

  it('counts a tower by its pad zone and a hero in the Mid gap as a side lane', () => {
    const mid = getMap().pads.find((p) => p.zone === 'mid' && !p.extra)!;
    const state = labGame();
    expect(hitFrom(state, { x: mid.x, y: mid.y, padId: mid.id }).lane).toBe(1);
    expect(heroHitLane(11.5, 12)).toBe(0);
    expect(heroHitLane(13, 12)).toBe(1);
    const boss = { x: 13, y: 20 };
    const reach = TUNING.hero.warden.attackRange + TUNING.hero.warden.radius + TUNING.creeps.ironhorn.radius;
    const stand = shieldStandPoint(boss, -1, reach);
    expect(stand).not.toBeNull();
    expect(dist(stand!.x, stand!.y, boss.x, boss.y)).toBeLessThanOrEqual(reach);
    expect(heroHitLane(stand!.x, stand!.y)).toBe(0);
  });

  it('shields Full wave 10 and Quick wave 10, not Quick wave 5 or Full wave 20', () => {
    const full = labGame();
    expect(spawnCreep(full, 'ironhorn', 1, 10).id).toBeGreaterThan(0);
    expect(full.shields).toHaveLength(1);
    expect(spawnCreep(full, 'matriarch', 1, 20).id).toBeGreaterThan(0);
    expect(full.shields).toHaveLength(1);

    const quick = createGame({ players: [{ id: 'p1', name: 'P', hero: 'ranger' }], mode: 'quick' }, 3);
    spawnCreep(quick, 'ironhorn', 1, 5);
    expect(quick.shields).toHaveLength(0);
    const matriarch = spawnCreep(quick, 'matriarch', 1, 10);
    expect(quick.shields.map((s) => s.creepId)).toEqual([matriarch.id]);
    expect(snapshot(quick).creeps.find((c) => c.id === matriarch.id)?.shield).toBe('up');
  });
});

describe('solo practice', () => {
  it('adds a level-6 ally that does not change pads, team size or bounty', () => {
    const solo = createGame({ players: [{ id: 'p1', name: 'P', hero: 'ranger' }] }, 4);
    const state = createGame(
      {
        players: [{ id: 'p1', name: 'P', hero: 'ranger' }],
        practice: { allyId: 'practice-ally', allyHero: 'arcanist' },
      },
      4,
    );
    expect(state.pads).toEqual(solo.pads);
    expect(teamSize(state)).toBe(1);
    expect(state.heroes.map((h) => h.level)).toEqual([6, 6]);
    expect(state.players.find((p) => p.id === 'practice-ally')!.gold).toBe(0);
    const creep = placeCreep(state, 'grunt', state.heroes[0]!.x, state.heroes[0]!.y);
    const leader = state.players[0]!;
    const before = leader.gold;
    damageCreep(state, creep, 10_000, 'physical', 'practice-ally');
    expect(creep.dead).toBe(true);
    expect(leader.gold).toBeGreaterThan(before);
    expect(state.players.find((p) => p.id === 'practice-ally')!.gold).toBe(0);
    expect(state.heroes[1]!.xp).toBe(state.tuning.hero.xpForLevel[5]);
    expect(state.heroes[0]!.xp).toBeGreaterThan(state.tuning.hero.xpForLevel[5]!);
  });

  it('the ally answers an instant R inside the window and the rains fuse', () => {
    const state = createGame(
      {
        players: [{ id: 'p1', name: 'P', hero: 'ranger' }],
        practice: { allyId: 'practice-ally', allyHero: 'arcanist' },
      },
      2,
    );
    learnR(state, 'p1');
    learnR(state, 'practice-ally');
    const ally = createPracticeAlly('practice-ally', 'p1');
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R' })).toBe(true);
    let fused = false;
    for (let i = 0; i < 40 && !fused; i++) {
      step(state);
      for (const cmd of ally.decide(snapshot(state))) applyCommand(state, 'practice-ally', cmd);
      fused = state.zones.some((z) => z.kind === 'meteorRain');
    }
    expect(fused).toBe(true);
    expect(state.zones.filter((z) => z.kind === 'arrowStorm' || z.kind === 'meteor').every((z) => z.done)).toBe(true);
  });
});

function labRain(heroes: ('ranger' | 'arcanist' | 'warden')[], tuning: Tuning = TUNING) {
  const state = labGame(tuning, heroes.length, heroes);
  for (const h of state.heroes) {
    h.attackCd = 1_000_000;
    h.ranks.R = 1;
    h.level = 6;
  }
  return { state, heroes: state.heroes };
}

/** Which lane a rain spot sits on. Points near the Heart count as Mid (the lanes have joined). */
function laneOf(x: number, y: number): LaneId {
  if (y >= 30) return 1;
  if (x < 9.5) return 0;
  if (x > 16.5) return 2;
  return 1;
}
