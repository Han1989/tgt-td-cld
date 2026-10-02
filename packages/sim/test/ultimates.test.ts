// What the playtest-2 targets ask of the ultimates (docs/GAME_DESIGN.md §13): one Arrow Storm or Meteor at rank 1
// kills every ordinary creep of a Quick wave 8–10 pack inside its circle; a boss loses about 8% or less of its HP to
// one ultimate; Iron Vow heals every teammate by at least 35% of their max HP.

import type { HeroKind } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/commands';
import { createGame, step } from '../src/game';
import type { Creep, GameState } from '../src/state';
import { TUNING } from '../src/tuning';
import { spawnCreep } from '../src/waves';

const AT = { x: 13, y: 16 };

/** A solo Quick game with a hero that can cast its ultimate (rank given) at AT. */
function lab(kind: HeroKind, rank = 1): GameState {
  const state = createGame({ players: [{ id: 'p1', name: 'P', hero: kind }], mode: 'quick' }, 7);
  state.nextWaveTick = -1;
  const hero = state.heroes[0]!;
  hero.attackCd = 1_000_000;
  hero.level = 10;
  hero.ranks.R = rank;
  hero.x = AT.x;
  hero.y = AT.y + 8;
  return state;
}

/** Every creep of the wave's list (bosses left out) packed into the circle, as tightly as a wave walks. */
function pack(state: GameState, wave: number): Creep[] {
  const creeps: Creep[] = [];
  let i = 0;
  for (const g of state.tuning.waves.list[wave - 1]!) {
    if (state.tuning.creeps[g.kind].boss) continue;
    for (let n = 0; n < g.perLane; n++, i++) {
      const c = spawnCreep(state, g.kind, 1, wave);
      const a = i * 2.39996;
      const r = Math.min(2.4, 0.6 * Math.sqrt(i));
      c.x = AT.x + Math.cos(a) * r;
      c.y = AT.y + Math.sin(a) * r;
      c.offX = c.offY = 0;
      c.rootUntil = 1_000_000;
      creeps.push(c);
    }
  }
  return creeps;
}

function cast(state: GameState): void {
  expect(applyCommand(state, 'p1', { type: 'cast', slot: 'R', x: AT.x, y: AT.y })).toBe(true);
  for (let t = 0; t < 20 * 6; t++) step(state);
}

describe('ultimates are pack killers', () => {
  it.each([8, 9, 10])('one rank-1 Arrow Storm kills every ordinary creep of Quick wave %i in its circle', (wave) => {
    const state = lab('ranger');
    const creeps = pack(state, wave);
    cast(state);
    const left = creeps.filter((c) => !c.dead && c.kind !== 'brute');
    expect(left.map((c) => c.kind)).toEqual([]);
  });

  it.each([8, 9, 10])('one rank-1 Meteor kills every ordinary ground creep of Quick wave %i in its circle', (wave) => {
    const state = lab('arcanist');
    const creeps = pack(state, wave);
    cast(state);
    const left = creeps.filter((c) => !c.dead && c.kind !== 'brute' && !TUNING.creeps[c.kind].flying);
    expect(left.map((c) => c.kind)).toEqual([]);
  });

  it('count in ultStats: damage and kills', () => {
    const state = lab('ranger');
    pack(state, 9);
    cast(state);
    expect(state.ultStats.kills).toBeGreaterThan(10);
    expect(state.ultStats.damage).toBeGreaterThan(1000);
  });
});

describe('ultimates are not boss killers', () => {
  it.each([
    ['ironhorn', 5, [1]],
    ['matriarch', 10, [1, 2, 3]],
    ['shardback', 15, [1, 2, 3]],
  ] as const)('one %s ultimate (wave %i, ranks %j) takes at most 8% of the boss', (boss, wave, ranks) => {
    for (const kind of ['ranger', 'arcanist'] as const) {
      for (const rank of ranks) {
        const state = lab(kind, rank);
        const b = spawnCreep(state, boss, 1, wave);
        b.x = AT.x;
        b.y = AT.y;
        b.rootUntil = 1_000_000;
        b.abilityCd = 1_000_000;
        state.shields = [];
        const hp = b.hp;
        cast(state);
        expect((hp - b.hp) / b.maxHp, `${kind} R${rank} on ${boss}`).toBeLessThanOrEqual(0.08);
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
