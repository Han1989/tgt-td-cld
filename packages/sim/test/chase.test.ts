// Creeps that cannot be kited (Han, 21 Oct 2026): the chase cap, the short leash and time limit with an aggro
// cooldown, and rejoining the lane ahead instead of walking back (creeps.ts, `tuning.creepAi`).

import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands';
import type { Creep, GameState, Hero } from '../src/state';
import { secondsToTicks, TICK_RATE, TUNING } from '../src/tuning';
import { LAB_PAD, labGame, parkHero, placeCreep, run, tuningCopy } from './helpers';

const AI = TUNING.creepAi;

/** A hero that neither walks nor fights on its own, and cannot die: the test moves it. */
function puppet(state: GameState): Hero {
  const hero = state.heroes[0]!;
  hero.stunUntil = 1_000_000;
  hero.attackCd = 1_000_000;
  hero.maxHp = 1_000_000;
  hero.hp = hero.maxHp;
  return hero;
}

const chasers = (state: GameState, hero: Hero) =>
  state.creeps.filter((c) => !c.dead && c.mode === 'chase' && c.targetId === hero.id);

const near = (c: Creep, hero: Hero) => Math.hypot(c.x - hero.x, c.y - hero.y);

describe('the chase cap', () => {
  it('a hero circling 6 tiles out draws at most 3 of 10 creeps, the nearest; the rest keep their lane progress', () => {
    expect(AI.chaseCap).toBe(3);
    const state = labGame();
    const hero = puppet(state);
    // Ten Grunts walking down the Mid lane (x = 13), a tile apart.
    const creeps = Array.from({ length: 10 }, (_, i) => placeCreep(state, 'grunt', 13, 6 + i));
    const speed = TUNING.creeps.grunt.speed;
    const start = creeps.map((c) => c.y);
    const prev = creeps.map((c) => c.remaining);
    const everChased = new Set<number>();
    let most = 0;
    const ticks = secondsToTicks(8);
    for (let i = 0; i < ticks; i++) {
      // The hero circles the group (which walks down the lane) 6 tiles out, at its walking speed.
      const a = (i / TICK_RATE) * (TUNING.hero.ranger.speed / 6);
      hero.x = 13 + 6 * Math.cos(a);
      hero.y = 10.5 + speed * (i / TICK_RATE) + 6 * Math.sin(a);
      const lane = creeps.filter((c) => c.mode === 'lane' && near(c, hero) <= AI.aggroRange);
      const before = chasers(state, hero).length;
      run(state, 1);
      const now = chasers(state, hero);
      expect(now.length).toBeLessThanOrEqual(AI.chaseCap);
      most = Math.max(most, now.length);
      for (const c of now) everChased.add(c.id);
      if (i === 0) {
        // The first chasers are the nearest creeps in aggro range.
        const nearest = lane.sort((x, y) => near(x, hero) - near(y, hero)).slice(0, AI.chaseCap - before);
        expect(now.map((c) => c.id).sort()).toEqual(nearest.map((c) => c.id).sort());
      }
      // Nobody loses lane progress, chasers included (they count from where they left the lane).
      creeps.forEach((c, k) => {
        expect(c.remaining).toBeLessThanOrEqual(prev[k]! + 1e-9);
        prev[k] = c.remaining;
      });
    }
    expect(most).toBe(AI.chaseCap);
    // The creeps that never chased walked on all the way, as if no hero were there.
    const walkers = creeps.filter((c) => !everChased.has(c.id));
    expect(walkers.length).toBeGreaterThanOrEqual(10 - 2 * AI.chaseCap);
    for (const c of walkers) {
      const k = creeps.indexOf(c);
      expect(c.y - start[k]!).toBeCloseTo(speed * (ticks / TICK_RATE), 5);
    }
  });

  it('a creep left out of the cap strikes a hero in its reach as it passes, without stopping', () => {
    const tuning = tuningCopy();
    tuning.hero.ranger.hpRegen = 0;
    const state = labGame(tuning);
    const hero = puppet(state);
    hero.x = 13;
    hero.y = 14;
    // Three rooted Grunts out of reach hold every place.
    for (const x of [10, 16, 13]) {
      const c = placeCreep(state, 'grunt', x, x === 13 ? 17 : 14);
      c.rootUntil = 1_000_000;
    }
    run(state, 1);
    expect(chasers(state, hero)).toHaveLength(AI.chaseCap);
    const walker = placeCreep(state, 'grunt', 13, 10);
    const hp = hero.hp;
    let y = walker.y;
    for (let i = 0; i < secondsToTicks(4); i++) {
      run(state, 1);
      expect(walker.mode).toBe('lane');
      expect(walker.y).toBeGreaterThan(y);
      y = walker.y;
    }
    expect(walker.y).toBeGreaterThan(hero.y + 2);
    expect(hero.hp).toBeLessThan(hp);
  });

  it('Taunt pulls every creep in its radius past the cap and the leash; others still take the free places', () => {
    const state = labGame(TUNING, 1, ['warden']);
    const warden = state.heroes[0]!;
    warden.x = 13;
    warden.y = 14;
    const r = TUNING.hero.warden.taunt.radius;
    // Eight Grunts within the taunt's radius, and two just outside it, still within aggro range.
    const taunted = [-3, -2, -1, 1, 2, 3].map((dy) => placeCreep(state, 'grunt', 13, 14 + dy));
    taunted.push(placeCreep(state, 'grunt', 10, 14), placeCreep(state, 'grunt', 16, 14));
    const outside = [placeCreep(state, 'grunt', 13 - r - 0.4, 14), placeCreep(state, 'grunt', 13 + r + 0.4, 14)];
    for (const c of outside) expect(near(c, warden)).toBeLessThanOrEqual(AI.aggroRange);
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'W' })).toBe(true);
    warden.stunUntil = 1_000_000;
    warden.attackCd = 1_000_000;
    // As if they had left the lane far away: a taunt ignores the leash.
    for (const c of taunted) c.anchorY = c.y - 20;
    run(state, 5);
    for (const c of taunted) expect(c).toMatchObject({ mode: 'chase', targetId: warden.id });
    for (const c of outside) expect(c).toMatchObject({ mode: 'chase', targetId: warden.id });
    expect(chasers(state, warden)).toHaveLength(taunted.length + outside.length);
  });

  it('when a taunt ends with more than the cap on the Warden, the farthest give up', () => {
    const state = labGame(TUNING, 1, ['warden']);
    const warden = state.heroes[0]!;
    warden.x = 13;
    warden.y = 14;
    const creeps = [-3, -2, 2, 3].flatMap((dy) => [12, 14].map((x) => placeCreep(state, 'grunt', x, 14 + dy)));
    expect(applyCommand(state, 'p1', { type: 'cast', slot: 'W' })).toBe(true);
    warden.stunUntil = 1_000_000;
    warden.attackCd = 1_000_000;
    const ticks = secondsToTicks(TUNING.hero.warden.taunt.duration[0]!);
    run(state, ticks - 1);
    expect(chasers(state, warden)).toHaveLength(creeps.length);
    const d = new Map(creeps.map((c) => [c.id, near(c, warden)]));
    run(state, 1);
    const left = chasers(state, warden);
    expect(left).toHaveLength(AI.chaseCap);
    const gone = creeps.filter((c) => !left.includes(c));
    const dists = (cs: Creep[]) => cs.map((c) => d.get(c.id)!);
    expect(Math.max(...dists(left))).toBeLessThanOrEqual(Math.min(...dists(gone)));
    for (const c of gone) expect(c.noAggroUntil).toBeGreaterThan(state.tick);
  });
});

