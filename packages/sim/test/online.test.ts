// Sim features used by online play: player-count scaling and disconnects.

import type { CreepKind } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { applyCommand, setPlayerConnected } from '../src/commands';
import { createGame, snapshot } from '../src/game';
import { getMap } from '../src/map';
import { secondsToTicks, TUNING } from '../src/tuning';
import { creepMaxHp, scaledCount } from '../src/waves';
import { run } from './helpers';

const game = (players: number) =>
  createGame(
    { players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, hero: 'ranger' as const })) },
    9,
  );

describe('player-count scaling', () => {
  it('multiplies creep HP by 1 + 0.5 × (players − 1)', () => {
    const base = creepMaxHp(game(1), 'grunt', 1);
    expect(base).toBe(TUNING.creeps.grunt.hp);
    expect(creepMaxHp(game(2), 'grunt', 1)).toBe(Math.round(base * 1.5));
    expect(creepMaxHp(game(4), 'grunt', 1)).toBe(Math.round(base * 2.5));
  });

  it('adds 25% creeps per extra player', () => {
    expect(scaledCount(game(1), 4)).toBe(4);
    expect(scaledCount(game(2), 4)).toBe(5);
    expect(scaledCount(game(4), 4)).toBe(7);
  });

  it('spawns more creeps in wave 1 with four players', () => {
    const count = (players: number) => {
      const state = game(players);
      run(state, secondsToTicks(TUNING.waves.buildPhase + 1));
      return state.creeps.length + state.spawnQueue.length;
    };
    expect(count(1)).toBe(12);
    expect(count(4)).toBe(21);
  });

  it.each([10, 20, 30])('never multiplies the number of bosses (wave %i)', (wave) => {
    const state = game(4);
    state.wave = wave - 1;
    state.nextWaveTick = state.tick;
    run(state, 1);
    const isBoss = (kind: CreepKind) => TUNING.creeps[kind].boss;
    const bosses = state.spawnQueue.filter((s) => isBoss(s.kind)).length + state.creeps.filter((c) => isBoss(c.kind)).length;
    expect(bosses).toBe(1);
  });
});

describe('disconnects', () => {
  it('sends a disconnected hero back to the Heart and keeps its towers firing', () => {
    const state = game(2);
    applyCommand(state, 'p2', { type: 'build', padId: 20, tower: 'arrow' });
    const hero = state.heroes[1]!;
    applyCommand(state, 'p2', { type: 'move', x: 22, y: 36 });
    run(state, 200);
    expect(Math.hypot(hero.x - 22, hero.y - 36)).toBeLessThan(0.1);

    setPlayerConnected(state, 'p2', false);
    expect(snapshot(state).players[1]!.connected).toBe(false);
    run(state, 300);
    const spawn = getMap().heroSpawn;
    expect(Math.hypot(hero.x - spawn.x, hero.y - spawn.y)).toBeLessThan(0.1);
    expect(state.towers).toHaveLength(1);

    const gold = state.players[1]!.gold;
    setPlayerConnected(state, 'p2', true);
    expect(snapshot(state).players[1]).toMatchObject({ connected: true, gold });
  });
});
