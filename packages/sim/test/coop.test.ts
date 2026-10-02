// Aimed ultimates, the three combos, the wave-10 two-lane shield, and solo practice. Always on.

import { R_OVERLAP_SECONDS } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands';
import { damageCreep } from '../src/combat';
import { comboOf, comboPartners, heroHitLane, hitFrom, shieldStandPoint, teamSize } from '../src/coop';
import { createGame, snapshot, step } from '../src/game';
import { getMap } from '../src/map';
import { createPracticeAlly } from '../src/practiceAlly';
import type { GameState } from '../src/state';
import { secondsToTicks, TUNING, type Tuning } from '../src/tuning';
import { spawnCreep } from '../src/waves';
import { dist } from '../src/vec';
import { labGame, placeCreep, run, runCollect } from './helpers';

function learnR(state: GameState, playerId: string): void {
  const hero = state.heroes.find((h) => h.owner === playerId)!;
  hero.level = Math.max(hero.level, 6);
  hero.skillPoints = Math.max(hero.skillPoints, 1);
  expect(applyCommand(state, playerId, { type: 'learn', slot: 'R' })).toBe(true);
}

describe('aimed ultimates', () => {
  it('Arrow Storm rains on its circle for 6 pulses, hits ground and air, and leaves the rest of the map alone', () => {
    const { state } = labRain(['ranger']);
    const at = { x: 13, y: 20 };
    state.heroes[0]!.x = 13;
    state.heroes[0]!.y = 26;
    const inside = placeCreep(state, 'brute', at.x + 1, at.y, 1);
    const wisp = placeCreep(state, 'wisp', at.x - 1, at.y, 1);
    const outside = placeCreep(state, 'brute', at.x + 7, at.y, 1);
    for (const c of [inside, wisp, outside]) c.rootUntil = 1_000_000;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R', x: at.x, y: at.y })).toBe(true);
    const s = TUNING.hero.ranger.arrowStorm;
    const events = runCollect(state, secondsToTicks(s.duration) + secondsToTicks(s.pulseInterval) + 4);
    const pulses = events.filter((e) => e.type === 'aoe' && e.effect === 'arrowStorm');
    expect(pulses).toHaveLength(Math.round(s.duration / s.pulseInterval));
    for (const e of pulses) expect(e).toMatchObject({ x: at.x, y: at.y, radius: s.radius });
    expect(inside.hp).toBeLessThan(inside.maxHp);
    expect(wisp.hp).toBeLessThan(wisp.maxHp);
    expect(outside.hp).toBe(outside.maxHp);
  });

  it('Meteor lands after its delay on ground creeps only, damages them and stuns them', () => {
    const { state } = labRain(['arcanist']);
    const at = { x: 13, y: 20 };
    state.heroes[0]!.x = 13;
    state.heroes[0]!.y = 26;
    const grunt = placeCreep(state, 'grunt', at.x, at.y, 1);
    const wisp = placeCreep(state, 'wisp', at.x + 1, at.y, 1);
    const far = placeCreep(state, 'grunt', at.x + 7, at.y, 1);
    for (const c of [grunt, wisp, far]) c.rootUntil = 1_000_000;
    const s = TUNING.hero.arcanist.meteor;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R', x: at.x, y: at.y })).toBe(true);
    run(state, secondsToTicks(s.delay) - 3);
    expect(grunt.hp).toBe(grunt.maxHp);
    run(state, 8);
    expect(grunt.hp).toBeLessThan(grunt.maxHp);
    expect(grunt.stunUntil).toBeGreaterThan(state.tick);
    expect(wisp.hp).toBe(wisp.maxHp);
    expect(far.hp).toBe(far.maxHp);
  });

  it('walks into range first when the point is too far', () => {
    const { state } = labRain(['ranger']);
    const hero = state.heroes[0]!;
    hero.x = 13;
    hero.y = 40;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R', x: 13, y: 20 })).toBe(true);
    run(state, 4);
    expect(state.zones).toHaveLength(0);
    run(state, 60);
    expect(state.zones.some((z) => z.kind === 'arrowStorm') || hero.skillCd.R > 0).toBe(true);
    expect(hero.skillCd.R).toBeGreaterThan(0);
  });
});

