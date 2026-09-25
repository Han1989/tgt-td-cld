import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands';
import { createGame, snapshot, step } from '../src/game';
import { getMap, isWalkable, Tile, tileAt } from '../src/map';
import { findPath } from '../src/pathfinding';
import { secondsToTicks, TUNING } from '../src/tuning';
import { creepMaxHp } from '../src/waves';
import { labGame, parkHero, placeCreep, run, tuningCopy } from './helpers';

const solo = () => createGame({ players: [{ id: 'p1', name: 'Solo', hero: 'ranger' }] }, 1);

describe('map', () => {
  const map = getMap();

  it('is an 80 × 60 grid with three lanes ending at the Heart', () => {
    expect(map.width).toBe(80);
    expect(map.height).toBe(60);
    expect(map.lanes).toHaveLength(3);
    for (const lane of map.lanes) {
      expect(lane.waypoints.at(-1)).toEqual(map.heart);
      expect(lane.waypoints[0]!.y).toBeLessThan(2);
    }
  });

  it('has build pads beside every lane, all on pad tiles', () => {
    for (const lane of [0, 1, 2]) expect(map.pads.filter((p) => p.lane === lane).length).toBeGreaterThan(8);
    for (const pad of map.pads) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        expect(tileAt(map, pad.tx + dx, pad.ty + dy)).toBe(Tile.Pad);
      }
    }
  });

  it('lets heroes reach every build pad from the Heart', () => {
    for (const pad of map.pads) expect(findPath(map, map.heroSpawn, pad), `pad ${pad.id}`).not.toBeNull();
  });
});

describe('pathfinding', () => {
  const map = getMap();

  it('finds a walkable path around blockers', () => {
    const from = map.heroSpawn;
    const to = { x: 12.5, y: 5 };
    const path = findPath(map, from, to)!;
    expect(path).not.toBeNull();
    expect(path.at(-1)).toEqual(to);
    let prev = from;
    for (const p of path) {
      for (let t = 0; t <= 1; t += 0.05) {
        expect(isWalkable(map, prev.x + (p.x - prev.x) * t, prev.y + (p.y - prev.y) * t)).toBe(true);
      }
      prev = p;
    }
  });

  it('refuses blocked destinations', () => {
    expect(findPath(map, map.heroSpawn, { x: 0.5, y: 0.5 })).toBeNull();
  });

  it('moves the hero to a clicked point', () => {
    const state = labGame();
    expect(applyCommand(state, 'p1', { type: 'move', x: 22, y: 36 })).toBe(true);
    run(state, 20 * 20);
    const hero = state.heroes[0]!;
    expect(Math.hypot(hero.x - 22, hero.y - 36)).toBeLessThan(0.01);
    expect(hero.order.type).toBe('idle');
  });
});

describe('waves', () => {
  it('starts wave 1 after the build phase and spawns creeps in all three lanes', () => {
    const state = solo();
    run(state, secondsToTicks(TUNING.waves.buildPhase) - 1);
    expect(state.wave).toBe(0);
    expect(state.phase).toBe('build');
    run(state, 1);
    expect(state.wave).toBe(1);
    expect(state.phase).toBe('waves');
    run(state, secondsToTicks(10));
    expect(new Set(state.creeps.map((c) => c.lane))).toEqual(new Set([0, 1, 2]));
  });

  it('starts a new wave every interval whether or not the last is cleared', () => {
    const state = solo();
    parkHero(state);
    run(state, secondsToTicks(TUNING.waves.buildPhase + TUNING.waves.interval));
    expect(state.wave).toBe(2);
    expect(state.creeps.length).toBeGreaterThan(0);
  });

  it('has 10 waves, wisps from wave 5 and a boss at wave 10', () => {
    const list = TUNING.waves.list;
    expect(list).toHaveLength(10);
    list.forEach((groups, i) => {
      const kinds = groups.map((g) => g.kind);
      if (i + 1 < 5) expect(kinds).not.toContain('wisp');
      expect(kinds.includes('boss')).toBe(i + 1 === 10);
    });
    expect(list[4]!.some((g) => g.kind === 'wisp')).toBe(true);
    const size = (groups: typeof list[number]) => groups.reduce((n, g) => n + g.perLane * g.lanes.length, 0);
    expect(size(list[0]!)).toBe(12);
  });

  it('scales creep HP with the wave number', () => {
    const state = labGame();
    expect(creepMaxHp(state, 'grunt', 1)).toBe(TUNING.creeps.grunt.hp);
    expect(creepMaxHp(state, 'grunt', 6)).toBe(
      Math.round(TUNING.creeps.grunt.hp * (1 + 5 * TUNING.waves.hpGrowthPerWave)),
    );
  });
});

