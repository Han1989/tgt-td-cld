import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands';
import { createGame, snapshot, step } from '../src/game';
import { getMap, isWalkable, laneDistance, padAtTile, Tile, tileAt } from '../src/map';
import { findPath } from '../src/pathfinding';
import { secondsToTicks, TUNING } from '../src/tuning';
import { creepMaxHp, spawnCreep } from '../src/waves';
import { LAB_PAD, labGame, parkHero, placeCreep, run, tuningCopy } from './helpers';

const solo = () => createGame({ players: [{ id: 'p1', name: 'Solo', hero: 'ranger' }] }, 1);

describe('map', () => {
  const map = getMap();

  it('is Spire: a 26 × 50 portrait grid with three lanes from the top edge to the Heart', () => {
    expect(map.name).toBe('Spire');
    expect(map.width).toBe(26);
    expect(map.height).toBe(50);
    expect(map.lanes).toHaveLength(3);
    for (const lane of map.lanes) {
      expect(lane.waypoints.at(-1)).toEqual(map.heart);
      expect(lane.waypoints[0]!.y).toBeLessThan(2);
    }
    // West, Mid, East from left to right.
    const portals = map.lanes.map((l) => l.waypoints[0]!.x);
    expect([...portals].sort((a, b) => a - b)).toEqual(portals);
  });

  it('keeps the safe zone (the bottom band under the touch controls) scenery only', () => {
    expect(map.safeFromY).toBeGreaterThan(map.heart.y + TUNING.heart.radius);
    expect(map.height - map.safeFromY).toBeGreaterThanOrEqual(10);
    for (let ty = map.safeFromY; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) expect(tileAt(map, tx, ty), `${tx},${ty}`).toBe(Tile.Blocker);
    }
    for (const pad of map.pads) expect(pad.ty + map.padSize).toBeLessThanOrEqual(map.safeFromY);
    for (const lane of map.lanes) for (const wp of lane.waypoints) expect(wp.y).toBeLessThan(map.safeFromY);
  });

  it('has square pads on pad tiles, clear of the lanes, the Heart and each other', () => {
    expect(map.padSize).toBe(3);
    for (const pad of map.pads) {
      for (let dy = 0; dy < map.padSize; dy++) {
        for (let dx = 0; dx < map.padSize; dx++) {
          const [x, y] = [pad.tx + dx + 0.5, pad.ty + dy + 0.5];
          expect(tileAt(map, pad.tx + dx, pad.ty + dy), `pad ${pad.id}`).toBe(Tile.Pad);
          expect(laneDistance(map.lanes, x, y), `pad ${pad.id}`).toBeGreaterThan(1.4);
          expect(Math.hypot(x - map.heart.x, y - map.heart.y)).toBeGreaterThan(TUNING.heart.radius + 1);
        }
      }
      expect(padAtTile(map, pad.tx + 1, pad.ty + 1)).toBe(pad);
    }
    // Pads never overlap.
    const covered = map.pads.reduce((n) => n + map.padSize * map.padSize, 0);
    expect(map.tiles.filter((t) => t === Tile.Pad).length).toBe(covered);
  });

  it('tags pads with zones: West, Mid and East pads alongside their lanes, extra pads for bigger teams', () => {
    const base = map.pads.filter((p) => !p.extra);
    for (const zone of ['west', 'mid', 'east'] as const) {
      expect(base.filter((p) => p.zone === zone).length, zone).toBeGreaterThanOrEqual(8);
      expect(map.pads.filter((p) => p.extra && p.zone === zone).length).toBeGreaterThanOrEqual(
        Math.max(...TUNING.pads.extraPerLaneZone),
      );
    }
    expect(base.some((p) => p.zone === 'core')).toBe(false);
    expect(map.pads.filter((p) => p.zone === 'core').length).toBeGreaterThanOrEqual(Math.max(...TUNING.pads.core));
    // West pads lie west of the Mid lane, East pads east of it; Mid pads sit on both sides (half each).
    const midX = map.lanes[1]!.waypoints[0]!.x;
    for (const p of map.pads.filter((q) => q.zone === 'west')) expect(p.x).toBeLessThan(midX);
    for (const p of map.pads.filter((q) => q.zone === 'east')) expect(p.x).toBeGreaterThan(midX);
    const mid = base.filter((p) => p.zone === 'mid');
    expect(mid.filter((p) => p.half === 0).length).toBe(mid.filter((p) => p.half === 1).length);
  });

  it('lets heroes reach every build pad from the Heart', () => {
    for (const pad of map.pads) expect(findPath(map, map.heroSpawn, pad), `pad ${pad.id}`).not.toBeNull();
  });
});