describe('combos', () => {
  it('Arrow Storm + Meteor with overlapping circles fuse into Meteor Rain and both effects end', () => {
    const { state, heroes } = labRain(['ranger', 'arcanist']);
    heroes[0]!.x = 13;
    heroes[0]!.y = 26;
    heroes[1]!.x = 14;
    heroes[1]!.y = 26;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R', x: 12, y: 20 })).toBe(true);
    expect(applyCommand(state, 'p2', { type: 'cast', slot: 'R', x: 15, y: 20 })).toBe(true);
    const events = runCollect(state, 3);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'combo', combo: 'meteorRain', heroes: [heroes[0]!.id, heroes[1]!.id] }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'syncCast', slot: 'R', heroIds: [heroes[0]!.id, heroes[1]!.id] }),
    );
    expect(state.zones.map((z) => z.kind)).toEqual(['meteorRain']);
    const zone = state.zones[0]!;
    expect(zone.radius).toBe(3 + TUNING.coop.meteorRain.radiusBonus);
    const rain = runCollect(state, secondsToTicks(TUNING.coop.meteorRain.duration) + 2).filter(
      (e) => e.type === 'aoe' && e.effect === 'meteorRain',
    );
    expect(rain.length).toBeGreaterThanOrEqual(10);
  });

  it('does not fuse when the circles do not overlap, but still syncs', () => {
    const { state, heroes } = labRain(['ranger', 'arcanist']);
    heroes[0]!.x = 5;
    heroes[0]!.y = 24;
    heroes[1]!.x = 21;
    heroes[1]!.y = 24;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R', x: 5, y: 20 })).toBe(true);
    expect(applyCommand(state, 'p2', { type: 'cast', slot: 'R', x: 21, y: 20 })).toBe(true);
    const events = runCollect(state, 3);
    expect(events.some((e) => e.type === 'combo')).toBe(false);
    expect(events.some((e) => e.type === 'syncCast')).toBe(true);
    expect(state.zones.map((z) => z.kind).sort()).toEqual(['arrowStorm', 'meteor']);
  });

  it('fuses up to 5 seconds apart, not after', () => {
    const at = (gap: number) => {
      const { state, heroes } = labRain(['ranger', 'arcanist']);
      heroes[0]!.x = 13;
      heroes[0]!.y = 26;
      heroes[1]!.x = 14;
      heroes[1]!.y = 26;
      applyCommand(state, 'p1', { type: 'cast', slot: 'R', x: 13, y: 20 });
      run(state, secondsToTicks(gap));
      applyCommand(state, 'p2', { type: 'cast', slot: 'R', x: 13, y: 20 });
      return runCollect(state, 3);
    };
    expect(TUNING.coop.comboWindow).toBe(R_OVERLAP_SECONDS);
    expect(at(4.5).some((e) => e.type === 'combo')).toBe(true);
    expect(at(5.5).some((e) => e.type === 'combo')).toBe(false);
  });

  it('Iron Vow + Arrow Storm is a Stun Storm when the Warden stands in the storm, in either order', () => {
    for (const vowFirst of [false, true]) {
      const { state, heroes } = labRain(['ranger', 'warden']);
      const [ranger, warden] = heroes as [(typeof heroes)[number], (typeof heroes)[number]];
      ranger.x = 13;
      ranger.y = 26;
      warden.x = 13;
      warden.y = 20;
      const grunt = placeCreep(state, 'brute', 14, 20, 1);
      grunt.rootUntil = 1_000_000;
      const storm = () => applyCommand(state, 'p1', { type: 'cast', slot: 'R', x: 13, y: 20 });
      const vow = () => applyCommand(state, 'p2', { type: 'cast', slot: 'R' });
      if (vowFirst) {
        expect(vow()).toBe(true);
        run(state, 20);
        expect(storm()).toBe(true);
      } else {
        expect(storm()).toBe(true);
        run(state, 20);
        expect(vow()).toBe(true);
      }
      const events = runCollect(state, 3);
      expect(events).toContainEqual(expect.objectContaining({ type: 'combo', combo: 'stunStorm' }));
      expect(state.zones.map((z) => z.kind)).toEqual(['stunStorm']);
      const zone = state.zones[0]!;
      expect(zone.radius).toBe(TUNING.hero.ranger.arrowStorm.radius + TUNING.coop.stunStorm.radiusBonus);
      const pulses = runCollect(state, secondsToTicks(TUNING.hero.ranger.arrowStorm.duration) + 2);
      expect(pulses.some((e) => e.type === 'aoe' && e.effect === 'stunStorm')).toBe(true);
    }
  });

  it('Iron Vow does not combo when the Warden stands outside the other ultimate', () => {
    const { state, heroes } = labRain(['ranger', 'warden']);
    heroes[0]!.x = 13;
    heroes[0]!.y = 26;
    heroes[1]!.x = 4;
    heroes[1]!.y = 30;
    applyCommand(state, 'p1', { type: 'cast', slot: 'R', x: 13, y: 20 });
    run(state, 10);
    applyCommand(state, 'p2', { type: 'cast', slot: 'R' });
    const events = runCollect(state, 3);
    expect(events.some((e) => e.type === 'combo')).toBe(false);
    expect(events.some((e) => e.type === 'syncCast')).toBe(true);
    expect(state.zones.map((z) => z.kind)).toEqual(['arrowStorm']);
  });

  it('Meteor + Iron Vow is a Shockwave: creeps are pulled to the point, then it lands harder than the Meteor', () => {
    const { state, heroes } = labRain(['arcanist', 'warden']);
    const [arcanist, warden] = heroes as [(typeof heroes)[number], (typeof heroes)[number]];
    arcanist.x = 13;
    arcanist.y = 27;
    warden.x = 13;
    warden.y = 22;
    const near = placeCreep(state, 'brute', 13, 18, 1);
    near.rootUntil = 1_000_000;
    near.hp = near.maxHp = 100_000;
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R', x: 13, y: 22 })).toBe(true);
    run(state, 6);
    expect(applyCommand(state, 'p2', { type: 'cast', slot: 'R' })).toBe(true);
    const events = runCollect(state, 3);
    expect(events).toContainEqual(expect.objectContaining({ type: 'combo', combo: 'shockwave' }));
    expect(state.zones.map((z) => z.kind)).toEqual(['shockwave']);
    const before = dist(near.x, near.y, 13, 22);
    const hp = near.hp;
    runCollect(state, secondsToTicks(TUNING.coop.shockwave.pullTime) + 2);
    expect(dist(near.x, near.y, 13, 22)).toBeLessThan(before);
    expect(hp - near.hp).toBeGreaterThan(0);
  });

  it('every pair of heroes has exactly one combo', () => {
    expect(comboOf('arrowStorm', 'meteor')).toBe('meteorRain');
    expect(comboOf('ironVow', 'arrowStorm')).toBe('stunStorm');
    expect(comboOf('meteor', 'ironVow')).toBe('shockwave');
    expect(comboOf('meteor', 'meteor')).toBeNull();
    expect(comboPartners('warden')).toEqual(['ranger', 'arcanist']);
  });
});