describe('economy', () => {
  it('starts every player with 150 gold', () => {
    expect(solo().players[0]!.gold).toBe(150);
  });

  it('pays wave income to every player at each wave start', () => {
    const state = createGame(
      { players: [{ id: 'a', name: 'A', hero: 'ranger' }, { id: 'b', name: 'B', hero: 'ranger' }] },
      1,
    );
    run(state, secondsToTicks(TUNING.waves.buildPhase));
    const income = TUNING.economy.waveIncomeBase;
    expect(state.players.map((p) => p.gold)).toEqual([150 + income, 150 + income]);
  });

  it('builds on an empty pad for gold, rejects occupied pads and insufficient gold', () => {
    const state = solo();
    const cost = TUNING.towers.arrow.tiers[0]!.cost;
    expect(applyCommand(state, 'p1', { type: 'build', padId: 0, tower: 'arrow' })).toBe(true);
    expect(state.players[0]!.gold).toBe(150 - cost);
    expect(applyCommand(state, 'p1', { type: 'build', padId: 0, tower: 'frost' })).toBe(false);
    expect(applyCommand(state, 'p1', { type: 'build', padId: 9999, tower: 'frost' })).toBe(false);
    state.players[0]!.gold = 0;
    expect(applyCommand(state, 'p1', { type: 'build', padId: 1, tower: 'arrow' })).toBe(false);
    step(state);
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'rejected', reason: 'Not enough gold' }));
  });

  it('sells for 70% of the gold spent, only by the owner', () => {
    const state = createGame(
      { players: [{ id: 'a', name: 'A', hero: 'ranger' }, { id: 'b', name: 'B', hero: 'ranger' }] },
      1,
    );
    applyCommand(state, 'a', { type: 'build', padId: 3, tower: 'cannon' });
    const tower = state.towers[0]!;
    expect(applyCommand(state, 'b', { type: 'sell', towerId: tower.id })).toBe(false);
    const gold = state.players[0]!.gold;
    expect(applyCommand(state, 'a', { type: 'sell', towerId: tower.id })).toBe(true);
    expect(state.players[0]!.gold).toBe(gold + Math.floor(TUNING.towers.cannon.tiers[0]!.cost * 0.7));
    expect(state.towers).toHaveLength(0);
  });

  it('credits tower kills to the tower owner', () => {
    const state = labGame(TUNING, 2);
    parkHero(state, 0);
    parkHero(state, 1);
    applyCommand(state, 'p2', { type: 'build', padId: 37, tower: 'arrow' });
    const tower = state.towers[0]!;
    const c = placeCreep(state, 'runner', tower.x + 2, tower.y);
    c.rootUntil = 1_000;
    c.hp = 1;
    run(state, 20);
    expect(state.players[1]!.kills).toBe(1);
    expect(state.players[0]!.kills).toBe(0);
  });

  it('call-early starts the next wave now and pays every player a bonus', () => {
    const state = createGame(
      { players: [{ id: 'a', name: 'A', hero: 'ranger' }, { id: 'b', name: 'B', hero: 'ranger' }] },
      1,
    );
    run(state, 20);
    const bonus = snapshot(state).callEarlyBonus;
    expect(bonus).toBeGreaterThan(0);
    expect(applyCommand(state, 'b', { type: 'callEarly' })).toBe(true);
    step(state);
    expect(state.wave).toBe(1);
    const income = TUNING.economy.waveIncomeBase;
    expect(state.players.map((p) => p.gold)).toEqual([150 + bonus + income, 150 + bonus + income]);
  });

  it('cannot call early once the final wave has started', () => {
    const state = solo();
    state.wave = 9;
    state.nextWaveTick = state.tick;
    step(state);
    expect(state.wave).toBe(10);
    expect(applyCommand(state, 'p1', { type: 'callEarly' })).toBe(false);
  });
});