describe('the leash, the time limit and the aggro cooldown', () => {
  it('a chase ends after chaseSeconds, then the creep ignores heroes for aggroCooldown but strikes one in reach', () => {
    const tuning = tuningCopy();
    tuning.hero.ranger.hpRegen = 0;
    const state = labGame(tuning);
    const hero = puppet(state);
    hero.x = 16;
    hero.y = 10;
    // Rooted: it never reaches the hero 3 tiles away, and never strays past its leash.
    const c = placeCreep(state, 'grunt', 13, 10);
    c.rootUntil = 1_000_000;
    run(state, 1);
    expect(c.mode).toBe('chase');
    const chase = secondsToTicks(AI.chaseSeconds);
    run(state, chase - 1);
    expect(c.mode).toBe('chase');
    run(state, 1);
    expect(c.mode).toBe('lane');
    expect(c.targetId).toBe(-1);

    // Cooling down: the hero 3 tiles away does not draw it, and one in its reach is struck all the same.
    const cooldown = secondsToTicks(AI.aggroCooldown);
    run(state, cooldown / 2);
    expect(c.mode).toBe('lane');
    hero.x = 13;
    hero.y = 11;
    const hp = hero.hp;
    run(state, cooldown / 2 - 1);
    expect(c.mode).toBe('lane');
    expect(hero.hp).toBeLessThan(hp);
    run(state, 1);
    expect(c).toMatchObject({ mode: 'chase', targetId: hero.id });
  });

  it('a creep lured 4 tiles down the lane rejoins it there, never behind, and crosses a tower range once', () => {
    const state = labGame();
    const hero = puppet(state);
    applyCommand(state, 'p1', { type: 'build', padId: LAB_PAD, tower: 'arrow' });
    const tower = state.towers[0]!;
    tower.stunUntil = 1_000_000; // never shoots: the creep lives
    const inRange = (c: Creep) =>
      Math.hypot(c.x - tower.x, c.y - tower.y) <= TUNING.towers.arrow.tiers[0]!.range + TUNING.creeps.grunt.radius;
    // Just above the tower's range on the Mid lane, the hero 4.5 tiles further down.
    const c = placeCreep(state, 'grunt', 13, 7.5);
    expect(inRange(c)).toBe(false);
    hero.x = 13;
    hero.y = 12;
    let entries = 0;
    let was = false;
    let y = c.y;
    let chased = false;
    let rejoined: { x: number; y: number; d: number } | null = null;
    for (let i = 0; i < secondsToTicks(20) && !c.dead; i++) {
      // The hero kites it: always 3 tiles further down the lane, out of its reach, until it gives up.
      if (c.mode === 'chase') hero.y = c.y + 3;
      run(state, 1);
      if (c.mode === 'chase') chased = true;
      else if (chased && !rejoined) {
        rejoined = { x: c.anchorX, y: c.anchorY, d: Math.hypot(c.x - 13, c.y - 7.5) };
        parkHero(state);
      }
      const now = inRange(c);
      if (now && !was) entries++;
      was = now;
      // Never back up the lane.
      expect(c.y).toBeGreaterThanOrEqual(y - 1e-9);
      y = c.y;
    }
    expect(rejoined).not.toBeNull();
    // It gave up at the leash, 4 tiles out, and rejoined where it stood: never behind where it left.
    expect(rejoined!.d).toBeGreaterThan(AI.leashRange);
    expect(rejoined!.d).toBeLessThan(AI.leashRange + 0.2);
    expect(rejoined!.x).toBeCloseTo(13);
    expect(rejoined!.y).toBeGreaterThan(7.5 + AI.leashRange);
    expect(entries).toBe(1);
    expect(c.y).toBeGreaterThan(tower.y + 6);
  });

  it('a creep lured back up the lane rejoins it no further back than where it left', () => {
    const state = labGame();
    const hero = puppet(state);
    const c = placeCreep(state, 'grunt', 13, 20);
    hero.x = 13;
    hero.y = 16;
    const left = c.remaining;
    let rejoin: { x: number; y: number } | null = null;
    for (let i = 0; i < secondsToTicks(6) && !rejoin; i++) {
      hero.y = c.y - 3;
      run(state, 1);
      expect(c.remaining).toBeLessThanOrEqual(left + 1e-9);
      if (c.mode === 'rejoin') rejoin = { x: c.anchorX, y: c.anchorY };
    }
    expect(rejoin).not.toBeNull();
    // It gave up at the leash, 4 tiles up the lane, and heads back down to where it left.
    expect(c.y).toBeLessThan(20 - AI.leashRange + 0.1);
    expect(rejoin!.x).toBeCloseTo(13);
    expect(rejoin!.y).toBeCloseTo(20);
  });
});
