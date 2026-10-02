// Lane-rain ultimates, the three combos, the wave-10 two-lane shield, and solo practice. Always on.

import { R_OVERLAP_SECONDS } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands';
import { damageCreep } from '../src/combat';
import { comboOf, comboPartners, heroHitLane, hitFrom, shieldStandPoint, teamSize } from '../src/coop';
import { createGame, snapshot, step } from '../src/game';
import { getMap } from '../src/map';
import { createPracticeAlly } from '../src/practiceAlly';
import type { GameState } from '../src/state';
import type { GameEvent } from '@tdt/protocol';
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

/** A point on the straight part of `lane`, `3 k` tiles from its portal. */
function onLane(lane: 0 | 1 | 2, k = 3): { x: number; y: number } {
  const w = getMap().lanes[lane]!.waypoints[0]!;
  return { x: w.x, y: w.y + 3 * k };
}

/** A rooted creep of `kind` standing on `lane`, `3 k` tiles from its portal and `dx` to the side. */
function standOn(state: GameState, kind: Parameters<typeof placeCreep>[1], lane: 0 | 1 | 2, k = 3, dx = 0) {
  const p = onLane(lane, k);
  const c = placeCreep(state, kind, p.x + dx, p.y, lane);
  c.rootUntil = 1_000_000;
  return c;
}

const R = { type: 'cast', slot: 'R' } as const;

describe('lane rains', () => {
  it('Arrow Storm is instant, rains on all three lanes, hits ground and air, and never strikes empty road', () => {
    const { state } = labRain(['ranger']);
    const creeps = [
      standOn(state, 'brute', 0),
      standOn(state, 'grunt', 1, 3, 0.5),
      standOn(state, 'wisp', 2, 4),
      standOn(state, 'grunt', 2, 6),
    ];
    for (const c of creeps) c.hp = c.maxHp = 5000;
    expect(applyCommand(state, 'p1', R)).toBe(true);
    const s = TUNING.hero.ranger.arrowStorm;
    const events = runCollect(state, secondsToTicks(s.duration) + secondsToTicks(s.pulseInterval) + 4);
    const strikes = events.filter((e) => e.type === 'aoe' && e.effect === 'arrowStorm');
    // Four creeps in four spots, six pulses: 24 strikes.
    expect(strikes).toHaveLength(4 * Math.round(s.duration / s.pulseInterval));
    for (const e of strikes) {
      if (e.type !== 'aoe') continue;
      expect(e.radius).toBe(s.strikeRadius);
      // Every strike is centred on a creep.
      expect(creeps.some((c) => c.x === e.x && c.y === e.y)).toBe(true);
    }
    for (const c of creeps) expect(c.hp, c.kind).toBeLessThan(c.maxHp);
    expect(state.ultStats.by.arrowStorm.casts).toBe(1);
  });

  it('a lane with no creeps gets no strike, and a creep takes one hit per pulse however many strikes overlap', () => {
    const { state } = labRain(['ranger']);
    const a = standOn(state, 'grunt', 0, 3);
    const b = standOn(state, 'grunt', 0, 3, 0.4);
    state.heroes[0]!.skillCd.R = 0;
    applyCommand(state, 'p1', R);
    const s = TUNING.hero.ranger.arrowStorm;
    const events = runCollect(state, secondsToTicks(s.pulseInterval) + 1);
    const strikes = events.filter((e) => e.type === 'aoe');
    expect(strikes).toHaveLength(1);
    const lost = a.maxHp - a.hp;
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThanOrEqual(s.damage[0]!);
    expect(b.maxHp - b.hp).toBeCloseTo(lost, 5);
  });

  it('has no cap: a lane with a pack strung along it is struck all the way down', () => {
    const { state } = labRain(['ranger']);
    const creeps = Array.from({ length: 12 }, (_, i) => standOn(state, 'grunt', 1, 1 + Math.floor(i / 2), (i % 2) * 5 - 2.5));
    applyCommand(state, 'p1', R);
    run(state, secondsToTicks(TUNING.hero.ranger.arrowStorm.pulseInterval) + 1);
    for (const c of creeps) expect(c.hp).toBeLessThan(c.maxHp);
  });

  it('Meteor is instant, hits ground and air on every lane, and every impact stuns', () => {
    const { state } = labRain(['arcanist']);
    const grunt = standOn(state, 'grunt', 0);
    const wisp = standOn(state, 'wisp', 1);
    const brute = standOn(state, 'brute', 2);
    for (const c of [grunt, wisp, brute]) c.hp = c.maxHp = 5000;
    expect(applyCommand(state, 'p1', R)).toBe(true);
    const s = TUNING.hero.arcanist.meteor;
    const events = runCollect(state, secondsToTicks(s.pulseInterval) + 1);
    expect(events.filter((e) => e.type === 'aoe' && e.effect === 'meteor')).toHaveLength(3);
    for (const c of [grunt, wisp, brute]) {
      expect(c.hp, c.kind).toBeLessThan(c.maxHp);
      expect(c.stunUntil, c.kind).toBeGreaterThan(state.tick);
    }
    // And again at the next impact.
    const hp = grunt.hp;
    run(state, secondsToTicks(s.pulseInterval));
    expect(grunt.hp).toBeLessThan(hp);
  });

  it('works the same in a team of three, wherever the caster stands', () => {
    const { state, heroes } = labRain(['ranger', 'warden', 'arcanist']);
    heroes[0]!.x = 3;
    heroes[0]!.y = 46;
    const c = standOn(state, 'grunt', 2, 5);
    expect(applyCommand(state, 'p1', R)).toBe(true);
    run(state, 20);
    expect(c.hp).toBeLessThan(c.maxHp);
  });
});