describe('pathfinding', () => {
  const map = getMap();

  it('finds a walkable path around blockers', () => {
    const from = map.heroSpawn;
    const to = { x: 2.5, y: 3.5 };
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
    expect(applyCommand(state, 'p1', { type: 'move', x: 21.5, y: 38.5 })).toBe(true);
    run(state, 20 * 20);
    const hero = state.heroes[0]!;
    expect(Math.hypot(hero.x - 21.5, hero.y - 38.5)).toBeLessThan(0.01);
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

  it('has 30 waves, wisps from wave 5 and a different boss at waves 10, 20 and 30', () => {
    const list = TUNING.waves.list;
    expect(list).toHaveLength(30);
    const bosses = new Map<number, string>();
    list.forEach((groups, i) => {
      const kinds = groups.map((g) => g.kind);
      if (i + 1 < 5) expect(kinds).not.toContain('wisp');
      expect(kinds).not.toContain('hatchling');
      for (const g of groups) {
        if (!TUNING.creeps[g.kind].boss) continue;
        bosses.set(i + 1, g.kind);
        expect(g.perLane * g.lanes.length).toBe(1);
      }
    });
    expect([...bosses]).toEqual([
      [10, 'ironhorn'],
      [20, 'matriarch'],
      [30, 'shardback'],
    ]);
    expect(list[4]!.some((g) => g.kind === 'wisp')).toBe(true);
  });

  it('grows from 12 creeps in wave 1 to 120 in wave 30', () => {
    const list = TUNING.waves.list;
    const size = (groups: (typeof list)[number]) =>
      groups.filter((g) => !TUNING.creeps[g.kind].boss).reduce((n, g) => n + g.perLane * g.lanes.length, 0);
    expect(size(list[0]!)).toBe(12);
    expect(size(list[29]!)).toBe(120);
    // Bigger overall: every wave after 10 is at least as big as wave 10.
    for (let i = 10; i < 30; i++) expect(size(list[i]!)).toBeGreaterThanOrEqual(size(list[9]!));
    // The last wave still finishes spawning before the next wave would start.
    const perLane = Math.max(...[0, 1, 2].map((lane) => list[29]!.filter((g) => g.lanes.includes(lane as 0 | 1 | 2)).reduce((n, g) => n + g.perLane, 0)));
    expect(perLane * TUNING.waves.spawnInterval).toBeLessThan(TUNING.waves.interval);
  });

  it('adds armour to creeps as the waves go on', () => {
    const state = labGame();
    const early = spawnCreep(state, 'grunt', 1, 1);
    const late = spawnCreep(state, 'grunt', 1, 21);
    expect(early.armor).toBe(TUNING.creeps.grunt.armor);
    expect(late.armor).toBeCloseTo(TUNING.creeps.grunt.armor + 20 * TUNING.waves.armorGrowthPerWave);
    expect(late.magicResist).toBe(TUNING.creeps.grunt.magicResist);
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
  const START = TUNING.economy.startingGold;

  it('starts every player with the starting gold', () => {
    expect(solo().players[0]!.gold).toBe(START);
  });

  it('pays wave income to every player at each wave start', () => {
    const state = createGame(
      { players: [{ id: 'a', name: 'A', hero: 'ranger' }, { id: 'b', name: 'B', hero: 'ranger' }] },
      1,
    );
    run(state, secondsToTicks(TUNING.waves.buildPhase));
    const income = TUNING.economy.waveIncomeBase;
    expect(state.players.map((p) => p.gold)).toEqual([START + income, START + income]);
  });

  it('builds on an empty pad for gold, rejects occupied pads and insufficient gold', () => {
    const state = solo();
    const cost = TUNING.towers.arrow.tiers[0]!.cost;
    expect(applyCommand(state, 'p1', { type: 'build', padId: 0, tower: 'arrow' })).toBe(true);
    expect(state.players[0]!.gold).toBe(START - cost);
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
    applyCommand(state, 'p2', { type: 'build', padId: LAB_PAD, tower: 'arrow' });
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
    expect(state.players.map((p) => p.gold)).toEqual([START + bonus + income, START + bonus + income]);
  });

  it('cannot call early once the final wave has started', () => {
    const state = solo();
    state.wave = 29;
    state.nextWaveTick = state.tick;
    step(state);
    expect(state.wave).toBe(30);
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

  it.each(['ironhorn', 'matriarch', 'shardback'] as const)('the %s boss leaks 20', (kind) => {
    const state = labGame();
    parkHero(state);
    const heart = getMap().heart;
    placeCreep(state, kind, heart.x, heart.y - 2.5, 1).wp = 7;
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
    const dir = fileURLToPath(new URL('../src/', import.meta.url));
    const files = readdirSync(dir, { recursive: true, withFileTypes: true }).filter((f) => f.isFile());
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const src = readFileSync(join(file.parentPath, file.name), 'utf8');
      expect(src, file.name).not.toMatch(/Math\.random|Date\.now|performance\.now/);
    }
  });
});

describe('snapshot', () => {
  it('is JSON-safe and reports HUD fields', () => {
    const state = solo();
    step(state);
    const snap = snapshot(state);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    expect(snap).toMatchObject({ heartHp: 100, wave: 0, totalWaves: 30, phase: 'build' });
    expect(snap.nextWaveIn).toBe(secondsToTicks(30) - 1);
    const hero = snap.heroes[0]!;
    expect(hero.skills.map((s) => s.slot)).toEqual(['Q', 'W', 'E', 'R']);
    expect(hero.skills.map((s) => s.rank)).toEqual([1, 1, 0, 0]);
    expect(hero.skills.map((s) => s.maxRank)).toEqual([4, 4, 4, 3]);
    expect(hero.maxLevel).toBe(10);
    expect(snap.zones).toEqual([]);
  });
});
