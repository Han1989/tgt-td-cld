// What the playtest-2 targets ask of the ultimates (docs/GAME_DESIGN.md §13): one Arrow Storm or Meteor at rank 1,
// on a Quick wave 8–10, kills the Runners, Wisps and Grunts on every lane and takes at least half the HP of the rest
// (Brutes and bosses aside); a boss loses about 8% or less of its HP to one ultimate; Iron Vow heals every teammate
// by at least 35% of their max HP.

import type { HeroKind } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands';
import { createGame, step } from '../src/game';
import { getMap } from '../src/map';
import type { Creep, GameState } from '../src/state';
import { TUNING } from '../src/tuning';
import { spawnCreep } from '../src/waves';

const KINDS: HeroKind[] = ['ranger', 'warden', 'arcanist'];

/** A Quick game of `players` players, hero 0 of kind `kind` (rank given) ready to cast its ultimate. */
function lab(kind: HeroKind, rank = 1, players = 1): GameState {
  const heroes = [kind, ...KINDS.filter((k) => k !== kind)].slice(0, players);
  const state = createGame(
    { players: heroes.map((hero, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, hero })), mode: 'quick' },
    7,
  );
  state.nextWaveTick = -1;
  for (const hero of state.heroes) {
    hero.attackCd = 1_000_000;
    hero.level = 10;
    hero.ranks.R = rank;
  }
  return state;
}

/** Every creep of the wave's list on its lane (bosses left out), packed as tightly as a wave walks, rooted in place. */
function pack(state: GameState, wave: number): Creep[] {
  const creeps: Creep[] = [];
  for (const lane of [0, 1, 2] as const) {
    const start = getMap().lanes[lane]!.waypoints[0]!;
    let i = 0;
    for (const g of state.tuning.waves.list[wave - 1]!) {
      if (state.tuning.creeps[g.kind].boss) continue;
      for (let n = 0; n < g.perLane; n++, i++) {
        const c = spawnCreep(state, g.kind, lane, wave);
        c.x = start.x + ((i % 3) - 1) * 0.7;
        c.y = start.y + 6 + Math.floor(i / 3) * 0.8;
        c.offX = c.offY = 0;
        c.rootUntil = 1_000_000;
        creeps.push(c);
      }
    }
  }
  return creeps;
}

function cast(state: GameState): void {
  expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R' })).toBe(true);
  for (let t = 0; t < 20 * 6; t++) step(state);
}

describe('ultimates are pack killers', () => {
  // One rain, rank 1, on a Quick wave 8-10 pack: the weak creeps die on every lane and the rest lose at least half.
  describe.each([
    ['ranger', 1],
    ['arcanist', 1],
    ['ranger', 2],
    ['arcanist', 2],
    ['ranger', 3],
    ['arcanist', 3],
  ] as const)('%s with %i players', (kind, players) => {
    it.each([8, 9, 10])('Quick wave %i', (wave) => {
      const state = lab(kind, 1, players);
      const creeps = pack(state, wave);
      const hp = new Map(creeps.map((c) => [c, c.hp]));
      cast(state);
      for (const c of creeps) {
        if (c.dead) continue;
        expect(['grunt', 'runner', 'wisp'], `${c.kind} lives`).not.toContain(c.kind);
        if (c.kind === 'brute') continue;
        expect((hp.get(c)! - c.hp) / hp.get(c)!, c.kind).toBeGreaterThanOrEqual(0.5);
      }
    });
  });

  it('count in ultStats: casts, damage and kills, per ultimate', () => {
    const state = lab('ranger');
    pack(state, 9);
    cast(state);
    expect(state.ultStats.by.arrowStorm.casts).toBe(1);
    expect(state.ultStats.by.arrowStorm.kills).toBeGreaterThan(10);
    expect(state.ultStats.kills).toBe(state.ultStats.by.arrowStorm.kills);
    expect(state.ultStats.damage).toBeGreaterThan(1000);
  });
});

describe('ultimates are not boss killers', () => {
  // Ironhorn (wave 5) is met before R unlocks (level 6) in a normal match, so it gets a little more room.
  it.each([
    ['ironhorn', 5, [1], 0.15],
    ['matriarch', 10, [1, 2, 3], 0.08],
    ['shardback', 15, [1, 2, 3], 0.08],
  ] as const)('one %s ultimate (wave %i, ranks %j) takes at most a share of the boss', (boss, wave, ranks, limit) => {
    for (const kind of ['ranger', 'arcanist'] as const) {
      for (const rank of ranks) {
        const state = lab(kind, rank);
        const b = spawnCreep(state, boss, 1, wave);
        b.x = 13;
        b.y = 16;
        b.rootUntil = 1_000_000;
        b.abilityCd = 1_000_000;
        state.shields = [];
        const hp = b.hp;
        cast(state);
        expect((hp - b.hp) / b.maxHp, `${kind} R${rank} on ${boss}`).toBeLessThanOrEqual(limit);
        expect(hp - b.hp).toBeGreaterThan(0);
      }
    }
  });
});

describe('Iron Vow', () => {
  it('heals every teammate by at least 35% of their max HP at every rank', () => {
    for (const heal of TUNING.hero.warden.ironVow.heal) expect(heal).toBeGreaterThanOrEqual(0.35);
  });
});