describe('wave-10 shield', () => {
  it('takes no damage from one lane, then the second lane breaks it and lands', () => {
    const state = labGame();
    state.tuning.coop.bossShield.waves = [10];
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
    state.tuning.coop.bossShield.waves = [10];
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

  it('shields Quick wave 10 only: not Quick wave 5, and not Full wave 10 or 20', () => {
    const full = labGame();
    spawnCreep(full, 'ironhorn', 1, 10);
    expect(full.shields).toHaveLength(0);
    spawnCreep(full, 'matriarch', 1, 20);
    expect(full.shields).toHaveLength(0);

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

  it('the ally answers your R where you cast it, inside the window, and the two fuse', () => {
    for (const [leader, ally, combo] of [
      ['ranger', 'arcanist', 'meteorRain'],
      ['ranger', 'warden', 'stunStorm'],
      ['arcanist', 'warden', 'shockwave'],
    ] as const) {
      const state = createGame(
        {
          players: [{ id: 'p1', name: 'P', hero: leader }],
          practice: { allyId: 'practice-ally', allyHero: ally },
        },
        2,
      );
      learnR(state, 'p1');
      learnR(state, 'practice-ally');
      const bot = createPracticeAlly('practice-ally', 'p1');
      const me = state.heroes[0]!;
      const at = { x: me.x, y: me.y - 4 };
      expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R', x: at.x, y: at.y })).toBe(true);
      let fused = false;
      for (let i = 0; i < 120 && !fused; i++) {
        step(state);
        for (const cmd of bot.decide(snapshot(state))) applyCommand(state, 'practice-ally', cmd);
        fused = state.zones.some((z) => z.kind === combo);
      }
      expect(fused).toBe(true);
    }
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