describe('win and lose', () => {
  it('leaking creeps damage the Heart and 0 HP is defeat', () => {
    const state = labGame();
    parkHero(state);
    state.heartHp = 2;
    const heart = getMap().heart;
    placeCreep(state, 'grunt', heart.x, heart.y - 3, 1).wp = 7;
    placeCreep(state, 'runner', heart.x, heart.y - 3, 1).wp = 7;
    run(state, 60);
    expect(state.heartHp).toBe(0);
    expect(state.phase).toBe('defeat');
    expect(applyCommand(state, 'p1', { type: 'callEarly' })).toBe(false);
  });

  it('bosses leak 20', () => {
    const state = labGame();
    parkHero(state);
    const heart = getMap().heart;
    placeCreep(state, 'boss', heart.x, heart.y - 2.5, 1).wp = 7;
    run(state, 100);
    expect(state.heartHp).toBe(TUNING.heart.maxHp - 20);
  });

  it('clearing the final wave is victory', () => {
    const tuning = tuningCopy();
    tuning.waves.list = [[{ kind: 'grunt', perLane: 1, lanes: [1] }]];
    tuning.waves.buildPhase = 0;
    const state = createGame({ players: [{ id: 'p1', name: 'P', hero: 'ranger' }], tuning }, 3);
    run(state, 2);
    expect(state.creeps).toHaveLength(1);
    state.creeps[0]!.hp = 0.1;
    state.creeps[0]!.x = state.heroes[0]!.x;
    state.creeps[0]!.y = state.heroes[0]!.y - 3;
    run(state, 40);
    expect(state.phase).toBe('victory');
  });
});

describe('determinism', () => {
  it('replays identically from the same seed and commands', () => {
    const play = (seed: number) => {
      const state = solo();
      state.rng = seed;
      applyCommand(state, 'p1', { type: 'build', padId: 20, tower: 'arrow' });
      applyCommand(state, 'p1', { type: 'callEarly' });
      run(state, 2000);
      return JSON.stringify(snapshot(state));
    };
    expect(play(5)).toBe(play(5));
    expect(play(5)).not.toBe(play(6));
  });

  it('never uses Math.random or Date.now in the sim', () => {
    const dir = new URL('../src/', import.meta.url);
    for (const file of readdirSync(fileURLToPath(dir))) {
      const src = readFileSync(new URL(file, dir), 'utf8');
      expect(src, file).not.toMatch(/Math\.random|Date\.now|performance\.now/);
    }
  });
});

describe('snapshot', () => {
  it('is JSON-safe and reports HUD fields', () => {
    const state = solo();
    step(state);
    const snap = snapshot(state);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    expect(snap).toMatchObject({ heartHp: 100, wave: 0, totalWaves: 10, phase: 'build' });
    expect(snap.nextWaveIn).toBe(secondsToTicks(30) - 1);
    const hero = snap.heroes[0]!;
    expect(hero.skills.map((s) => s.slot)).toEqual(['Q', 'W']);
    expect(hero.skills.every((s) => s.rank === 1)).toBe(true);
    expect(hero.maxLevel).toBe(5);
  });
});