/** Total ultimate damage and the creeps' HP lost after a full cast of the ultimates of `heroes` in `order`. */
function castAll(heroes: ('ranger' | 'arcanist' | 'warden')[], order: number[], gap = 10, seconds = 8) {
  const { state } = labRain(heroes);
  const creeps = [0, 1, 2].flatMap((lane) =>
    [0, 1, 2, 3].map((i) => standOn(state, 'grunt', lane as 0 | 1 | 2, 3 + i, (i % 2) * 0.6)),
  );
  for (const c of creeps) {
    c.hp = c.maxHp = 100_000;
  }
  const events: GameEvent[] = [];
  order.forEach((idx, n) => {
    if (n > 0) events.push(...runCollect(state, gap));
    expect(applyCommand(state, `p${idx + 1}`, R)).toBe(true);
  });
  events.push(...runCollect(state, seconds * 20));
  return { state, creeps, events, lost: creeps.reduce((sum, c) => sum + (c.maxHp - c.hp), 0) };
}

describe('combos', () => {
  it('Arrow Storm + Meteor fuse into Meteor Rain wherever the heroes stand, and both rains end', () => {
    const { state, heroes } = labRain(['ranger', 'arcanist']);
    heroes[0]!.x = 3;
    heroes[0]!.y = 46;
    heroes[1]!.x = 20;
    heroes[1]!.y = 8;
    standOn(state, 'grunt', 1);
    applyCommand(state, 'p1', R);
    run(state, 20);
    const events = (applyCommand(state, 'p2', R), runCollect(state, 2));
    expect(events.filter((e) => e.type === 'combo')).toHaveLength(1);
    const kinds = state.zones.filter((z) => !z.done).map((z) => z.kind);
    expect(kinds).toEqual(['meteorRain']);
    expect(state.zones.every((z) => z.radius === 0)).toBe(true);
    expect(state.ultStats.by.meteorRain.casts).toBe(1);
  });

  it('fuses up to 5 seconds apart, not after, but still syncs', () => {
    for (const [gap, fuses] of [[R_OVERLAP_SECONDS * 20 - 2, true], [R_OVERLAP_SECONDS * 20 + 4, false]] as const) {
      const { state } = labRain(['ranger', 'arcanist']);
      standOn(state, 'brute', 1);
      applyCommand(state, 'p1', R);
      run(state, gap);
      applyCommand(state, 'p2', R);
      run(state, 2);
      expect(state.zones.some((z) => z.kind === 'meteorRain' && !z.done), `gap ${gap}`).toBe(fuses);
    }
  });

  it('Meteor Rain does at least 1.5x the damage of the two cast apart', () => {
    const apart =
      castAll(['ranger', 'arcanist'], [0], 10, 8).lost + castAll(['arcanist', 'ranger'], [0], 10, 8).lost;
    const fused = castAll(['ranger', 'arcanist'], [0, 1], 10, 8).lost;
    expect(fused).toBeGreaterThanOrEqual(apart * 1.5);
  });

  it('Stun Storm (Iron Vow + Arrow Storm) is clearly stronger than the two cast apart, in either order, and stuns every strike', () => {
    const apart = castAll(['ranger', 'warden'], [0]).lost + castAll(['warden', 'ranger'], [0]).lost;
    for (const order of [[0, 1], [1, 0]]) {
      const run1 = castAll(['ranger', 'warden'], order);
      expect(run1.events.filter((e) => e.type === 'combo' && e.combo === 'stunStorm')).toHaveLength(1);
      expect(run1.lost).toBeGreaterThanOrEqual(apart * 1.25);
      expect(run1.creeps.every((c) => c.stunUntil > 0)).toBe(true);
    }
  });

  it('Shockwave (Meteor + Iron Vow) pulls the creeps together and is clearly stronger than the two cast apart', () => {
    const apart = castAll(['arcanist', 'warden'], [0]).lost + castAll(['warden', 'arcanist'], [0]).lost;
    const { state } = labRain(['arcanist', 'warden']);
    const a = standOn(state, 'grunt', 1, 3, -1.5);
    const b = standOn(state, 'grunt', 1, 3, 1.5);
    a.hp = a.maxHp = b.hp = b.maxHp = 5000;
    applyCommand(state, 'p1', R);
    run(state, 20);
    applyCommand(state, 'p2', R);
    const gap = Math.abs(a.x - b.x);
    run(state, secondsToTicks(TUNING.hero.arcanist.meteor.pulseInterval) + 2);
    expect(Math.abs(a.x - b.x)).toBeLessThan(gap);
    expect(castAll(['arcanist', 'warden'], [0, 1]).lost).toBeGreaterThanOrEqual(apart * 1.25);
  });

  it('three ultimates inside the window fire only the strongest pair, once, whatever the order', () => {
    const orders = [[0, 1, 2], [0, 2, 1], [1, 2, 0], [2, 0, 1], [2, 1, 0], [1, 0, 2]];
    for (const order of orders) {
      const { state } = labRain(['ranger', 'warden', 'arcanist']);
      standOn(state, 'brute', 1);
      for (const idx of order) {
        expect(applyCommand(state, `p${idx + 1}`, R)).toBe(true);
        run(state, 20);
      }
      const live = state.zones.filter((z) => !z.done);
      // Arrow Storm + Meteor (the first of `comboOrder`) is the pair that is left running.
      expect(live.filter((z) => z.kind === 'meteorRain' || z.kind === 'stunStorm' || z.kind === 'shockwave'), order.join()).toHaveLength(1);
      expect(live.find((z) => z.kind === 'meteorRain'), order.join()).toBeDefined();
    }
  });

  it('a third ultimate that makes a weaker pair adds no second combo', () => {
    const { state } = labRain(['ranger', 'warden', 'arcanist']);
    standOn(state, 'brute', 1);
    for (const idx of [0, 2, 1]) {
      applyCommand(state, `p${idx + 1}`, R);
      run(state, 10);
    }
    expect(state.ultStats.by.meteorRain.casts).toBe(1);
    expect(state.ultStats.by.stunStorm.casts + state.ultStats.by.shockwave.casts).toBe(0);
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

  it('the ally answers your R inside the window, and the two fuse', () => {
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
      void me;
      expect(applyCommand(state, 'p1', R)).toBe(true);
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
